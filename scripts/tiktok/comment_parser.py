"""TikTok — парсинг комментариев под видео (DOM scrape + дата + порядок в ленте)."""
from __future__ import annotations

import hashlib
import re
import time
from datetime import datetime, timedelta

_COMMENT_LIST_SELECTORS = [
    '[data-e2e="comment-list"]',
    '[data-e2e="browse-comment-list"]',
    'div[class*="CommentListContainer"]',
    'div[class*="DivCommentMain"]',
]

_OPEN_COMMENTS_SELECTORS = [
    '[data-e2e="browse-comment-icon"]',
    '[data-e2e="comment-icon"]',
    "button[aria-label*='comment' i]",
    "button[aria-label*='коммент' i]",
    "button[aria-label*='Read or add comments' i]",
]

_COLLECT_JS = r"""
() => {
  const norm = (s) => (s || '').trim();
  const seen = new Set();
  const out = [];

  function extractText(el) {
    const textEl = el.querySelector(
      '[data-e2e="comment-level-1"], span[data-e2e="comment-level-1"], span[data-e2e^="comment-level"], p[data-e2e^="comment-level"]'
    );
    if (textEl) return norm(textEl.innerText);
    for (const node of el.querySelectorAll('span[class*="TUXText"], p[class*="TUXText"], p')) {
      const t = norm(node.innerText);
      if (t.length < 3) continue;
      if (/^(reply|ответить|view|показать|\d+$|add comment)/i.test(t)) continue;
      if (t.includes('replies') || t.includes('ответ')) continue;
      if (/^\d{4}-\d{2}-\d{2}$/.test(t)) continue;
      if (/^\d+\s*(s|sec|m|min|h|hr|д|ч|нед|w|d|дн)/i.test(t)) continue;
      if (/ago|назад|тому|хв|дн/i.test(t)) continue;
      return t;
    }
    return '';
  }

  function extractLikes(el) {
    const likeEl = el.querySelector(
      '[data-e2e="comment-like-count"], [class*="LikeContainer"] span, [class*="like-count"]'
    );
    return norm(likeEl?.innerText || '0') || '0';
  }

  function extractReplyCount(el) {
    const viewEl = el.querySelector('[class*="ViewReplies"], [data-e2e="view-more-1"]');
    const vt = norm(viewEl?.innerText || '');
    const m2 = vt.match(/(\d+)/);
    return m2 ? parseInt(m2[1], 10) : 0;
  }

  function extractDateLabel(el) {
    const timeEl = el.querySelector(
      '[data-e2e="comment-time"], [data-e2e*="comment-time"], time, span[class*="TimeStamp"], span[class*="time-tag"]'
    );
    if (timeEl) {
      const attr = norm(timeEl.getAttribute('datetime') || timeEl.getAttribute('title') || '');
      if (attr) return attr;
      const tt = norm(timeEl.innerText);
      if (tt && tt.length <= 32) return tt;
    }
    const candidates = [...el.querySelectorAll('span, time, p')];
    for (const node of candidates) {
      const t = norm(node.innerText);
      if (!t || t.length > 32) continue;
      if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
      if (/^\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}$/.test(t)) return t;
      if (/^\d+\s*(s|sec|m|min|h|hr|д|ч|нед|w|d|дн|хв|мин|сек)/i.test(t)) return t;
      if (/\b(ago|назад|тому)\b/i.test(t)) return t;
      if (/^(just now|сейчас|щойно)$/i.test(t)) return t;
    }
    return '';
  }

  function pushComment(el, listOrder) {
    const authorEl = el.querySelector('a[href^="/@"]');
    const author = norm((authorEl?.getAttribute('href') || '').replace(/^\/@/, '').split('/')[0]);
    const text = extractText(el);
    if (!text) return;
    const key = (author || '?') + ':' + text.slice(0, 50);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      listOrder,
      text,
      likes: extractLikes(el),
      replyCount: extractReplyCount(el),
      author,
      dateLabel: extractDateLabel(el),
      pinned: !!el.querySelector('[data-e2e="comment-pin-icon"], [data-e2e="comment-pinned"]'),
    });
  }

  const itemSelectors = [
    '[data-e2e="comment-item"]',
    'div[class*="CommentObjectWrapper"]',
    'div[class*="CommentItemContainer"]',
    'div[class*="DivCommentItemWrapper"]',
    'div[class*="DivCommentObjectWrapper"]',
  ];
  const items = [];
  for (const sel of itemSelectors) {
    document.querySelectorAll(sel).forEach((el) => items.push(el));
  }
  if (items.length > 0) {
    items.forEach((el, i) => pushComment(el, i));
    return out;
  }

  const replyBtns = [...document.querySelectorAll('span, p, button, div[role="button"]')].filter((el) => {
    const t = norm(el.innerText);
    if (!/^(reply|ответить)$/i.test(t)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 8 && r.height > 8 && r.top > 0 && r.top < window.innerHeight;
  });
  replyBtns.forEach((btn, i) => {
    let parent = btn.parentElement;
    for (let j = 0; j < 10 && parent; j++) {
      if (parent.querySelector('a[href^="/@"]')) {
        pushComment(parent, i);
        break;
      }
      parent = parent.parentElement;
    }
  });
  return out;
}
"""

