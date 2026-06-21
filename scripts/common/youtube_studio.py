#!/usr/bin/env python3
"""YouTube Studio — channel customization and video upload via Playwright."""
import os
import re
import random

from common.account_status import inspect_account_page
from common.youtube_actions import (
    dismiss_consent,
    dismiss_studio_overlays,
    dismiss_upload_popups,
    scroll_next_short,
    human_watch,
)
from common.utils import random_delay, progress
from common.human_sim import HumanSimulator


def _human(page):
    return HumanSimulator(page)


def _reliable_click(page, locator, *, verify=None, retries=3, timeout=5000):
    """human → coordinate click → force → JS, with optional effect verification."""
    human = _human(page)
    for attempt in range(max(1, retries)):
        targets = [locator]
        try:
            inner = locator.locator('button, a, #button').first
            if inner.count() > 0:
                targets.insert(0, inner)
        except Exception:
            pass

        for target in targets:
            try:
                target.wait_for(state='visible', timeout=min(timeout, 8000))
            except Exception:
                pass

            for fn in (
                lambda t=target: human.human_click(t, timeout=timeout),
                lambda t=target: t.click(timeout=timeout, force=True),
                lambda t=target: t.evaluate(
                    '''el => {
                      const inner = el.shadowRoot?.querySelector('#button')
                        || el.querySelector?.('#button, button, tp-yt-paper-button');
                      if (inner) inner.click();
                      else el.click();
                    }'''
                ),
                lambda t=target: t.evaluate('el => el.click()'),
            ):
                try:
                    fn()
                    random_delay(0.15, 0.35)
                    if verify is None or verify():
                        return True
                except Exception:
                    continue

        random_delay(0.35, 0.75)
    return False


STUDIO_URL = 'https://studio.youtube.com'
UPLOAD_URL = 'https://www.youtube.com/upload'

_VIDEO_ID_RE = re.compile(r'(?:shorts/|watch\?v=|youtu\.be/|/embed/)([a-zA-Z0-9_-]{11})')

_PROCESSING_DONE_RE = re.compile(
    r'(finished processing|processing complete|upload complete|checks complete|'
    r'no issues found|issues found|обработка завершена|загрузка завершена|проверка завершена)',
    re.I,
)


def _normalize_video_url(url):
    if not url:
        return '', ''
    raw = str(url).strip()
    m = _VIDEO_ID_RE.search(raw)
    if not m:
        return '', ''
    vid = m.group(1)
    if 'shorts/' in raw or '/shorts/' in raw:
        return f'https://www.youtube.com/shorts/{vid}', vid
    return f'https://www.youtube.com/watch?v={vid}', vid


def _collect_video_urls_from_page(page):
    try:
        hrefs = page.evaluate(
            '''() => {
              const out = [];
              const seen = new Set();
              const add = (h) => {
                if (!h || seen.has(h)) return;
                if (/youtube\\.com\\/(shorts\\/|watch)|youtu\\.be\\//.test(h)) {
                  seen.add(h);
                  out.push(h);
                }
              };
              for (const a of document.querySelectorAll('a[href]')) add(a.href);
              for (const inp of document.querySelectorAll('input, textarea')) {
                const v = inp.value || '';
                if (v.includes('youtube') || v.includes('youtu.be')) add(v.trim());
              }
              return out;
            }'''
        )
    except Exception:
        hrefs = []
    found = []
    for href in hrefs or []:
        url, vid = _normalize_video_url(href)
        if vid:
            found.append((url, vid))
    return found


def _disable_beforeunload(page):
    try:
        page.evaluate('() => { window.onbeforeunload = null; }')
    except Exception:
        pass


def _check_daily_upload_limit(page):
    for text in (
        'Daily upload limit reached',
        'Достигнут суточный лимит',
        'суточный лимит загрузки',
    ):
        try:
            if page.get_by_text(text, exact=False).first.is_visible(timeout=400):
                return True
        except Exception:
            continue
    return False


def _read_upload_progress_text(page):
    try:
        return page.evaluate(
            '''() => {
              const sels = 'span.progress-label, ytcp-video-upload-progress span, #progress-label';
              for (const el of document.querySelectorAll(sels)) {
                const t = (el.textContent || '').trim();
                if (t) return t;
              }
              return '';
            }'''
        ) or ''
    except Exception:
        return ''


def _wait_server_upload_and_processing(page, timeout_ms=600000):
    """Ждём Upload complete → обработку → форму Details (как youtube-uploader / YouTubeUploader)."""
    import time

    deadline = time.time() + timeout_ms / 1000
    last_log = ''
    upload_complete = False

    progress('upload', None, 'жду загрузку на сервер и обработку…')
    while time.time() < deadline:
        if _check_daily_upload_limit(page):
            raise RuntimeError('Достигнут дневной лимит загрузки YouTube')

        text = _read_upload_progress_text(page)
        if text and text != last_log:
            progress('upload', None, f'прогресс: {text[:90]}')
            last_log = text

        if re.search(r'upload complete|загрузка завершена', text, re.I):
            upload_complete = True

        if _PROCESSING_DONE_RE.search(text):
            progress('upload', None, 'обработка завершена')
            random_delay(2, 4)
            return True

        for marker in (
            'Upload complete',
            'Загрузка завершена',
            'Finished processing',
            'Обработка завершена',
            'Checks complete',
        ):
            try:
                if page.get_by_text(marker, exact=False).first.is_visible(timeout=350):
                    if 'finish' in marker.lower() or 'complete' in marker.lower() or 'заверш' in marker.lower():
                        if 'upload' in marker.lower() or 'загруз' in marker.lower():
                            upload_complete = True
                        else:
                            progress('upload', None, f'готово: {marker}')
                            random_delay(2, 4)
                            return True
            except Exception:
                continue

        if upload_complete:
            try:
                if not page.get_by_text('Upload complete', exact=False).first.is_visible(timeout=400):
                    if not page.get_by_text('Загрузка завершена', exact=False).first.is_visible(timeout=400):
                        progress('upload', None, 'загрузка на сервер завершена, жду обработку…')
            except Exception:
                pass

        if _title_field_visible(page):
            if upload_complete or not text or _PROCESSING_DONE_RE.search(text):
                progress('upload', None, 'форма Details готова')
                random_delay(1.5, 3)
                return True

        try:
            page.wait_for_timeout(800)
        except Exception:
            break

    if _title_field_visible(page):
        return True
    return False


def _wait_for_publish_link(page, timeout_ms=90000):
    import time

    deadline = time.time() + timeout_ms / 1000
    while time.time() < deadline:
        for sel in ('a[href^="https://youtu.be/"]', 'a[href*="watch?v="]'):
            try:
                link = page.locator(sel).first
                if link.count() == 0 or not link.is_visible(timeout=500):
                    continue
                href = (link.get_attribute('href') or '').strip()
                if href.rstrip('/') in ('https://youtu.be', 'https://www.youtube.com/watch'):
                    continue
                url, vid = _normalize_video_url(href)
                if vid:
                    return url, vid
            except Exception:
                continue
        for url, vid in _collect_video_urls_from_page(page):
            if vid:
                return url, vid
        try:
            page.wait_for_timeout(500)
        except Exception:
            break
    return '', ''


