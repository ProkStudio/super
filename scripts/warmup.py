#!/usr/bin/env python3
"""
YouTube Shorts warmup — Truwas WarmupWorker._run_warmup parity.
1) youtube.com → captcha/login check
2) youtube.com/shorts → human watch loop
"""
import sys
import os
import random
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common.utils import progress
from common.session_runner import run_playwright_sessions
from common.human_sim import HumanSimulator
from common.verification import (
    check_captcha,
    check_logged_in,
    check_account_safe,
    CaptchaDetected,
    AccountNotLoggedIn,
    AccountBanned,
)


def _try_like_truwas(page, human):
    selectors = [
        '#like-button button',
        'like-button-view-model button',
        'ytd-toggle-button-renderer#like-button button',
    ]
    for sel in selectors:
        try:
            btn = page.locator(sel).first
            if btn.count() > 0 and btn.is_visible(timeout=1200):
                if btn.get_attribute('aria-pressed') == 'true':
                    return False
                human.human_click(btn)
                return True
        except Exception:
            continue
    return False


def _try_subscribe_truwas(page, human):
    selectors = [
        '#subscribe-button button',
        'ytd-reel-channel-bar-renderer #subscribe-button button',
    ]
    for sel in selectors:
        try:
            btn = page.locator(sel).first
            if btn.count() > 0 and btn.is_visible(timeout=1200):
                label = (btn.get_attribute('aria-label') or '').lower()
                if 'subscribed' in label or 'подписан' in label:
                    return False
                human.human_click(btn)
                return True
        except Exception:
            continue
    return False


def _nav_next_short(page, human):
    if random.random() < 0.65:
        human.smooth_scroll('down')
    else:
        try:
            page.keyboard.press('ArrowDown')
            human.human_delay(0.25, 0.55)
        except Exception:
            human.smooth_scroll('down')


def run_session(page, label, session, index, total, config):
    duration_min = int(config.get('durationMin', 5))
    duration_max = int(config.get('durationMax', 15))
    watch_min = int(config.get('watchMin', 15))
    watch_max = int(config.get('watchMax', 45))
    likes_enabled = config.get('likesEnabled', True)
    subs_enabled = config.get('subsEnabled', False)
    like_prob = (int(config.get('likeProbability', 30)) / 100) if likes_enabled else 0
    sub_prob = (int(config.get('subProbability', 15)) / 100) if subs_enabled else 0

    if duration_min > duration_max:
        duration_min, duration_max = duration_max, duration_min
    if watch_min > watch_max:
        watch_min, watch_max = watch_max, watch_min

    session_seconds = random.randint(duration_min * 60, duration_max * 60)
    base_pct = int((index / max(total, 1)) * 100)
    human = HumanSimulator(page)

    progress('warmup', base_pct, f'{label}: открываю YouTube')
    try:
        human.goto('https://www.youtube.com', wait_until='domcontentloaded', timeout=90000)
        human.random_micro_action()
        check_captcha(page)
        check_logged_in(page)
        check_account_safe(page)
    except CaptchaDetected as e:
        raise RuntimeError(f'{label}: {e} — пройдите проверку вручную') from e
    except AccountNotLoggedIn as e:
        raise RuntimeError(f'{label}: {e}') from e
    except AccountBanned as e:
        raise RuntimeError(f'{label}: {e}') from e

    progress('warmup', base_pct + 1, f'{label}: Shorts')
    human.goto('https://www.youtube.com/shorts', wait_until='domcontentloaded', timeout=90000)
    human.random_micro_action()
    check_captcha(page)

    start = time.time()
    end_time = start + session_seconds
    videos = likes = subs = 0

    while time.time() < end_time:
        elapsed = time.time() - start
        pct = base_pct + int((elapsed / session_seconds) * (100 / max(total, 1)))
        watch_sec = random.randint(watch_min, watch_max)
        progress('warmup', min(pct, 99), f'{label}: Short #{videos + 1} (~{watch_sec}с)')

        human.watch_for(watch_sec)
        videos += 1

        if like_prob > 0 and random.random() < like_prob and _try_like_truwas(page, human):
            likes += 1

        if sub_prob > 0 and random.random() < sub_prob and _try_subscribe_truwas(page, human):
            subs += 1

        try:
            check_captcha(page)
        except CaptchaDetected as e:
            raise RuntimeError(f'{label}: {e} — остановлено') from e

        _nav_next_short(page, human)
        human.random_micro_action()

    progress(
        'warmup',
        min(base_pct + int(100 / max(total, 1)), 100),
        f'{label}: {videos} видео, {likes} лайков, {subs} подписок',
    )
    return {'videos': videos, 'likes': likes, 'subs': subs, 'seconds': int(time.time() - start)}


def main():
    from common.utils import load_config
    config = load_config()
    run_playwright_sessions(config, 'warmup', run_session, 'Симуляция прогрева (нет CDP)')


if __name__ == '__main__':
    main()
