#!/usr/bin/env python3
"""YouTube Shorts helpers for warmup automation."""
import random
import re
import time


CONSENT_SELECTORS = [
    'button:has-text("Accept all")',
    'button:has-text("Принять все")',
    'button:has-text("Accept the use")',
    'button:has-text("I agree")',
    'button:has-text("Agree")',
]

LIKE_LABEL_RE = re.compile(
    r'(like this video|i like this|нравится|мне нравится|отметить.*нрав)',
    re.I,
)
UNLIKE_LABEL_RE = re.compile(r'(unlike|убрать.*нрав|dislike|не нравится)', re.I)

LIKE_SELECTORS = [
    'ytd-reel-video-renderer[is-active] #like-button button',
    'ytd-reel-video-renderer[is-active] like-button-view-model button',
    'ytd-reel-video-renderer[is-active] button[aria-label*="like" i]',
    'ytd-reel-video-renderer[is-active] button[aria-label*="нравится" i]',
    'ytd-shorts #like-button button',
    'ytd-shorts like-button-view-model button',
    'ytd-shorts button[aria-label*="like" i]',
    'ytd-shorts button[aria-label*="нравится" i]',
    '#like-button button',
    'like-button-view-model button',
    'button[aria-label="Like this video"]',
    'button[aria-label="Нравится"]',
    'button[aria-label="Мне нравится"]',
]

LIKE_BUTTON_JS = '''
() => {
  const likeRe = /like this video|i like this|нравится|мне нравится|отметить.*нрав/i;
  const unlikeRe = /unlike|убрать|dislike|не нравится/i;

  function labelOf(el) {
    return (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
  }

  function isLike(el) {
    if (!el || el.disabled) return false;
    const tag = (el.tagName || '').toUpperCase();
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (tag !== 'BUTTON' && role !== 'button') return false;
    const label = labelOf(el);
    if (!label || unlikeRe.test(label)) return false;
    return likeRe.test(label);
  }

  function isLiked(el) {
    return el.getAttribute('aria-pressed') === 'true';
  }

  function walk(root, hits) {
    if (!root) return;
    const queue = [root];
    while (queue.length) {
      const node = queue.shift();
      if (!node || node.nodeType !== 1) continue;
      if (isLike(node)) hits.push(node);
      if (node.shadowRoot) queue.push(node.shadowRoot);
      for (const ch of node.children || []) queue.push(ch);
    }
  }

  const hits = [];
  walk(document, hits);

  const active = document.querySelector('ytd-reel-video-renderer[is-active]');
  if (active && active.shadowRoot) {
    walk(active.shadowRoot, hits);
    walk(active, hits);
  }

  const shorts = document.querySelector('ytd-shorts');
  if (shorts && shorts.shadowRoot) {
    walk(shorts.shadowRoot, hits);
  }

  const seen = new Set();
  for (const btn of hits) {
    if (seen.has(btn)) continue;
    seen.add(btn);
    try {
      const rect = btn.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) continue;
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
    } catch (e) {
      continue;
    }
    if (isLiked(btn)) return { status: 'already' };
    btn.scrollIntoView({ block: 'center', inline: 'nearest' });
    btn.click();
    return { status: 'clicked' };
  }
  return { status: 'not_found' };
}
'''

IS_LIKED_JS = '''
() => {
  const unlikeRe = /unlike|убрать|dislike|не нравится/i;
  const likeRe = /like this video|нравится|мне нравится/i;
  function walk(root) {
    if (!root) return false;
    const queue = [root];
    while (queue.length) {
      const node = queue.shift();
      if (!node || node.nodeType !== 1) continue;
      const label = (node.getAttribute('aria-label') || node.getAttribute('title') || '');
      if (node.getAttribute('aria-pressed') === 'true' && likeRe.test(label) && !unlikeRe.test(label)) {
        return true;
      }
      if (node.shadowRoot) queue.push(node.shadowRoot);
      for (const ch of node.children || []) queue.push(ch);
    }
    return false;
  }
  return walk(document)
    || walk(document.querySelector('ytd-reel-video-renderer[is-active]')?.shadowRoot)
    || walk(document.querySelector('ytd-shorts')?.shadowRoot);
}
'''


def dismiss_consent(page):
    for sel in CONSENT_SELECTORS:
        try:
            btn = page.locator(sel).first
            if btn.is_visible(timeout=1500):
                btn.click(timeout=2000)
                time.sleep(random.uniform(0.8, 1.5))
                return True
        except Exception:
            continue
    return False


