"""TikTok — внутренняя навигация: поиск в сайдбаре, клик по видео, возврат в ленту."""
from __future__ import annotations

import random
import re
import time
from urllib.parse import quote

from common.utils import progress, random_delay
from common.human_sim import HumanSimulator

FYP_URL = 'https://www.tiktok.com/ru-RU/'

_PLAYER_LIKE_SELECTORS = (
    '[data-e2e="browse-like-icon"]',
    '[data-e2e="like-icon"]',
    '[data-e2e="video-like-icon"]',
)

_SEARCH_INPUT_SELECTORS = (
    '[data-e2e="search-user-input"] input',
    '[data-e2e="search-user-input"]',
    'form[action*="search"] input',
    'input[placeholder*="Search"]',
    'input[placeholder*="Поиск"]',
    'input[type="search"]',
)

_VIDEO_TAB_SELECTORS = (
    'a[href*="/search/video"]',
    '[data-e2e="search_video-tab"]',
    'span:has-text("Videos")',
    'span:has-text("Видео")',
)

_USER_TAB_SELECTORS = (
    '[data-e2e="search-user-tab"]',
    'span:has-text("Users")',
    'span:has-text("Аккаунты")',
    'span:has-text("Пользователи")',
)

_SIDEBAR_SEARCH_TRIGGERS = (
    '[data-e2e="nav-search"]',
    'a[href*="/search"]',
    'div:has(input[placeholder*="Поиск"])',
    'div:has(input[placeholder*="Search"])',
)

_CLOSE_VIEW_SELECTORS = (
    '[data-e2e="browse-close"]',
    '[data-e2e="search-common-back"]',
    '[data-e2e="search-back"]',
    'button[aria-label*="Close"]',
    'button[aria-label*="Закрыть"]',
    'button[aria-label*="close"]',
    'button[aria-label*="закрыть"]',
)

_RECS_NAV_SELECTORS = (
    '[data-e2e="nav-home"]',
    'a[href="/ru-RU/"]',
    'a[href="/ru-RU"]',
    'a[href*="/foryou"]',
    'a[href="https://www.tiktok.com/ru-RU/"]',
    'span:has-text("Рекомендации")',
    'p:has-text("Рекомендации")',
    'span:has-text("For You")',
)


def search_url(keyword: str) -> str | None:
    kw = (keyword or '').strip().lstrip('#@')
    if not kw:
        return None
    return f'https://www.tiktok.com/search/video?q={quote(kw)}'


def is_in_video_player(page) -> bool:
    url = (page.url or '').lower()
    if re.search(r'/@[^/]+/video/\d+', url):
        return True
    for sel in _PLAYER_LIKE_SELECTORS:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0 and loc.is_visible(timeout=700):
                return True
        except Exception:
            continue
    return False


def wait_video_with_id(page, video_id: str, timeout_sec=12.0) -> bool:
    """Плеер открыт и в URL именно это video_id."""
    vid = str(video_id or '').strip()
    if not vid:
        return False
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        url = page.url or ''
        m = re.search(r'/video/(\d+)', url)
        if m and m.group(1) == vid:
            return True
        time.sleep(0.35)
    return False


def wait_video_player(page, timeout_sec=10.0, video_id: str | None = None) -> bool:
    if video_id:
        return wait_video_with_id(page, video_id, timeout_sec=timeout_sec)
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        if is_in_video_player(page):
            return True
        time.sleep(0.35)
    return False


def is_on_recommendations(page) -> bool:
    url = (page.url or '').lower()
    if '/video/' in url or '/search' in url:
        return False
    if '/ru-ru' in url or url.rstrip('/').endswith('tiktok.com'):
        return True
    if '/foryou' in url:
        return True
    try:
        for sel in ('[data-e2e="browse-like-icon"]', '[data-e2e="recommend-list-item-container"]'):
            loc = page.locator(sel).first
            if loc.count() > 0 and loc.is_visible(timeout=800):
                return True
    except Exception:
        pass
    return False