_COUNT_JS = r"""
() => {
  const sels = [
    '[data-e2e="comment-item"]',
    'div[class*="CommentObjectWrapper"]',
    'div[class*="CommentItemContainer"]',
  ];
  for (const s of sels) {
    const n = document.querySelectorAll(s).length;
    if (n > 0) return n;
  }
  return [...document.querySelectorAll('span, p')].filter(
    (e) => /^(reply|ответить)$/i.test((e.innerText || '').trim())
  ).length;
}
"""


def parse_count(raw: str) -> int:
    s = (raw or "").strip().upper().replace(",", "").replace(" ", "")
    if not s:
        return 0
    mult = 1
    if s.endswith("K"):
        mult, s = 1000, s[:-1]
    elif s.endswith("M"):
        mult, s = 1_000_000, s[:-1]
    elif s.endswith("B"):
        mult, s = 1_000_000_000, s[:-1]
    try:
        return int(float(s) * mult)
    except (TypeError, ValueError):
        m = re.search(r"(\d+)", s)
        return int(m.group(1)) if m else 0


def parse_comment_age_hours(date_label: str, now: datetime | None = None) -> float | None:
    """Возраст комментария в часах. None — не удалось распознать."""
    raw = (date_label or "").strip().lower()
    if not raw:
        return None
    now = now or datetime.now()

    if raw in ("just now", "сейчас", "щойно"):
        return 0.0

    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", raw)
    if m:
        try:
            dt = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            return max(0.0, (now - dt).total_seconds() / 3600.0)
        except ValueError:
            return None

    m = re.match(r"^(\d+)\s*(s|sec|сек\.?|с)$", raw)
    if m:
        return int(m.group(1)) / 3600.0
    m = re.match(r"^(\d+)\s*(m|min|мин\.?|м)$", raw)
    if m:
        return int(m.group(1)) / 60.0
    m = re.match(r"^(\d+)\s*(h|hr|ч\.?|г|год)$", raw)
    if m:
        return float(m.group(1))
    m = re.match(r"^(\d+)\s*(d|day|дн\.?|д)$", raw)
    if m:
        return float(m.group(1)) * 24.0
    m = re.match(r"^(\d+)\s*(w|week|нед\.?|н)$", raw)
    if m:
        return float(m.group(1)) * 24.0 * 7.0
    # compact: 2d, 3h, 5m
    m = re.match(r"^(\d+)(d|h|m|s|w)$", raw)
    if m:
        n = int(m.group(1))
        unit = m.group(2)
        if unit == "d":
            return float(n) * 24.0
        if unit == "w":
            return float(n) * 24.0 * 7.0
        if unit == "h":
            return float(n)
        if unit == "m":
            return n / 60.0
        if unit == "s":
            return n / 3600.0

    m = re.search(r"(\d+)\s*(second|minute|hour|day|week|секунд|минут|час|дн|нед)", raw)
    if m:
        n = int(m.group(1))
        unit = m.group(2)
        if unit.startswith(("s", "сек")):
            return n / 3600.0
        if unit.startswith(("m", "мин")):
            return n / 60.0
        if unit.startswith(("h", "час", "ч")):
            return float(n)
        if unit.startswith(("d", "дн")):
            return float(n) * 24.0
        if unit.startswith(("w", "нед")):
            return float(n) * 24.0 * 7.0

    if "ago" in raw or "назад" in raw or "тому" in raw:
        m = re.search(r"(\d+)", raw)
        if m:
            n = int(m.group(1))
            if "sec" in raw or "сек" in raw or re.search(r"\d+\s*s\b", raw):
                return n / 3600.0
            if "min" in raw or "мин" in raw or "хв" in raw:
                return n / 60.0
            if "hour" in raw or "час" in raw or re.search(r"\d+\s*h\b", raw):
                return float(n)
            if "day" in raw or "дн" in raw:
                return float(n) * 24.0
            if "week" in raw or "нед" in raw:
                return float(n) * 24.0 * 7.0

    return None


