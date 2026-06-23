"""TikTok — публикация комментария/ответа."""
from __future__ import annotations

import random
import time

from common.utils import random_delay

_COMMENT_INPUT_SELECTORS = [
    '[data-e2e="comment-input"]',
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
]
_COMMENT_POST_SELECTORS = [
    '[data-e2e="comment-post"]',
    'button[data-e2e="comment-post"]',
    'div[data-e2e="comment-post"]',
    'button[aria-label*="Post" i]',
    'button[aria-label*="Опубликовать" i]',
    'button[aria-label*="Отправить" i]',
]
_REPLY_BTN_SELECTORS = [
    '[data-e2e="comment-reply-1"]',
    '[data-e2e="comment-reply"]',
    'span[data-e2e="comment-reply"]',
    'p[data-e2e="comment-reply"]',
    'span:has-text("Reply")',
    'p:has-text("Reply")',
    'span:has-text("Ответить")',
    'p:has-text("Ответить")',
]
_CAPTION_SELECTORS = [
    '[data-e2e="browse-video-desc"]',
    '[data-e2e="video-desc"]',
    'h1[data-e2e="browse-video-desc"]',
]
_OPEN_COMMENTS_SELECTORS = [
    '[data-e2e="browse-comment-icon"]',
    '[data-e2e="comment-icon"]',
    "button[aria-label*='comment' i]",
    "button[aria-label*='коммент' i]",
    "button[aria-label*='Read or add comments' i]",
]
_COMMENT_LIST_SELECTORS = [
    '[data-e2e="comment-list"]',
    '[data-e2e="browse-comment-list"]',
    'div[class*="CommentListContainer"]',
    'div[class*="DivCommentMain"]',
]

_INPUT_PLACEHOLDERS_REPLY = (
    "Add a reply",
    "Добавить ответ",
    "Ответить",
)
_INPUT_PLACEHOLDERS_ROOT = (
    "Add comment",
    "Добавить комментарий",
    "Add comment...",
)

_CLICK_REPLY_JS = r"""
({ author, textPrefix }) => {
  const norm = (s) => (s || '').trim().toLowerCase();
  const wantAuthor = norm(author);
  const prefix = norm(textPrefix).slice(0, 48);

  const itemSelectors = [
    '[data-e2e="comment-item"]',
    'div[class*="CommentObjectWrapper"]',
    'div[class*="CommentItemContainer"]',
    'div[class*="DivCommentItemWrapper"]',
  ];
  const items = new Set();
  for (const sel of itemSelectors) {
    document.querySelectorAll(sel).forEach((el) => items.add(el));
  }

  function tryClickReply(el) {
    const reply = el.querySelector(
      '[data-e2e="comment-reply-1"], [data-e2e="comment-reply"], p[data-e2e="comment-reply"], span[data-e2e="comment-reply"]'
    ) || [...el.querySelectorAll('span, p, button')].find(
      (n) => /^(reply|ответить)$/i.test((n.innerText || '').trim())
    );
    if (!reply) return false;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    reply.click();
    return true;
  }

  function matchItem(el) {
    const authorEl = el.querySelector('a[href^="/@"]');
    const a = norm((authorEl?.getAttribute('href') || '').replace(/^\/@/, '').split('/')[0]);
    if (wantAuthor && a && a !== wantAuthor) return false;
    const textEl = el.querySelector(
      '[data-e2e="comment-level-1"], span[data-e2e^="comment-level"], span[class*="TUXText"], p'
    );
    const t = norm(textEl?.innerText || '');
    if (prefix && t) {
      const p = prefix.slice(0, 20);
      const sticker = /ステッカー|sticker|\[photo\]|\[image\]/i.test(prefix) || /ステッカー|sticker/i.test(t);
      if (!sticker && !t.startsWith(prefix) && !t.includes(p)) return false;
    }
    return true;
  }

  for (const el of items) {
    if (!matchItem(el)) continue;
    if (tryClickReply(el)) return true;
  }

  const replyBtns = [...document.querySelectorAll('span, p, button')].filter((el) => {
    const t = (el.innerText || '').trim();
    return /^(reply|ответить)$/i.test(t);
  });
  for (const btn of replyBtns) {
    let parent = btn.parentElement;
    for (let i = 0; i < 10 && parent; i++) {
      if (parent.querySelector('a[href^="/@"]')) {
        if (!matchItem(parent)) break;
        btn.scrollIntoView({ block: 'center', behavior: 'instant' });
        btn.click();
        return true;
      }
      parent = parent.parentElement;
    }
  }
  return false;
}
"""