def click_first_visible(page, human, selectors) -> bool:
    for sel in selectors:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0 and loc.is_visible(timeout=1200):
                human.human_click(loc)
                return True
        except Exception:
            continue
    return False


def click_videos_tab(page, human) -> bool:
    for sel in _VIDEO_TAB_SELECTORS:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0 and loc.is_visible(timeout=1500):
                human.human_click(loc)
                random_delay(1.2, 2.0)
                return True
        except Exception:
            continue
    return False


def click_users_tab(page, human) -> bool:
    for sel in _USER_TAB_SELECTORS:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0 and loc.is_visible(timeout=1500):
                human.human_click(loc)
                random_delay(1.0, 1.8)
                return True
        except Exception:
            continue
    return False


def locate_search_input(page):
    for sel in _SEARCH_INPUT_SELECTORS:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0 and loc.is_visible(timeout=1500):
                return loc
        except Exception:
            continue
    return None


def open_sidebar_search(page, human) -> bool:
    if click_first_visible(page, human, _SIDEBAR_SEARCH_TRIGGERS):
        random_delay(0.4, 0.9)
        return True
    try:
        loc = page.get_by_placeholder('Поиск', exact=False).first
        if loc.count() > 0 and loc.is_visible(timeout=1200):
            human.human_click(loc)
            random_delay(0.3, 0.7)
            return True
    except Exception:
        pass
    try:
        loc = page.get_by_placeholder('Search', exact=False).first
        if loc.count() > 0 and loc.is_visible(timeout=1200):
            human.human_click(loc)
            random_delay(0.3, 0.7)
            return True
    except Exception:
        pass
    return locate_search_input(page) is not None


def click_close_overlay(page, human) -> bool:
    if click_first_visible(page, human, _CLOSE_VIEW_SELECTORS):
        return True
    try:
        clicked = page.evaluate(
            """() => {
              const nodes = [...document.querySelectorAll('button, [role="button"]')];
              const candidates = nodes.filter((b) => {
                const r = b.getBoundingClientRect();
                if (r.width < 8 || r.height < 8) return false;
                const nearTop = r.top >= 0 && r.top < 90;
                const nearEdge = r.left < 90 || r.left > window.innerWidth - 90;
                if (!nearTop || !nearEdge) return false;
                const label = (b.getAttribute('aria-label') || '').toLowerCase();
                const txt = (b.innerText || '').trim();
                if (label.includes('close') || label.includes('закры')) return true;
                if (txt === '×' || txt === 'X') return true;
                return !!b.querySelector('svg');
              });
              if (!candidates.length) return false;
              candidates.sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left);
              candidates[0].click();
              return true;
            }"""
        )
        return bool(clicked)
    except Exception:
        return False


def return_to_recommendations(page, human, label='', stage='tiktok_warmup') -> bool:
    if label:
        progress(stage, None, f'{label}: возврат в Рекомендации')

    click_close_overlay(page, human)
    random_delay(0.6, 1.2)

    if click_first_visible(page, human, _RECS_NAV_SELECTORS):
        random_delay(1.2, 2.0)
        if is_on_recommendations(page):
            return True

    try:
        human.goto(FYP_URL, wait_until='domcontentloaded', timeout=60000)
        random_delay(1.2, 2.0)
        return is_on_recommendations(page)
    except Exception:
        return False


def open_recommendations(page, human, label='', stage='tiktok_warmup') -> bool:
    if is_on_recommendations(page) and not is_in_video_player(page):
        return True
    return return_to_recommendations(page, human, label=label, stage=stage)


