#!/usr/bin/env python3
"""Google login via CDP — Truwas LoginWorker parity (detect login state, no auto-password)."""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common.utils import load_config, progress, result, random_delay
from common.session_runner import run_playwright_sessions
from common.human_sim import HumanSimulator
from common.verification import check_logged_in, check_captcha, CaptchaDetected, AccountNotLoggedIn


def run_session(page, label, session, index, total, config):
    base_pct = int((index / max(total, 1)) * 100)
    human = HumanSimulator(page)
    progress('login', base_pct, f'{label}: открываю YouTube')
    try:
        human.goto('https://www.youtube.com', wait_until='domcontentloaded', timeout=90000)
        check_captcha(page)
        check_logged_in(page)
        progress('login', min(base_pct + int(100 / max(total, 1)), 100), f'{label}: уже авторизован')
        return {'profileId': session.get('profileId'), 'login': label, 'loggedIn': True}
    except AccountNotLoggedIn:
        progress('login', base_pct + 5, f'{label}: нужен ручной вход — откройте профиль и войдите в Google')
        human.goto('https://accounts.google.com/', wait_until='domcontentloaded', timeout=90000)
        random_delay(2, 4)
        raise RuntimeError(
            f'{label}: аккаунт не залогинен. Запустите профиль вручную, войдите в Google, затем повторите.'
        )
    except CaptchaDetected as e:
        raise RuntimeError(f'{label}: {e}') from e


def main():
    config = load_config()
    run_playwright_sessions(config, 'login', run_session, 'Симуляция входа (нет CDP)')


if __name__ == '__main__':
    main()