DISMISS_STUDIO_OVERLAYS_JS = '''
() => {
  const protectedSel = 'ytcp-uploads-dialog, ytcp-video-upload-dialog, ytcp-uploads-dialog-file-picker, ytcp-video-metadata-editor';
  const isProtected = (el) => el && el.closest && el.closest(protectedSel);

  const dismissText = /^(got it|ok|okay|dismiss|close|no thanks|not now|skip( tour)?|maybe later|понятно|хорошо|закрыть|не сейчас|пропустить|готово|далее)$/i;
  const dismissAria = /^(close|dismiss|skip|got it|no thanks|not now|понятно|закрыть|пропустить|не сейчас)/i;

  let closed = 0;
  const clicked = new Set();

  function tryClick(el) {
    if (!el || isProtected(el) || clicked.has(el)) return false;
    try {
      const r = el.getBoundingClientRect();
      if (!r || r.width < 2 || r.height < 2) return false;
      el.click();
      clicked.add(el);
      closed++;
      return true;
    } catch (e) {
      return false;
    }
  }

  function inCoachOrStudio(el) {
    if (el.closest('ytcp-feature-discovery-callout, ytcp-callout, ytcp-coachmark, ytcp-coach-mark, ytcp-feature-suppression')) {
      return true;
    }
    if (/studio\\.youtube\\.com/i.test(location.hostname)) {
      let n = el;
      for (let i = 0; i < 18 && n; i++) {
        const tag = (n.tagName || '').toLowerCase();
        if (tag.startsWith('ytcp-') || tag === 'tp-yt-paper-dialog') return true;
        n = n.parentElement || n.host;
      }
    }
    return false;
  }

  function walk(root) {
    if (!root || !root.querySelectorAll) return;
    const buttons = [];
    for (const el of root.querySelectorAll(
      'button, ytcp-button, tp-yt-paper-button, ytcp-icon-button, a[role="button"]'
    )) {
      if (isProtected(el) || !inCoachOrStudio(el)) continue;
      const text = (el.textContent || '').trim().replace(/\\s+/g, ' ');
      const aria = (el.getAttribute('aria-label') || '').trim();
      const id = (el.id || '').toLowerCase();
      let score = 0;
      if (id === 'dismiss-button' || id === 'close-button') score += 80;
      if (dismissText.test(text)) score += 60;
      if (aria && dismissAria.test(aria)) score += 50;
      if (el.closest('ytcp-feature-discovery-callout, ytcp-callout, ytcp-coachmark, ytcp-coach-mark, ytcp-feature-suppression')) {
        score += 40;
      }
      if (score > 0) buttons.push({ el, score });
    }
    buttons.sort((a, b) => b.score - a.score);
    for (const { el } of buttons.slice(0, 4)) tryClick(el.el);

    for (const host of root.querySelectorAll(
      'ytcp-feature-discovery-callout, ytcp-callout, ytcp-coachmark, ytcp-coach-mark, ytcp-feature-suppression'
    )) {
      if (isProtected(host)) continue;
      for (const btn of host.querySelectorAll('[id="close-button"], [id="dismiss-button"], [aria-label*="Close" i], [aria-label*="Dismiss" i], [aria-label*="Закрыть" i]')) {
        tryClick(btn);
      }
      if (host.shadowRoot) walk(host.shadowRoot);
    }

    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  }

  walk(document);

  for (const backdrop of document.querySelectorAll('iron-overlay-backdrop, tp-yt-iron-overlay-backdrop')) {
    try {
      if (backdrop.opened || backdrop.classList.contains('opened')) {
        backdrop.click();
        closed++;
      }
    } catch (e) {}
  }

  return closed;
}
'''

STUDIO_DISMISS_SELECTORS = [
    'ytcp-feature-discovery-callout #dismiss-button',
    'ytcp-feature-discovery-callout ytcp-button#dismiss-button',
    'ytcp-feature-discovery-callout [aria-label="Dismiss"]',
    'ytcp-feature-discovery-callout [aria-label="Close"]',
    'ytcp-feature-discovery-callout [aria-label="Закрыть"]',
    'ytcp-callout #dismiss-button',
    'ytcp-callout #close-button',
    'ytcp-coachmark #dismiss-button',
    'ytcp-coach-mark #dismiss-button',
    'ytcp-feature-suppression ytcp-button#dismiss-button',
    'ytcp-dialog-dismiss-button',
    'ytcp-dialog ytcp-icon-button#close-button',
    'tp-yt-paper-dialog ytcp-button:has-text("Got it")',
    'tp-yt-paper-dialog ytcp-button:has-text("OK")',
    'tp-yt-paper-dialog ytcp-button:has-text("Понятно")',
    'tp-yt-paper-dialog ytcp-button:has-text("Хорошо")',
]