def run_tiktok_search(page, human, keyword, label='', stage='tiktok_warmup', videos_tab=True) -> bool:
    """Поиск в сайдбаре TikTok → Enter → опц. вкладка «Видео»."""
    kw = (keyword or '').strip().lstrip('#@')
    if not kw:
        return False

    if is_in_video_player(page) or '/search' in (page.url or '').lower():
        return_to_recommendations(page, human, label=label, stage=stage)

    try:
        if not is_on_recommendations(page):
            human.goto(FYP_URL, wait_until='domcontentloaded', timeout=60000)
            random_delay(1.5, 2.5)
    except Exception:
        pass

    opened_via_input = False
    open_sidebar_search(page, human)
    search_input = locate_search_input(page)
    if search_input is not None:
        try:
            human.human_click(search_input)
            human.human_type(search_input, kw, clear=True)
            random_delay(0.4, 0.9)
            page.keyboard.press('Enter')
            random_delay(2.0, 3.5)
            if videos_tab:
                click_videos_tab(page, human)
            opened_via_input = True
        except Exception:
            opened_via_input = False

    if not opened_via_input:
        url = search_url(kw)
        if not url:
            return False
        human.goto(url, wait_until='domcontentloaded', timeout=60000)
        random_delay(2.0, 3.5)

    return True


def start_search_session(page, human, keyword, label='', stage='tiktok_warmup') -> bool:
    """Поиск → сетка результатов (без клика по видео)."""
    kw = (keyword or '').strip().lstrip('#@')
    if not kw:
        return False
    if is_in_video_player(page):
        return True

    msg = f'{label}: поиск «{kw}»' if label else f'поиск «{kw}»'
    progress(stage, None, msg)
    return run_tiktok_search(page, human, kw, label=label, stage=stage, videos_tab=True)


def click_video_by_id(page, human, video_id: str) -> bool:
    """Клик по карточке с точным video_id. Возвращает True только если URL совпал."""
    vid = str(video_id or '').strip()
    if not vid:
        return False

    current = (page.url or '').lower()
    if f'/video/{vid}' in current and vid in current:
        return True

    if '/search/video' not in current and '/search' in current:
        click_videos_tab(page, human)

    random_delay(0.8, 1.5)

    try:
        clicked = page.evaluate(
            """(targetId) => {
              const links = Array.from(document.querySelectorAll('a[href*="/video/"]'));
              for (const a of links) {
                const href = a.getAttribute('href') || a.href || '';
                const m = href.match(/\\/video\\/(\\d+)/);
                if (!m || m[1] !== targetId) continue;
                const r = a.getBoundingClientRect();
                if (r.width < 30 || r.height < 30) continue;
                a.scrollIntoView({ block: 'center', behavior: 'instant' });
                a.click();
                return true;
              }
              return false;
            }""",
            vid,
        )
        if clicked:
            random_delay(2.0, 3.5)
            return wait_video_with_id(page, vid, timeout_sec=14.0)
    except Exception:
        pass

    try:
        loc = page.locator(f'a[href*="/video/{vid}"]')
        for i in range(min(loc.count(), 20)):
            link = loc.nth(i)
            href = link.get_attribute('href') or ''
            m = re.search(r'/video/(\d+)', href)
            if not m or m.group(1) != vid:
                continue
            if not link.is_visible(timeout=1200):
                continue
            human.human_click(link)
            random_delay(2.0, 3.5)
            if wait_video_with_id(page, vid, timeout_sec=14.0):
                return True
    except Exception:
        pass
    return False


def navigate_same_tab(page, url: str) -> bool:
    """Переход в той же вкладке: сначала клик по <a>, потом location.assign."""
    target = (url or '').strip()
    if not target:
        return False
    try:
        page.evaluate(
            """(target) => {
              const a = document.createElement('a');
              a.href = target;
              a.target = '_self';
              a.rel = 'noopener';
              a.style.display = 'none';
              document.body.appendChild(a);
              a.click();
              a.remove();
            }""",
            target,
        )
        random_delay(2.0, 3.5)
        return True
    except Exception:
        pass
    try:
        page.evaluate('(u) => { window.location.assign(u); }', target)
        random_delay(2.5, 4.0)
        return True
    except Exception:
        return False