def read_caption(page) -> str:
    for sel in _CAPTION_SELECTORS:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0:
                txt = (loc.inner_text() or "").strip()
                if txt:
                    return txt
        except Exception:
            continue
    return ""


def ensure_comments_panel_open(page, human, timeout_sec=12.0) -> bool:
    for sel in _COMMENT_LIST_SELECTORS + _COMMENT_INPUT_SELECTORS:
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
                if loc.count() > 0 and loc.is_visible(timeout=1200):
                    human.human_click(loc)
                    random_delay(1.2, 2.0)
                    return True
            except Exception:
                continue
        time.sleep(0.4)
    return False


def scroll_comment_list(page, direction: str = 'down', amount: int = 500) -> bool:
    delta = amount if direction == 'down' else -amount
    for sel in _COMMENT_LIST_SELECTORS:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0:
                loc.evaluate("(el, d) => { el.scrollTop = el.scrollTop + d; }", delta)
                return True
        except Exception:
            continue
    return False


def scroll_comments_to_top(page) -> bool:
    for sel in _COMMENT_LIST_SELECTORS:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0:
                loc.evaluate("el => { el.scrollTop = 0; }")
                return True
        except Exception:
            continue
    return False


def _mark_reply_input(page) -> bool:
    """Пометить inline-поле ответа (не корневой composer внизу)."""
    try:
        return bool(
            page.evaluate(
                """() => {
                  document.querySelectorAll('[data-nexus-reply-target]').forEach((el) => {
                    el.removeAttribute('data-nexus-reply-target');
                  });
                  const inputs = Array.from(
                    document.querySelectorAll(
                      '[contenteditable="true"][role="textbox"], [data-e2e="comment-input"], div[contenteditable="true"]'
                    )
                  );
                  const candidates = [];
                  for (const el of inputs) {
                    const r = el.getBoundingClientRect();
                    if (r.width < 24 || r.height < 10 || r.bottom < 40) continue;
                    const inItem = el.closest(
                      '[data-e2e="comment-item"], div[class*="CommentItemContainer"], div[class*="CommentObjectWrapper"], div[class*="DivCommentItemWrapper"]'
                    );
                    if (!inItem) continue;
                    const ph = ((el.getAttribute('placeholder') || el.getAttribute('aria-label') || '') + '').toLowerCase();
                    const isReply = /reply|ответ/.test(ph);
                    candidates.push({ el, top: r.top, isReply });
                  }
                  if (!candidates.length) return false;
                  candidates.sort((a, b) => {
                    if (a.isReply !== b.isReply) return a.isReply ? -1 : 1;
                    return b.top - a.top;
                  });
                  candidates[0].el.setAttribute('data-nexus-reply-target', '1');
                  return true;
                }"""
            )
        )
    except Exception:
        return False


def _mark_root_input(page) -> bool:
    """Пометить корневой composer внизу панели комментариев."""
    try:
        return bool(
            page.evaluate(
                """() => {
                  document.querySelectorAll('[data-nexus-root-target]').forEach((el) => {
                    el.removeAttribute('data-nexus-root-target');
                  });
                  const list = document.querySelector(
                    '[data-e2e="comment-list"], [data-e2e="browse-comment-list"], div[class*="CommentListContainer"]'
                  );
                  const listBottom = list ? list.getBoundingClientRect().bottom : window.innerHeight * 0.5;
                  const inputs = Array.from(
                    document.querySelectorAll(
                      '[contenteditable="true"][role="textbox"], [data-e2e="comment-input"], div[contenteditable="true"]'
                    )
                  );
                  let best = null;
                  let bestScore = -1;
                  for (const el of inputs) {
                    const r = el.getBoundingClientRect();
                    if (r.width < 24 || r.height < 10) continue;
                    const inItem = el.closest(
                      '[data-e2e="comment-item"], div[class*="CommentItemContainer"], div[class*="CommentObjectWrapper"]'
                    );
                    if (inItem) continue;
                    let score = r.top;
                    if (r.top >= listBottom - 80) score += 10000;
                    if (score > bestScore) {
                      bestScore = score;
                      best = el;
                    }
                  }
                  if (!best) return false;
                  best.setAttribute('data-nexus-root-target', '1');
                  return true;
                }"""
            )
        )
    except Exception:
        return False