def extract_video_id(url: str) -> str:
    m = re.search(r"/video/(\d+)", url or "")
    return m.group(1) if m else (url or "")[:64]


def _open_comments_panel(page, human, timeout_sec=20.0) -> bool:
    for sel in _COMMENT_LIST_SELECTORS + ['[data-e2e="comment-input"]', 'div[contenteditable="true"]']:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0 and loc.is_visible(timeout=1000):
                return True
        except Exception:
            continue

    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        for sel in _OPEN_COMMENTS_SELECTORS:
            try:
                loc = page.locator(sel).first
                if loc.count() > 0 and loc.is_visible(timeout=1500):
                    human.human_click(loc)
                    time.sleep(1.5)
                    return True
            except Exception:
                continue
        time.sleep(0.4)
    return False


def wait_for_comments_loaded(page, timeout_sec=18.0) -> bool:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            count = page.evaluate(_COUNT_JS) or 0
            if int(count) > 0:
                return True
        except Exception:
            pass
        time.sleep(0.6)
    return False


def _scroll_list(page, delta: int) -> bool:
    for sel in _COMMENT_LIST_SELECTORS:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0:
                loc.evaluate("(el, d) => { el.scrollTop = el.scrollTop + d; }", delta)
                return True
        except Exception:
            continue
    return False


def _scroll_list_to_bottom(page) -> bool:
    for sel in _COMMENT_LIST_SELECTORS:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0:
                loc.evaluate("el => { el.scrollTop = el.scrollHeight; }")
                return True
        except Exception:
            continue
    return False


def _scroll_list_to_top(page) -> bool:
    for sel in _COMMENT_LIST_SELECTORS:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0:
                loc.evaluate("el => { el.scrollTop = 0; }")
                return True
        except Exception:
            continue
    return False


def stable_comment_parent_id(author: str, text: str) -> str:
    """Стабильный ID комментария между запусками (не встроенный hash() — он сменный)."""
    author_key = (author or "?").strip().lower().lstrip("@")
    core = _comment_core_text(text)
    digest = hashlib.sha256(f"{author_key}\n{core}".encode("utf-8")).hexdigest()[:16]
    return f"{author_key}:{digest}"


def _normalize_comment_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def _comment_core_text(text: str) -> str:
    """Только текст родителя — без хвоста от вложенных ответов после раскрытия треда."""
    norm = _normalize_comment_text(text)
    if not norm:
        return ""
    line = norm.split("\n")[0].strip()
    return line[:96]


