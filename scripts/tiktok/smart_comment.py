#!/usr/bin/env python3
"""TikTok — умный комментинг: листает комментарии сверху вниз, отвечает по фильтру."""
from __future__ import annotations

import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from common.utils import progress, random_delay
from common.session_runner import run_playwright_sessions
from common.human_sim import HumanSimulator

from tiktok.comment_parser import (
    extract_video_id,
    iterate_comments_top_down,
    wait_for_comments_loaded,
)
from tiktok.comment_poster import (
    ensure_comments_panel_open,
    post_reply,
    post_root_comment,
    read_caption,
)
from tiktok.comment_gen import generate_reply_text
from tiktok.page_health import assert_page_healthy
from tiktok.navigation import (
    ensure_tiktok_session,
    normalize_video_input,
    open_tiktok_video,
    parse_video_url,
    profile_url_for,
)
from tiktok.search_nav import micro_warmup_fyp

_LIKE_VIDEO_SELECTORS = [
    '[data-e2e="browse-like-icon"]',
    '[data-e2e="like-icon"]',
    '[data-e2e="video-like-icon"]',
]
_FOLLOW_VIDEO_SELECTORS = [
    '[data-e2e="browse-follow"]',
    '[data-e2e="feed-follow"]',
    'button:has-text("Follow")',
    'button:has-text("Подписаться")',
]


def _cfg_int(cfg, *keys, default=0):
    for key in keys:
        if key in cfg and cfg[key] is not None:
            try:
                return int(cfg[key])
            except (TypeError, ValueError):
                pass
    return default


def _cfg_bool(cfg, *keys, default=False):
    for key in keys:
        if key in cfg:
            return bool(cfg[key])
    return default


def _video_urls(cfg) -> list[str]:
    raw = cfg.get("videoUrls") or cfg.get("video_urls") or []
    if isinstance(raw, str):
        lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    else:
        lines = [str(x).strip() for x in raw if str(x).strip()]

    urls = []
    for line in lines:
        try:
            normalized = normalize_video_input(line)
        except ValueError as e:
            progress("tiktok_smart_comment", None, f"пропуск URL «{line[:50]}»: {e}")
            continue
        if normalized != line:
            progress("tiktok_smart_comment", None, f"короткая ссылка → {normalized}")
        urls.append(normalized)
    return urls


def _entry_url_from_cfg(cfg) -> str:
    raw = cfg.get("videoUrls") or cfg.get("video_urls") or []
    lines = raw if isinstance(raw, list) else str(raw).splitlines()
    for line in lines:
        try:
            normalized = normalize_video_input(str(line).strip())
        except ValueError:
            continue
        ref = parse_video_url(normalized)
        if ref and ref.username:
            return profile_url_for(ref)
    return ''


def _replied_set(cfg) -> set[str]:
    keys = cfg.get("repliedKeys") or cfg.get("replied_keys") or []
    return {str(k) for k in keys}


def _dedup_key(video_id: str, parent_id: str, profile_id: str) -> str:
    return f"{video_id}|{parent_id}|{profile_id}"


def _click_first(page, human, selectors) -> bool:
    for sel in selectors:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0 and loc.is_visible(timeout=1200):
                human.human_click(loc)
                return True
        except Exception:
            continue
    return False


def _open_video(page, human, url: str, label: str = '', session_ready: bool = False):
    page, human = open_tiktok_video(
        page,
        human,
        url,
        label=label,
        session_ready=session_ready,
        stage='tiktok_smart_comment',
    )
    return page, human


def _between_comments(cfg, label=''):
    dmin = _cfg_int(cfg, "delayMinSec", "delay_min_sec", default=7)
    dmax = _cfg_int(cfg, "delayMaxSec", "delay_max_sec", default=11)
    if dmin > dmax:
        dmin, dmax = dmax, dmin
    pause = random.uniform(float(dmin), float(dmax))
    progress(
        "tiktok_smart_comment",
        None,
        f"{label}: пауза {pause:.0f} сек (настройка {dmin}–{dmax})" if label else f"пауза {pause:.0f} сек",
    )
    time.sleep(pause)


def _maybe_video_actions(page, human, cfg):
    if _cfg_bool(cfg, "likeVideoEnabled", "like_video_enabled", default=False):
        prob = _cfg_int(cfg, "likeVideoProb", "like_video_prob", default=50) / 100.0
        if random.random() < prob:
            _click_first(page, human, _LIKE_VIDEO_SELECTORS)
    if _cfg_bool(cfg, "followVideoEnabled", "follow_video_enabled", default=False):
        prob = _cfg_int(cfg, "followVideoProb", "follow_video_prob", default=20) / 100.0
        if random.random() < prob:
            _click_first(page, human, _FOLLOW_VIDEO_SELECTORS)