def locate_reply_input(page, timeout_ms=4000):
    deadline = time.time() + timeout_ms / 1000.0
    while time.time() < deadline:
        for ph in _INPUT_PLACEHOLDERS_REPLY:
            try:
                loc = page.get_by_placeholder(ph, exact=False).first
                if loc.count() > 0 and loc.is_visible(timeout=500):
                    try:
                        in_item = loc.evaluate(
                            """el => !!el.closest('[data-e2e="comment-item"], div[class*="CommentItemContainer"], div[class*="CommentObjectWrapper"]')"""
                        )
                        if in_item:
                            return loc
                    except Exception:
                        return loc
            except Exception:
                pass
        if _mark_reply_input(page):
            try:
                loc = page.locator('[data-nexus-reply-target="1"]').first
                if loc.count() > 0 and loc.is_visible(timeout=800):
                    return loc
            except Exception:
                pass
        time.sleep(0.28)
    return None


def locate_root_input(page, timeout_ms=3500):
    deadline = time.time() + timeout_ms / 1000.0
    while time.time() < deadline:
        for ph in _INPUT_PLACEHOLDERS_ROOT:
            try:
                loc = page.get_by_placeholder(ph, exact=False).first
                if loc.count() > 0 and loc.is_visible(timeout=600):
                    return loc
            except Exception:
                pass
        if _mark_root_input(page):
            try:
                loc = page.locator('[data-nexus-root-target="1"]').first
                if loc.count() > 0 and loc.is_visible(timeout=800):
                    return loc
            except Exception:
                pass
        for sel in _COMMENT_INPUT_SELECTORS:
            try:
                loc = page.locator(sel).last
                if loc.count() > 0 and loc.is_visible(timeout=600):
                    return loc
            except Exception:
                continue
        time.sleep(0.28)
    return None


def locate_comment_input(page, reply_mode: bool = False, timeout_ms=3500):
    if reply_mode:
        return locate_reply_input(page, timeout_ms=timeout_ms)
    return locate_root_input(page, timeout_ms=timeout_ms)


def verify_comment_visible(page, text: str, timeout_sec: float = 6.0) -> bool:
    """Проверить, что текст ответа появился в ленте комментариев."""
    prefix = (text or "").strip()[:48].lower()
    if not prefix:
        return True
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            found = page.evaluate(
                """(prefix) => {
                  const norm = (s) => (s || '').trim().toLowerCase();
                  const sels = [
                    '[data-e2e="comment-level-1"]',
                    '[data-e2e="comment-level-2"]',
                    'span[data-e2e^="comment-level"]',
                    '[data-e2e="comment-item"]',
                    'div[class*="CommentObjectWrapper"]',
                  ];
                  const nodes = new Set();
                  for (const sel of sels) {
                    document.querySelectorAll(sel).forEach((n) => nodes.add(n));
                  }
                  const needle = prefix.slice(0, 24);
                  for (const n of nodes) {
                    const t = norm(n.innerText || n.textContent);
                    if (!t) continue;
                    if (t.startsWith(prefix) || t.includes(needle)) return true;
                  }
                  return false;
                }""",
                prefix,
            )
            if found:
                return True
        except Exception:
            pass
        time.sleep(0.45)
    return False


def _comment_input_text(page, root_only: bool = False) -> str:
    try:
        return page.evaluate(
            """(rootOnly) => {
              const sels = [
                '[data-e2e="comment-input"]',
                'div[contenteditable="true"][role="textbox"]',
                'div[contenteditable="true"]',
              ];
              for (const sel of sels) {
                const nodes = document.querySelectorAll(sel);
                for (const el of nodes) {
                  const r = el.getBoundingClientRect();
                  if (r.width < 8 || r.height < 8) continue;
                  const inItem = el.closest(
                    '[data-e2e="comment-item"], div[class*="CommentItemContainer"], div[class*="CommentObjectWrapper"]'
                  );
                  if (rootOnly && inItem) continue;
                  if (!rootOnly && !inItem) continue;
                  const t = (el.innerText || el.textContent || '').trim();
                  if (t) return t;
                }
              }
              return '';
            }""",
            root_only,
        ) or ""
    except Exception:
        return ""


