#!/usr/bin/env python3
"""TikTok — определение залогиненного пользователя в антидетект-профиле.

Логика из copy/modules/tiktok/services/session_manager.py (detect_logged_in_user).
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from common.utils import load_config, progress, random_delay
from common.session_runner import run_playwright_sessions
from common.human_sim import HumanSimulator
from tiktok.page_health import inspect_page, is_feed_active
from tiktok.navigation import ensure_tiktok_session

_USERNAME_FROM_URL_RE = re.compile(r'/@([A-Za-z0-9_.]+)')

# copy session_manager.py — стабильные селекторы TikTok web
_LOGGED_IN_USERNAME_JS = r"""
() => {
    try {
        const links = document.querySelectorAll('a[href^="/@"]');
        for (const a of links) {
            const href = a.getAttribute('href') || '';
            const m = href.match(/^\/@([A-Za-z0-9_.]+)\/?$/);
            if (m && (a.querySelector('img') || a.getAttribute('data-e2e') === 'nav-profile')) {
                return m[1];
            }
        }
        const nav = document.querySelector('a[data-e2e="nav-profile"]');
        if (nav) {
            const m2 = (nav.getAttribute('href') || '').match(/^\/@([A-Za-z0-9_.]+)/);
            if (m2) return m2[1];
        }
    } catch (e) {}
    return null;
}
"""

def _username_from_url(page) -> str | None:
    m = _USERNAME_FROM_URL_RE.search(page.url or '')
    if m and '/video/' not in (page.url or '').lower():
        return m.group(1)
    return None


def _try_profile_nav(page, human) -> str | None:
    """Клик по иконке профиля в сайдбаре — надёжнее, чем только DOM-скан."""
    try:
        nav = page.locator('a[data-e2e="nav-profile"]').first
        if nav.count() > 0 and nav.is_visible(timeout=2500):
            human.human_click(nav)
            random_delay(2.0, 3.5)
            from_url = _username_from_url(page)
            if from_url:
                return from_url
    except Exception:
        pass
    return None


def _detect_status(page, human=None):
    status, _message = inspect_page(page)
    if status == 'banned':
        return 'banned', None
    if status == 'verify':
        return 'verify', None
    try:
        username = page.evaluate(_LOGGED_IN_USERNAME_JS)
    except Exception:
        username = None
    if not username:
        username = _username_from_url(page)
    if not username and human is not None:
        username = _try_profile_nav(page, human)
    if username:
        return 'active', username
    if is_feed_active(page):
        return 'active', None
    return 'logged_out', None


def resolve_tiktok_username(page, human=None, session=None, label: str = '') -> str:
    """Реальный @ник TikTok (не profileId вроде 9d7f03ee)."""
    session = session or {}
    meta = (session.get('tiktokUsername') or '').strip().lstrip('@')
    if meta and not (len(meta) <= 12 and meta.isalnum()):
        return meta
    _, detected = _detect_status(page, human)
    if detected:
        return str(detected).strip().lstrip('@')
    login = (session.get('login') or label or '').strip().lstrip('@')
    if login and not (len(login) <= 12 and login.isalnum()):
        return login
    return login


def run_session(page, label, session, index, total, config):
    base_pct = int((index / max(total, 1)) * 100)
    human = HumanSimulator(page)
    profile_id = session.get('profileId')
    progress('tiktok_detect', base_pct, f'{label}: открываю TikTok')
    try:
        page, human = ensure_tiktok_session(page, human, label=label)
        random_delay(1.5, 3.0)
        status, username = _detect_status(page, human)
        progress(
            'tiktok_detect',
            min(base_pct + int(100 / max(total, 1)), 100),
            f'{label}: @{username}' if username else f'{label}: {status}',
        )
        return {
            'profileId': profile_id,
            'login': label,
            'tiktokUsername': username,
            'tiktokStatus': status,
            'loggedIn': status == 'active',
            'tiktokReady': status == 'active',
        }
    except Exception as e:
        return {
            'profileId': profile_id,
            'login': label,
            'tiktokStatus': 'error',
            'error': str(e),
            'loggedIn': False,
        }


def main():
    config = load_config()
    run_playwright_sessions(config, 'tiktok_detect', run_session, 'Симуляция detect (нет CDP)')


if __name__ == '__main__':
    main()
