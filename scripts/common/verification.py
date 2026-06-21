#!/usr/bin/env python3
"""Account / captcha guards — Truwas WarmupWorker + LoginWorker parity."""
import re

from common.account_status import inspect_account_page


class CaptchaDetected(Exception):
    pass


class AccountNotLoggedIn(Exception):
    pass


class AccountBanned(Exception):
    pass


BOT_WALL_RE = re.compile(
    r'(confirm you.?re not a bot|подтвердите, что вы не бот|sign in to confirm|'
    r'войдите в аккаунт, чтобы подтвердить|unusual traffic|detected unusual traffic)',
    re.I,
)

LOGIN_PROMPT_RE = re.compile(
    r'(sign in to youtube|войти в аккаунт|войти\b|log in to youtube|create account)',
    re.I,
)

AVATAR_SELECTORS = [
    'button#avatar-btn',
    'ytd-topbar-menu-button-renderer button',
    'yt-img-shadow.ytd-topbar-menu-button-renderer img',
    '#avatar-btn img',
    'ytd-masthead #avatar-btn',
]


def check_captcha(page):
    """Truwas WarmupWorker._check_captcha — stop before bot-like clicking."""
    url = (page.url or '').lower()
    if '/sorry/' in url or 'captcha' in url:
        raise CaptchaDetected('Captcha or IP block detected in URL')
    try:
        loc = page.locator("iframe[src*='recaptcha'], #captcha-form").first
        if loc.count() > 0 and loc.is_visible(timeout=600):
            raise CaptchaDetected('Captcha element detected on page')
    except CaptchaDetected:
        raise
    except Exception:
        pass
    try:
        body = (page.locator('body').inner_text(timeout=2500) or '')[:4000]
        if BOT_WALL_RE.search(body):
            raise CaptchaDetected('YouTube bot verification wall detected')
    except CaptchaDetected:
        raise
    except Exception:
        pass


def check_logged_in(page):
    """Truwas AccountNotLoggedInException — avatar must be visible."""
    url = (page.url or '').lower()
    if 'accounts.google.com' in url and ('signin' in url or 'ServiceLogin' in url):
        raise AccountNotLoggedIn('Redirected to Google sign-in')
    try:
        for sel in AVATAR_SELECTORS:
            btn = page.locator(sel).first
            if btn.count() > 0 and btn.is_visible(timeout=1200):
                return True
    except Exception:
        pass
    try:
        body = (page.locator('body').inner_text(timeout=2000) or '')[:3000]
        if BOT_WALL_RE.search(body):
            raise AccountNotLoggedIn('Account verification required (bot wall)')
        if LOGIN_PROMPT_RE.search(body) and 'avatar' not in body.lower():
            raise AccountNotLoggedIn('YouTube login prompt — войдите в аккаунт вручную')
    except AccountNotLoggedIn:
        raise
    except Exception:
        pass
    raise AccountNotLoggedIn('Аккаунт не авторизован в YouTube (нет аватара)')


def check_account_safe(page):
    status, msg = inspect_account_page(page)
    if status == 'ban':
        raise AccountBanned(msg or 'Account banned')
    if status == 'verify':
        raise CaptchaDetected(msg or 'Verification required')
    if status == 'disabled':
        raise AccountNotLoggedIn(msg or 'Account disabled')
    return status