def verify_reply_submitted(
    page,
    text: str,
    author: str = "",
    parent_text: str = "",
    own_username: str = "",
    timeout_sec: float = 12.0,
) -> bool:
    """Ответ появился как вложенный (level-2) от нашего аккаунта."""
    prefix = (text or "").strip()[:48].lower()
    if not prefix:
        return False
    author_key = (author or "").strip().lower().lstrip("@")
    parent_prefix = (parent_text or "").strip()[:32].lower()
    own_key = (own_username or "").strip().lower().lstrip("@")
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            found = page.evaluate(
                """({ prefix, authorKey, parentPrefix, ownKey }) => {
                  const norm = (s) => (s || '').trim().toLowerCase().replace(/^@/, '');
                  const needle = prefix.slice(0, 24);
                  const own = norm(ownKey);
                  const items = document.querySelectorAll(
                    '[data-e2e="comment-item"], div[class*="CommentObjectWrapper"], div[class*="CommentItemContainer"]'
                  );
                  for (const item of items) {
                    const authorEl = item.querySelector('a[href^="/@"]');
                    const a = norm((authorEl?.getAttribute('href') || '').replace(/^\\/@/, '').split('/')[0]);
                    if (authorKey && a && a !== authorKey) continue;
                    const parentEl = item.querySelector(
                      '[data-e2e="comment-level-1"], span[data-e2e^="comment-level-1"]'
                    );
                    const pt = norm(parentEl?.innerText || '');
                    if (parentPrefix && pt && !pt.includes(parentPrefix.slice(0, 16))) continue;
                    const levels = item.querySelectorAll(
                      '[data-e2e="comment-level-2"], span[data-e2e^="comment-level-2"]'
                    );
                    for (const lv of levels) {
                      const t = norm(lv.innerText || lv.textContent);
                      if (!t || (!t.startsWith(prefix) && !t.includes(needle))) continue;
                      if (!own) return true;
                      let block = lv.parentElement;
                      for (let i = 0; i < 12 && block; i++) {
                        const links = block.querySelectorAll('a[href^="/@"]');
                        for (const link of links) {
                          const u = norm((link.getAttribute('href') || '').replace(/^\\/@/, '').split('/')[0]);
                          if (u === own) return true;
                        }
                        block = block.parentElement;
                      }
                      return false;
                    }
                  }
                  return false;
                }""",
                {
                    "prefix": prefix,
                    "authorKey": author_key,
                    "parentPrefix": parent_prefix,
                    "ownKey": own_key,
                },
            )
            if found:
                return True
        except Exception:
            pass
        time.sleep(0.45)
    return False


def verify_post_submitted(page, text: str, reply_mode: bool = False, timeout_sec: float = 10.0) -> bool:
    """Пост отправлен: текст в ленте; для reply — только вложенный ответ."""
    if reply_mode:
        return False
    if verify_comment_visible(page, text, timeout_sec=timeout_sec):
        return True
    deadline = time.time() + min(4.0, timeout_sec)
    while time.time() < deadline:
        if not _comment_input_text(page, root_only=True):
            return True
        time.sleep(0.35)
    return False


def click_post_button(page, human, input_loc=None) -> bool:
    if input_loc is not None:
        try:
            clicked = input_loc.evaluate(
                """el => {
                  let node = el.closest('[data-e2e="comment-item"]') || el.parentElement;
                  for (let i = 0; i < 10 && node; i++) {
                    const btn = node.querySelector(
                      '[data-e2e="comment-post"], button[aria-label*="Post" i], button[aria-label*="Опубликовать" i], button[aria-label*="Отправить" i]'
                    );
                    if (btn) {
                      const r = btn.getBoundingClientRect();
                      if (r.width > 8 && r.height > 8) { btn.click(); return true; }
                    }
                    node = node.parentElement;
                  }
                  return false;
                }"""
            )
            if clicked:
                random_delay(1.0, 2.0)
                return True
        except Exception:
            pass

    for sel in _COMMENT_POST_SELECTORS:
        try:
            btn = page.locator(sel).first
            if btn.count() > 0 and btn.is_visible(timeout=1500):
                human.human_click(btn)
                random_delay(1.0, 2.0)
                return True
        except Exception:
            continue
    try:
        clicked = page.evaluate(
            """() => {
              const inputs = document.querySelectorAll('[data-e2e="comment-input"], div[contenteditable="true"]');
              for (const input of inputs) {
                const r = input.getBoundingClientRect();
                if (r.width < 20) continue;
                const parent = input.closest('div')?.parentElement;
                if (!parent) continue;
                const btn = parent.querySelector(
                  '[data-e2e="comment-post"], button[aria-label*="Post" i], button[type="submit"]'
                );
                if (btn) { btn.click(); return true; }
              }
              const posts = document.querySelectorAll('[data-e2e="comment-post"]');
              for (const p of posts) {
                const r = p.getBoundingClientRect();
                if (r.width > 10 && r.height > 10 && r.top > 0) { p.click(); return true; }
              }
              return false;
            }"""
        )
        if clicked:
            random_delay(1.0, 2.0)
            return True
    except Exception:
        pass
    try:
        page.keyboard.press("Enter")
        random_delay(1.0, 2.0)
        return True
    except Exception:
        return False