def _resolve_parent_id(seen: dict[str, dict], author: str, text: str) -> str:
    """Один и тот же комментарий не получает новый ID после раскрытия ответов в DOM."""
    pid = stable_comment_parent_id(author, text)
    if pid in seen:
        return pid
    author_l = (author or "").strip().lower().lstrip("@")
    core = _comment_core_text(text)
    if not author_l or not core:
        return pid
    prefix = core[:36]
    for existing_pid, row in seen.items():
        if (row.get("author") or "").strip().lower().lstrip("@") != author_l:
            continue
        existing_core = _comment_core_text(row.get("text") or "")
        if not existing_core:
            continue
        if (
            core.startswith(existing_core[:28])
            or existing_core.startswith(core[:28])
            or core[:24] == existing_core[:24]
        ):
            return existing_pid
    return pid


def dedup_keys_for_comment(video_id: str, profile_id: str, comment: dict) -> list[str]:
    author = (comment.get("author") or "").strip()
    text = comment.get("text") or ""
    pid = comment.get("parentId") or stable_comment_parent_id(author, text)
    keys = [f"{video_id}|{pid}|{profile_id}"]
    author_l = author.lower().lstrip("@")
    core = _comment_core_text(text)
    if author_l and core:
        core_digest = hashlib.sha256(f"{author_l}\n{core}".encode("utf-8")).hexdigest()[:12]
        keys.append(f"{video_id}|af:{author_l}:{core_digest}|{profile_id}")
    # Ключи из старых сборок (полный текст без core-нормализации)
    full_norm = _normalize_comment_text(text)
    if author_l and full_norm:
        legacy_digest = hashlib.sha256(f"{author_l}\n{full_norm}".encode("utf-8")).hexdigest()[:16]
        keys.append(f"{video_id}|{author_l}:{legacy_digest}|{profile_id}")
    return keys


def is_comment_already_replied(replied: set[str], video_id: str, profile_id: str, comment: dict) -> bool:
    return any(k in replied for k in dedup_keys_for_comment(video_id, profile_id, comment))


_HAS_OWN_REPLY_JS = r"""
({ ownUser, parentAuthor, textPrefix }) => {
  const norm = (s) => (s || '').trim().toLowerCase().replace(/^@/, '');
  const own = norm(ownUser);
  const wantAuthor = norm(parentAuthor);
  const prefix = norm(textPrefix).slice(0, 48);
  if (!own || !wantAuthor) return false;
  const items = document.querySelectorAll(
    '[data-e2e="comment-item"], div[class*="CommentObjectWrapper"], div[class*="CommentItemContainer"]'
  );
  for (const item of items) {
    const authorEl = item.querySelector('a[href^="/@"]');
    const a = norm((authorEl?.getAttribute('href') || '').replace(/^\/@/, '').split('/')[0]);
    if (a !== wantAuthor) continue;
    const parentEl = item.querySelector(
      '[data-e2e="comment-level-1"], span[data-e2e^="comment-level-1"], span[data-e2e^="comment-level"]'
    );
    const pt = norm(parentEl?.innerText || '');
    if (prefix && pt && !pt.startsWith(prefix.slice(0, 20)) && !pt.includes(prefix.slice(0, 16))) continue;
    const authors = item.querySelectorAll('a[href^="/@"]');
    for (const link of authors) {
      const u = norm((link.getAttribute('href') || '').replace(/^\/@/, '').split('/')[0]);
      if (u === own && u !== wantAuthor) return true;
    }
    const replies = item.querySelectorAll(
      '[data-e2e="comment-level-2"], span[data-e2e^="comment-level-2"]'
    );
    for (const lv of replies) {
      let block = lv.parentElement;
      for (let i = 0; i < 10 && block; i++) {
        const ae = block.querySelector('a[href^="/@"]');
        const u = norm((ae?.getAttribute('href') || '').replace(/^\/@/, '').split('/')[0]);
        if (u === own) return true;
        block = block.parentElement;
      }
    }
  }
  return false;
}
"""