def open_profile_via_search(page, human, username: str, label='', stage='tiktok_smart_comment') -> bool:
    """Поиск в TikTok → вкладка «Аккаунты» → профиль @user."""
    user = (username or '').strip().lstrip('@')
    if not user:
        return False

    if is_in_video_player(page) or '/search' in (page.url or '').lower():
        return_to_recommendations(page, human, label=label, stage=stage)

    if not is_on_recommendations(page):
        open_recommendations(page, human, label=label, stage=stage)

    msg = f'{label}: поиск профиля @{user}' if label else f'поиск профиля @{user}'
    progress(stage, None, msg)

    if not run_tiktok_search(page, human, user, label=label, stage=stage, videos_tab=False):
        return False
    random_delay(1.5, 2.5)
    click_users_tab(page, human)
    random_delay(1.0, 1.8)
    if click_profile_by_username(page, human, user):
        random_delay(2.0, 3.0)
        return f'/@{user}' in (page.url or '').lower()
    return False


def _scroll_profile_grid(page) -> bool:
    try:
        page.evaluate('() => window.scrollBy(0, Math.floor(window.innerHeight * 0.75))')
        return True
    except Exception:
        return False


def open_video_on_profile_grid(page, human, video_id: str, max_attempts: int = 16) -> bool:
    """На странице профиля — прокрутка сетки и клик по точному video_id."""
    vid = str(video_id or '').strip()
    if not vid:
        return False
    for _ in range(max_attempts):
        if click_video_by_id(page, human, vid):
            return True
        _scroll_profile_grid(page)
        random_delay(0.9, 1.6)
    return False


def _wait_profile_url(page, username: str, timeout_sec=18.0) -> bool:
    user = (username or '').strip().lstrip('@').lower()
    if not user:
        return False
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        url = (page.url or '').lower()
        if f'/@{user}' in url and '/video/' not in url:
            return True
        if f'/@{user}/' in url:
            return True
        time.sleep(0.4)
    return False


def open_video_via_search_videos(page, human, username: str, video_id: str, label='', stage='tiktok_smart_comment') -> bool:
    """Поиск @user → вкладка «Видео» → клик по video_id (только fallback)."""
    user = (username or '').strip().lstrip('@')
    vid = str(video_id or '').strip()
    if not user or not vid:
        return False

    if not run_tiktok_search(page, human, user, label=label, stage=stage, videos_tab=True):
        return False
    random_delay(1.5, 2.5)

    for _ in range(8):
        if click_video_by_id(page, human, vid):
            return wait_video_with_id(page, vid, timeout_sec=14.0)
        try:
            page.evaluate('() => window.scrollBy(0, Math.floor(window.innerHeight * 0.6))')
        except Exception:
            pass
        random_delay(0.8, 1.4)
    return False


def open_video_from_profile(page, human, username: str, video_id: str, label='', stage='tiktok_smart_comment') -> bool:
    """Прямой URL профиля → сетка → точный video_id. Без возврата в Рекомендации."""
    user = (username or '').strip().lstrip('@')
    vid = str(video_id or '').strip()
    if not user or not vid:
        return False

    progress(
        stage,
        None,
        f'{label}: открываю профиль @{user}' if label else f'профиль @{user}',
    )

    profile_url = f'https://www.tiktok.com/@{user}'
    try:
        human.goto(profile_url, wait_until='domcontentloaded', timeout=60000)
    except Exception:
        navigate_same_tab(page, profile_url)

    random_delay(2.0, 3.5)

    if not _wait_profile_url(page, user):
        try:
            page.evaluate('(u) => { window.location.assign(u); }', profile_url)
            random_delay(2.5, 4.0)
        except Exception:
            pass

    if not _wait_profile_url(page, user):
        progress(stage, None, f'{label}: не удалось открыть профиль @{user}' if label else f'профиль @{user} недоступен')
        return False

    return open_video_on_profile_grid(page, human, vid)


