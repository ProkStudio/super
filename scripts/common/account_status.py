"""Detect Google / YouTube account status from an open Playwright page."""
import re

BAN_URL_HINTS = (
    'channel-appeals',
    'account_suspended',
    '/terminated',
    'reinstating',
)

BAN_TEXT_STRICT = (
    r'your channel has been terminated',
    r'your account has been terminated',
    r'this account has been terminated',
    r'this channel has been terminated',
    r'channel is no longer available',
    r'account has been suspended',
    r'your channel has been removed due to',
    r'we terminated your channel',
    r'we have terminated your channel',
    r'этот канал удалён',
    r'этот канал был удалён',
    r'ваш канал был удалён',
    r'ваш канал удалён',
    r'аккаунт youtube заблокирован',
    r'ваш аккаунт youtube заблокирован',
    r'канал заблокирован за нарушение',
    r'account has been disabled due to a violation',
)

DISABLED_TEXT_STRICT = (
    r'your account has been disabled',
    r'this account has been disabled',
    r'account disabled by your administrator',
    r'аккаунт google отключён',
    r'аккаунт google был отключён',
    r'couldn\'t sign you in',
    r'не удалось выполнить вход',
)

VERIFY_TEXT_STRICT = (
    r"verify it's you",
    r'confirm your identity',
    r'проверьте, что это вы',
    r'подтвердите, что это вы',
    r'unusual activity on your account',
    r'подозрительная активность',
    r'complete a captcha',
)

NO_CHANNEL_TEXT = (
    r'create a channel',
    r'create a new channel',
    r'add or manage channel',
    r'get started creating on youtube',
    r'создайте канал',
    r'создать канал',
    r'добавить или управлять каналами',
    r'управление каналами',
    r'how to create a channel',
)

NO_CHANNEL_URL = (
    'create_channel',
    'channel_switcher',
)

LOGOUT_URL = (
    'accounts.google.com/signin',
    'accounts.google.com/v3/signin',
    'signin/identifier',
    'servicelogin',
    'oauth/v2/auth',
)

STUDIO_NAV_TEXT = (
    'Dashboard',
    'Content',
    'Analytics',
    'Панель управления',
    'Контент',
    'Аналитика',
)


def _match_any(text, patterns):
    for pat in patterns:
        if re.search(pat, text, re.I):
            return pat
    return None


def _visible_text(page):
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
            return page.inner_text('body').lower()
        except Exception:
            return ''


def _alert_text(page):
    chunks = []
    for sel in ('ytcp-error-banner', 'ytd-error-screen-renderer', '[role="alert"]', 'ytd-message-renderer'):
        try:
            loc = page.locator(sel).first
            if loc.is_visible(timeout=600):
                chunks.append(loc.inner_text().lower())
        except Exception:
            continue
    return '\n'.join(chunks)


def _has_channel_id(page):
    url = (page.url or '').lower()
    if re.search(r'/channel/uc[\w-]+', url):
        return True
    if re.search(r'channelid=uc[\w-]+', url):
        return True
    try:
        href = page.locator('a[href*="/channel/UC"]').first.get_attribute('href', timeout=1500)
        if href and re.search(r'/channel/uc[\w-]+', href.lower()):
            return True
    except Exception:
        pass
    return False


def _has_studio_dashboard(page):
    for sel in ('ytcp-app', 'ytcp-navigation-drawer', 'ytcp-dashboard', '#dashboard-container'):
        try:
            if page.locator(sel).first.is_visible(timeout=1200):
                return True
        except Exception:
            continue
    for text in STUDIO_NAV_TEXT:
        try:
            if page.locator(f'tp-yt-paper-item:has-text("{text}")').first.is_visible(timeout=700):
                return True
        except Exception:
            continue
    return False


def _looks_logged_out(url):
    low = (url or '').lower()
    return any(x in low for x in LOGOUT_URL)


def inspect_account_page(page):
    """Return (status, message) for the current page."""
    url = (page.url or '').lower()
    body = _visible_text(page)
    alerts = _alert_text(page)
    focused = f'{url}\n{alerts}\n{body[:12000]}'

    if _looks_logged_out(url):
        return 'logged_out', 'Требуется вход в Google'

    if any(h in url for h in BAN_URL_HINTS):
        return 'banned', 'Страница блокировки YouTube'

    hit = _match_any(alerts or body[:8000], BAN_TEXT_STRICT)
    if hit:
        return 'banned', 'Канал или аккаунт заблокирован'

    hit = _match_any(focused[:6000], DISABLED_TEXT_STRICT)
    if hit:
        return 'disabled', 'Google аккаунт отключён'

    hit = _match_any(focused[:6000], VERIFY_TEXT_STRICT)
    if hit:
        return 'verify', 'Требуется подтверждение / капча'

    if any(h in url for h in NO_CHANNEL_URL):
        return 'no_channel', 'YouTube-канал ещё не создан'

    if 'studio.youtube.com' in url and 'signin' not in url:
        if _has_studio_dashboard(page) or _has_channel_id(page):
            return 'active', 'YouTube Studio — канал активен'
        hit = _match_any(body[:8000], NO_CHANNEL_TEXT)
        if hit:
            return 'no_channel', 'YouTube-канал ещё не создан'
        if _has_channel_id(page):
            return 'active', 'YouTube Studio доступен'
        return 'no_channel', 'YouTube-канал не найден — создайте канал'

    if 'youtube.com' in url and 'signin' not in url:
        if _has_studio_dashboard(page) or _has_channel_id(page):
            return 'active', 'YouTube доступен'
        hit = _match_any(body[:8000], NO_CHANNEL_TEXT)
        if hit:
            return 'no_channel', 'YouTube-канал ещё не создан'
        return 'active', 'YouTube доступен'

    if 'myaccount.google.com' in url:
        if _match_any(body[:6000], DISABLED_TEXT_STRICT):
            return 'disabled', 'Google аккаунт отключён'
        return 'active', 'Google аккаунт активен'

    return 'unknown', 'Статус не определён'