def type_comment(
    page,
    human,
    text: str,
    reply_mode: bool = False,
    author: str = "",
    parent_text: str = "",
    own_username: str = "",
    input_loc=None,
) -> bool:
    loc = input_loc or locate_comment_input(page, reply_mode=reply_mode)
    if loc is None:
        return False
    try:
        human.human_click(loc)
        human.human_delay(0.45, 0.95)
        try:
            loc.evaluate("el => { el.focus(); el.click(); }")
        except Exception:
            pass
        human.human_delay(0.2, 0.45)
        typing_ms = random.randint(78, 105)
        human.human_type(
            loc,
            text,
            clear=True,
            verify=False,
            base_delay_ms=typing_ms,
            micro_pause_every=random.randint(7, 11),
        )
        human.human_delay(0.5, 1.1)
        try:
            page.keyboard.press("End")
        except Exception:
            pass
    except Exception:
        return False
    if not click_post_button(page, human, input_loc=loc):
        return False
    random_delay(1.2, 2.0)
    if reply_mode:
        if verify_reply_submitted(
            page,
            text,
            author=author,
            parent_text=parent_text,
            own_username=own_username,
            timeout_sec=16.0,
        ):
            return True
        stuck_root = _comment_input_text(page, root_only=True)
        if stuck_root and text.strip()[:24].lower() in stuck_root.lower():
            return False
        return False
    return verify_post_submitted(page, text, reply_mode=False, timeout_sec=8.0)


def click_reply_on_index(page, human, comment_index: int) -> bool:
    item_selectors = [
        '[data-e2e="comment-item"]',
        'div[class*="CommentObjectWrapper"]',
        'div[class*="CommentItemContainer"]',
    ]
    for sel in item_selectors:
        try:
            item = page.locator(sel).nth(comment_index)
            if item.count() == 0:
                continue
            item.scroll_into_view_if_needed(timeout=3000)
            for rsel in _REPLY_BTN_SELECTORS:
                btn = item.locator(rsel).first
                if btn.count() > 0 and btn.is_visible(timeout=1200):
                    human.human_click(btn)
                    random_delay(0.7, 1.4)
                    return True
        except Exception:
            continue
    return False


def click_reply_by_text(page, human, author: str, text: str, max_scrolls: int = 8) -> bool:
    payload = {"author": (author or "").strip(), "textPrefix": (text or "").strip()[:80]}
    if not payload["textPrefix"] and not payload["author"]:
        return click_reply_on_index(page, human, 0)

    random_delay(0.3, 0.6)

    for _ in range(max_scrolls):
        try:
            if page.evaluate(_CLICK_REPLY_JS, payload):
                random_delay(0.8, 1.5)
                return True
        except Exception:
            pass
        scroll_comment_list(page, 'down', amount=350)
        random_delay(0.4, 0.7)

    scroll_comments_to_top(page)
    random_delay(0.4, 0.8)
    for _ in range(max_scrolls):
        try:
            if page.evaluate(_CLICK_REPLY_JS, payload):
                random_delay(0.8, 1.5)
                return True
        except Exception:
            pass
        scroll_comment_list(page, 'down', amount=350)
        random_delay(0.4, 0.7)
    return False