def _process_video(page, human, cfg, state, profile_id, own_username, video_url, label):
    video_id = extract_video_id(video_url)
    replied = _replied_set(cfg)
    new_keys: list[str] = []
    posted = 0
    limit = _cfg_int(cfg, "commentsPerVideo", "comments_per_video", default=20)
    like_parent_prob = (
        _cfg_int(cfg, "likeParentProb", "like_parent_prob", default=30) / 100.0
        if _cfg_bool(cfg, "likeParentEnabled", "like_parent_enabled", default=True)
        else 0.0
    )

    progress("tiktok_smart_comment", None, f"{label}: открываю {video_url[:60]}…")
    page, human = _open_video(
        page,
        human,
        video_url,
        label=label,
        session_ready=bool(state.get("tiktokReady")),
    )
    state["page"] = page
    state["human"] = human
    _maybe_video_actions(page, human, cfg)

    progress("tiktok_smart_comment", None, f"{label}: жду загрузку видео…")
    random_delay(3.0, 5.0)
    ensure_comments_panel_open(page, human)
    wait_for_comments_loaded(page, timeout_sec=20.0)
    random_delay(1.5, 2.5)

    caption = read_caption(page)
    max_age = _cfg_int(cfg, "commentMaxAgeDays", "comment_max_age_days", default=7)
    date_on = _cfg_bool(cfg, "commentDateFilterEnabled", "comment_date_filter_enabled", default=True)
    scroll_stats: dict = {}
    progress(
        "tiktok_smart_comment",
        None,
        f"{label}: листаю комментарии сверху вниз, лимит {limit}"
        + (f", только ≤{max_age} дн." if date_on else ""),
    )

    failed_posts = 0
    for comment in iterate_comments_top_down(
        page, human, cfg, own_username, stats=scroll_stats
    ):
        if posted >= limit:
            break
        parent_id = comment.get("parentId") or str(comment.get("index", 0))
        dkey = _dedup_key(video_id, parent_id, profile_id)
        if dkey in replied:
            continue

        text = generate_reply_text(
            comment.get("text") or "",
            caption,
            cfg,
            state,
        )
        if not text:
            progress("tiktok_smart_comment", None, f"{label}: пустой текст ответа — пропуск")
            continue

        idx = int(comment.get("index", 0))
        parent_text = comment.get("text") or ""
        author = comment.get("author") or ""

        progress(
            "tiktok_smart_comment",
            None,
            f"{label}: Reply → «{parent_text[:30] or f'#{idx}'}…»",
        )

        ok = post_reply(
            page,
            human,
            idx,
            text,
            like_prob=like_parent_prob,
            author=author,
            parent_text=parent_text,
        )
        if not ok:
            failed_posts += 1
            progress(
                "tiktok_smart_comment",
                None,
                f"{label}: не удалось ответить на «{parent_text[:35]}…» (@{author})",
            )
            if failed_posts >= 3:
                progress(
                    "tiktok_smart_comment",
                    None,
                    f"{label}: много неудачных отправок — увеличьте паузу или проверьте аккаунт",
                )
                break
            continue

        posted += 1
        replied.add(dkey)
        new_keys.append(dkey)
        progress(
            "tiktok_smart_comment",
            None,
            f"{label}: +1 «{text[:40]}…» ({posted}/{limit})",
        )
        _between_comments(cfg, label=label)
        assert_page_healthy(page)

    progress(
        "tiktok_smart_comment",
        None,
        f"{label}: просмотрено {scroll_stats.get('scanned', 0)}, "
        f"подошло {scroll_stats.get('yielded', 0)}, "
        f"отсеяно фильтром {scroll_stats.get('skippedFilter', 0)}, "
        f"ответов {posted}/{limit}",
    )

    if posted == 0 and scroll_stats.get("yielded", 0) == 0 and scroll_stats.get("scanned", 0) > 0:
        progress(
            "tiktok_smart_comment",
            None,
            f"{label}: нет свежих комментов — ослабьте фильтр даты или увеличьте «макс. возраст»",
        )
    elif posted == 0 and scroll_stats.get("scanned", 0) == 0:
        progress("tiktok_smart_comment", None, f"{label}: комментарии не найдены под видео")

    if posted < limit and _cfg_bool(cfg, "rootCommentEnabled", "root_comment_enabled", default=False):
        root_text = generate_reply_text("", caption, cfg, state)
        if root_text and post_root_comment(page, human, root_text):
            posted += 1
            progress("tiktok_smart_comment", None, f"{label}: корневой коммент «{root_text[:40]}…»")
    elif posted == 0 and failed_posts > 0:
        progress(
            "tiktok_smart_comment",
            None,
            f"{label}: 0 комментариев — не удалось нажать «Ответить» или отправить ({failed_posts} попыток)",
        )

    return {
        "videoUrl": video_url,
        "videoId": video_id,
        "commentsPosted": posted,
        "repliedKeys": new_keys,
    }


