"""TikTok — проверка здоровья страницы (без ложных срабатываний из JS-бандлов)."""
from __future__ import annotations

import re
import time

BAN_URL_HINTS = (
    '/account/ban',
    '/account-ban',
)

BAN_TEXT_STRICT = (
    r'your account was permanently banned',
    r'your account has been permanently banned',
    r'your account has been banned',
    r'this account has been banned',
    r'account was permanently banned',
    r'account has been permanently banned',
    r'ваш аккаунт навсегда заблокирован',
    r'ваш аккаунт был навсегда заблокирован',
    r'ваш аккаунт был заблокирован',
    r'аккаунт навсегда заблокирован',
)

VERIFY_TEXT_STRICT = (
    r'verify your account to continue',
    r'confirm your identity',
    r'подтвердите свой аккаунт',
    r'подтвердите, что это вы',
    r'подтвердите, что вы не робот',
    r'complete the security check',
    r'пройдите проверку безопасности',
    r'unusual activity on your account',
    r'подозрительная активность',
)

WAF_TEXT_STRICT = (
    r'please wait',
    r'slardarwaf',
)

_FEED_SELECTORS = (
    '[data-e2e="browse-like-icon"]',
    '[data-e2e="browse-comment-icon"]',
    '[data-e2e="browse-share-icon"]',
    '[data-e2e="browse-comment-count"]',
    '[data-e2e="comment-count"]',
    '[data-e2e="video-card"]',
    '[data-e2e="recommend-list-item"]',
    '[data-e2e="recommend-list-item-container"]',
    '[data-e2e="nav-home"]',
)

_VIDEO_UI_SELECTORS = (
    '[data-e2e="browse-comment-icon"]',
    '[data-e2e="comment-icon"]',
    '[data-e2e="browse-like-icon"]',
    '[data-e2e="nav-home"]',
    'video',
)


def _match_any(text: str, patterns) -> str | None:
    for pat in patterns:
        if re.search(pat, text, re.I):
            return pat
    return None


def _visible_text(page) -> str:
    try:
        return page.evaluate(
            '''() => {
              const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG']);
              const parts = [];
              function walk(node) {
                if (!node) return;
                if (node.nodeType === Node.TEXT_NODE) {
                  const t = node.textContent?.trim();
                  if (t) parts.push(t);
                  return;
                }
                if (node.nodeType !== Node.ELEMENT_NODE) return;
                if (skip.has(node.tagName)) return;
                let st;
                try { st = getComputedStyle(node); } catch (e) { st = null; }
                if (st && (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0')) return;
                for (const ch of node.childNodes) walk(ch);
              }
              walk(document.body);
              return parts.join('\\n').toLowerCase();
            }'''
        ) or ''
    except Exception:
        try:
            return (page.inner_text('body') or '').lower()
        except Exception:
            return ''


def _has_waf_markers(page) -> bool:
    body = _visible_text(page)[:4000]
    html = ''
    try:
        html = (page.content() or '')[:20000].lower()
    except Exception:
        pass
    blob = f'{body}\n{html}'
    return _match_any(blob, WAF_TEXT_STRICT) is not None


def _has_tiktok_ui(page) -> bool:
    for sel in _FEED_SELECTORS + _VIDEO_UI_SELECTORS:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0 and loc.is_visible(timeout=600):
                return True
        except Exception:
            continue
    return False


def is_feed_active(page) -> bool:
    """FYP / лента видна — аккаунт точно не на экране бана."""
    for sel in _FEED_SELECTORS:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0 and loc.is_visible(timeout=1800):
                return True
        except Exception:
            continue
    return False


def is_waf_challenge(page) -> bool:
    """Быстрая проверка маркеров WAF (может сработать на загрузке)."""
    if not _has_waf_markers(page):
        return False
    if is_feed_active(page) or _has_tiktok_ui(page):
        return False
    return True


def is_waf_confirmed(page, stuck_sec: float = 12.0) -> bool:
    """WAF подтверждён: маркеры есть и UI TikTok не появляется stuck_sec секунд."""
    if not _has_waf_markers(page):
        return False
    if is_feed_active(page) or _has_tiktok_ui(page):
        return False
    deadline = time.time() + max(2.0, stuck_sec)
    while time.time() < deadline:
        if is_feed_active(page) or _has_tiktok_ui(page):
            return False
        if not _has_waf_markers(page):
            return False
        try:
            page.wait_for_timeout(400)
        except Exception:
            break
    return _has_waf_markers(page) and not (is_feed_active(page) or _has_tiktok_ui(page))


def inspect_page(page) -> tuple[str, str | None]:
    """
    Возвращает (status, message).
    status: active | banned | verify | waf | unknown
    """
    if is_feed_active(page):
        return 'active', None

    url = (page.url or '').lower()
    body = _visible_text(page)[:12000]
    focused = f'{url}\n{body}'

    if is_waf_confirmed(page, stuck_sec=8.0):
        return 'waf', 'TikTok WAF: страница «Please wait» (антибот-проверка)'

    if any(h in url for h in BAN_URL_HINTS):
        return 'banned', 'страница блокировки TikTok'

    if _match_any(body, BAN_TEXT_STRICT):
        return 'banned', 'аккаунт заблокирован'

    if _match_any(focused[:8000], VERIFY_TEXT_STRICT):
        return 'verify', 'требуется верификация / капча'

    return 'active', None


def assert_page_healthy(page):
    """Поднять RuntimeError только при реальном бане/верификации/WAF."""
    status, message = inspect_page(page)
    if status == 'banned':
        raise RuntimeError(message or 'аккаунт заблокирован')
    if status in ('verify', 'waf'):
        raise RuntimeError(message or 'требуется верификация / капча')