_LIKE_PARENT_JS = r"""
({ author, textPrefix }) => {
  const norm = (s) => (s || '').trim().toLowerCase();
  const wantAuthor = norm(author);
  const prefix = norm(textPrefix).slice(0, 48);
  const itemSelectors = [
    '[data-e2e="comment-item"]',
    'div[class*="CommentObjectWrapper"]',
    'div[class*="CommentItemContainer"]',
  ];
  const items = new Set();
  for (const sel of itemSelectors) {
    document.querySelectorAll(sel).forEach((el) => items.add(el));
  }
  for (const el of items) {
    const authorEl = el.querySelector('a[href^="/@"]');
    const a = norm((authorEl?.getAttribute('href') || '').replace(/^\/@/, '').split('/')[0]);
    if (wantAuthor && a && a !== wantAuthor) continue;
    const textEl = el.querySelector('[data-e2e="comment-level-1"], span[data-e2e^="comment-level"], span[class*="TUXText"]');
    const t = norm(textEl?.innerText || '');
    if (prefix && t && !t.startsWith(prefix) && !t.includes(prefix.slice(0, 20))) continue;
    const like = el.querySelector(
      '[data-e2e="comment-like-icon"], [data-e2e="like-icon"], [class*="LikeContainer"] [role="button"], [class*="LikeContainer"] svg'
    );
    if (like) {
      like.click();
      return true;
    }
  }
  return false;
}
"""


def like_parent_comment(page, human, author: str, parent_text: str) -> bool:
    try:
        liked = page.evaluate(
            _LIKE_PARENT_JS,
            {"author": (author or "").strip(), "textPrefix": (parent_text or "").strip()[:80]},
        )
        if liked:
            random_delay(0.4, 0.9)
            return True
    except Exception:
        pass
    try:
        loc = page.locator('[data-e2e="comment-like-icon"]').first
        if loc.count() > 0 and loc.is_visible(timeout=1000):
            human.human_click(loc)
            random_delay(0.4, 0.9)
            return True
    except Exception:
        pass
    return False


def click_reply_nth_visible(page, human, n: int = 0) -> bool:
    try:
        loc = page.locator(
            'span:has-text("Reply"), p:has-text("Reply"), span:has-text("Ответить"), p:has-text("Ответить")'
        )
        btn = loc.nth(n)
        if btn.count() > 0 and btn.is_visible(timeout=2000):
            btn.scroll_into_view_if_needed(timeout=3000)
            human.human_click(btn)
            random_delay(0.8, 1.5)
            return True
    except Exception:
        pass
    return click_reply_on_index(page, human, n)


def post_root_comment(page, human, text: str) -> bool:
    if not ensure_comments_panel_open(page, human):
        return False
    return type_comment(page, human, text, reply_mode=False)


def _clear_root_composer(page) -> None:
    try:
        page.evaluate(
            """() => {
              const list = document.querySelector('[data-e2e="comment-list"], div[class*="CommentListContainer"]');
              const listBottom = list ? list.getBoundingClientRect().bottom : 0;
              document.querySelectorAll('[contenteditable="true"], [data-e2e="comment-input"]').forEach((el) => {
                const r = el.getBoundingClientRect();
                if (r.width < 20) return;
                const inItem = el.closest('[data-e2e="comment-item"], div[class*="CommentItemContainer"]');
                if (inItem) return;
                if (r.top < listBottom - 40) return;
                el.innerText = '';
                el.textContent = '';
              });
            }"""
        )
    except Exception:
        pass


def post_reply(
    page,
    human,
    comment_index: int,
    text: str,
    like_prob: float = 0,
    author: str = "",
    parent_text: str = "",
    own_username: str = "",
) -> bool:
    if not ensure_comments_panel_open(page, human):
        return False

    _clear_root_composer(page)

    if like_prob > 0 and random.random() < like_prob and (author or parent_text):
        like_parent_comment(page, human, author, parent_text)

    opened = False
    if author or parent_text:
        opened = click_reply_by_text(page, human, author, parent_text)
    if not opened:
        opened = click_reply_on_index(page, human, comment_index)
    if not opened:
        opened = click_reply_nth_visible(page, human, comment_index)

    if not opened:
        return False

    random_delay(0.6, 1.2)
    reply_input = locate_reply_input(page, timeout_ms=3500)
    if reply_input is None:
        return False

    return type_comment(
        page,
        human,
        text,
        reply_mode=True,
        author=author,
        parent_text=parent_text,
        own_username=own_username,
        input_loc=reply_input,
    )
