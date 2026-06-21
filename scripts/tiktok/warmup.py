#!/usr/bin/env python3
"""TikTok — прогрев аккаунта (FYP + поиск по ключам).

Порт copy/modules/tiktok/workers/warmup.py на sync Playwright + HumanSimulator.
"""
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from common.utils import progress, random_delay
from common.session_runner import run_playwright_sessions
from common.human_sim import HumanSimulator
from tiktok.page_health import assert_page_healthy
from tiktok.navigation import ensure_tiktok_session
from tiktok.search_nav import (
    FYP_URL as _FYP_URL,
    click_close_overlay as _click_close_overlay,
    click_first_visible as _click_first_visible,
    click_videos_tab as _click_videos_tab,
    is_in_video_player as _is_in_video_player,
    is_on_recommendations as _is_on_recommendations,
    locate_search_input as _locate_search_input,
    open_recommendations as _open_recommendations,
    open_search_video as _open_search_video,
    open_sidebar_search as _open_sidebar_search,
    return_to_recommendations as _return_to_recommendations,
    search_url as _search_url,
    start_search_session as _start_search_session,
    wait_video_player as _wait_video_player,
)
_NEXT_KEY = 'ArrowDown'

_LIKE_SELECTORS = [
    '[data-e2e="browse-like-icon"]',
    '[data-e2e="like-icon"]',
    '[data-e2e="video-like-icon"]',
]
_FOLLOW_SELECTORS = [
    '[data-e2e="browse-follow"]',
    '[data-e2e="feed-follow"]',
    'button:has-text("Follow")',
    'button:has-text("Подписаться")',
]
_SAVE_SELECTORS = [
    '[data-e2e="browse-collect-icon"]',
    '[data-e2e="undefined-icon"]',
    '[data-e2e="video-collect-icon"]',
]
_SHARE_SELECTORS = [
    '[data-e2e="browse-share-icon"]',
    '[data-e2e="share-icon"]',
    '[data-e2e="video-share-icon"]',
]


def _cfg_int(cfg, *keys, default=0):
    for key in keys:
        if key in cfg and cfg[key] is not None:
            try:
                return int(cfg[key])
            except (TypeError, ValueError):
                pass
    return default


def _cfg_float(cfg, *keys, default=0.0):
    for key in keys:
        if key in cfg and cfg[key] is not None:
            try:
                return float(cfg[key])
            except (TypeError, ValueError):
                pass
    return default


def _cfg_bool(cfg, *keys, default=False):
    for key in keys:
        if key in cfg:
            return bool(cfg[key])
    return default


def _keywords(cfg):
    raw = cfg.get('searchKeywords') or cfg.get('search_keywords') or ''
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()]
    return [ln.strip() for ln in str(raw).splitlines() if ln.strip()]


def _click_first(page, human, selectors):
    for sel in selectors:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0 and loc.is_visible(timeout=1200):
                human.human_click(loc)
                return True
        except Exception:
            continue
    return False


def _goto_feed(page, human, cfg, label=''):
    source_mode = (cfg.get('sourceMode') or cfg.get('source_mode') or 'search_mix').lower()
    keywords = _keywords(cfg)
    mix_ratio = _cfg_int(cfg, 'nicheMixRatio', 'niche_mix_ratio', default=30)

    if source_mode == 'fyp_only':
        _open_recommendations(page, human, label=label)
        return 'fyp', None

    if source_mode == 'search_only':
        if not keywords:
            _open_recommendations(page, human, label=label)
            return 'fyp', None
        kw = random.choice(keywords)
        _start_search_session(page, human, kw, label=label)
        return 'search', kw

    if keywords and random.randint(1, 100) <= mix_ratio:
        kw = random.choice(keywords)
        _start_search_session(page, human, kw, label=label)
        return 'search', kw

    _open_recommendations(page, human, label=label)
    return 'fyp', None