def run_session(page, label, session, index, total, config):
    cfg = config or {}
    profile_id = str(session.get("profileId") or "")
    own_username = (session.get("login") or label or "").lstrip("@")
    urls = _video_urls(cfg)
    if not urls:
        raise RuntimeError(f"{label}: не указаны URL видео")

    human = HumanSimulator(page)
    state: dict = {"poolIndex": int(cfg.get("poolIndex") or 0)}
    entry_url = _entry_url_from_cfg(cfg)
    page, human = ensure_tiktok_session(
        page,
        human,
        label=label,
        stage='tiktok_smart_comment',
        entry_url=entry_url,
    )
    state["page"] = page
    state["human"] = human
    state["tiktokReady"] = True
    dmin = _cfg_int(cfg, "delayMinSec", "delay_min_sec", default=7)
    dmax = _cfg_int(cfg, "delayMaxSec", "delay_max_sec", default=11)
    like_on = _cfg_bool(cfg, "likeParentEnabled", "like_parent_enabled", default=True)
    if _cfg_bool(cfg, "preWarmupEnabled", "pre_warmup_enabled", default=True):
        presses = _cfg_int(cfg, "preWarmupScrolls", "pre_warmup_scrolls", default=2)
        progress("tiktok_smart_comment", None, f"{label}: короткий прогрев FYP ({presses} рол.) перед комментингом")
        micro_warmup_fyp(page, human, arrow_presses=presses)
        page = state.get("page", page)
        human = state.get("human", human)
    progress(
        "tiktok_smart_comment",
        None,
        f"{label}: TikTok готов, видео: {len(urls)}, пауза {dmin}–{dmax} сек, лайк: {'да' if like_on else 'нет'}",
    )
    video_stats = []
    all_keys: list[str] = []
    total_posted = 0
    base_pct = int((index / max(total, 1)) * 100)

    for vi, url in enumerate(urls):
        if not url.startswith("http"):
            url = f"https://www.tiktok.com{url if url.startswith('/') else '/' + url}"
        page = state.get("page", page)
        human = state.get("human", human)
        try:
            stat = _process_video(page, human, cfg, state, profile_id, own_username, url, label)
            video_stats.append(stat)
            total_posted += stat.get("commentsPosted", 0)
            all_keys.extend(stat.get("repliedKeys") or [])
        except RuntimeError:
            raise
        except Exception as e:
            progress("tiktok_smart_comment", None, f"{label}: ошибка на {url[:50]} — {e}")
            video_stats.append({
                "videoUrl": url,
                "videoId": extract_video_id(url),
                "commentsPosted": 0,
                "error": str(e),
            })
        pct = base_pct + int(((vi + 1) / max(len(urls), 1)) * (100 / max(total, 1)))
        progress(
            "tiktok_smart_comment",
            min(pct, 99),
            f"{label}: видео {vi + 1}/{len(urls)}, всего комм. {total_posted}",
        )
        if vi < len(urls) - 1:
            random_delay(2.0, 5.0)

    progress(
        "tiktok_smart_comment",
        min(base_pct + int(100 / max(total, 1)), 100),
        f"{label}: готово, {total_posted} комментариев на {len(urls)} видео",
    )
    return {
        "profileId": profile_id,
        "login": label,
        "videoStats": video_stats,
        "repliedKeys": all_keys,
        "totalPosted": total_posted,
        "poolIndex": state.get("poolIndex", 0),
        "keepBrowserOpen": cfg.get("keepBrowserOpen", cfg.get("keep_browser_open", total_posted == 0)),
    }


def main():
    from common.utils import load_config

    config = load_config()
    run_playwright_sessions(
        config,
        "tiktok_smart_comment",
        run_session,
        "Симуляция TikTok комментинга (нет CDP)",
    )


if __name__ == "__main__":
    main()
