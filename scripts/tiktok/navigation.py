"""TikTok — вход на сайт + открытие видео только через UI TikTok (без Google site:)."""
from __future__ import annotations

import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

from urllib.parse import quote, urlparse

from common.utils import progress, random_delay
from common.human_sim import HumanSimulator
from tiktok.page_health import assert_page_healthy, is_feed_active, is_waf_confirmed
from tiktok.search_nav import (
    navigate_same_tab,
    open_video_from_profile,
    open_video_via_search_videos,
)

_FYP_URL = 'https://www.tiktok.com/ru-RU/'
_VIDEO_ID_RE = re.compile(r'/video/(\d+)')
_VIDEO_URL_RE = re.compile(r'tiktok\.com/@([^/?#]+)/video/(\d+)', re.I)
_PROFILE_URL_RE = re.compile(r'tiktok\.com/@([^/?#]+)/?$', re.I)
_SHORT_URL_RE = re.compile(
    r'(vm|vt)\.tiktok\.com|tiktok\.com/t/|m\.tiktok\.com/v/',
    re.I,
)
_RESOLVE_UA = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
)

_VIDEO_READY_SELECTORS = (
    '[data-e2e="browse-comment-icon"]',
    '[data-e2e="comment-icon"]',
    '[data-e2e="browse-like-icon"]',
    '[data-e2e="video-desc"]',
    '[data-e2e="browse-video-desc"]',
    'video',
)

# Вход на TikTok: только общий запрос «tiktok» (без site: и без URL видео)
_ENTRY_SEARCH_ENGINES = (
    ('https://www.bing.com/search?q={q}', 'Bing'),
    ('https://duckduckgo.com/?q={q}&ia=web', 'DuckDuckGo'),
    ('https://yandex.ru/search/?text={q}', 'Яндекс'),
    ('https://www.google.com/search?q={q}&hl=ru', 'Google'),
)

_CONSENT_SELECTORS = (
    'button:has-text("Accept all")',
    'button:has-text("Принять все")',
    'button:has-text("I agree")',
    'button:has-text("Согласен")',
    '#L2AGLb',
)


@dataclass
class VideoRef:
    username: str
    video_id: str
    url: str


def is_tiktok_short_url(url: str) -> bool:
    return bool(_SHORT_URL_RE.search(url or ''))


def canonical_video_url(url: str) -> str:
    """Канонический URL @user/video/ID без query-параметров."""
    ref = parse_video_url(url)
    if not ref or not ref.video_id:
        return (url or '').strip()
    if ref.username:
        return f'https://www.tiktok.com/@{ref.username}/video/{ref.video_id}'
    return f'https://www.tiktok.com/video/{ref.video_id}'