def _maybe_switch_source(page, human, cfg, current, active_keyword=None, label=''):
    source_mode = (cfg.get('sourceMode') or cfg.get('source_mode') or 'search_mix').lower()
    if source_mode == 'fyp_only':
        return current, active_keyword
    # search_only: остаёмся в плеере, листаем ArrowDown — не возвращаемся на сетку
    if source_mode == 'search_only':
        return current, active_keyword

    keywords = _keywords(cfg)
    if not keywords:
        return current, active_keyword
    mix_ratio = _cfg_int(cfg, 'nicheMixRatio', 'niche_mix_ratio', default=30)
    if random.randint(1, 100) <= max(5, mix_ratio // 3):
        kw = random.choice(keywords)
        try:
            _start_search_session(page, human, kw, label=label)
            return 'search', kw
        except Exception:
            return current, active_keyword
    if current != 'fyp':
        try:
            _return_to_recommendations(page, human, label=label)
            return 'fyp', None
        except Exception:
            pass
    return current, active_keyword


_FYP_PLAYER_SELECTORS = [
    '[data-e2e="recommend-list-item-container"]',
    '[data-e2e="browse-video"]',
    'div[class*="DivVideoContainer"]',
    'video',
]

_NAV_DOWN_SELECTORS = [
    'button[aria-label*="Go to next video"]',
    'button[aria-label*="Next video"]',
    'button[aria-label*="Scroll down"]',
    'button[aria-label*="Следующ"]',
    'button[aria-label*="Далее"]',
]


def _current_video_signature(page) -> str:
    try:
        sig = page.evaluate(
            """() => {
              const url = location.href || '';
              const m = url.match(/\\/video\\/(\\d+)/);
              if (m) return 'id:' + m[1];
              const desc = document.querySelector(
                '[data-e2e="browse-video-desc"], [data-e2e="video-desc"]'
              );
              const user = document.querySelector(
                '[data-e2e="browse-username"], [data-e2e="video-author-avatar"] a, a[data-e2e="browse-user-avatar"]'
              );
              const d = (desc && desc.innerText || '').trim().slice(0, 140);
              const u = (user && (user.innerText || user.getAttribute('href') || '')).trim();
              if (u || d) return (u + '|' + d);
              return url;
            }"""
        )
        return str(sig or page.url or '')
    except Exception:
        return page.url or ''


def _focus_fyp_player(page, human) -> bool:
    try:
        page.bring_to_front()
    except Exception:
        pass
    for sel in _FYP_PLAYER_SELECTORS:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0 and loc.is_visible(timeout=1200):
                box = loc.bounding_box()
                if box and box.get('width') and box.get('height'):
                    x = box['x'] + box['width'] * random.uniform(0.35, 0.55)
                    y = box['y'] + box['height'] * random.uniform(0.35, 0.55)
                    human.move_mouse_to(x, y)
                    page.mouse.click(x, y)
                    random_delay(0.15, 0.4)
                    return True
                loc.click(timeout=2000)
                random_delay(0.15, 0.4)
                return True
        except Exception:
            continue
    try:
        vp = page.viewport_size or {'width': 1280, 'height': 720}
        x = int(vp['width'] * 0.5)
        y = int(vp['height'] * 0.5)
        human.move_mouse_to(x, y)
        page.mouse.click(x, y)
        return True
    except Exception:
        return False


def _click_nav_down_button(page, human) -> bool:
    for sel in _NAV_DOWN_SELECTORS:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0 and loc.is_visible(timeout=1000):
                human.human_click(loc)
                return True
        except Exception:
            continue
    try:
        clicked = page.evaluate(
            """() => {
              const buttons = [...document.querySelectorAll('button')].filter((b) => {
                const r = b.getBoundingClientRect();
                return r.width > 8 && r.height > 8
                  && r.left > window.innerWidth * 0.82
                  && r.top > window.innerHeight * 0.42
                  && r.bottom < window.innerHeight * 0.92;
              });
              if (!buttons.length) return false;
              buttons.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
              const down = buttons[buttons.length - 1];
              down.click();
              return true;
            }"""
        )
        return bool(clicked)
    except Exception:
        return False


def _press_arrow_down_once(page):
    try:
        page.keyboard.press(_NEXT_KEY, delay=random.randint(30, 90))
    except Exception:
        pass


def _goto_next_video_in_player(page, human):
    """Ровно одно листание в полноэкранном плеере; повтор при застревании на том же ролике."""
    sig_before = _current_video_signature(page)
    for attempt in range(3):
        _focus_fyp_player(page, human)
        random_delay(0.15, 0.35)
        _press_arrow_down_once(page)
        random_delay(0.9, 1.5)
        sig_after = _current_video_signature(page)
        if sig_after and sig_after != sig_before:
            return True
        if attempt == 0:
            _click_nav_down_button(page, human)
            random_delay(0.8, 1.3)
            sig_after = _current_video_signature(page)
            if sig_after and sig_after != sig_before:
                return True
        if attempt == 1:
            human.smooth_scroll('down', amount=random.randint(400, 700))
            random_delay(0.6, 1.0)
    return False


def _next_video(page, human, cfg=None, feed_kind='fyp', active_keyword=None, label=''):
    if feed_kind == 'search' and not _is_in_video_player(page):
        kws = _keywords(cfg or {})
        kw = active_keyword or (random.choice(kws) if kws else None)
        if kw:
            _start_search_session(page, human, kw, label=label)
        return

    if _is_in_video_player(page) or feed_kind == 'fyp':
        _goto_next_video_in_player(page, human)
        return

    human.smooth_scroll('down', amount=random.randint(700, 950))


def _try_share(page, human):
    if not _click_first(page, human, _SHARE_SELECTORS):
        return False
    random_delay(0.4, 0.9)
    try:
        page.keyboard.press('Escape')
    except Exception:
        pass
    return True


def run_session(page, label, session, index, total, config):
    cfg = config or {}
    dur_min = _cfg_int(cfg, 'durationMin', 'duration_min', default=3)
    dur_max = _cfg_int(cfg, 'durationMax', 'duration_max', default=8)
    watch_min = _cfg_int(cfg, 'watchMin', 'watch_min_sec', default=4)
    watch_max = _cfg_int(cfg, 'watchMax', 'watch_max_sec', default=20)
    pause_min = _cfg_int(cfg, 'pauseMin', 'pause_min_ms', default=800) / 1000.0
    pause_max = _cfg_int(cfg, 'pauseMax', 'pause_max_ms', default=2200) / 1000.0

    if dur_min > dur_max:
        dur_min, dur_max = dur_max, dur_min
    if watch_min > watch_max:
        watch_min, watch_max = watch_max, watch_min

    likes_on = _cfg_bool(cfg, 'likesEnabled', 'likes_enabled', default=True)
    subs_on = _cfg_bool(cfg, 'subsEnabled', 'subs_enabled', default=False)
    save_on = _cfg_bool(cfg, 'saveEnabled', 'save_enabled', default=False)
    share_on = _cfg_bool(cfg, 'shareEnabled', 'share_enabled', default=False)

    like_prob = (_cfg_int(cfg, 'likeProbability', 'like_prob', default=25) / 100.0) if likes_on else 0
    follow_prob = (_cfg_int(cfg, 'subProbability', 'follow_prob', default=5) / 100.0) if subs_on else 0
    save_prob = (_cfg_int(cfg, 'saveProbability', 'save_prob', default=10) / 100.0) if save_on else 0
    share_prob = (_cfg_int(cfg, 'shareProbability', 'share_prob', default=5) / 100.0) if share_on else 0

    session_seconds = random.randint(dur_min * 60, dur_max * 60)
    base_pct = int((index / max(total, 1)) * 100)
    human = HumanSimulator(page)
    page, human = ensure_tiktok_session(page, human, label=label)

    progress('tiktok_warmup', base_pct, f'{label}: открываю TikTok')
    try:
        feed_kind, active_keyword = _goto_feed(page, human, cfg, label=label)
        random_delay(1.5, 3.5)
        assert_page_healthy(page)
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f'{label}: не удалось открыть TikTok — {e}') from e

    start = time.time()
    end_time = start + session_seconds
    watched = likes = follows = saves = shares = 0

    while time.time() < end_time:
        if feed_kind == 'search' and not _is_in_video_player(page):
            kws = _keywords(cfg)
            kw = active_keyword or (random.choice(kws) if kws else None)
            if kw:
                _start_search_session(page, human, kw, label=label)

        elapsed = time.time() - start
        pct = base_pct + int((elapsed / session_seconds) * (100 / max(total, 1)))
        watch_sec = random.randint(watch_min, watch_max)
        progress('tiktok_warmup', min(pct, 99), f'{label}: видео #{watched + 1} (~{watch_sec}с)')

        human.watch_for(watch_sec)
        watched += 1

        if like_prob > 0 and random.random() < like_prob and _click_first(page, human, _LIKE_SELECTORS):
            likes += 1

        if follow_prob > 0 and random.random() < follow_prob and _click_first(page, human, _FOLLOW_SELECTORS):
            follows += 1

        if save_prob > 0 and random.random() < save_prob and _click_first(page, human, _SAVE_SELECTORS):
            saves += 1

        if share_prob > 0 and random.random() < share_prob and _try_share(page, human):
            shares += 1

        assert_page_healthy(page)
        _next_video(page, human, cfg, feed_kind, active_keyword=active_keyword, label=label)
        if _is_in_video_player(page):
            if random.random() < 0.2:
                human.idle_mouse_movement(duration_sec=random.uniform(0.3, 0.7))
        else:
            human.random_micro_action()
        random_delay(pause_min, pause_max)

        if watched % 4 == 0:
            feed_kind, active_keyword = _maybe_switch_source(
                page, human, cfg, feed_kind, active_keyword=active_keyword, label=label,
            )

    progress(
        'tiktok_warmup',
        min(base_pct + int(100 / max(total, 1)), 100),
        f'{label}: {watched} видео, ♥{likes}, +{follows}, ★{saves}, ↗{shares}',
    )
    return {
        'profileId': session.get('profileId'),
        'login': label,
        'watched': watched,
        'likes': likes,
        'follows': follows,
        'saves': saves,
        'shares': shares,
        'seconds': int(time.time() - start),
    }


def main():
    from common.utils import load_config
    config = load_config()
    run_playwright_sessions(config, 'tiktok_warmup', run_session, 'Симуляция TikTok прогрева (нет CDP)')


if __name__ == '__main__':
    main()