DISMISS_UPLOAD_POPUPS_JS = '''
() => {
  function tryDismiss(dlg) {
    for (const b of dlg.querySelectorAll(
      'tp-yt-paper-icon-button, ytcp-icon-button, [role="button"]'
    )) {
      const attr = (b.getAttribute('icon') || b.getAttribute('aria-label') || '').toLowerCase();
      if (/close|dismiss|cancel/.test(attr)) { b.click(); return true; }
      const iron = b.querySelector('iron-icon');
      if (iron && /close/.test((iron.getAttribute('icon') || '').toLowerCase())) {
        b.click(); return true;
      }
    }
    const btns = [...dlg.querySelectorAll(
      'tp-yt-paper-button:not([hidden]), ytcp-button:not([hidden])'
    )];
    if (btns.length > 0) { btns[btns.length - 1].click(); return true; }
    return false;
  }

  function isVis(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.height === 0 || r.width === 0) return false;
    const s = window.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  }

  // External popups outside the upload form — never close dialogs inside ytcp-uploads-dialog
  // (bug #138: upload form uses tp-yt-paper-dialog; closing it kills the whole upload).
  for (const dlg of document.querySelectorAll('tp-yt-paper-dialog[opened]')) {
    if (dlg.closest('ytcp-uploads-dialog')) continue;
    if (!isVis(dlg)) continue;
    if (tryDismiss(dlg)) return dlg.tagName.toLowerCase();
  }

  const tut = document.querySelector('ytcp-tutorial-dialog');
  if (tut && isVis(tut) && tryDismiss(tut)) return 'ytcp-tutorial-dialog';

  const innerSelectors = [
    'ytcp-confirmation-dialog[opened]',
    'ytcp-copyright-matches-dialog[opened]',
    'ytcp-made-for-kids-dialog[opened]',
  ];
  for (const sel of innerSelectors) {
    for (const dlg of document.querySelectorAll(sel)) {
      if (!isVis(dlg)) continue;
      if (tryDismiss(dlg)) return dlg.tagName.toLowerCase();
    }
  }
  return '';
}
'''


def dismiss_upload_popups(page, rounds=2):
    """Dismiss Studio popups during upload without closing the upload dialog itself."""
    dismissed = 0
    for _ in range(max(1, rounds)):
        try:
            tag = page.evaluate(DISMISS_UPLOAD_POPUPS_JS) or ''
            if tag:
                dismissed += 1
                time.sleep(random.uniform(0.2, 0.45))
        except Exception:
            pass
    return dismissed


def dismiss_studio_overlays(page, rounds=3):
    """Закрывает coach marks Studio. На youtube.com/shorts — только cookie, без Close."""
    dismiss_consent(page)
    url = (page.url or '').lower()
    if 'studio.youtube.com' not in url:
        return 0

    total = 0
    for _ in range(max(1, rounds)):
        try:
            page.keyboard.press('Escape')
            time.sleep(0.12)
        except Exception:
            pass

        try:
            total += int(page.evaluate(DISMISS_STUDIO_OVERLAYS_JS) or 0)
        except Exception:
            pass

        for sel in STUDIO_DISMISS_SELECTORS:
            try:
                loc = page.locator(sel).first
                if loc.count() > 0 and loc.is_visible(timeout=250):
                    loc.click(timeout=2000, force=True)
                    total += 1
                    time.sleep(random.uniform(0.15, 0.35))
            except Exception:
                continue

        for pattern in (
            re.compile(r'^(got it|ok|dismiss|no thanks|not now|skip|понятно|закрыть|не сейчас|пропустить)$', re.I),
        ):
            for host in (
                'ytcp-feature-discovery-callout',
                'ytcp-callout',
                'ytcp-coachmark',
                'ytcp-coach-mark',
            ):
                try:
                    btn = page.locator(host).get_by_role('button', name=pattern).first
                    if btn.is_visible(timeout=200):
                        btn.click(timeout=1500, force=True)
                        total += 1
                        time.sleep(0.15)
                except Exception:
                    continue

    return total


