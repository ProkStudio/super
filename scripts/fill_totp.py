#!/usr/bin/env python3
"""Fill Google 2FA TOTP field via MostLogin CDP session."""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common.utils import load_config, progress, result
from common.session_runner import connect_page
from common.totp import generate_totp, is_totp_secret
from common.human_sim import HumanSimulator


TOTP_SELECTORS = [
    'input[name="totpPin"]',
    'input[id="totpPin"]',
    'input[type="tel"]',
    'input[autocomplete="one-time-code"]',
    'input[aria-label*="code" i]',
    'input[aria-label*="код" i]',
    'input[name="idvPin"]',
]

NEXT_SELECTORS = [
    'button:has-text("Next")',
    'button:has-text("Далее")',
    'div[role="button"]:has-text("Next")',
    'div[role="button"]:has-text("Далее")',
    '#idvPreregisteredPhoneNext',
    '#totpNext',
]


def _click_first(page, human, selectors, timeout=5000):
    for sel in selectors:
        try:
            loc = page.locator(sel).first
            if loc.is_visible(timeout=1500):
                human.human_click(loc, timeout=timeout)
                return True
        except Exception:
            continue
    return False


def fill_totp_on_page(page, secret, max_attempts=3):
    if not is_totp_secret(secret):
        return False, 'Секрет 2FA не распознан (нужен base32 ключ из Google Authenticator)'

    human = HumanSimulator(page)

    for attempt in range(max_attempts):
        info = generate_totp(secret)
        code = info.get('code', '')
        if not code:
            return False, 'Не удалось сгенерировать код'

        progress('totp', None, f'2FA код: {code} (осталось {info.get("remaining")}с)')

        filled = False
        for sel in TOTP_SELECTORS:
            try:
                inp = page.locator(sel).first
                if inp.count() == 0 or not inp.is_visible(timeout=2000):
                    continue
                human.human_type(inp, code, clear=True, verify=True, base_delay_ms=90)
                filled = True
                break
            except Exception:
                continue

        if not filled:
            return False, 'Поле 2FA не найдено на странице'

        human.human_delay(0.35, 0.55)
        _click_first(page, human, NEXT_SELECTORS, timeout=4000)

        time.sleep(1.5)
        url = (page.url or '').lower()
        if 'challenge' not in url and 'totp' not in url and 'signin' not in url:
            return True, f'Код {code} отправлен'

        if attempt + 1 < max_attempts and info.get('remaining', 99) < 3:
            time.sleep(info.get('remaining', 1) + 0.5)

    return True, 'Код вставлен'


def main():
    config = load_config()
    cdp_url = config.get('cdpUrl') or ''
    secret = config.get('secret') or config.get('totp') or ''
    code_override = config.get('code') or ''

    if not cdp_url:
        result({'ok': False, 'error': 'cdpUrl не указан'})
        return

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        result({'ok': False, 'error': 'playwright not installed'})
        return

    with sync_playwright() as playwright:
        browser, page = connect_page(playwright, cdp_url)
        try:
            human = HumanSimulator(page)
            if code_override and not is_totp_secret(secret):
                for sel in TOTP_SELECTORS:
                    try:
                        inp = page.locator(sel).first
                        if inp.is_visible(timeout=2000):
                            human.human_type(inp, code_override, clear=True, verify=True, base_delay_ms=90)
                            _click_first(page, human, NEXT_SELECTORS)
                            result({'ok': True, 'code': code_override})
                            return
                    except Exception:
                        continue
                result({'ok': False, 'error': 'Поле 2FA не найдено'})
                return

            ok, message = fill_totp_on_page(page, secret)
            info = generate_totp(secret) if is_totp_secret(secret) else {}
            result({
                'ok': ok,
                'message': message,
                'code': info.get('code', code_override),
            })
        except Exception as exc:
            result({'ok': False, 'error': str(exc)[:200]})


if __name__ == '__main__':
    main()