def resolve_tiktok_url(url: str, timeout: float = 15.0) -> str:
    """Развернуть vm/vt/t/… ссылку через HTTP-редирект (без браузера — без WAF)."""
    raw = (url or '').strip()
    if not raw:
        raise ValueError('пустой URL')
    if not raw.startswith('http'):
        raw = f'https://{raw.lstrip("/")}'

    ref = parse_video_url(raw)
    if ref and ref.video_id:
        return canonical_video_url(raw)

    headers = {'User-Agent': _RESOLVE_UA}
    last_err: Exception | None = None
    for method in ('HEAD', 'GET'):
        req = urllib.request.Request(raw, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                final = getattr(resp, 'url', None) or resp.geturl()
                if final:
                    canon = canonical_video_url(final)
                    if canon and parse_video_url(canon) and parse_video_url(canon).video_id:
                        return canon
                    return final
        except urllib.error.HTTPError as e:
            last_err = e
            loc = e.headers.get('Location') if e.headers else None
            if loc and e.code in (301, 302, 303, 307, 308):
                canon = canonical_video_url(loc)
                if canon and parse_video_url(canon) and parse_video_url(canon).video_id:
                    return canon
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last_err = e

    host = urlparse(raw).netloc or raw[:40]
    raise ValueError(f'не удалось развернуть {host}: {last_err or "нет video ID"}')


def normalize_video_input(url: str, timeout: float = 15.0) -> str:
    """Короткая или полная ссылка → канонический @user/video/ID."""
    raw = (url or '').strip()
    if not raw:
        raise ValueError('пустой URL')
    if not raw.startswith('http'):
        raw = f'https://www.tiktok.com{raw if raw.startswith("/") else "/" + raw}'

    ref = parse_video_url(raw)
    if ref and ref.video_id:
        return canonical_video_url(raw)

    if is_tiktok_short_url(raw):
        return resolve_tiktok_url(raw, timeout=timeout)

    raise ValueError(f'некорректный URL видео: {raw[:80]}')


def parse_video_url(url: str) -> VideoRef | None:
    raw = (url or '').strip()
    if not raw:
        return None
    if not raw.startswith('http'):
        raw = f'https://www.tiktok.com{raw if raw.startswith("/") else "/" + raw}'
    m = _VIDEO_URL_RE.search(raw)
    if m:
        return VideoRef(username=m.group(1), video_id=m.group(2), url=raw)
    mp = _PROFILE_URL_RE.search(raw.rstrip('/'))
    if mp:
        user = mp.group(1)
        return VideoRef(username=user, video_id='', url=raw)
    m2 = re.search(r'/video/(\d+)', raw)
    if m2:
        return VideoRef(username='', video_id=m2.group(1), url=raw)
    return None


def profile_url_for(ref: VideoRef) -> str:
    if ref.username:
        return f'https://www.tiktok.com/@{ref.username}'
    return ''


def video_id_in_url(page, video_id: str) -> bool:
    vid = str(video_id or '').strip()
    url = page.url or ''
    if not vid or '/video/' not in url.lower():
        return False
    m = _VIDEO_ID_RE.search(url)
    return bool(m and m.group(1) == vid)


def _log(stage: str, label: str, message: str) -> None:
    text = f'{label}: {message}' if label else message
    progress(stage, None, text)


def _all_context_pages(context) -> list:
    pages: list = []
    seen = set()

    def add(page):
        if page is None:
            return
        pid = id(page)
        if pid in seen:
            return
        seen.add(pid)
        pages.append(page)

    for p in context.pages:
        add(p)
    try:
        browser = context.browser
        if browser:
            for ctx in browser.contexts:
                for p in ctx.pages:
                    add(p)
    except Exception:
        pass
    return pages


def _is_tiktok_alive(page) -> bool:
    url = (page.url or '').lower()
    return 'tiktok.com' in url and not is_waf_confirmed(page)


def _page_score(page) -> int:
    url = (page.url or '').lower()
    if 'tiktok.com' not in url:
        return -1
    if is_waf_confirmed(page):
        return 0
    score = 2
    if is_tiktok_session_healthy(page):
        score += 10
    if '/video/' in url:
        score += 3
    return score


def resolve_tiktok_page(context, current_page=None):
    best = None
    best_score = -1
    for p in _all_context_pages(context):
        score = _page_score(p)
        if score > best_score:
            best_score = score
            best = p
    if best is None or best_score <= 0:
        return current_page
    if best != current_page:
        try:
            best.bring_to_front()
        except Exception:
            pass
    return best


def is_video_page_ready(page) -> bool:
    url = (page.url or '').lower()
    if not _is_tiktok_alive(page):
        return False
    if '/video/' not in url and not _VIDEO_ID_RE.search(url):
        return False
    for sel in _VIDEO_READY_SELECTORS:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0 and loc.is_visible(timeout=800):
                return True
        except Exception:
            continue
    return False


def is_tiktok_session_healthy(page) -> bool:
    if not _is_tiktok_alive(page):
        return False
    if is_feed_active(page) or is_video_page_ready(page):
        return True
    try:
        nav = page.locator('[data-e2e="nav-home"]').first
        if nav.count() > 0 and nav.is_visible(timeout=800):
            return True
    except Exception:
        pass
    return False


def _wait_video_ready(page, human, timeout_sec=35.0, video_id: str = '') -> bool:
    """Ждём загрузку UI видео; WAF не считаем финальным, пока не истёк таймаут."""
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        page = resolve_tiktok_page(page.context, page)
        if is_video_page_ready(page):
            return True
        if video_id and video_id_in_url(page, video_id):
            try:
                random_delay(0.4, 0.9)
            except Exception:
                pass
        elif '/video/' in (page.url or '').lower():
            try:
                random_delay(0.4, 0.9)
            except Exception:
                pass
        try:
            page.wait_for_timeout(500)
        except Exception:
            break
    page = resolve_tiktok_page(page.context, page)
    if is_waf_confirmed(page):
        return False
    if is_video_page_ready(page) and (not video_id or video_id_in_url(page, video_id)):
        return True
    if video_id and video_id_in_url(page, video_id):
        return True
    return False


def _dismiss_search_consent(page, human) -> None:
    for sel in _CONSENT_SELECTORS:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0 and loc.is_visible(timeout=1000):
                human.human_click(loc)
                random_delay(0.4, 0.9)
                return
        except Exception:
            continue


def _click_tiktok_search_result(page, human) -> bool:
    try:
        clicked = page.evaluate(
            """() => {
              const anchors = Array.from(document.querySelectorAll('a[href]'));
              for (const a of anchors) {
                const href = (a.href || a.getAttribute('href') || '').toLowerCase();
                if (!href.includes('tiktok.com')) continue;
                if (href.includes('google.') || href.includes('gstatic')) continue;
                const r = a.getBoundingClientRect();
                if (r.width < 24 || r.height < 12) continue;
                if (r.top < 0 || r.top > window.innerHeight - 20) continue;
                a.scrollIntoView({ block: 'center', behavior: 'instant' });
                a.click();
                return true;
              }
              return false;
            }"""
        )
        if clicked:
            return True
    except Exception:
        pass

    for sel in ('a[href*="tiktok.com"]', '#search a[href*="tiktok"]'):
        try:
            loc = page.locator(sel)
            for i in range(min(loc.count(), 10)):
                link = loc.nth(i)
                if 'tiktok.com' not in (link.get_attribute('href') or '').lower():
                    continue
                if link.is_visible(timeout=800):
                    human.human_click(link)
                    return True
        except Exception:
            continue
    return False


def _wait_tiktok_loaded(context, page, timeout_sec=20.0) -> tuple:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        resolved = resolve_tiktok_page(context, page)
        if resolved and _is_tiktok_alive(resolved):
            if is_tiktok_session_healthy(resolved):
                return resolved, HumanSimulator(resolved), True
        try:
            page.wait_for_timeout(350)
        except Exception:
            break
    resolved = resolve_tiktok_page(context, page)
    if resolved and _is_tiktok_alive(resolved):
        return resolved, HumanSimulator(resolved), True
    return page, HumanSimulator(page), False


def _click_and_follow_tiktok(context, page, human, label='', stage='tiktok_nav') -> tuple:
    new_page = None
    clicked = False
    try:
        with context.expect_page(timeout=8000) as popup_info:
            clicked = _click_tiktok_search_result(page, human)
        if clicked:
            try:
                new_page = popup_info.value
            except Exception:
                new_page = None
    except Exception:
        if not clicked:
            clicked = _click_tiktok_search_result(page, human)

    if not clicked:
        return page, human, False

    if new_page is not None:
        try:
            new_page.wait_for_load_state('domcontentloaded', timeout=15000)
        except Exception:
            pass
        page, human, ok = _wait_tiktok_loaded(context, new_page, timeout_sec=15.0)
        if ok:
            _log(stage, label, 'TikTok открыт')
            return page, human, True

    page, human, ok = _wait_tiktok_loaded(context, page, timeout_sec=15.0)
    return page, human, ok


def natural_entry_direct(context, label='', stage='tiktok_nav', entry_url: str = '') -> tuple:
    """Вход на TikTok: сначала прямая ссылка (профиль/FYP), поисковики — только при WAF."""
    existing = resolve_tiktok_page(context, None)
    if existing and _is_tiktok_alive(existing):
        _log(stage, label, 'TikTok уже открыт — использую текущую вкладку')
        return existing, HumanSimulator(existing)

    page = context.new_page()
    try:
        page.bring_to_front()
    except Exception:
        pass
    human = HumanSimulator(page)

    targets = []
    if (entry_url or '').strip():
        targets.append(entry_url.strip())
    targets.append(_FYP_URL)

    for target in targets:
        try:
            _log(stage, label, f'прямой переход → {target[:70]}…')
            human.goto(target, wait_until='domcontentloaded', timeout=60000)
            random_delay(2.0, 3.5)
            page = resolve_tiktok_page(context, page)
            if _is_tiktok_alive(page) and not is_waf_confirmed(page):
                _log(stage, label, 'TikTok открыт')
                return page, HumanSimulator(page)
            if is_waf_confirmed(page):
                _log(stage, label, 'WAF на прямом переходе — пробую поисковик')
                break
        except Exception:
            continue

    for template, engine_name in _ENTRY_SEARCH_ENGINES:
        try:
            _log(stage, label, f'fallback: {engine_name}…')
            human.goto(
                template.format(q=quote('tiktok')),
                wait_until='domcontentloaded',
                timeout=45000,
            )
            random_delay(1.0, 2.0)
            _dismiss_search_consent(page, human)
            page, human, ok = _click_and_follow_tiktok(context, page, human, label=label, stage=stage)
            if ok:
                return page, human
        except Exception:
            continue

    page = resolve_tiktok_page(context, page)
    if page and _is_tiktok_alive(page):
        return page, HumanSimulator(page)
    raise RuntimeError('не удалось открыть TikTok')


def natural_entry_via_search(context, label='', stage='tiktok_nav', entry_url: str = '') -> tuple:
    return natural_entry_direct(context, label=label, stage=stage, entry_url=entry_url)


def ensure_tiktok_session(
    page,
    human,
    label='',
    force=False,
    stage='tiktok_nav',
    entry_url: str = '',
) -> tuple:
    page = resolve_tiktok_page(page.context, page)
    human = HumanSimulator(page)

    if not force and _is_tiktok_alive(page):
        return page, human

    if not force:
        for p in _all_context_pages(page.context):
            if _is_tiktok_alive(p):
                try:
                    p.bring_to_front()
                except Exception:
                    pass
                return p, HumanSimulator(p)

    if is_waf_confirmed(page) or 'tiktok.com' not in (page.url or '').lower() or force:
        return natural_entry_direct(
            page.context,
            label=label,
            stage=stage,
            entry_url=entry_url,
        )

    return page, human


def _try_open_video(page, human, ref: VideoRef, label='', stage='tiktok_smart_comment') -> bool:
    """Одна стратегия открытия — True если video_id в URL и плеер готов."""
    page = resolve_tiktok_page(page.context, page)
    human = HumanSimulator(page)
    if is_waf_confirmed(page):
        return False
    return _wait_video_ready(page, human, timeout_sec=22.0, video_id=ref.video_id)


def open_video_by_internal_search(
    page,
    human,
    ref: VideoRef,
    label='',
    stage='tiktok_smart_comment',
) -> tuple:
    """Открыть видео только через TikTok UI (профиль / поиск / клик по ссылке)."""
    page = resolve_tiktok_page(page.context, page)
    human = HumanSimulator(page)

    if video_id_in_url(page, ref.video_id) and _wait_video_ready(
        page, human, timeout_sec=8.0, video_id=ref.video_id
    ):
        return page, human

    if not ref.username:
        _log(stage, label, 'в URL нет @username — пробую прямую ссылку внутри TikTok')
        navigate_same_tab(page, ref.url)
        random_delay(2.5, 4.0)
        page = resolve_tiktok_page(page.context, page)
        human = HumanSimulator(page)
        if _try_open_video(page, human, ref, label, stage):
            return page, human
        raise RuntimeError(f'нужен URL с @username для обхода WAF: {ref.url[:80]}')

    # 1) Прямой профиль → сетка → video_id
    _log(stage, label, f'открываю @{ref.username} → видео {ref.video_id}')
    if open_video_from_profile(page, human, ref.username, ref.video_id, label=label, stage=stage):
        page = resolve_tiktok_page(page.context, page)
        human = HumanSimulator(page)
        if _try_open_video(page, human, ref, label, stage):
            _log(stage, label, 'видео открыто с профиля')
            return page, human

    # 2) Прямая ссылка на видео в той же вкладке
    _log(stage, label, 'прямая ссылка на видео')
    try:
        human.goto(ref.url, wait_until='domcontentloaded', timeout=45000)
    except Exception:
        navigate_same_tab(page, ref.url)
    random_delay(2.5, 4.0)
    page = resolve_tiktok_page(page.context, page)
    human = HumanSimulator(page)
    if _try_open_video(page, human, ref, label, stage):
        _log(stage, label, 'видео открыто по прямой ссылке')
        return page, human

    # 3) Поиск TikTok (последний fallback)
    _log(stage, label, f'fallback: поиск видео @{ref.username}')
    if open_video_via_search_videos(page, human, ref.username, ref.video_id, label=label, stage=stage):
        page = resolve_tiktok_page(page.context, page)
        human = HumanSimulator(page)
        if _try_open_video(page, human, ref, label, stage):
            _log(stage, label, 'видео найдено в поиске TikTok')
            return page, human

    raise RuntimeError(
        f'не удалось открыть видео {ref.video_id} — проверьте @{ref.username} и доступность ролика'
    )


def open_tiktok_video(
    page,
    human,
    video_url: str,
    label='',
    session_ready=False,
    stage='tiktok_smart_comment',
) -> tuple:
    """Открыть видео: сессия TikTok → внутренний поиск (без CDP goto на URL видео)."""
    if not session_ready:
        page, human = ensure_tiktok_session(page, human, label=label, stage=stage)
    else:
        page = resolve_tiktok_page(page.context, page)
        human = HumanSimulator(page)

    if not _is_tiktok_alive(page):
        page, human = ensure_tiktok_session(page, human, label=label, stage=stage)

    try:
        video_url = normalize_video_input(video_url)
    except ValueError as e:
        raise RuntimeError(str(e)) from e

    ref = parse_video_url(video_url)
    if not ref:
        raise RuntimeError(f'некорректный URL: {video_url[:80]}')
    if not ref.video_id:
        raise RuntimeError(
            f'укажите URL видео (…/video/ID). Профиль @{ref.username} — только для навигации, '
            f'добавьте строку с /video/…'
        )

    _log(stage, label, f'открываю видео {ref.video_id}…')
    page, human = open_video_by_internal_search(page, human, ref, label=label, stage=stage)

    if is_waf_confirmed(page):
        raise RuntimeError('TikTok WAF — не удалось открыть видео через внутренний поиск')

    if not _wait_video_ready(page, human, timeout_sec=15.0, video_id=ref.video_id):
        raise RuntimeError(f'видео не загрузилось — в URL нет {ref.video_id}')

    if not video_id_in_url(page, ref.video_id):
        raise RuntimeError(f'открыто не то видео — ожидался ID {ref.video_id}')

    _log(stage, label, 'видео открыто, начинаю комментинг')
    return page, human
