#!/usr/bin/env python3
"""TikTok — умный комментинг: листает комментарии сверху вниз, отвечает по фильтру."""
from __future__ import annotations

import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from common.utils import progress, random_delay, emit_replied_keys
from common.session_runner import run_playwright_sessions
from common.human_sim import HumanSimulator

from tiktok.comment_parser import (
    dedup_keys_for_comment,
    extract_video_id,
    is_comment_already_replied,
    iterate_comments_top_down,
    parent_thread_has_own_reply,
    seed_replied_keys_from_dom,
    wait_for_comments_loaded,
)
from tiktok.detect_login import resolve_tiktok_username
from tiktok.comment_poster import (
    ensure_comments_panel_open,
    post_reply,
    post_root_comment,
    read_caption,
    scroll_comment_list,
)
from tiktok.comment_gen import generate_reply_text
from tiktok.navigation import (
    ensure_tiktok_session,
    guard_session_or_recover,
    normalize_video_input,
    open_tiktok_video,
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
    """Вход только на FYP — прямой goto @profile триггерит WAF «Please wait»."""
    return ''


def _replied_set(cfg) -> set[str]:
    keys = cfg.get("repliedKeys") or cfg.get("replied_keys") or []
    return {str(k) for k in keys}


def _register_replied(replied: set[str], video_id: str, profile_id: str, comment: dict) -> list[str]:
    added: list[str] = []
    for k in dedup_keys_for_comment(video_id, profile_id, comment):
        if k not in replied:
            replied.add(k)
            added.append(k)
    return added


def _refresh_replied_from_dom(page, video_id: str, profile_id: str, own_username: str, replied: set[str]) -> list[str]:
    added: list[str] = []
    for k in seed_replied_keys_from_dom(page, video_id, profile_id, own_username):
        if k not in replied:
            replied.add(k)
            added.append(k)
    return added


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


_SPAM_MARKERS = (
    "ютуб", "youtube", "подпис", "заработ", "деньг", "скидк", "промокод",
    "telegram", "телег", "whatsapp", "вацап", "http", "www.", ".com",
)


def _spam_risk_hint(text: str) -> str | None:
    low = (text or "").lower()
    hits = [m for m in _SPAM_MARKERS if m in low]
    if len(hits) >= 2 or (hits and len(low) > 60):
        return f"риск скрытия TikTok (маркеры: {', '.join(hits[:4])})"
    if hits:
        return f"возможен фильтр TikTok ({hits[0]})"
    return None


def _watch_target_video(page, human, cfg, label: str = "") -> None:
    wmin = _cfg_int(cfg, "watchMinSec", "watch_min_sec", default=12)
    wmax = _cfg_int(cfg, "watchMaxSec", "watch_max_sec", default=28)
    if wmin <= 0 and wmax <= 0:
        return
    if wmin > wmax:
        wmin, wmax = wmax, wmin
    watch_sec = random.randint(max(3, wmin), max(wmin, wmax))
    msg = f"{label}: смотрю видео ~{watch_sec}с перед комментами" if label else f"смотрю видео ~{watch_sec}с"
    progress("tiktok_smart_comment", None, msg)
    human.watch_for(watch_sec)


def _maybe_video_actions(page, human, cfg):
    if _cfg_bool(cfg, "likeVideoEnabled", "like_video_enabled", default=False):
        prob = _cfg_int(cfg, "likeVideoProb", "like_video_prob", default=50) / 100.0
        if random.random() < prob:
            _click_first(page, human, _LIKE_VIDEO_SELECTORS)
    if _cfg_bool(cfg, "followVideoEnabled", "follow_video_enabled", default=False):
        prob = _cfg_int(cfg, "followVideoProb", "follow_video_prob", default=20) / 100.0
        if random.random() < prob:
            _click_first(page, human, _FOLLOW_VIDEO_SELECTORS)


def _process_video(page, human, cfg, state, profile_id, own_username, video_url, label, replied_cache: set[str] | None = None):
    video_id = extract_video_id(video_url)
    replied = replied_cache if replied_cache is not None else _replied_set(cfg)
    cfg = {**cfg, "profileId": profile_id, "ownUsernames": list({own_username, *(cfg.get("ownUsernames") or [])})}
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

    page, human = guard_session_or_recover(page, human, label=label, stage='tiktok_smart_comment')
    state["page"] = page
    state["human"] = human

    progress("tiktok_smart_comment", None, f"{label}: жду загрузку видео…")
    random_delay(3.0, 5.0)
    _watch_target_video(page, human, cfg, label=label)
    ensure_comments_panel_open(page, human)
    wait_for_comments_loaded(page, timeout_sec=20.0)
    random_delay(1.5, 2.5)

    seeded = seed_replied_keys_from_dom(page, video_id, profile_id, own_username)
    new_seed_keys: list[str] = []
    for k in seeded:
        if k not in replied:
            replied.add(k)
            new_seed_keys.append(k)
    if new_seed_keys:
        emit_replied_keys(new_seed_keys)
        progress(
            "tiktok_smart_comment",
            None,
            f"{label}: на видео уже есть {len(new_seed_keys)} наших ответов — пропущу",
        )

    page, human = guard_session_or_recover(page, human, label=label, stage='tiktok_smart_comment')
    state["page"] = page
    state["human"] = human

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
    session_text_counts: dict[str, int] = {}
    for comment in iterate_comments_top_down(
        page,
        human,
        cfg,
        own_username,
        stats=scroll_stats,
        replied_keys=replied,
        video_id=video_id,
        profile_id=profile_id,
    ):
        if posted >= limit:
            break
        if is_comment_already_replied(replied, video_id, profile_id, comment):
            scroll_stats["skippedReplied"] = int(scroll_stats.get("skippedReplied", 0)) + 1
            continue

        author = comment.get("author") or ""
        parent_text = comment.get("text") or ""
        if own_username and parent_thread_has_own_reply(page, own_username, author, parent_text):
            scroll_stats["skippedReplied"] = int(scroll_stats.get("skippedReplied", 0)) + 1
            added = _register_replied(replied, video_id, profile_id, comment)
            if added:
                emit_replied_keys(added)
            continue

        text = generate_reply_text(
            comment.get("text") or "",
            caption,
            cfg,
            state,
        )
        if not text:
            from tiktok.comment_filters import parent_offers_service
            if parent_offers_service(parent_text):
                progress("tiktok_smart_comment", None, f"{label}: пропуск — автор продаёт услугу")
            else:
                progress("tiktok_smart_comment", None, f"{label}: пустой текст ответа — пропуск")
            continue

        norm_text = text.strip().lower()
        session_text_counts[norm_text] = session_text_counts.get(norm_text, 0) + 1
        if session_text_counts[norm_text] == 4:
            progress(
                "tiktok_smart_comment",
                None,
                f"{label}: ⚠ один и тот же текст уже 3+ раз — TikTok часто скрывает такие ответы от других",
            )
        spam_hint = _spam_risk_hint(text)
        if spam_hint and session_text_counts[norm_text] <= 1:
            progress("tiktok_smart_comment", None, f"{label}: ⚠ {spam_hint}")

        idx = int(comment.get("index", 0))

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
            own_username=own_username or "",
        )
        if not ok:
            failed_posts += 1
            progress(
                "tiktok_smart_comment",
                None,
                f"{label}: не удалось ответить на «{parent_text[:35]}…» (@{author})",
            )
            scroll_comment_list(page, direction='down', amount=450)
            random_delay(0.8, 1.4)
            if failed_posts == 3:
                progress(
                    "tiktok_smart_comment",
                    None,
                    f"{label}: 3 неудачи подряд — проверьте лимиты TikTok, продолжаю листать",
                )
            continue

        failed_posts = 0
        posted += 1
        added_keys = _register_replied(replied, video_id, profile_id, comment)
        added_keys.extend(_refresh_replied_from_dom(page, video_id, profile_id, own_username, replied))
        new_keys.extend(added_keys)
        if added_keys:
            emit_replied_keys(added_keys)
        progress(
            "tiktok_smart_comment",
            None,
            f"{label}: +1 «{text[:40]}…» ({posted}/{limit})",
        )
        scroll_comment_list(page, direction='down', amount=380)
        random_delay(0.6, 1.1)
        _between_comments(cfg, label=label)
        page, human = guard_session_or_recover(page, human, label=label, stage='tiktok_smart_comment')
        state["page"] = page
        state["human"] = human

    progress(
        "tiktok_smart_comment",
        None,
        f"{label}: просмотрено {scroll_stats.get('scanned', 0)}, "
        f"подошло {scroll_stats.get('yielded', 0)}, "
        f"отсеяно фильтром {scroll_stats.get('skippedFilter', 0)}, "
        f"уже отвечали {scroll_stats.get('skippedReplied', 0)}, "
        f"ответов {posted}/{limit}",
    )
    reasons = scroll_stats.get("skipReasons") or {}
    if reasons:
        parts = ", ".join(f"{k}={v}" for k, v in sorted(reasons.items()))
        progress("tiktok_smart_comment", None, f"{label}: причины отсева: {parts}")

    if posted == 0 and scroll_stats.get("yielded", 0) == 0 and scroll_stats.get("scanned", 0) > 0:
        if reasons.get("date_old"):
            progress(
                "tiktok_smart_comment",
                None,
                f"{label}: все комменты старше лимита — увеличьте «макс. возраст» или выключите фильтр даты",
            )
        elif reasons.get("date_unknown"):
            progress(
                "tiktok_smart_comment",
                None,
                f"{label}: дата комментов не распознана — отключите «отсеивать без даты» или фильтр даты",
            )
        elif reasons:
            progress(
                "tiktok_smart_comment",
                None,
                f"{label}: ни один коммент не прошёл фильтры — проверьте ключевые слова, лайки, свои комменты",
            )
        else:
            progress(
                "tiktok_smart_comment",
                None,
                f"{label}: нет подходящих комментов — ослабьте фильтр даты или увеличьте «макс. возраст»",
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
    own_username = resolve_tiktok_username(page, human, session, label)
    if own_username:
        progress("tiktok_smart_comment", None, f"{label}: аккаунт @{own_username}")
    state["page"] = page
    state["human"] = human
    state["ownUsername"] = own_username
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
    replied_cache = _replied_set(cfg)
    if replied_cache:
        progress(
            "tiktok_smart_comment",
            None,
            f"{label}: в памяти {len(replied_cache)} уже отвеченных комментов",
        )
    base_pct = int((index / max(total, 1)) * 100)

    for vi, url in enumerate(urls):
        if not url.startswith("http"):
            url = f"https://www.tiktok.com{url if url.startswith('/') else '/' + url}"
        page = state.get("page", page)
        human = state.get("human", human)
        try:
            stat = _process_video(
                page, human, cfg, state, profile_id, own_username, url, label, replied_cache
            )
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
