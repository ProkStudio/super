#!/usr/bin/env python3
"""Dump YouTube Studio customization DOM (shadow DOM) for selector debugging."""
import json
import os
import sys
import time
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common.utils import load_config, progress, result, random_delay
from common.session_runner import get_sessions, connect_page

DUMP_JS = '''
() => {
  const out = { url: location.href, title: document.title, fields: [], textboxes: [], scrollables: [], labels: [] };

  function walk(root, path) {
    if (!root || !root.querySelectorAll) return;

    for (const box of root.querySelectorAll('#textbox, [contenteditable="true"], textarea, input[type="text"]')) {
      const aria = box.getAttribute('aria-label') || '';
      if (!aria && !box.id) continue;
      out.textboxes.push({
        path,
        tag: box.tagName,
        id: box.id || null,
        ariaLabel: aria || null,
        inProfile: !!box.closest('ytcp-channel-editing-profile'),
        inName: !!box.closest('#channel-name'),
        inDesc: !!box.closest('#channel-description'),
        textPreview: (box.textContent || box.value || '').trim().slice(0, 80),
        visible: !!(box.offsetWidth || box.offsetHeight),
      });
    }

    for (const el of root.querySelectorAll('ytcp-form-input-container, ytcp-social-suggestions-textbox, ytcp-social-suggestion-input')) {
      const labelEl = el.querySelector('#label, [id="label"], .label');
      const box = el.querySelector('#textbox, [contenteditable="true"], textarea, input');
      out.fields.push({
        path,
        tag: el.tagName,
        id: el.id || null,
        label: (labelEl?.textContent || '').trim().slice(0, 120),
        ariaLabel: el.getAttribute('aria-label'),
        hasTextbox: Boolean(box),
        textboxTag: box?.tagName || null,
        textboxAria: box?.getAttribute('aria-label') || null,
        textPreview: (box?.textContent || box?.value || '').trim().slice(0, 80),
        visible: !!(el.offsetWidth || el.offsetHeight),
      });
    }

    for (const el of root.querySelectorAll('*')) {
      if (el.id === 'channel-name' || el.id === 'channel-description') {
        out.labels.push({ id: el.id, tag: el.tagName, path, html: el.outerHTML.slice(0, 300) });
      }
      try {
        const st = getComputedStyle(el);
        if (el.scrollHeight > el.clientHeight + 20 && /auto|scroll|overlay/.test(st.overflowY)) {
          out.scrollables.push({
            tag: el.tagName,
            id: el.id || null,
            className: (el.className || '').toString().slice(0, 80),
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
            scrollTop: el.scrollTop,
          });
        }
      } catch (e) {}
      if (el.shadowRoot) walk(el.shadowRoot, path + ' >> shadow');
    }
  }

  walk(document, 'document');
  out.scrollables.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
  out.scrollables = out.scrollables.slice(0, 15);
  out.textboxes.sort((a, b) => (b.inProfile - a.inProfile) || (b.visible - a.visible));
  return out;
}
'''

SCROLL_AND_DUMP_JS = '''
() => {
  function walk(root) {
    for (const el of root.querySelectorAll('*')) {
      try {
        const st = getComputedStyle(el);
        if (el.scrollHeight > el.clientHeight + 8 && /auto|scroll|overlay/.test(st.overflowY)) {
          el.scrollTop += Math.max(el.clientHeight * 0.8, 500);
        }
      } catch (e) {}
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  }
  walk(document);
  return true;
}
'''


def _save_payload(out_path, payload):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def main():
    config = load_config()
    sessions = get_sessions(config)
    wait_sec = int(config.get('waitSeconds') or 90)
    out_dir = os.path.abspath(config.get('outputDir') or os.path.join(os.path.dirname(__file__), '..', 'debug'))
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, 'studio-dom-debug.json')
    shot_path = os.path.join(out_dir, 'studio-dom-debug.png')

    payload = {
        'profileId': None,
        'login': None,
        'finalUrl': '',
        'dumps': [],
        'screenshot': None,
        'error': None,
    }

    if not sessions:
        payload['error'] = 'Нет CDP-сессии. Запустите из приложения с выбранным профилем.'
        _save_payload(out_path, payload)
        result({'ok': False, 'error': payload['error'], 'path': out_path})
        return

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        payload['error'] = 'playwright not installed'
        _save_payload(out_path, payload)
        result({'ok': False, 'error': payload['error'], 'path': out_path})
        return

    session = sessions[0]
    label = session.get('login') or session.get('profileId', 'profile')
    payload['profileId'] = session.get('profileId')
    payload['login'] = label

    try:
        with sync_playwright() as pw:
            browser, page = connect_page(pw, session['cdpUrl'])
            progress('debug', 5, f'{label}: подключено — {page.url}')

            target = config.get('targetUrl')
            if target:
                try:
                    page.goto(target, wait_until='domcontentloaded', timeout=60000)
                    random_delay(2, 3)
                except Exception as e:
                    payload['error'] = f'goto failed: {e}'

            progress('debug', 10, f'{label}: войдите в Google и откройте настройку канала (editing/profile)')
            progress('debug', 10, f'Ожидание {wait_sec} сек…')

            deadline = time.time() + wait_sec
            last_url = ''
            dumps = []
            while time.time() < deadline:
                url = page.url or ''
                if url != last_url:
                    progress('debug', 15, f'URL: {url}')
                    last_url = url
                if '/editing/profile' in url.lower():
                    progress('debug', 20, 'Страница editing/profile обнаружена')
                    break
                time.sleep(2)

            random_delay(1, 2)

            for step in range(6):
                progress('debug', 25 + step * 10, f'Снимок DOM (прокрутка {step + 1}/6)…')
                try:
                    data = page.evaluate(DUMP_JS)
                    data['scrollStep'] = step
                    dumps.append(data)
                except Exception as e:
                    dumps.append({'error': str(e), 'scrollStep': step})
                try:
                    page.evaluate(SCROLL_AND_DUMP_JS)
                except Exception:
                    pass
                page.keyboard.press('PageDown')
                page.mouse.wheel(0, 900)
                random_delay(0.8, 1.2)

            payload['dumps'] = dumps
            payload['finalUrl'] = page.url

            try:
                page.screenshot(path=shot_path, full_page=False)
                payload['screenshot'] = shot_path
            except Exception:
                shot_path = None

            progress('debug', 100, f'Сохранено: {out_path}')
            _save_payload(out_path, payload)
            result({
                'ok': True,
                'path': out_path,
                'screenshot': shot_path,
                'fields': len(dumps[-1].get('fields', [])) if dumps else 0,
                'textboxes': len(dumps[-1].get('textboxes', [])) if dumps else 0,
            })
    except Exception as e:
        payload['error'] = traceback.format_exc()
        _save_payload(out_path, payload)
        progress('debug', 100, f'Ошибка, частично сохранено: {out_path}')
        result({'ok': False, 'error': str(e), 'path': out_path})


if __name__ == '__main__':
    main()