def parent_thread_has_own_reply(page, own_username: str, author: str, parent_text: str) -> bool:
    own = (own_username or "").strip().lstrip("@")
    if not own:
        return False
    try:
        return bool(
            page.evaluate(
                _HAS_OWN_REPLY_JS,
                {
                    "ownUser": own,
                    "parentAuthor": (author or "").strip(),
                    "textPrefix": _comment_core_text(parent_text),
                },
            )
        )
    except Exception:
        return False


_OWN_REPLY_SEED_JS = r"""
(ownUser) => {
  const norm = (s) => (s || '').trim().toLowerCase().replace(/^@/, '');
  const own = norm(ownUser);
  if (!own) return [];
  const out = [];
  const items = document.querySelectorAll(
    '[data-e2e="comment-item"], div[class*="CommentObjectWrapper"], div[class*="CommentItemContainer"]'
  );
  for (const item of items) {
    const authors = item.querySelectorAll('a[href^="/@"]');
    if (!authors.length) continue;
    const parentAuthor = norm((authors[0].getAttribute('href') || '').replace(/^\/@/, '').split('/')[0]);
    const parentEl = item.querySelector(
      '[data-e2e="comment-level-1"], span[data-e2e^="comment-level-1"], span[data-e2e^="comment-level"]'
    );
    const parentText = (parentEl?.innerText || '').trim();
    if (!parentAuthor || !parentText) continue;
    let hasOwn = false;
    for (const a of authors) {
      const u = norm((a.getAttribute('href') || '').replace(/^\/@/, '').split('/')[0]);
      if (u === own && u !== parentAuthor) { hasOwn = true; break; }
    }
    const lvl2 = item.querySelectorAll('[data-e2e="comment-level-2"], span[data-e2e^="comment-level-2"]');
    for (const lv of lvl2) {
      const t = norm(lv.innerText || '');
      if (!t) continue;
      let block = lv.parentElement;
      for (let i = 0; i < 8 && block; i++) {
        const ae = block.querySelector('a[href^="/@"]');
        const u = norm((ae?.getAttribute('href') || '').replace(/^\/@/, '').split('/')[0]);
        if (u === own) { hasOwn = true; break; }
        block = block.parentElement;
      }
      if (hasOwn) break;
    }
    if (hasOwn) out.push({ parentAuthor, parentText: parentText.slice(0, 160) });
  }
  return out;
}
"""


def seed_replied_keys_from_dom(page, video_id: str, profile_id: str, own_username: str) -> list[str]:
    """Уже оставленные нами ответы под видео → dedup-ключи (даже если store пуст)."""
    own = (own_username or "").strip().lstrip("@")
    if not own:
        return []
    try:
        rows = page.evaluate(_OWN_REPLY_SEED_JS, own) or []
    except Exception:
        return []
    keys: list[str] = []
    seen: set[str] = set()
    for row in rows:
        comment = {
            "author": row.get("parentAuthor") or "",
            "text": row.get("parentText") or "",
        }
        for key in dedup_keys_for_comment(video_id, profile_id, comment):
            if key not in seen:
                seen.add(key)
                keys.append(key)
    return keys


def _merge_rows(seen: dict[str, dict], rows: list[dict], order_counter: list[int]) -> int:
    added = 0
    for row in rows:
        text = (row.get("text") or "").strip()
        author = (row.get("author") or "").strip()
        if not text:
            continue
        pid = _resolve_parent_id(seen, author, text)
        if pid in seen:
            continue
        age_h = parse_comment_age_hours(row.get("dateLabel") or "")
        seen[pid] = {
            "index": len(seen),
            "listOrder": order_counter[0],
            "parentId": pid,
            "text": text,
            "likeCount": parse_count(str(row.get("likes", "0"))),
            "replyCount": int(row.get("replyCount") or 0),
            "author": author,
            "isPinned": bool(row.get("pinned")),
            "dateLabel": row.get("dateLabel") or "",
            "ageHours": age_h,
        }
        order_counter[0] += 1
        added += 1
    return added