def click_profile_by_username(page, human, username: str) -> bool:
    user = (username or '').strip().lstrip('@').lower()
    if not user:
        return False
    try:
        clicked = page.evaluate(
            """(user) => {
              const links = Array.from(document.querySelectorAll('a[href^="/@"]'));
              for (const a of links) {
                const href = (a.getAttribute('href') || '').toLowerCase();
                if (!href.startsWith('/@' + user) && !href.startsWith('/@' + user + '/')) continue;
                if (!href.match(/^\\/@([^/]+)\\/?$/)) continue;
                const r = a.getBoundingClientRect();
                if (r.width < 20 || r.height < 12) continue;
                a.scrollIntoView({ block: 'center', behavior: 'instant' });
                a.click();
                return true;
              }
              return false;
            }""",
            user,
        )
        if clicked:
            random_delay(2.0, 3.0)
            return f'/@{user}' in (page.url or '').lower()
    except Exception:
        pass

    try:
        loc = page.locator(f'a[href="/@{user}"], a[href^="/@{user}/"]')
        for i in range(min(loc.count(), 8)):
            link = loc.nth(i)
            if link.is_visible(timeout=1200):
                human.human_click(link)
                random_delay(2.0, 3.0)
                return f'/@{user}' in (page.url or '').lower()
    except Exception:
        pass
    return False


def open_search_video(page, human, keyword=None, video_id: str | None = None) -> bool:
    """Клик по ролику в сетке поиска → плеер. video_id — точное видео, иначе случайное."""
    if video_id and click_video_by_id(page, human, video_id):
        return True

    if keyword:
        if not start_search_session(page, human, keyword):
            return False
        if video_id:
            return click_video_by_id(page, human, video_id)

    current = (page.url or '').lower()
    if '/search/video' not in current and '/search' in current:
        click_videos_tab(page, human)

    random_delay(1.0, 2.0)

    if video_id:
        return click_video_by_id(page, human, video_id)

    try:
        clicked = page.evaluate(
            """() => {
              const links = Array.from(document.querySelectorAll('a[href*="/video/"]'));
              const visible = links.filter((a) => {
                const href = a.getAttribute('href') || '';
                if (!/\\/@[^/]+\\/video\\/\\d+/.test(href)) return false;
                const r = a.getBoundingClientRect();
                return r.width > 60 && r.height > 60 && r.top >= 40 && r.top < window.innerHeight - 40;
              });
              if (!visible.length) return false;
              const pick = visible[Math.floor(Math.random() * Math.min(visible.length, 10))];
              pick.scrollIntoView({ block: 'center', behavior: 'instant' });
              pick.click();
              return true;
            }"""
        )
    except Exception:
        clicked = False

    if clicked:
        random_delay(2.0, 3.5)
        if wait_video_player(page):
            return True

    try:
        links = page.locator('a[href*="/@"][href*="/video/"]')
        count = links.count()
        if count == 0:
            return False
        idx = random.randint(0, min(count - 1, 11))
        target = links.nth(idx)
        if target.is_visible(timeout=2000):
            human.human_click(target)
            random_delay(2.0, 3.5)
            return wait_video_player(page)
    except Exception:
        pass
    return False


def micro_warmup_fyp(page, human, arrow_presses: int = 2):
    """Короткий прогрев на ленте перед переходом на целевое видео."""
    try:
        if not is_on_recommendations(page):
            open_recommendations(page, human, stage='tiktok_smart_comment')
        random_delay(1.5, 3.0)
        for _ in range(max(1, arrow_presses)):
            page.keyboard.press('ArrowDown', delay=random.randint(30, 90))
            random_delay(2.0, 4.0)
        human.random_micro_action()
        random_delay(1.0, 2.0)
    except Exception:
        pass
