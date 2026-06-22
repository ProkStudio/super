#!/usr/bin/env python3

"""Shared Playwright CDP session runner for Nexus automation scripts."""

import os

import random

import threading

from concurrent.futures import ThreadPoolExecutor, as_completed



from common.utils import progress, result, random_delay





def get_sessions(config):

    sessions = config.get('sessions') or []

    profile_ids = config.get('profileIds') or []

    if not sessions and profile_ids:

        sessions = [{'profileId': pid, 'cdpUrl': config.get('cdpUrl', '')} for pid in profile_ids]

    return [s for s in sessions if s.get('cdpUrl')]





def clamp_threads(value, maximum=20):

    try:

        n = int(value)

    except (TypeError, ValueError):

        n = 1

    return max(1, min(maximum, n))





def connect_page(playwright, cdp_url, prefer_domains=None, bring_to_front=False):

    browser = playwright.chromium.connect_over_cdp(cdp_url)

    context = browser.contexts[0] if browser.contexts else browser.new_context()

    page = None

    prefer = [str(d).lower() for d in (prefer_domains or []) if d]

    prefer_tiktok = any('tiktok.com' in d for d in prefer)

    if prefer:

        for domain in prefer:

            for ctx in browser.contexts or [context]:

                for p in ctx.pages:

                    if domain in (p.url or '').lower():

                        page = p

                        break

                if page:

                    break

            if page:

                break

    if not page:

        for ctx in browser.contexts or [context]:

            if ctx.pages:

                page = ctx.pages[0]

                break

    if not page and not prefer_tiktok:

        for ctx in browser.contexts or [context]:

            for p in ctx.pages:

                url = (p.url or '').lower()

                if 'youtube.com' in url or 'google.com' in url:

                    page = p

                    break

            if page:

                break

    if not page:

        page = context.pages[0] if context.pages else context.new_page()

    if bring_to_front:

        try:

            page.bring_to_front()

        except Exception:

            pass

    return browser, page





def list_media_files(folder, extensions, recursive=False, max_depth=2):

    if not folder or not os.path.isdir(folder):

        return []

    ext_set = {e.lower() if e.startswith('.') else f'.{e.lower()}' for e in extensions}

    files = []



    def walk(current, depth):

        try:

            names = sorted(os.listdir(current))

        except OSError:

            return

        for name in names:

            path = os.path.join(current, name)

            try:

                if os.path.isfile(path):

                    if any(name.lower().endswith(ext) for ext in ext_set):

                        files.append(path)

                elif recursive and depth > 0 and os.path.isdir(path):

                    walk(path, depth - 1)

            except OSError:

                continue



    walk(folder, max_depth if recursive else 0)

    return files





_progress_lock = threading.Lock()





def _safe_progress(stage, percent, message=''):

    with _progress_lock:

        progress(stage, percent, message)





def _run_one_session(session, handler, stage, index, total, config):

    from playwright.sync_api import sync_playwright



    pid = session.get('profileId', f'profile-{index}')

    label = session.get('login') or pid

    cdp = session['cdpUrl']

    prefer_domains = config.get('pagePreferDomains') or config.get('page_prefer_domains')

    prefer_tiktok = any(
        'tiktok.com' in str(d).lower()
        for d in (prefer_domains or [])
    )

    _safe_progress(stage, int((index / max(total, 1)) * 100), f'{label}: подключение')

    try:

        with sync_playwright() as playwright:

            browser, page = connect_page(
                playwright,
                cdp,
                prefer_domains=prefer_domains,
                bring_to_front=not prefer_tiktok,
            )

            stat = handler(page, label, session, index, total, config)

            stat = stat or {}

            stat.setdefault('profileId', pid)

            stat.setdefault('login', session.get('login'))

            return stat

    except Exception as e:

        _safe_progress(stage, int(((index + 1) / max(total, 1)) * 100), f'{label}: ошибка — {e}')

        return {'profileId': pid, 'login': session.get('login'), 'error': str(e)}





def run_playwright_sessions(config, stage, handler, simulate_message='Симуляция (нет CDP)'):

    sessions = get_sessions(config)

    profile_ids = config.get('profileIds') or []

    threads = clamp_threads(config.get('threads', 1))



    if not sessions:

        progress(stage, 100, simulate_message)

        random_delay(1, 2)

        result({'ok': True, 'simulated': True, 'profiles': len(profile_ids)})

        return



    try:

        from playwright.sync_api import sync_playwright  # noqa: F401

    except ImportError:

        progress(stage, 100, 'Playwright не установлен')

        result({'ok': False, 'error': 'playwright not installed'})

        return



    total = len(sessions)

    workers = min(threads, total)

    stats = [None] * total

    completed = 0

    completed_lock = threading.Lock()



    def run_indexed(index, session):

        nonlocal completed

        stat = _run_one_session(session, handler, stage, index, total, config)

        with completed_lock:

            completed += 1

            pct = int((completed / total) * 100)

        _safe_progress(stage, pct, f'Готово {completed}/{total}')

        return index, stat



    with ThreadPoolExecutor(max_workers=workers) as executor:

        futures = [executor.submit(run_indexed, i, session) for i, session in enumerate(sessions)]

        for future in as_completed(futures):

            try:

                index, stat = future.result()

            except Exception as exc:

                progress(stage, None, f'Поток упал: {exc}')

                continue

            stats[index] = stat



    stats = [s for s in stats if s is not None]

    has_errors = any(s.get('error') for s in stats)

    progress(stage, 100, 'Готово')

    result({'ok': not has_errors, 'sessions': stats, 'profiles': total, 'errors': has_errors})