def _collect_once(page) -> list[dict]:
    try:
        return page.evaluate(_COLLECT_JS) or []
    except Exception:
        return []


def scrape_comments(page, human, scroll_depth: int = 5) -> list[dict]:
    """Собрать комментарии: верх → прокрутка вниз → дно. listOrder = позиция в ленте."""
    _open_comments_panel(page, human)
    wait_for_comments_loaded(page, timeout_sec=16.0)
    time.sleep(1.0)

    _scroll_list_to_top(page)
    time.sleep(0.6)

    seen: dict[str, dict] = {}
    order_counter = [0]
    depth = max(1, int(scroll_depth))

    _merge_rows(seen, _collect_once(page), order_counter)

    stable = 0
    for pass_i in range(depth):
        _scroll_list(page, 550)
        time.sleep(0.9)
        added = _merge_rows(seen, _collect_once(page), order_counter)
        if added == 0:
            stable += 1
        else:
            stable = 0
        if stable >= 2:
            break

    for _ in range(4):
        _scroll_list_to_bottom(page)
        time.sleep(1.0)
        added = _merge_rows(seen, _collect_once(page), order_counter)
        if added == 0:
            break

    return list(seen.values())


def _keyword_lines(cfg, *keys) -> list[str]:
    for key in keys:
        raw = cfg.get(key)
        if raw is None:
            continue
        if isinstance(raw, str):
            lines = [ln.strip().lower() for ln in raw.splitlines() if ln.strip()]
        else:
            lines = [str(x).strip().lower() for x in raw if str(x).strip()]
        if lines:
            return lines
    return []


def _text_matches_keywords(text: str, include: list[str], exclude: list[str]) -> bool:
    blob = (text or "").lower()
    if exclude and any(kw in blob for kw in exclude):
        return False
    if include and not any(kw in blob for kw in include):
        return False
    return True


def _filter_skip_reason(c: dict, cfg, own_username: str = "") -> str | None:
    """Причина пропуска или None если комментарий подходит."""
    skip_pinned = bool(cfg.get("skipPinned", cfg.get("skip_pinned", False)))
    skip_own = bool(cfg.get("skipOwn", cfg.get("skip_own", True)))
    own = (own_username or "").lower().lstrip("@")
    own_aliases = {a for a in (cfg.get("ownUsernames") or cfg.get("own_usernames") or []) if a}
    if own:
        own_aliases.add(own)
    extra = (cfg.get("profileId") or cfg.get("profile_id") or "")
    if extra:
        own_aliases.add(str(extra).lower())
    strict_date = _cfg_bool(cfg, "commentDateFilterEnabled", "comment_date_filter_enabled", default=True)
    reject_unparsed = _cfg_bool(
        cfg, "commentRejectUnparsedDates", "comment_reject_unparsed_dates", default=False
    )
    max_days = _cfg_int(cfg, "commentMaxAgeDays", "comment_max_age_days", default=7)
    max_hours = max(1, max_days) * 24.0
    min_likes = _cfg_int(cfg, "commentMinLikes", "comment_min_likes", default=0)
    max_replies = _cfg_int(cfg, "commentMaxReplies", "comment_max_replies", default=0)
    include_kw = _keyword_lines(cfg, "commentIncludeKeywords", "comment_include_keywords")
    exclude_kw = _keyword_lines(cfg, "commentExcludeKeywords", "comment_exclude_keywords")

    if skip_pinned and c.get("isPinned"):
        return "pinned"
    if skip_own and own_aliases and (c.get("author") or "").lower().lstrip("@") in own_aliases:
        return "own"
    if not c.get("text"):
        return "empty"
    if min_likes > 0 and int(c.get("likeCount") or 0) < min_likes:
        return "likes"
    if max_replies > 0 and int(c.get("replyCount") or 0) > max_replies:
        return "replies"
    if not _text_matches_keywords(c.get("text") or "", include_kw, exclude_kw):
        return "keywords"
    if _cfg_bool(cfg, "skipCompetitorOffers", "skip_competitor_offers", default=True):
        from tiktok.comment_filters import parent_offers_service
        if parent_offers_service(c.get("text") or ""):
            return "competitor"
    if strict_date:
        age = c.get("ageHours")
        if age is None:
            if reject_unparsed:
                return "date_unknown"
        elif age > max_hours:
            return "date_old"
    return None