def _focus_short_player(page):
    try:
        page.locator('ytd-shorts, #shorts-container, ytd-reel-video-renderer[is-active]').first.wait_for(
            state='visible', timeout=8000,
        )
    except Exception:
        pass
    for sel in (
        'ytd-reel-video-renderer[is-active] #player-container',
        'ytd-reel-video-renderer[is-active] video',
        'ytd-shorts #player',
        'video',
    ):
        try:
            loc = page.locator(sel).first
            if loc.is_visible(timeout=1500):
                loc.click(timeout=2500, force=True)
                time.sleep(0.35)
                return True
        except Exception:
            continue
    return False


def _is_short_liked(page):
    try:
        return bool(page.evaluate(IS_LIKED_JS))
    except Exception:
        return False


def try_like_short(page):
    """Ставит лайк на текущий Short. Возвращает True только если лайк реально появился."""
    _focus_short_player(page)
    time.sleep(random.uniform(0.25, 0.5))

    if _is_short_liked(page):
        return False

    for sel in LIKE_SELECTORS:
        try:
            btn = page.locator(sel).first
            if not btn.is_visible(timeout=1200):
                continue
            pressed = btn.get_attribute('aria-pressed')
            if pressed == 'true':
                return False
            btn.click(timeout=2500)
            time.sleep(random.uniform(0.4, 0.7))
            if _is_short_liked(page) or btn.get_attribute('aria-pressed') == 'true':
                return True
        except Exception:
            continue

    try:
        btn = page.get_by_role('button', name=LIKE_LABEL_RE).first
        if btn.is_visible(timeout=1500):
            if btn.get_attribute('aria-pressed') == 'true':
                return False
            btn.click(timeout=2500)
            time.sleep(random.uniform(0.4, 0.7))
            if _is_short_liked(page):
                return True
    except Exception:
        pass

    try:
        result = page.evaluate(LIKE_BUTTON_JS)
        if result and result.get('status') == 'clicked':
            time.sleep(random.uniform(0.45, 0.75))
            if _is_short_liked(page):
                return True
        if result and result.get('status') == 'already':
            return False
    except Exception:
        pass

    try:
        page.keyboard.press('l')
        time.sleep(random.uniform(0.5, 0.8))
        if _is_short_liked(page):
            return True
    except Exception:
        pass

    return False


SUBSCRIBE_LABEL_RE = re.compile(r'subscribe|подписаться|подписаться на канал', re.I)


def try_subscribe_short(page):
    """Subscribe on current Short channel overlay if available."""
    _focus_short_player(page)
    time.sleep(random.uniform(0.2, 0.45))
    selectors = [
        'ytd-subscribe-button-renderer tp-yt-paper-button',
        '#subscribe-button tp-yt-paper-button',
        'ytd-subscribe-button-renderer button',
        'button[aria-label*="Subscribe"]',
        'button[aria-label*="Подписаться"]',
    ]
    for sel in selectors:
        try:
            btn = page.locator(sel).first
            if not btn.is_visible(timeout=1200):
                continue
            label = (btn.get_attribute('aria-label') or btn.inner_text(timeout=500) or '').lower()
            if 'subscribed' in label or 'подписан' in label:
                return False
            btn.click(timeout=2500)
            time.sleep(random.uniform(0.5, 0.9))
            return True
        except Exception:
            continue
    try:
        btn = page.get_by_role('button', name=SUBSCRIBE_LABEL_RE).first
        if btn.is_visible(timeout=1500):
            label = (btn.get_attribute('aria-label') or '').lower()
            if 'subscribed' in label or 'подписан' in label:
                return False
            btn.click(timeout=2500)
            time.sleep(random.uniform(0.5, 0.9))
            return True
    except Exception:
        pass
    return False


def scroll_next_short(page):
    try:
        page.keyboard.press('ArrowDown')
        return True
    except Exception:
        try:
            page.mouse.wheel(0, random.randint(400, 900))
            return True
        except Exception:
            return False


def human_watch(page, seconds):
    end = time.time() + seconds
    while time.time() < end:
        chunk = min(random.uniform(0.8, 2.5), end - time.time())
        if chunk <= 0:
            break
        time.sleep(chunk)
        if random.random() < 0.15:
            try:
                page.mouse.move(
                    random.randint(200, 900),
                    random.randint(200, 700),
                    steps=random.randint(3, 8),
                )
            except Exception:
                pass