def _wait_upload_dialog_closed(page, timeout_ms=30000):
    step = 500
    for _ in range(max(1, timeout_ms // step)):
        if not _is_upload_dialog_visible(page):
            return True
        try:
            page.wait_for_timeout(step)
        except Exception:
            break
    return not _is_upload_dialog_visible(page)


def _get_uploaded_video_link(page, title='', timeout_ms=30000):
    import time
    deadline = time.time() + timeout_ms / 1000
    title_key = (title or '').strip().lower()[:40]
    while time.time() < deadline:
        for url, vid in _collect_video_urls_from_page(page):
            return url, vid
        try:
            page.wait_for_timeout(900)
        except Exception:
            break

    channel_id = _extract_channel_id(page)
    targets = []
    if channel_id:
        targets.append(f'{STUDIO_URL}/channel/{channel_id}/videos')
    targets.extend([f'{STUDIO_URL}/channel/me/videos', STUDIO_URL])

    for target in targets:
        try:
            if target not in (page.url or ''):
                page.goto(target, wait_until='domcontentloaded', timeout=90000)
                random_delay(2, 3)
            for sel in (
                'a[href*="/shorts/"]',
                'a[href*="watch?v="]',
                'ytcp-video-row a[href*="youtube.com"]',
            ):
                try:
                    loc = page.locator(sel).first
                    if loc.count() == 0 or not loc.is_visible(timeout=2500):
                        continue
                    href = loc.get_attribute('href', timeout=3000)
                    url, vid = _normalize_video_url(href or '')
                    if vid:
                        if title_key:
                            try:
                                row_text = loc.evaluate(
                                    'el => (el.closest("ytcp-video-row, tr, [role=row]")?.innerText || el.innerText || "").toLowerCase()'
                                )
                                if title_key not in (row_text or ''):
                                    continue
                            except Exception:
                                pass
                        return url, vid
                except Exception:
                    continue
        except Exception:
            continue
    return '', ''


FIELD_KEYS = {
    'channel-name': {
        'key': 'name',
        'label': 'названия канала',
        'role': re.compile(r'^(name|channel name|название|имя канала)$', re.I),
    },
    'channel-description': {
        'key': 'description',
        'label': 'описания канала',
        'role': re.compile(r'^(description|описание|описание канала|tell viewers)', re.I),
    },
}

DEEP_FIELD_JS = '''
([fieldKey, value, mode]) => {
  function walkShadow(root, visit) {
    if (!root) return;
    visit(root);
    for (const el of root.querySelectorAll?.('*') || []) {
      if (el.shadowRoot) walkShadow(el.shadowRoot, visit);
    }
  }

  function findNameInput() {
    const inputs = [];
    walkShadow(document, (root) => {
      for (const c of root.querySelectorAll?.('ytcp-form-input-container') || []) {
        if (c.id === 'business-email') continue;
        if (c.closest('ytcp-social-suggestions-textbox, #description-textbox')) continue;
        const input = c.querySelector('input:not([type="hidden"]):not([type="email"])');
        if (!input) continue;
        inputs.push({ box: input, score: c.id === 'channel-name' ? 300 : 0, aria: 'Name (input)' });
      }
    });
    if (!inputs.length) return null;
    return inputs[0];
  }

  function findDescriptionBox() {
    let hit = null;
    walkShadow(document, (root) => {
      if (hit) return;
      const box = root.querySelector?.('ytcp-social-suggestions-textbox#description-textbox #textbox')
        || root.querySelector?.('#description-textbox #textbox')
        || root.querySelector?.('#textbox[aria-label*="Tell viewers about your channel"]');
      if (box) hit = { box, score: 300, aria: box.getAttribute('aria-label') || 'description-textbox' };
    });
    return hit;
  }

  const hit = fieldKey === 'name' ? findNameInput() : fieldKey === 'description' ? findDescriptionBox() : null;
  if (!hit) return { ok: false, reason: 'not found' };

  const box = hit.box;
  box.scrollIntoView({ block: 'center', behavior: 'instant' });
  const main = document.querySelector('main#main, main');
  if (main) main.scrollTop = Math.max(0, box.offsetTop - 160);

  if (mode === 'find') return { ok: true, reason: 'found', ariaLabel: hit.aria, score: hit.score };

  box.focus();
  if ('value' in box) {
    box.value = '';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    box.value = value;
  } else {
    box.textContent = '';
    box.innerText = '';
    try { document.execCommand('selectAll', false, null); document.execCommand('delete', false, null); } catch (e) {}
    box.textContent = value;
    box.innerText = value;
  }
  box.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  box.dispatchEvent(new Event('change', { bubbles: true }));
  box.dispatchEvent(new Event('blur', { bubbles: true }));
  const text = ('value' in box ? box.value : (box.textContent || box.innerText || '')).trim();
  return { ok: true, text, ariaLabel: hit.aria };
}
'''

SCROLL_PANEL_JS = '''
() => {
  const scrollables = [];
  function walk(root) {
    for (const el of root.querySelectorAll('*')) {
      try {
        const st = getComputedStyle(el);
        if (el.scrollHeight > el.clientHeight + 8 && /auto|scroll|overlay/.test(st.overflowY)) {
          scrollables.push(el);
        }
      } catch (e) {}
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  }
  walk(document);
  scrollables.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
  for (const el of scrollables.slice(0, 5)) {
    el.scrollTop += Math.max(el.clientHeight * 0.7, 420);
  }
  return scrollables.length;
}
'''


FILL_UPLOAD_FIELD_JS = '''
([kind, value]) => {
  function walk(root, visit) {
    if (!root) return;
    visit(root);
    for (const el of root.querySelectorAll?.('*') || []) {
      if (el.shadowRoot) walk(el.shadowRoot, visit);
    }
  }

  function inUploadDialog(node) {
    return node && node.closest?.('ytcp-uploads-dialog, ytcp-video-dialog, ytcp-video-metadata-editor, ytcp-uploads-dialog-file-picker');
  }

  function findTitle() {
    let hit = null;
    walk(document, (root) => {
      if (hit) return;
      const selectors = [
        'ytcp-video-title #textbox',
        '#title-textarea #textbox',
        'ytcp-social-suggestions-textbox#title-textarea #textbox',
        '#textbox[aria-label*="itle" i]',
        '#textbox[aria-label*="азван" i]',
      ];
      for (const sel of selectors) {
        for (const box of root.querySelectorAll?.(sel) || []) {
          if (inUploadDialog(box) || box.closest('ytcp-uploads-dialog')) {
            hit = box;
            return;
          }
        }
      }
    });
    return hit;
  }

  function findTagsInput() {
    let hit = null;
    walk(document, (root) => {
      if (hit) return;
      const selectors = [
        'ytcp-form-chip-bar #text-input',
        'ytcp-chip-bar #text-input',
        'ytcp-video-metadata-editor-advanced #text-input',
        'input[aria-label*="tag" i]',
        'input[aria-label*="тег" i]',
        '#tags-container input',
      ];
      for (const sel of selectors) {
        for (const inp of root.querySelectorAll?.(sel) || []) {
          if (inUploadDialog(inp) || inp.closest('ytcp-uploads-dialog, ytcp-video-metadata-editor')) {
            hit = inp;
            return;
          }
        }
      }
    });
    return hit;
  }

  const el = kind === 'tags' ? findTagsInput() : findTitle();
  if (!el) return { ok: false, reason: 'not found' };

  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  el.focus();
  if ('value' in el) {
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.value = value;
  } else {
    el.textContent = '';
    el.innerText = '';
    try { document.execCommand('selectAll', false, null); document.execCommand('delete', false, null); } catch (e) {}
    el.textContent = value;
    el.innerText = value;
  }
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
  const text = ('value' in el ? el.value : (el.textContent || el.innerText || '')).trim();
  return { ok: true, text };
}
'''


def _fill_upload_field_js(page, kind, value):
    try:
        result = page.evaluate(FILL_UPLOAD_FIELD_JS, [kind, value])
        return bool(result and result.get('ok'))
    except Exception:
        return False


def _title_field_locators(page):
    return (
        page.locator('ytcp-video-title #textbox').first,
        page.locator('#title-textarea #textbox').first,
        page.locator('ytcp-social-suggestions-textbox#title-textarea #textbox').first,
        page.locator('#textbox[aria-label*="title" i]').first,
        page.locator('#textbox[aria-label*="назван" i]').first,
        page.get_by_label(re.compile(r'^title$|^назван', re.I)).first,
    )


def _wait_upload_title_ready(page, timeout_ms=20000):
    step = 500
    attempts = max(1, timeout_ms // step)
    for _ in range(attempts):
        for loc in _title_field_locators(page):
            try:
                if loc.count() > 0 and loc.is_visible(timeout=800):
                    text = _read_textbox(loc)
                    if text:
                        return loc
            except Exception:
                continue
        try:
            page.wait_for_timeout(step)
        except Exception:
            break
    for loc in _title_field_locators(page):
        try:
            if loc.count() > 0 and loc.is_visible(timeout=1000):
                return loc
        except Exception:
            continue
    return None


def _fill_upload_title(page, title, *, force_prepare=False):
    if not title:
        return False

    if _title_matches_on_page(page, title):
        progress('upload', None, 'название уже заполнено')
        return True

    if force_prepare:
        dismiss_studio_overlays(page, rounds=1)
    progress('upload', None, f'название: {title[:80]}')
    title_loc = _wait_upload_title_ready(page)
    if title_loc is None:
        random_delay(1, 2)

    for attempt in range(4):
        if attempt:
            random_delay(0.8, 1.2)

        for loc in _title_field_locators(page):
            try:
                if loc.count() == 0 or not loc.is_visible(timeout=1500):
                    continue
                _overwrite_textbox(page, loc, title)
                actual = _read_textbox(loc)
                if _text_matches(title, actual):
                    progress('upload', None, 'название установлено')
                    return True
            except Exception:
                continue

        if _fill_upload_field_js(page, 'title', title):
            progress('upload', None, 'название установлено (JS)')
            return True

    progress('upload', None, 'не удалось установить название')
    return False


def _title_matches_on_page(page, title):
    for loc in _title_field_locators(page):
        try:
            if loc.count() > 0 and loc.is_visible(timeout=400):
                if _text_matches(title, _read_textbox(loc)):
                    return True
        except Exception:
            continue
    return False


def _is_audience_step(page):
    for sel in (
        'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
        'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_MFK"]',
        '#not-made-for-kids-radio',
    ):
        try:
            if page.locator(sel).first.is_visible(timeout=400):
                return True
        except Exception:
            continue
    try:
        if page.get_by_text(re.compile(r'made for kids|для детей|audience', re.I)).first.is_visible(timeout=400):
            return True
    except Exception:
        pass
    return False


def _is_visibility_step(page):
    for sel in (
        'ytcp-video-visibility-select',
        '#privacy-radio-public',
        'tp-yt-paper-radio-button[name="PUBLIC"]',
    ):
        try:
            if page.locator(sel).first.is_visible(timeout=400):
                return True
        except Exception:
            continue
    return False


def _next_button_locators(page):
    return (
        page.locator('ytcp-button#next-button').first,
        page.locator('xpath=//*[normalize-space(text())="Next"]/parent::*[not(@disabled)]').first,
        page.locator('xpath=//*[normalize-space(text())="Далее"]/parent::*[not(@disabled)]').first,
        page.get_by_role('button', name=re.compile(r'^(next|далее)$', re.I)).first,
    )


def _locator_is_enabled(btn):
    try:
        if btn.count() == 0 or not btn.is_visible(timeout=500):
            return False
        disabled = btn.get_attribute('disabled')
        aria = btn.get_attribute('aria-disabled')
        return disabled is None and aria != 'true'
    except Exception:
        return False


def _wait_upload_next_enabled(page, timeout_ms=120000):
    import time

    deadline = time.time() + timeout_ms / 1000
    while time.time() < deadline:
        for loc in _next_button_locators(page):
            try:
                if _locator_is_enabled(loc):
                    return loc
            except Exception:
                continue
        try:
            page.wait_for_timeout(700)
        except Exception:
            break
    return None


CLICK_UPLOAD_NEXT_JS = '''
() => {
  function clickYtcp(btn) {
    if (!btn) return false;
    const inner = btn.shadowRoot?.querySelector('#button')
      || btn.querySelector?.('#button, button, tp-yt-paper-button');
    if (inner) { inner.click(); return true; }
    btn.click();
    return true;
  }
  function findNext(root) {
    const direct = root.querySelector?.('ytcp-button#next-button');
    if (direct) return direct;
    for (const el of root.querySelectorAll?.('*') || []) {
      if (el.shadowRoot) {
        const hit = findNext(el.shadowRoot);
        if (hit) return hit;
      }
    }
    return null;
  }
  const btn = findNext(document);
  if (!btn) return false;
  if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
  return clickYtcp(btn);
}
'''

MANUAL_ASSIST_HINT_SEC = 25
MANUAL_ASSIST_MAX_MS = 180000


def _is_publish_success_state(page):
    """Share dialog / success screen — публикация уже выполнена."""
    state = _upload_wizard_state(page)
    if state.get('share_dialog'):
        return True
    try:
        return bool(
            page.evaluate(
                '''() => {
                  function isVis(el) {
                    if (!el) return false;
                    const r = el.getBoundingClientRect();
                    if (r.height < 4 || r.width < 4) return false;
                    const s = window.getComputedStyle(el);
                    return s.display !== 'none' && s.visibility !== 'hidden';
                  }
                  if (isVis(document.querySelector('ytcp-video-share-dialog'))) return true;
                  const uploadDlg = document.querySelector('ytcp-uploads-dialog');
                  if (!uploadDlg || !isVis(uploadDlg)) {
                    const body = document.body?.innerText || '';
                    if (/video published|video is public|видео опубликовано|готово к просмотру/i.test(body)) {
                      return true;
                    }
                  }
                  return false;
                }'''
            )
        )
    except Exception:
        return False


def _resolve_manual_wait_ms(manual_wait_ms):
    """0 = ждать пользователя, но не дольше MANUAL_ASSIST_MAX_MS."""
    ms = int(manual_wait_ms or 0)
    if ms <= 0:
        return MANUAL_ASSIST_MAX_MS
    return ms


def _upload_wizard_state(page):
    """Probe upload wizard state (visibility step, share dialog, upload gone)."""
    try:
        return page.evaluate(
            '''() => {
              function isVis(el) {
                if (!el) return false;
                const r = el.getBoundingClientRect();
                if (r.height === 0 || r.width === 0) return false;
                const s = window.getComputedStyle(el);
                return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
              }
              const uploadDlg = document.querySelector('ytcp-uploads-dialog');
              return {
                visibility: isVis(document.querySelector('#privacy-radios'))
                  || isVis(document.querySelector('tp-yt-paper-radio-button[name="PUBLIC"]'))
                  || isVis(document.querySelector('#done-button')),
                share_dialog: isVis(document.querySelector('ytcp-video-share-dialog')),
                upload_gone: !uploadDlg || !isVis(uploadDlg),
              };
            }'''
        ) or {}
    except Exception:
        return {}


def _close_success_dialog(page):
    """Close post-publish success/share dialog."""
    try:
        page.keyboard.press('Escape')
        random_delay(0.3, 0.5)
    except Exception:
        pass

    share_selectors = (
        'ytcp-video-share-dialog button.ytcpButtonShapeImpl--mono',
        'ytcp-video-share-dialog #close-button button',
        'ytcp-video-share-dialog ytcp-button-shape button',
        'ytcp-video-share-dialog button',
    )
    for sel in share_selectors:
        try:
            btn = page.locator(sel).first
            if btn.count() > 0 and btn.is_visible(timeout=500):
                btn.click(timeout=2000)
                progress('upload', None, 'закрыл диалог «Видео опубликовано»')
                random_delay(0.4, 0.7)
                return True
        except Exception:
            continue

    try:
        closed = page.evaluate(
            '''() => {
              const dialog = document.querySelector('ytcp-video-share-dialog');
              if (!dialog) return false;
              const btn = dialog.querySelector('button.ytcpButtonShapeImpl--mono')
                || dialog.querySelector('#close-button button')
                || dialog.querySelector('ytcp-button-shape button')
                || dialog.querySelector('button');
              if (btn) { btn.click(); return true; }
              return false;
            }'''
        )
        if closed:
            progress('upload', None, 'закрыл диалог «Видео опубликовано» (JS)')
            return True
    except Exception:
        pass
    return False


def _check_channel_ban(page):
    """Raise if channel/account is banned before or during upload."""
    status, _msg = inspect_account_page(page)
    if status in ('banned', 'disabled'):
        raise RuntimeError(f'Канал/аккаунт недоступен: {status}')


def _dismiss_upload_overlays(page, rounds=1):
    """Upload-safe overlay dismiss; falls back to generic Studio dismiss."""
    if _is_upload_dialog_visible(page):
        return dismiss_upload_popups(page, rounds=rounds)
    return dismiss_studio_overlays(page, rounds=rounds)


def _wizard_step_snapshot(page):
    try:
        return page.evaluate(
            '''() => {
              const dlg = document.querySelector(
                'ytcp-uploads-dialog, ytcp-video-metadata-editor, ytcp-uploads-dialog-file-picker'
              );
              if (!dlg) return { dialog: false };
              const active = document.querySelector(
                '[class*="step-active"], ytcp-stepper [active], #step-badge-0[active], #step-badge-1[active], #step-badge-2[active], #step-badge-3[active]'
              );
              const next = document.querySelector('ytcp-button#next-button');
              const done = document.querySelector('ytcp-button#done-button');
              return {
                dialog: true,
                step: active?.id || active?.className?.slice?.(0, 80) || '',
                nextDisabled: !!(next && (next.disabled || next.getAttribute('aria-disabled') === 'true')),
                hasDone: !!(done && !done.disabled && done.getAttribute('aria-disabled') !== 'true'),
                title: !!document.querySelector('ytcp-video-title #textbox, #title-textarea #textbox'),
                audience: !!document.querySelector(
                  'tp-yt-paper-radio-button[name*="MFK"], #not-made-for-kids-radio'
                ),
                visibility: !!document.querySelector('ytcp-video-visibility-select, #privacy-radio-public'),
              };
            }'''
        )
    except Exception:
        return {'dialog': False}


def _wizard_snap_changed(prev, cur):
    if not prev or not cur:
        return True
    for key in ('step', 'title', 'audience', 'visibility', 'nextDisabled', 'hasDone'):
        if prev.get(key) != cur.get(key):
            return True
    return False


def _publish_button_visible(page, timeout_ms=2000):
    return _wait_publish_button_enabled(page, timeout_ms) is not None


def _publish_still_required(page):
    """Ссылка youtu.be в диалоге появляется ДО клика «Опубликовать» — нельзя считать это успехом."""
    if _is_publish_success_state(page):
        return False
    if not _is_upload_dialog_visible(page):
        return False
    if not _is_visibility_step(page):
        try:
            snap = _wizard_step_snapshot(page)
            if not snap.get('visibility'):
                return False
        except Exception:
            return False
    if _publish_button_visible(page, 400):
        return True
    return _is_visibility_step(page)


def _wait_for_manual_wizard_progress(page, prev_snap, timeout_ms=0, *, reason='Next / Далее'):
    """Ждём ручного Next/Publish — окно не закрываем, пока пользователь не продвинет мастер."""
    import time

    start = time.time()
    last_hint = 0
    effective_timeout_ms = _resolve_manual_wait_ms(timeout_ms)
    progress('upload', None, f'⏸ Нажмите {reason} в Studio — жду (браузер не закроется)')

    while True:
        if _is_publish_success_state(page):
            _close_success_dialog(page)
            progress('upload', None, 'публикация завершена (success dialog)')
            return 'published'

        if _publish_still_required(page):
            if _click_upload_publish(page, timeout_ms=8000, manual_assist=False):
                return 'published'
        else:
            url, vid = _wait_for_publish_link(page, timeout_ms=1500)
            if vid:
                return 'published'

        snap = _wizard_step_snapshot(page)
        if not snap.get('dialog'):
            if not _publish_still_required(page) or _is_publish_success_state(page):
                return 'published'
            return 'dialog_closed'

        if prev_snap and _wizard_snap_changed(prev_snap, snap):
            progress('upload', None, 'шаг сменился — продолжаю автоматизацию')
            return 'advanced'

        if snap.get('hasDone') and snap.get('visibility') and not snap.get('nextDisabled'):
            return 'advanced'

        elapsed_ms = (time.time() - start) * 1000
        if elapsed_ms >= effective_timeout_ms:
            if _is_publish_success_state(page):
                _close_success_dialog(page)
                return 'published'
            if not _publish_still_required(page):
                return 'published'
            progress('upload', None, f'таймаут ожидания ({int(elapsed_ms / 1000)} с) — продолжаю')
            return 'timeout'

        if time.time() - last_hint >= MANUAL_ASSIST_HINT_SEC:
            progress('upload', None, f'⏸ Всё ещё жду: {reason} (прошло {int(elapsed_ms / 1000)} с)')
            last_hint = time.time()

        try:
            page.wait_for_timeout(1200)
        except Exception:
            break

    return 'timeout'


def _click_upload_next_aggressive(page, *, wait_enabled_ms=25000, safety_sleep=False):
    if safety_sleep:
        random_delay(2.0, 3.5)

    _dismiss_upload_overlays(page, rounds=1)
    snap_before = _wizard_step_snapshot(page)

    def _next_took_effect():
        if _is_publish_success_state(page):
            return True
        for _ in range(5):
            snap_after = _wizard_step_snapshot(page)
            if _wizard_snap_changed(snap_before, snap_after):
                return True
            try:
                page.wait_for_timeout(450)
            except Exception:
                break
        return False

    btn = _wait_upload_next_enabled(page, wait_enabled_ms)
    if btn is not None:
        try:
            btn.scroll_into_view_if_needed(timeout=3000)
            if _reliable_click(page, btn, verify=_next_took_effect):
                random_delay(0.8, 1.4)
                return True
        except Exception:
            pass

    for loc in _next_button_locators(page):
        try:
            if loc.count() == 0 or not loc.is_visible(timeout=800):
                continue
            loc.scroll_into_view_if_needed(timeout=3000)
            if _reliable_click(page, loc, verify=_next_took_effect):
                random_delay(0.8, 1.4)
                return True
        except Exception:
            continue

    try:
        if page.evaluate(CLICK_UPLOAD_NEXT_JS):
            random_delay(0.8, 1.4)
            if _next_took_effect():
                return True
    except Exception:
        pass
    return False


def _click_upload_next(page, timeout_ms=90000, *, safety_sleep=False, manual_assist=True, manual_wait_ms=0):
    if _click_upload_next_aggressive(page, wait_enabled_ms=min(timeout_ms, 30000), safety_sleep=safety_sleep):
        progress('upload', None, '→ Next')
        random_delay(1.0, 1.8)
        return True

    if not manual_assist:
        return False

    snap = _wizard_step_snapshot(page)
    result = _wait_for_manual_wizard_progress(page, snap, manual_wait_ms, reason='Next / Далее')
    return result in ('advanced', 'published', 'dialog_closed')


def _wait_publish_button_enabled(page, timeout_ms=60000):
    import time

    finish_selectors = [
        'ytcp-button#done-button',
        'ytcp-button:has-text("Publish")',
        'ytcp-button:has-text("Опубликовать")',
        'ytcp-button:has-text("Save")',
        'ytcp-button:has-text("Сохранить")',
        'xpath=//*[normalize-space(text())="Publish"]/parent::*[not(@disabled)]',
        'xpath=//*[normalize-space(text())="Опубликовать"]/parent::*[not(@disabled)]',
        'xpath=//*[normalize-space(text())="Save"]/parent::*[not(@disabled)]',
    ]
    deadline = time.time() + timeout_ms / 1000
    while time.time() < deadline:
        for sel in finish_selectors:
            try:
                btn = page.locator(sel).first
                if _locator_is_enabled(btn):
                    return btn
            except Exception:
                continue
        try:
            page.wait_for_timeout(600)
        except Exception:
            break
    return None


CLICK_PUBLISH_JS = '''
() => {
  function clickYtcp(btn) {
    if (!btn) return false;
    const inner = btn.shadowRoot?.querySelector('#button')
      || btn.querySelector?.('#button, button, tp-yt-paper-button');
    if (inner) { inner.click(); return true; }
    btn.click();
    return true;
  }
  function findBtn(root) {
    for (const sel of ['ytcp-button#done-button', 'ytcp-button#publish-button']) {
      const hit = root.querySelector?.(sel);
      if (hit) return hit;
    }
    for (const el of root.querySelectorAll?.('*') || []) {
      if (el.shadowRoot) {
        const hit = findBtn(el.shadowRoot);
        if (hit) return hit;
      }
    }
    return null;
  }
  const labels = /^(publish|опубликовать|save|сохранить|done|готово)$/i;
  function walk(root) {
    for (const el of root.querySelectorAll?.('ytcp-button, button, tp-yt-paper-button') || []) {
      const t = (el.innerText || el.textContent || '').trim();
      if (labels.test(t) && !el.disabled && el.getAttribute('aria-disabled') !== 'true') {
        return el;
      }
    }
    for (const el of root.querySelectorAll?.('*') || []) {
      if (el.shadowRoot) {
        const hit = walk(el.shadowRoot);
        if (hit) return hit;
      }
    }
    return null;
  }
  const btn = findBtn(document) || walk(document);
  if (!btn) return false;
  if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
  return clickYtcp(btn);
}
'''


def _click_publish_button_aggressive(page, timeout_ms=45000):
    """Клик по «Опубликовать» / #done-button — не путать с превью-ссылкой youtu.be."""
    _dismiss_upload_overlays(page, rounds=1)

    btn = _wait_publish_button_enabled(page, min(timeout_ms, 30000))
    if btn is not None:
        try:
            btn.scroll_into_view_if_needed(timeout=3000)
            if _reliable_click(page, btn):
                return True
        except Exception:
            pass

    for sel in (
        'ytcp-button#done-button',
        'ytcp-button#publish-button',
        'xpath=//*[normalize-space(text())="Publish"]/parent::*[not(@disabled)]',
        'xpath=//*[normalize-space(text())="Опубликовать"]/parent::*[not(@disabled)]',
        'xpath=//*[normalize-space(text())="Опубликовать видео"]/parent::*[not(@disabled)]',
    ):
        try:
            loc = page.locator(sel).first
            if loc.count() > 0 and loc.is_visible(timeout=800):
                loc.scroll_into_view_if_needed(timeout=3000)
                if _reliable_click(page, loc):
                    return True
        except Exception:
            continue

    try:
        btn = page.get_by_role(
            'button',
            name=re.compile(r'^(publish|опубликовать|опубликовать видео|save|сохранить)$', re.I),
        ).first
        if btn.is_visible(timeout=1500):
            btn.scroll_into_view_if_needed(timeout=3000)
            if _reliable_click(page, btn):
                return True
    except Exception:
        pass

    try:
        if page.evaluate(CLICK_PUBLISH_JS):
            random_delay(0.3, 0.6)
            return True
    except Exception:
        pass
    return False


def _confirm_after_publish_click(page, timeout_ms=90000):
    """Ждём закрытия мастера или исчезновения кнопки Publish после клика."""
    import time

    deadline = time.time() + timeout_ms / 1000
    while time.time() < deadline:
        if _is_publish_success_state(page):
            _close_success_dialog(page)
            progress('upload', None, 'публикация подтверждена (success dialog)')
            return True
        state = _upload_wizard_state(page)
        if state.get('share_dialog'):
            _close_success_dialog(page)
            progress('upload', None, 'публикация подтверждена (share dialog)')
            return True
        if state.get('upload_gone') and not _publish_still_required(page):
            progress('upload', None, 'публикация подтверждена (upload dialog gone)')
            return True
        if not _publish_still_required(page):
            _close_success_dialog(page)
            _wait_upload_dialog_closed(page, 15000)
            progress('upload', None, 'публикация подтверждена (диалог закрыт)')
            return True
        if not _is_upload_dialog_visible(page):
            _close_success_dialog(page)
            progress('upload', None, 'публикация подтверждена')
            return True
        try:
            page.wait_for_timeout(700)
        except Exception:
            break
    if _is_publish_success_state(page):
        _close_success_dialog(page)
        return True
    return not _publish_still_required(page)


def _click_upload_publish(page, timeout_ms=60000, *, manual_assist=True, manual_wait_ms=0):
    _dismiss_upload_overlays(page, rounds=1)

    state = _upload_wizard_state(page)
    if state.get('share_dialog'):
        _close_success_dialog(page)
        progress('upload', None, 'share dialog — публикация уже выполнена')
        return True

    if not _is_visibility_step(page) and not _publish_button_visible(page, 2000):
        if not _is_upload_dialog_visible(page):
            url, vid = _wait_for_publish_link(page, timeout_ms=2000)
            return bool(vid)
        return False

    if not _publish_still_required(page):
        url, vid = _wait_for_publish_link(page, timeout_ms=2000)
        if vid:
            progress('upload', None, f'уже опубликовано: {url}')
            return True

    url_preview, vid_preview = _wait_for_publish_link(page, timeout_ms=1500)
    if vid_preview:
        progress('upload', None, f'ссылка в диалоге (ещё не жму Publish): {url_preview[:60]}')

    progress('upload', None, 'нажимаю «Опубликовать»…')
    if _click_publish_button_aggressive(page, timeout_ms=min(timeout_ms, 45000)):
        progress('upload', None, '→ Publish')
        random_delay(1.5, 2.5)
        if _confirm_after_publish_click(page, timeout_ms=min(timeout_ms, 90000)):
            return True
        progress('upload', None, 'клик Publish отправлен, жду закрытия диалога…')
        if _click_publish_button_aggressive(page, timeout_ms=15000):
            random_delay(1.5, 2.5)
            if _confirm_after_publish_click(page, timeout_ms=30000):
                return True

    if manual_assist and _publish_still_required(page):
        progress('upload', None, '⏸ Нажмите «Опубликовать» в Studio — жду')
        snap = _wizard_step_snapshot(page)
        result = _wait_for_manual_wizard_progress(
            page, snap, manual_wait_ms, reason='Publish / Опубликовать',
        )
        if result == 'published':
            if _is_publish_success_state(page):
                _close_success_dialog(page)
            return True
        if result == 'advanced':
            return _click_upload_publish(page, timeout_ms=timeout_ms, manual_assist=False, manual_wait_ms=0)
    if _is_publish_success_state(page):
        _close_success_dialog(page)
        return True
    return not _publish_still_required(page) and not _is_upload_dialog_visible(page)


def _fill_upload_tags(page, tags):
    if not tags:
        return False
    clean = []
    for tag in tags:
        c = re.sub(r'^#+\s*', '', str(tag).strip())
        if c:
            clean.append(c)
    if not clean:
        return False
    value = ', '.join(clean[:30])[:495] + ', '
    human = _human(page)

    for sel in (
        'ytcp-button:has-text("Show more")',
        'ytcp-button:has-text("Show More")',
        'ytcp-button:has-text("Ещё")',
        'ytcp-button:has-text("Показать")',
    ):
        try:
            btn = page.locator(sel).first
            if btn.count() > 0 and btn.is_visible(timeout=800):
                human.human_click(btn)
                human.human_delay(0.4, 0.8)
                break
        except Exception:
            continue

    for loc in (
        page.locator('[aria-label="Tags"]').first,
        page.locator('[aria-label*="Tags" i]').first,
        page.locator('[aria-label*="тег" i]').first,
        page.locator('ytcp-form-chip-bar #text-input').first,
    ):
        try:
            if loc.count() > 0 and loc.is_visible(timeout=1500):
                human.human_type(loc, value, clear=True, verify=True)
                progress('upload', None, 'теги установлены')
                return True
        except Exception:
            continue

    if _fill_upload_field_js(page, 'tags', value):
        progress('upload', None, 'теги установлены (JS)')
        return True
    return False


def _advance_upload_wizard(page, title, description='', visibility='public', tags=None, config=None):
    """Details → audience → Next → visibility → Publish. При зависании — ждёт ручного Next."""
    cfg = config if isinstance(config, dict) else {}
    manual = cfg.get('uploadManualAssist', True)
    manual_wait_ms = int(cfg.get('uploadManualWaitMs') or 0)

    if not _wait_upload_next_enabled(page, 180000):
        progress('upload', None, 'Next долго не активен — заполняю поля и пробую снова')

    title_done = False
    kids_done = False
    tags_done = False
    desc_done = False

    for step in range(24):
        _dismiss_upload_overlays(page, rounds=1)
        if _is_publish_success_state(page):
            _close_success_dialog(page)
            return True
        if step % 4 == 0:
            _check_channel_ban(page)

        if title and not title_done and _title_field_visible(page):
            _fill_upload_title(page, title)
            title_done = True
            random_delay(0.5, 1.0)

        if description and not desc_done and _title_field_visible(page):
            for loc in (
                page.locator('#textbox[aria-label*="description" i]').first,
                page.locator('#textbox[aria-label*="описан" i]').first,
            ):
                try:
                    if loc.count() > 0 and loc.is_visible(timeout=800):
                        _overwrite_textbox(page, loc, description)
                        desc_done = True
                        break
                except Exception:
                    continue

        if tags and not tags_done and _title_field_visible(page):
            tags_done = _fill_upload_tags(page, tags) or tags_done

        if not kids_done and _is_audience_step(page):
            _set_made_for_kids(page, for_kids=False)
            kids_done = True
            random_delay(0.6, 1.2)

        if _is_visibility_step(page):
            _set_video_visibility(page, visibility)

        if _click_upload_publish(
            page,
            manual_assist=manual,
            manual_wait_ms=manual_wait_ms,
        ):
            return True

        safety = step == 0 and bool(_read_upload_progress_text(page))
        advanced = _click_upload_next(
            page,
            timeout_ms=60000,
            safety_sleep=safety,
            manual_assist=manual,
            manual_wait_ms=manual_wait_ms,
        )
        if advanced:
            if _is_visibility_step(page):
                _set_video_visibility(page, visibility)
            continue

        if manual:
            snap = _wizard_step_snapshot(page)
            result = _wait_for_manual_wizard_progress(page, snap, manual_wait_ms)
            if result in ('advanced', 'published', 'dialog_closed', 'timeout'):
                if result == 'published' or _is_publish_success_state(page):
                    _close_success_dialog(page)
                    return True
                if result == 'timeout':
                    continue
                continue
        progress('upload', None, f'шаг {step + 1}: не удалось продвинуть мастер')
        break

    return _click_upload_publish(
        page,
        timeout_ms=120000,
        manual_assist=manual,
        manual_wait_ms=manual_wait_ms,
    )


def _title_field_visible(page):
    for loc in _title_field_locators(page):
        try:
            if loc.count() > 0 and loc.is_visible(timeout=400):
                return True
        except Exception:
            continue
    return False


def _click_first(page, selectors, timeout=4000):
    _prepare_studio_page(page, rounds=1)
    for sel in selectors:
        try:
            loc = page.locator(sel).first
            if loc.is_visible(timeout=timeout):
                if _reliable_click(page, loc):
                    random_delay(0.3, 0.5)
                    return True
        except Exception:
            _prepare_studio_page(page, rounds=1)
            continue
    return False


def _extract_channel_id(page):
    url = page.url or ''
    for pattern in (
        r'/channel/(UC[\w-]{20,})',
        r'/channel/(UC[\w-]+)',
        r'channelId=(UC[\w-]+)',
    ):
        m = re.search(pattern, url)
        if m:
            return m.group(1)
    try:
        href = page.locator('a[href*="/channel/UC"]').first.get_attribute('href', timeout=2000)
        if href:
            m = re.search(r'/channel/(UC[\w-]+)', href)
            if m:
                return m.group(1)
    except Exception:
        pass
    return None


def _is_on_customization_page(page):
    url = (page.url or '').lower()
    if '/editing/profile' in url or '/editing/branding' in url or '/editing/hometab' in url:
        return True
    for text in ('Channel customization', 'Настройка канала', 'Banner image', 'Баннер'):
        try:
            if page.get_by_text(text, exact=False).first.is_visible(timeout=800):
                return True
        except Exception:
            continue
    return False


def _is_branding_visible(page):
    try:
        if page.locator('ytcp-profile-editor, ytcp-banner-editor').first.is_visible(timeout=1000):
            return True
    except Exception:
        pass
    for text in ('Picture', 'Banner image', 'Profile picture', 'Баннер', 'Фото профиля'):
        try:
            if page.get_by_text(text, exact=False).first.is_visible(timeout=600):
                return True
        except Exception:
            continue
    return False


def ensure_branding_tab(page):
    if _is_branding_visible(page):
        random_delay(0.4, 0.6)
        return True

    if _click_first(page, [
        'tp-yt-paper-tab:has-text("Branding")',
        'tp-yt-paper-tab:has-text("Брендинг")',
        'ytcp-tab:has-text("Branding")',
        'ytcp-tab:has-text("Брендинг")',
        'a[href*="/editing/branding"]',
    ], timeout=5000):
        random_delay(1, 1.5)
        if _is_branding_visible(page):
            return True

    channel_id = _extract_channel_id(page)
    for target in filter(None, [
        f'{STUDIO_URL}/channel/{channel_id}/editing/branding' if channel_id else None,
        f'{STUDIO_URL}/channel/me/editing/branding',
    ]):
        try:
            page.goto(target, wait_until='domcontentloaded', timeout=60000)
            random_delay(1.5, 2)
            _prepare_studio_page(page)
            if _is_branding_visible(page):
                return True
        except Exception:
            continue

    try:
        page.wait_for_selector('ytcp-profile-editor, ytcp-banner-editor, input[type="file"]', timeout=8000)
        return True
    except Exception:
        return _is_branding_visible(page)


def ensure_profile_tab(page):
    url = (page.url or '').lower()
    if '/editing/profile' in url:
        return True
    return _click_first(page, [
        'tp-yt-paper-tab:has-text("Profile")',
        'tp-yt-paper-tab:has-text("Профиль")',
        'a[href*="/editing/profile"]',
    ], timeout=3000)


def _scroll_customization_down(page):
    try:
        page.locator('main#main, main').first.evaluate('el => { el.scrollTop += Math.max(el.clientHeight * 0.75, 450); }')
    except Exception:
        pass
    try:
        page.locator('ytcp-channel-editing-profile, ytcp-channel-editing').first.click(timeout=1000)
    except Exception:
        pass
    try:
        page.evaluate(SCROLL_PANEL_JS)
    except Exception:
        pass
    page.keyboard.press('PageDown')
    page.mouse.wheel(0, 900)
    random_delay(0.28, 0.38)


def _scroll_customization_top(page):
    try:
        page.locator('main#main, main').first.evaluate('el => { el.scrollTop = 0; }')
    except Exception:
        page.keyboard.press('Home')
    random_delay(0.3, 0.45)


def _deep_find_field(page, field_key):
    try:
        result = page.evaluate(DEEP_FIELD_JS, [field_key, '', 'find'])
        if result and result.get('ok'):
            aria = result.get('ariaLabel', '')
            if aria:
                progress('channel', None, f'найдено поле aria-label="{aria}"')
            return True
    except Exception:
        pass
    return False


def scroll_to_channel_field(page, field_id, stage='channel'):
    meta = FIELD_KEYS.get(field_id, {'key': field_id, 'label': field_id})
    field_key = meta['key']
    progress(stage, None, f'листаю к полю {meta["label"]}…')

    if field_key == 'name':
        _scroll_customization_top(page)

    if _deep_find_field(page, field_key):
        progress(stage, None, f'поле «{field_key}» найдено')
        return True

    for i in range(18):
        _scroll_customization_down(page)
        if _deep_find_field(page, field_key):
            progress(stage, None, f'поле «{field_key}» найдено (шаг {i + 1})')
            return True

    progress(stage, None, f'поле «{field_key}» не найдено после прокрутки')
    return False


def scroll_to_profile_text_fields(page, stage='channel'):
    return scroll_to_channel_field(page, 'channel-name', stage)


def _playwright_field_locators(page, field_id):
    meta = FIELD_KEYS.get(field_id, {})
    field_key = meta.get('key', field_id.replace('channel-', ''))

    if field_key == 'name':
        selectors = [
            'ytcp-form-input-container#channel-name input',
            'main ytcp-form-input-container:not(#business-email) input',
            'ytcp-form-input-container:not(#business-email) input',
        ]
        locs = [page.locator(sel).first for sel in selectors]
        locs.insert(0, page.locator('ytcp-form-input-container:not(#business-email) input').nth(0))
    else:
        selectors = [
            'ytcp-social-suggestions-textbox#description-textbox #textbox',
            '#description-textbox #textbox',
            '#textbox[aria-label*="Tell viewers about your channel" i]',
            'ytcp-form-input-container#channel-description #textbox',
        ]
        locs = [page.locator(sel).first for sel in selectors]
        role_pat = meta.get('role')
        if role_pat:
            locs.append(page.get_by_role('textbox', name=role_pat).first)
    return locs


def _read_textbox(loc):
    try:
        t = (loc.inner_text(timeout=1500) or '').strip()
        if t:
            return t
    except Exception:
        pass
    try:
        return (loc.input_value(timeout=1000) or '').strip()
    except Exception:
        pass
    try:
        return (loc.text_content(timeout=1000) or '').strip()
    except Exception:
        pass
    return ''


def _text_matches(expected, actual):
    if not actual:
        return False
    exp = expected.strip()
    act = actual.strip()
    return exp == act or exp in act or act in exp


def _clear_textbox(page, loc):
    """Always wipe field content before writing new value."""
    human = _human(page)
    human.human_click(loc)
    for _ in range(3):
        page.keyboard.press('Control+A')
        human.human_delay(0.05, 0.1)
        page.keyboard.press('Backspace')
        human.human_delay(0.05, 0.1)
    page.keyboard.press('Delete')
    human.human_delay(0.1, 0.15)


def _overwrite_textbox(page, loc, text):
    """Clear field completely, then type new text character-by-character (Truwas _safe_fill)."""
    human = _human(page)
    human.human_type(loc, text, clear=True, verify=True)
    return _read_textbox(loc)


def _deep_fill_field(page, field_key, text):
    try:
        result = page.evaluate(DEEP_FIELD_JS, [field_key, text, 'fill'])
        if result and result.get('ok'):
            if _text_matches(text, result.get('text', '')):
                return True
            progress('channel', None, f'JS fill aria="{result.get("ariaLabel", "")}" text="{result.get("text", "")[:40]}"')
    except Exception:
        pass
    return False


def _fill_channel_field(page, field_id, text, stage='channel'):
    if not text:
        return False

    meta = FIELD_KEYS.get(field_id, {'key': field_id.replace('channel-', ''), 'label': field_id})
    field_key = meta['key']
    progress(stage, None, f'перезаписываю поле {meta["label"]}…')

    scroll_to_channel_field(page, field_id, stage)

    if _deep_fill_field(page, field_key, text):
        return True

    for loc in _playwright_field_locators(page, field_id):
        try:
            if loc.count() == 0:
                continue
            scroll_to_channel_field(page, field_id, stage)
            actual = _overwrite_textbox(page, loc.first, text)
            if _text_matches(text, actual):
                return True
        except Exception:
            continue

    scroll_to_channel_field(page, field_id, stage)
    return _deep_fill_field(page, field_key, text)


def _scroll_studio_panel(page, direction='down', steps=4):
    delta = 1 if direction == 'down' else -1
    for _ in range(steps):
        try:
            page.evaluate(
                '''(d) => {
                  const all = Array.from(document.querySelectorAll('*'));
                  const scrollables = all.filter(el => el.scrollHeight > el.clientHeight + 8);
                  scrollables.sort((a,b) => (b.scrollHeight-b.clientHeight)-(a.scrollHeight-a.clientHeight));
                  for (const el of scrollables.slice(0, 4)) {
                    el.scrollTop += d * Math.max(el.clientHeight * 0.8, 450);
                  }
                }''',
                delta,
            )
        except Exception:
            page.mouse.wheel(0, 700 * delta)
        random_delay(0.25, 0.35)
    if direction == 'up':
        page.keyboard.press('Home')
    else:
        page.keyboard.press('End')
    random_delay(0.3, 0.5)


def _overwrite_locator(page, loc, text):
    """Public helper — always clear and rewrite."""
    actual = _overwrite_textbox(page, loc, text)
    return _text_matches(text, actual)


def _fill_locator(loc, page, text):
    return _overwrite_locator(page, loc, text)


def open_studio_customization(page):
    if _is_on_customization_page(page):
        ensure_profile_tab(page)
        try:
            page.wait_for_selector(
                'ytcp-channel-editing-profile, ytcp-channel-editing, ytcp-form-input-container',
                timeout=15000,
            )
        except Exception:
            pass
        random_delay(1, 1.5)
        return True

    channel_id = _extract_channel_id(page)
    if not channel_id:
        page.goto(STUDIO_URL, wait_until='domcontentloaded', timeout=60000)
        random_delay(2, 3)
        _prepare_studio_page(page)
        channel_id = _extract_channel_id(page)

    target = (
        f'{STUDIO_URL}/channel/{channel_id}/editing/profile'
        if channel_id
        else f'{STUDIO_URL}/channel/me/editing/profile'
    )
    page.goto(target, wait_until='domcontentloaded', timeout=60000)
    random_delay(2, 3)
    _prepare_studio_page(page)
    ensure_profile_tab(page)
    try:
        page.wait_for_selector(
            'ytcp-channel-editing-profile, ytcp-channel-editing, ytcp-form-input-container',
            timeout=20000,
        )
    except Exception:
        pass
    random_delay(1.5, 2.5)
    return _is_on_customization_page(page)


def save_customization(page):
    _scroll_studio_panel(page, 'up', steps=4)
    random_delay(0.4, 0.7)
    clicked = _click_first(page, [
        'ytcp-button#publish-button',
        'ytcp-button#save-button',
        'button#publish-button',
        'ytcp-button:has-text("Publish")',
        'ytcp-button:has-text("Опубликовать")',
        'ytcp-button:has-text("Save")',
        'ytcp-button:has-text("Сохранить")',
        'button:has-text("Publish")',
        'button:has-text("Опубликовать")',
    ], timeout=6000)
    if not clicked:
        return False
    random_delay(1.5, 2)
    return True


def set_channel_name(page, name):
    if not name:
        return False
    return _fill_channel_field(page, 'channel-name', name)


def set_channel_description(page, description):
    if not description:
        return False
    return _fill_channel_field(page, 'channel-description', description)


def _fill_by_label(page, text, labels):
    for label in labels:
        try:
            heading = page.get_by_text(label, exact=True).first
            if not heading.is_visible(timeout=1500):
                continue
            heading.scroll_into_view_if_needed(timeout=3000)
            box = heading.locator('xpath=ancestor::*[.//div[@id="textbox"]]//div[@id="textbox"]').first
            if box.count():
                _fill_locator(box, page, text)
                return True
        except Exception:
            continue
    return False


def _link_url_input_visible(page, timeout_ms=1500):
    selectors = [
        'ytcp-form-input-container.ytcpChannelLinkItemUrlContainer input',
        'ytcp-form-input-container.ytcpChannelLinkItemTitleContainer input',
        'input[aria-label*="URL" i]',
        'input[aria-label*="url" i]',
    ]
    for sel in selectors:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0 and loc.is_visible(timeout=timeout_ms):
                return True
        except Exception:
            continue
    try:
        loc = page.get_by_label(re.compile(r'url', re.I)).first
        return loc.is_visible(timeout=timeout_ms)
    except Exception:
        return False


def _click_add_link_button(page, timeout_ms=15000):
    selectors = [
        'ytcp-button.YtcpChannelLinksAddLinkButton button',
        'ytcp-button.YtcpChannelLinksAddLinkButton',
        'button:has-text("Add link")',
        'button:has-text("Добавить ссылку")',
        'ytcp-button:has-text("Add link")',
        'ytcp-button:has-text("Добавить ссылку")',
    ]
    deadline = timeout_ms / 1000.0
    import time
    start = time.time()
    while time.time() - start < deadline:
        for sel in selectors:
            try:
                loc = page.locator(sel).first
                if loc.count() == 0 or not loc.is_visible(timeout=800):
                    continue
                if _reliable_click(
                    page,
                    loc,
                    verify=lambda: _link_url_input_visible(page, timeout_ms=1200),
                    retries=2,
                ):
                    return True
            except Exception:
                continue
        random_delay(0.4, 0.7)
    return False


def set_profile_links(page, link_title, urls):
    if not urls:
        return False
    _click_first(page, [
        'tp-yt-paper-tab:has-text("Links")',
        'tp-yt-paper-tab:has-text("Ссылки")',
        'a[href*="editing/links"]',
    ], timeout=5000)
    random_delay(0.5, 1.0)

    url_list = [u.strip() for u in urls if u and str(u).strip()]
    if not url_list:
        return False

    added = 0
    for i, url in enumerate(url_list[:5]):
        title = link_title or f'Link {i + 1}'
        if not _click_add_link_button(page, timeout_ms=15000):
            continue
        random_delay(0.35, 0.65)
        if not _link_url_input_visible(page, timeout_ms=3000):
            continue

        try:
            title_loc = page.locator(
                'ytcp-form-input-container.ytcpChannelLinkItemTitleContainer input'
            ).first
            if title_loc.count() == 0:
                title_loc = page.get_by_label(re.compile(r'title|заголовок', re.I)).first
            url_loc = page.locator(
                'ytcp-form-input-container.ytcpChannelLinkItemUrlContainer input'
            ).first
            if url_loc.count() == 0:
                url_loc = page.get_by_label(re.compile(r'url', re.I)).first
            _overwrite_textbox(page, title_loc, title)
            _overwrite_textbox(page, url_loc, url)
        except Exception:
            continue

        if _click_first(page, [
            'ytcp-button:has-text("Add")',
            'ytcp-button:has-text("Добавить")',
            'button:has-text("Add")',
            'button:has-text("Добавить")',
        ], timeout=4000):
            added += 1
        random_delay(0.4, 0.7)
    return added > 0


GET_BEST_FILE_INPUT_JS = '''
(kind) => {
  const inputs = [];
  function walk(root) {
    if (!root || !root.querySelectorAll) return;
    for (const inp of root.querySelectorAll('input[type="file"]')) inputs.push(inp);
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  }
  walk(document);
  if (!inputs.length) return null;

  function score(inp) {
    let s = 0;
    let node = inp;
    for (let i = 0; i < 15 && node; i++) {
      const tag = (node.tagName || '').toLowerCase();
      const t = (node.textContent || '').slice(0, 250).toLowerCase();
      if (kind === 'banner') {
        if (tag.includes('banner')) s += 80;
        if (t.includes('banner')) s += 40;
        if (tag.includes('profile') || t.includes('picture')) s -= 60;
      } else {
        if (tag.includes('profile') || tag.includes('picture')) s += 80;
        if (t.includes('picture') || t.includes('profile picture')) s += 40;
        if (tag.includes('banner') || t.includes('banner image')) s -= 60;
      }
      node = node.parentElement;
    }
    return s;
  }

  inputs.sort((a, b) => score(b) - score(a));
  const best = kind === 'avatar' && inputs.length > 1 && score(inputs[0]) < 10
    ? inputs[inputs.length - 1]
    : inputs[0];
  best.scrollIntoView({ block: 'center', behavior: 'instant' });
  return best;
}
'''


def _set_files_via_shadow_input(page, file_path, kind):
    handle = None
    try:
        handle = page.evaluate_handle(GET_BEST_FILE_INPUT_JS, kind)
        elem = handle.as_element()
        if not elem:
            return False
        elem.set_input_files(file_path)
        return True
    except Exception:
        return False
    finally:
        if handle:
            try:
                handle.dispose()
            except Exception:
                pass


GET_VIDEO_UPLOAD_FILE_INPUT_JS = '''
() => {
  const inputs = [];
  function walk(root) {
    if (!root || !root.querySelectorAll) return;
    for (const inp of root.querySelectorAll('input[type="file"]')) inputs.push(inp);
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  }
  walk(document);
  if (!inputs.length) return null;

  function score(inp) {
    let s = 0;
    let node = inp;
    for (let i = 0; i < 20 && node; i++) {
      const tag = (node.tagName || '').toLowerCase();
      const id = (node.id || '').toLowerCase();
      if (tag.includes('upload')) s += 50;
      if (tag.includes('video')) s += 30;
      if (id.includes('upload') || id.includes('file')) s += 20;
      node = node.parentElement || node.host;
    }
    const accept = (inp.getAttribute('accept') || '').toLowerCase();
    if (accept.includes('video')) s += 40;
    if (inp.closest('ytcp-uploads-dialog, ytcp-video-upload-dialog, ytcp-uploads-file-picker, ytcp-file-upload')) {
      s += 120;
    }
    return s;
  }

  inputs.sort((a, b) => score(b) - score(a));
  const best = inputs[0];
  best.scrollIntoView({ block: 'center', behavior: 'instant' });
  return best;
}
'''

UPLOAD_PICKER_DETECT_JS = '''
() => {
  const url = location.href || '';
  const urlOk = /\\/videos\\/upload|youtube\\.com\\/upload/i.test(url);
  const bodyText = document.body?.innerText || '';
  const textHints = [
    'Drag and drop', 'Select files', 'Upload videos',
    'Перетащите', 'Выбрать файлы', 'Загрузить видео',
  ];
  const hasText = textHints.some((t) => bodyText.includes(t));
  let hasFileInput = false;
  function walk(root) {
    if (!root || !root.querySelectorAll) return;
    for (const inp of root.querySelectorAll('input[type="file"]')) {
      const accept = (inp.getAttribute('accept') || '').toLowerCase();
      if (!accept || accept.includes('video') || accept.includes('*')) {
        hasFileInput = true;
        return;
      }
    }
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  }
  walk(document);
  const hostTags = ['ytcp-uploads-dialog', 'ytcp-video-upload-dialog', 'ytcp-uploads-dialog-file-picker'];
  let hasHost = false;
  for (const tag of hostTags) {
    for (const el of document.querySelectorAll(tag)) {
      const r = el.getBoundingClientRect?.();
      if (r && r.width > 0 && r.height > 0) {
        hasHost = true;
        break;
      }
    }
    if (hasHost) break;
  }
  return {
    urlOk,
    hasText,
    hasFileInput,
    hasHost,
    ready: hasFileInput && (hasText || hasHost || urlOk),
  };
}
'''

_UPLOAD_URL_RE = re.compile(r'/videos/upload|youtube\.com/upload', re.I)


def _prepare_studio_page(page, rounds=2):
    """Cookie + чёрные подсказки / coach marks перед действием в Studio."""
    dismiss_consent(page)
    if _is_upload_dialog_visible(page):
        return dismiss_upload_popups(page, rounds=rounds)
    return dismiss_studio_overlays(page, rounds=rounds)


def _probe_upload_picker(page):
    try:
        return page.evaluate(UPLOAD_PICKER_DETECT_JS) or {}
    except Exception:
        return {}


def _locate_video_file_input(page):
    selectors = [
        'ytcp-uploads-dialog input[type="file"]',
        'ytcp-video-upload-dialog input[type="file"]',
        'ytcp-uploads-file-picker input[type="file"]',
        'ytcp-file-upload input[type="file"]',
        'ytcp-uploads-dialog-file-picker input[type="file"]',
        'input[type="file"][accept*="video"]',
        'input[type="file"]',
    ]
    for sel in selectors:
        try:
            inp = page.locator(sel).first
            if inp.count() > 0:
                return inp
        except Exception:
            continue
    return None


def _set_video_file_via_shadow_input(page, file_path):
    handle = None
    try:
        handle = page.evaluate_handle(GET_VIDEO_UPLOAD_FILE_INPUT_JS)
        elem = handle.as_element()
        if not elem:
            progress('upload', None, 'shadow: input[type=file] не найден')
            return False
        elem.set_input_files(file_path)
        return True
    except Exception as exc:
        progress('upload', None, f'shadow input: {exc}')
        return False
    finally:
        if handle:
            try:
                handle.dispose()
            except Exception:
                pass


def _set_video_file_via_chooser(page, file_path):
    """Клик «Select files» + перехват системного file chooser (надёжно в Studio)."""
    btn_selectors = [
        'ytcp-button#select-files-button',
        'ytcp-button:has-text("Select files")',
        'ytcp-button:has-text("Выбрать файлы")',
        'button:has-text("Select files")',
        'button:has-text("Выбрать файлы")',
        '#upload-icon',
    ]
    for sel in btn_selectors:
        try:
            btn = page.locator(sel).first
            if btn.count() == 0 or not btn.is_visible(timeout=1500):
                continue
            progress('upload', None, f'chooser: клик {sel}')
            with page.expect_file_chooser(timeout=20000) as fc_info:
                btn.click(timeout=8000)
            fc_info.value.set_files(file_path)
            progress('upload', None, f'файл через chooser: {os.path.basename(file_path)}')
            return True
        except Exception as exc:
            progress('upload', None, f'chooser ({sel}): {exc}')
            continue
    return False


def _set_video_file_via_locators(page, file_path):
    selectors = [
        'ytcp-uploads-dialog >> input[type="file"]',
        'ytcp-video-upload-dialog >> input[type="file"]',
        'ytcp-uploads-dialog-file-picker >> input[type="file"]',
        'ytcp-uploads-dialog input[type="file"]',
        'input[type="file"][accept*="video"]',
        'input[type="file"]',
    ]
    for sel in selectors:
        try:
            inp = page.locator(sel).first
            if inp.count() == 0:
                continue
            inp.set_input_files(file_path, timeout=60000)
            progress('upload', None, f'файл через {sel}')
            return True
        except Exception as exc:
            progress('upload', None, f'input {sel}: {exc}')
    return False


def _is_upload_dialog_visible(page):
    """Диалог загрузки: URL, текст или file input в shadow (input может быть скрыт)."""
    info = _probe_upload_picker(page)
    if info.get('ready'):
        return True

    url = page.url or ''
    if _UPLOAD_URL_RE.search(url) and info.get('hasFileInput'):
        return True

    for text in (
        'Drag and drop video files',
        'Drag and drop',
        'Select files',
        'Upload videos',
        'Перетащите видеофайлы',
        'Перетащите',
        'Выбрать файлы',
        'Загрузить видео',
    ):
        try:
            if page.get_by_text(text, exact=False).first.is_visible(timeout=600):
                return True
        except Exception:
            continue

    try:
        if page.get_by_role('heading', name=re.compile(r'upload\s*videos|загруз', re.I)).first.is_visible(timeout=600):
            return True
    except Exception:
        pass

    dialog_sels = (
        'ytcp-uploads-dialog',
        'ytcp-video-upload-dialog',
        'ytcp-uploads-dialog-file-picker',
    )
    for sel in dialog_sels:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0 and loc.is_visible(timeout=800):
                return True
        except Exception:
            continue
    return False


def _upload_dialog_ready(page):
    return _is_upload_dialog_visible(page)


def _wait_upload_dialog(page, timeout_ms=20000):
    step = 500
    attempts = max(1, timeout_ms // step)
    for i in range(attempts):
        if i % 4 == 0:
            _prepare_studio_page(page, rounds=1)
        if _is_upload_dialog_visible(page):
            return True
        try:
            page.wait_for_timeout(step)
        except Exception:
            break
    return _is_upload_dialog_visible(page)


def _click_studio_create_upload(page):
    create_selectors = [
        'ytcp-button#create-icon',
        '#create-icon',
        'ytcp-button[aria-label="Create"]',
        'ytcp-button[aria-label="Создать"]',
        'button[aria-label="Create"]',
        'button[aria-label="Создать"]',
    ]
    clicked = _click_first(page, create_selectors, timeout=8000)
    if not clicked:
        try:
            btn = page.get_by_role('button', name=re.compile(r'^(create|создать)$', re.I)).first
            if btn.is_visible(timeout=2000):
                btn.click(timeout=5000)
                clicked = True
        except Exception:
            pass

    if not clicked:
        progress('upload', None, 'кнопка Create не найдена')
        return False

    random_delay(0.6, 1.2)

    upload_selectors = [
        'tp-yt-paper-item[test-id="upload-beta"]',
        'tp-yt-paper-item:has-text("Upload videos")',
        'tp-yt-paper-item:has-text("Загрузить видео")',
        'ytcp-upload-video-button',
        'ytcp-text-menu a[href="/upload"]',
        'a[href="/upload"]',
        '#upload-item',
    ]
    if _click_first(page, upload_selectors, timeout=8000):
        return True

    try:
        item = page.get_by_role(
            'menuitem',
            name=re.compile(r'upload\s*videos?|загрузить\s*видео', re.I),
        ).first
        if item.is_visible(timeout=3000):
            item.click(timeout=5000)
            return True
    except Exception:
        pass

    progress('upload', None, 'пункт Upload videos не найден')
    return False


def _open_upload_dialog(page):
    _disable_beforeunload(page)
    if _upload_dialog_ready(page):
        progress('upload', None, 'диалог загрузки уже открыт')
        return True

    progress('upload', None, 'перехожу в YouTube Studio (страница Upload)…')

    channel_id = _extract_channel_id(page)
    targets = [UPLOAD_URL, f'{STUDIO_URL}/channel/me/videos/upload']
    if channel_id:
        targets.insert(1, f'{STUDIO_URL}/channel/{channel_id}/videos/upload')

    seen = set()
    for target in targets:
        if not target or target in seen:
            continue
        seen.add(target)
        try:
            page.goto(target, wait_until='domcontentloaded', timeout=120000)
            random_delay(2, 4)
            if 'studio.youtube.com' in (page.url or '').lower():
                _prepare_studio_page(page, rounds=2)
            else:
                dismiss_consent(page)
            if _wait_upload_dialog(page, 45000):
                progress('upload', None, f'Studio: {(page.url or "")[:100]}')
                return True
            progress('upload', None, f'диалог не появился после {target[:80]}')
        except Exception as exc:
            progress('upload', None, f'переход {target[:60]}: {exc}')

    progress('upload', None, 'Create → Upload videos')
    try:
        if 'studio.youtube.com' not in (page.url or '').lower():
            page.goto(STUDIO_URL, wait_until='domcontentloaded', timeout=90000)
            random_delay(2, 3)
            _prepare_studio_page(page, rounds=2)
        if _click_studio_create_upload(page) and _wait_upload_dialog(page, 25000):
            return True
    except Exception as exc:
        progress('upload', None, f'menu Create: {exc}')

    return False


def _wait_upload_processing(page, timeout_ms=45000):
    """После set_input_files — ждём прогресс загрузки или исчезновение экрана «Drag and drop»."""
    markers = (
        'Uploading',
        'Загрузка',
        'Processing',
        'Обработка',
        'Checks',
        'Проверка',
        'Details',
        'Сведения',
        'Video details',
        'Сведения о видео',
    )
    picker_texts = ('Drag and drop', 'Перетащите', 'Select files', 'Выбрать файлы')
    step = 800
    attempts = max(1, timeout_ms // step)
    for i in range(attempts):
        if i % 8 == 0 and i > 0:
            _prepare_studio_page(page, rounds=1)
        for text in markers:
            try:
                if page.get_by_text(text, exact=False).first.is_visible(timeout=400):
                    return True
            except Exception:
                continue
        try:
            if page.locator('ytcp-video-upload-progress, #progress-label, [role="progressbar"]').first.is_visible(timeout=400):
                return True
        except Exception:
            pass
        still_picker = False
        for text in picker_texts:
            try:
                if page.get_by_text(text, exact=False).first.is_visible(timeout=300):
                    still_picker = True
                    break
            except Exception:
                continue
        if not still_picker:
            return True
        try:
            page.wait_for_timeout(step)
        except Exception:
            break
    return False


def _set_video_file(page, video_path):
    video_path = os.path.abspath(os.path.normpath(video_path))
    if not video_path or not os.path.isfile(video_path):
        raise RuntimeError(f'Файл не найден: {video_path}')

    if not _upload_dialog_ready(page):
        progress('upload', None, 'диалог не готов — открываю загрузку')
        if not _open_upload_dialog(page):
            raise RuntimeError('Не удалось открыть диалог загрузки YouTube')

    progress('upload', None, f'назначаю файл: {os.path.basename(video_path)}')
    dismiss_studio_overlays(page, rounds=1)

    def try_assign_file():
        if _set_video_file_via_shadow_input(page, video_path):
            return True
        if _set_video_file_via_locators(page, video_path):
            return True
        if _set_video_file_via_chooser(page, video_path):
            return True
        return False

    if try_assign_file():
        progress('upload', None, 'жду начала загрузки на сервер…')
        if _wait_upload_processing(page, 60000):
            return True
        progress('upload', None, 'файл отправлен, экран picker сменился')

    progress('upload', None, 'повтор: Select files → chooser')
    _prepare_studio_page(page, rounds=1)
    if _set_video_file_via_chooser(page, video_path) and _wait_upload_processing(page, 60000):
        return True

    if try_assign_file() and _wait_upload_processing(page, 60000):
        return True

    info = _probe_upload_picker(page)
    progress('upload', None, f'не удалось выбрать файл, picker={info}')
    return False


def _find_upload_button(page, kind):
    btn_labels = re.compile(r'^(Upload|Загрузить|Change|Изменить)$', re.I)
    try:
        btns = page.get_by_role('button', name=btn_labels)
        count = btns.count()
        if count == 0:
            return None
        idx = 0 if kind == 'banner' else min(1, count - 1)
        btn = btns.nth(idx)
        if btn.is_visible(timeout=2000):
            return btn
    except Exception:
        pass

    section_text = 'Banner image' if kind == 'banner' else 'Picture'
    try:
        section = page.get_by_text(section_text, exact=False).first
        section.scroll_into_view_if_needed(timeout=3000)
        btn = section.locator('xpath=ancestor::*[.//button][1]').get_by_role(
            'button', name=btn_labels
        ).first
        if btn.is_visible(timeout=2000):
            return btn
    except Exception:
        pass
    return None


def _scroll_to_branding_section(page, kind):
    labels = (
        ['Banner image', 'Channel banner', 'Баннер', 'Баннер канала']
        if kind == 'banner'
        else ['Picture', 'Profile picture', 'Фото профиля', 'Your profile picture']
    )
    for label in labels:
        try:
            loc = page.get_by_text(label, exact=False).first
            if loc.is_visible(timeout=1500):
                loc.scroll_into_view_if_needed(timeout=4000)
                random_delay(0.3, 0.5)
                return True
        except Exception:
            continue
    return False


def _locate_branding_file_input(page, kind):
    if kind == 'banner':
        selectors = [
            'ytcp-banner-editor input[type="file"]',
            'ytcp-banner-picker input[type="file"]',
            'ytcp-banner-editor-dialog input[type="file"]',
        ]
    else:
        selectors = [
            'ytcp-profile-editor input[type="file"]',
            'ytcp-profile-image-picker input[type="file"]',
            'ytcp-profile-editor-dialog input[type="file"]',
            'ytcp-profile-image-picker-dialog input[type="file"]',
            'ytcp-image-selector input[type="file"]',
        ]

    for sel in selectors:
        try:
            inp = page.locator(sel).first
            if inp.count() > 0:
                return inp
        except Exception:
            continue
    return None


def _confirm_image_upload(page, kind='avatar'):
    random_delay(0.8, 1.2)
    if kind == 'banner':
        done_selectors = [
            'ytcp-banner-editor ytcp-button#done-button',
            'ytcp-banner-editor-dialog ytcp-button#done-button',
            'ytcp-banner-editor ytcp-button:has-text("Done")',
            'ytcp-banner-editor ytcp-button:has-text("Готово")',
        ]
    else:
        done_selectors = [
            'ytcp-profile-image-picker ytcp-button#done-button',
            'ytcp-profile-editor ytcp-button#done-button',
            'ytcp-profile-editor-dialog ytcp-button#done-button',
            'ytcp-profile-image-picker ytcp-button:has-text("Done")',
            'ytcp-profile-image-picker ytcp-button:has-text("Готово")',
        ]
    done_selectors.extend([
        'ytcp-button#done-button',
        'ytcp-img-with-fallback-dialog ytcp-button:has-text("Done")',
        'button:has-text("Done")',
        'button:has-text("Готово")',
        'button:has-text("Apply")',
        'button:has-text("Применить")',
    ])
    if _click_first(page, done_selectors, timeout=8000):
        random_delay(0.5, 0.8)
    return True


def _set_files_on_input(page, locator, file_path, kind='avatar'):
    locator.set_input_files(file_path, timeout=10000)
    label = 'баннер' if kind == 'banner' else 'аватар'
    progress('channel', None, f'{label}: файл передан — {os.path.basename(file_path)}')
    random_delay(1, 1.5)
    return _confirm_image_upload(page, kind)


def upload_image_file(page, file_path, kind='avatar'):
    if not file_path or not os.path.isfile(file_path):
        progress('channel', None, f'файл не найден: {file_path}')
        return False

    label = 'баннер' if kind == 'banner' else 'аватар'
    if not ensure_branding_tab(page):
        progress('channel', None, f'{label}: не удалось открыть вкладку Branding')
        return False

    progress('channel', None, f'{label}: вкладка Branding — {page.url}')
    _scroll_to_branding_section(page, kind)
    _scroll_studio_panel(page, 'up', steps=2)
    random_delay(0.5, 0.8)
    try:
        page.keyboard.press('Escape')
        random_delay(0.15, 0.25)
    except Exception:
        pass

    inp = _locate_branding_file_input(page, kind)
    if inp is not None:
        try:
            inp.scroll_into_view_if_needed(timeout=4000)
            return _set_files_on_input(page, inp, file_path, kind)
        except Exception:
            pass

    if _set_files_via_shadow_input(page, file_path, kind):
        progress('channel', None, f'{label}: файл передан (shadow) — {os.path.basename(file_path)}')
        random_delay(1, 1.5)
        return _confirm_image_upload(page, kind)

    upload_btn = _find_upload_button(page, kind)
    if upload_btn:
        try:
            upload_btn.scroll_into_view_if_needed(timeout=3000)
            with page.expect_file_chooser(timeout=12000) as fc_info:
                upload_btn.click(timeout=5000)
            fc_info.value.set_files(file_path)
            progress('channel', None, f'{label}: файл выбран — {os.path.basename(file_path)}')
            random_delay(1, 1.5)
            return _confirm_image_upload(page, kind)
        except Exception as exc:
            progress('channel', None, f'{label}: chooser не сработал: {exc}')
            try:
                if _set_files_via_shadow_input(page, file_path, kind):
                    progress('channel', None, f'{label}: файл передан после клика — {os.path.basename(file_path)}')
                    random_delay(1, 1.5)
                    return _confirm_image_upload(page, kind)
            except Exception:
                pass

    progress('channel', None, f'{label}: не найден input для загрузки (url={page.url})')
    return False


def mini_feed_warmup(page, seconds=30):
    try:
        from common.verification import check_captcha, check_logged_in
        human = _human(page)
        human.goto('https://www.youtube.com', wait_until='domcontentloaded', timeout=60000)
        check_captcha(page)
        check_logged_in(page)
        human.goto('https://www.youtube.com/shorts', wait_until='domcontentloaded', timeout=60000)
        dismiss_consent(page)
        human.watch_for(seconds)
        if random.random() < 0.7:
            human.smooth_scroll('down')
        else:
            scroll_next_short(page)
    except Exception:
        pass


def _set_made_for_kids(page, for_kids=False):
    """Answer required audience question. Default: second option — not for kids."""
    label_patterns = (
        [
            re.compile(r'yes.*made for kids', re.I),
            re.compile(r'да.*(?:дет|детск)', re.I),
        ]
        if for_kids
        else [
            re.compile(r'no.*not made for kids', re.I),
            re.compile(r"not made for kids", re.I),
            re.compile(r'нет.*не.*(?:дет|детск)', re.I),
            re.compile(r'не для детей', re.I),
        ]
    )
    selectors = (
        [
            'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_MFK"]',
            'tp-yt-paper-radio-button[name="MFK"]',
            '#made-for-kids-radio',
            '#onRadio',
        ]
        if for_kids
        else [
            'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
            'tp-yt-paper-radio-button[name="NOT_MFK"]',
            '#not-made-for-kids-radio',
            '#offRadio',
        ]
    )

    for pattern in label_patterns:
        try:
            radio = page.get_by_role('radio', name=pattern).first
            if radio.is_visible(timeout=2000):
                radio.scroll_into_view_if_needed(timeout=3000)
                _reliable_click(page, radio)
                random_delay(0.3, 0.5)
                progress('upload', None, 'аудитория: не для детей' if not for_kids else 'аудитория: для детей')
                return True
        except Exception:
            pass
        try:
            loc = page.get_by_text(pattern).first
            if loc.is_visible(timeout=1500):
                loc.scroll_into_view_if_needed(timeout=3000)
                _reliable_click(page, loc)
                random_delay(0.3, 0.5)
                progress('upload', None, 'аудитория: не для детей' if not for_kids else 'аудитория: для детей')
                return True
        except Exception:
            continue

    for sel in selectors:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0 and loc.is_visible(timeout=1500):
                loc.scroll_into_view_if_needed(timeout=3000)
                _reliable_click(page, loc)
                random_delay(0.3, 0.5)
                progress('upload', None, 'аудитория: не для детей' if not for_kids else 'аудитория: для детей')
                return True
        except Exception:
            continue

    if not for_kids and _click_audience_second_radio(page):
        return True

    return False


SELECT_AUDIENCE_SECOND_RADIO_JS = '''
() => {
  function walk(root, visit) {
    if (!root) return;
    visit(root);
    for (const el of root.querySelectorAll?.('*') || []) {
      if (el.shadowRoot) walk(el.shadowRoot, visit);
    }
  }

  function collectRadios(root, out) {
    for (const r of root.querySelectorAll('tp-yt-paper-radio-button, [role="radio"]')) {
      out.push(r);
    }
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) collectRadios(el.shadowRoot, out);
    }
  }

  const audiences = [];
  walk(document, (root) => {
    for (const a of root.querySelectorAll('ytcp-audience, #audience')) audiences.push(a);
  });

  for (const sec of audiences) {
    const radios = [];
    collectRadios(sec, radios);
    if (radios.length >= 2) {
      radios[1].click();
      return true;
    }
  }

  const all = [];
  walk(document, (root) => collectRadios(root, all));
  const kidsRadios = all.filter((r) => {
    const t = (r.textContent || r.getAttribute('aria-label') || '').toLowerCase();
    return t.includes('kid') || t.includes('дет') || t.includes('children');
  });
  if (kidsRadios.length >= 2) {
    kidsRadios[1].click();
    return true;
  }
  return false;
}
'''


def _click_audience_second_radio(page):
    try:
        if page.evaluate(SELECT_AUDIENCE_SECOND_RADIO_JS):
            random_delay(0.3, 0.5)
            progress('upload', None, 'аудитория: выбран 2-й пункт')
            return True
    except Exception:
        pass
    return False


def _set_video_visibility(page, visibility='public'):
    labels = {
        'public': [
            'Public', 'Открытый доступ', 'Открытый', 'Public access',
        ],
        'unlisted': [
            'Unlisted', 'Доступ по ссылке', 'Не в списке', 'Unlisted access',
        ],
        'private': [
            'Private', 'Доступ только для меня', 'Частный', 'Private access',
        ],
    }
    vis = visibility if visibility in labels else 'public'

    for text in labels[vis]:
        try:
            radio = page.get_by_role('radio', name=re.compile(re.escape(text), re.I)).first
            if radio.is_visible(timeout=1500):
                radio.scroll_into_view_if_needed(timeout=3000)
                _reliable_click(page, radio)
                random_delay(0.3, 0.5)
                progress('upload', None, f'видимость: {vis}')
                return True
        except Exception:
            pass
        try:
            loc = page.get_by_text(text, exact=False).first
            if loc.is_visible(timeout=1500):
                loc.scroll_into_view_if_needed(timeout=3000)
                _reliable_click(page, loc)
                random_delay(0.3, 0.5)
                progress('upload', None, f'видимость: {vis}')
                return True
        except Exception:
            continue

    for sel in (
        f'ytcp-video-visibility-select [value="{vis}"]',
        f'ytcp-video-visibility-select [value="{vis.upper()}"]',
        f'#privacy-{vis}',
        f'[name="privacy"][value="{vis}"]',
    ):
        try:
            loc = page.locator(sel).first
            if loc.count() > 0 and loc.is_visible(timeout=1500):
                loc.scroll_into_view_if_needed(timeout=3000)
                _reliable_click(page, loc)
                random_delay(0.3, 0.5)
                progress('upload', None, f'видимость: {vis}')
                return True
        except Exception:
            continue
    return False


def upload_video(page, video_path, title, description='', visibility='public', tags=None, config=None):
    cfg = config if isinstance(config, dict) else {}
    keep_on_stuck = cfg.get('uploadKeepBrowserOnStuck', True)

    if not _open_upload_dialog(page):
        raise RuntimeError('Не удалось открыть YouTube Studio / диалог Upload')

    progress('upload', None, f'выбираю файл: {os.path.basename(video_path)}')
    if not _set_video_file(page, video_path):
        raise RuntimeError('Не удалось выбрать файл видео')

    if _check_daily_upload_limit(page):
        raise RuntimeError('Достигнут дневной лимит загрузки YouTube')

    if not _wait_server_upload_and_processing(page):
        progress('upload', None, 'таймаут обработки — продолжаю мастер')

    progress('upload', None, 'файл принят, прохожу мастер загрузки…')
    published = _advance_upload_wizard(
        page, title, description, visibility, tags=tags or [], config=cfg,
    )

    if published and _publish_still_required(page):
        progress('upload', None, 'мастер прошёл, но «Опубликовать» ещё нужно — жму снова')
        published = _click_upload_publish(
            page,
            timeout_ms=120000,
            manual_assist=cfg.get('uploadManualAssist', True),
            manual_wait_ms=int(cfg.get('uploadManualWaitMs') or 0),
        )

    if _is_publish_success_state(page):
        _close_success_dialog(page)
        published = True

    really_published = bool(published) and not _publish_still_required(page)
    if not really_published and _is_publish_success_state(page):
        really_published = True

    out = {
        'published': really_published,
        'url': '',
        'videoId': '',
        'keepBrowserOpen': False,
        'needsManualAssist': False,
    }
    url, vid = _wait_for_publish_link(page, timeout_ms=8000)
    if not vid:
        url, vid = _get_uploaded_video_link(page, title, timeout_ms=15000)
    out['url'] = url
    out['videoId'] = vid

    if not really_published and vid and not _is_upload_dialog_visible(page):
        really_published = True
        out['published'] = True
        progress('upload', None, f'видео на канале — считаю опубликованным → {url}')

    if really_published:
        if url:
            progress('upload', None, f'опубликовано → {url}')
        else:
            progress('upload', None, 'опубликовано, ссылку не считали')
    else:
        out['needsManualAssist'] = True
        if keep_on_stuck:
            out['keepBrowserOpen'] = True
        if vid:
            progress(
                'upload',
                None,
                f'ссылка есть ({url}), но «Опубликовать» не нажато — браузер остаётся открытым',
            )
        else:
            progress(
                'upload',
                None,
                'не опубликовано — нажмите «Опубликовать» в Studio (браузер не закроется)',
            )
    return out