def _base_filter(comments, cfg, own_username: str = "") -> list[dict]:
    rows = []
    for c in comments:
        if _filter_skip_reason(c, cfg, own_username) is None:
            rows.append(c)
    return rows


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


def comment_passes_filter(c: dict, cfg, own_username: str = "") -> bool:
    return _filter_skip_reason(c, cfg, own_username) is None


def iterate_comments_top_down(
    page,
    human,
    cfg,
    own_username: str = "",
    max_idle_rounds: int = 8,
    stats: dict | None = None,
    replied_keys: set[str] | None = None,
    video_id: str = "",
    profile_id: str = "",
):
    """
    Листает комментарии сверху вниз; отдаёт подходящие по фильтру по listOrder.
    Останавливается, когда после прокрутки новых комментариев нет.
    """
    st = stats if stats is not None else {}
    st.setdefault("scanned", 0)
    st.setdefault("skippedFilter", 0)
    st.setdefault("yielded", 0)
    st.setdefault("skippedReplied", 0)
    st.setdefault("skipReasons", {})

    vid = video_id or str(cfg.get("_video_id") or cfg.get("videoId") or "")
    pid_profile = profile_id or str(cfg.get("profileId") or cfg.get("profile_id") or "")
    replied = replied_keys

    storage: dict[str, dict] = {}
    order_counter = [0]
    processed: set[str] = set()
    idle = 0

    _scroll_list_to_top(page)
    time.sleep(0.6)
    for _ in range(3):
        _merge_rows(storage, _collect_once(page), order_counter)
        _scroll_list(page, 550)
        time.sleep(0.75)
    _scroll_list_to_top(page)
    time.sleep(0.5)

    def _emit_new():
        for c in sorted(storage.values(), key=lambda x: x.get("listOrder", 0)):
            pid = c.get("parentId") or ""
            if not pid or pid in processed:
                continue
            processed.add(pid)

            if replied and vid and pid_profile and is_comment_already_replied(replied, vid, pid_profile, c):
                st["skippedReplied"] = int(st.get("skippedReplied", 0)) + 1
                continue

            author = c.get("author") or ""
            parent_text = c.get("text") or ""
            if own_username and parent_thread_has_own_reply(page, own_username, author, parent_text):
                st["skippedReplied"] = int(st.get("skippedReplied", 0)) + 1
                if replied is not None and vid and pid_profile:
                    for k in dedup_keys_for_comment(vid, pid_profile, c):
                        replied.add(k)
                continue

            st["scanned"] += 1
            reason = _filter_skip_reason(c, cfg, own_username)
            if reason:
                st["skippedFilter"] += 1
                reasons = st["skipReasons"]
                reasons[reason] = int(reasons.get(reason, 0)) + 1
                continue
            st["yielded"] += 1
            yield c

    while idle < max_idle_rounds:
        prev_size = len(storage)
        _merge_rows(storage, _collect_once(page), order_counter)
        yield from _emit_new()

        if len(storage) == prev_size:
            idle += 1
        else:
            idle = 0

        if idle >= max_idle_rounds:
            break

        _scroll_list(page, 550)
        time.sleep(0.9)

    for _ in range(3):
        if idle >= max_idle_rounds:
            break
        _scroll_list_to_bottom(page)
        time.sleep(1.0)
        prev_size = len(storage)
        _merge_rows(storage, _collect_once(page), order_counter)
        had_new = False
        for item in _emit_new():
            had_new = True
            yield item
        if had_new:
            idle = 0
        elif len(storage) == prev_size:
            idle += 1
        else:
            idle = 0

