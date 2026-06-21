#!/usr/bin/env python3
"""YouTube video upload via Studio — один профиль за запуск, без потоков."""
import sys
import os
import random
import re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common.utils import progress, random_delay, emit_upload_session
from common.spintax import pick_from_list
from common.session_runner import run_playwright_sessions, list_media_files
from common.youtube_studio import mini_feed_warmup, upload_video
from common.human_sim import HumanSimulator
from common.verification import check_captcha, check_logged_in, check_account_safe, CaptchaDetected, AccountNotLoggedIn, AccountBanned


VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.flv', '.wmv', '.m4v']


def parse_tags(raw):
    if isinstance(raw, str):
        return [t.strip() for t in re.split(r'[,;\n]', raw) if t.strip()]
    if isinstance(raw, list):
        return [str(t).strip() for t in raw if t and str(t).strip()]
    return []


def build_title_with_hashtags(title, tags):
    hash_parts = []
    for tag in parse_tags(tags):
        clean = re.sub(r'^#+\s*', '', tag.strip())
        if clean:
            hash_parts.append(f'#{clean}')
    if not hash_parts:
        return title.strip()
    return f'{title.strip()} {" ".join(hash_parts)}'.strip()


def resolve_video_files(config):
    explicit = [f for f in (config.get('videoFiles') or []) if f and os.path.isfile(f)]
    if explicit:
        return explicit
    return list_media_files(config.get('videoFolder', ''), VIDEO_EXTENSIONS, recursive=True)


def session_slot(index, total, config):
    """Индекс аккаунта в общей очереди (Node передаёт uploadIndex при поочерёдной загрузке)."""
    if config.get('uploadIndex') is not None:
        return int(config['uploadIndex']), int(config.get('uploadTotal') or total or 1)
    return index, total


def pick_random_tags(all_tags, config):
    if not all_tags:
        return []
    if not config.get('tagsEnabled'):
        return all_tags
    lo = max(1, int(config.get('tagsMin') or 3))
    hi = max(lo, int(config.get('tagsMax') or lo))
    hi = min(hi, len(all_tags))
    lo = min(lo, hi)
    count = random.randint(lo, hi)
    return random.sample(all_tags, count)


def remove_published_video(video_path, label, config):
    """Truwas start_upload: os.remove(video_path) after successful publish."""
    if config.get('uploadDeleteAfterPublish') is False:
        return False
    if not video_path or not os.path.isfile(video_path):
        return False
    try:
        os.remove(video_path)
        progress(
            'upload',
            None,
            f'{label}: видео опубликовано и удалено из папки — {os.path.basename(video_path)}',
        )
        return True
    except OSError as exc:
        progress('upload', None, f'{label}: не удалось удалить файл — {exc}')
        return False


def run_session(page, label, session, index, total, config):
    slot, slot_total = session_slot(index, total, config)
    base_pct = int((slot / max(slot_total, 1)) * 100)
    step = max(1, int(100 / max(slot_total, 1)))

    videos = resolve_video_files(config)
    if not videos:
        raise RuntimeError('Нет видео: укажите папку или выберите файлы')

    titles_raw = config.get('videoTitles') or []
    if isinstance(titles_raw, str):
        titles = [t.strip() for t in titles_raw.split('\n') if t.strip()]
    else:
        titles = [str(t).strip() for t in titles_raw if str(t).strip()]
    tags = parse_tags(config.get('videoTags') or [])
    tags = pick_random_tags(tags, config)

    video_path = videos[slot % len(videos)]
    base_name = os.path.basename(video_path)
    base_title = pick_from_list(titles, slot) if titles else os.path.splitext(base_name)[0]
    title = build_title_with_hashtags(base_title, tags)
    description = pick_from_list(config.get('videoDescriptions') or [], slot) if config.get('descriptionsEnabled') else ''

    progress('upload', base_pct, f'{label}: проверка аккаунта')
    human = HumanSimulator(page)
    try:
        human.goto('https://www.youtube.com', wait_until='domcontentloaded', timeout=90000)
        human.random_micro_action()
        check_captcha(page)
        check_logged_in(page)
        check_account_safe(page)
    except (CaptchaDetected, AccountNotLoggedIn, AccountBanned) as e:
        raise RuntimeError(f'{label}: {e}') from e

    progress('upload', base_pct, f'{label}: видео → {base_name}')

    warmup_sec = random.randint(20, 45) if config.get('uploadWarmupEnabled') else 0
    if warmup_sec:
        progress('upload', base_pct, f'{label}: прогрев Shorts ({warmup_sec}с) — ещё не загрузка')
        mini_feed_warmup(page, warmup_sec)
        progress('upload', base_pct, f'{label}: прогрев завершён, перехожу в Studio')

    progress('upload', base_pct + step // 5, f'{label}: открываю Studio и выбираю файл…')

    try:
        upload_result = upload_video(
            page,
            video_path,
            title,
            description=description,
            visibility='public',
            tags=tags,
            config=config,
        )
    except Exception as exc:
        progress('upload', min(base_pct + step, 99), f'{label}: ошибка — {exc}')
        return {
            'profileId': session.get('profileId'),
            'login': label,
            'error': str(exc),
            'published': False,
            'video': base_name,
            'title': title,
        }

    keep_browser_open = False
    needs_manual = False
    if isinstance(upload_result, dict):
        ok = bool(upload_result.get('published'))
        video_url = upload_result.get('url') or ''
        video_id = upload_result.get('videoId') or ''
        keep_browser_open = bool(upload_result.get('keepBrowserOpen'))
        needs_manual = bool(upload_result.get('needsManualAssist'))
    else:
        ok = bool(upload_result)
        video_url = ''
        video_id = ''

    if ok and not video_id:
        from common.youtube_studio import _get_uploaded_video_link
        video_url, video_id = _get_uploaded_video_link(page, title, timeout_ms=20000)

    payload = {
        'video': base_name,
        'title': title,
        'published': ok,
        'url': video_url,
        'videoId': video_id,
        'profileId': session.get('profileId'),
        'login': label,
        'keepBrowserOpen': keep_browser_open or needs_manual,
        'needsManualAssist': needs_manual,
    }

    if ok and not payload.get('needsManualAssist'):
        emit_upload_session(payload)
        payload['videoRemoved'] = remove_published_video(video_path, label, config)
        if video_url:
            progress('upload', min(base_pct + step, 99), f'{label}: опубликовано → {video_url}')
        else:
            progress('upload', min(base_pct + step, 99), f'{label}: опубликовано (ссылку не считали)')

    if warmup_sec and ok:
        progress('upload', base_pct + int(step * 0.85), f'{label}: прогрев после загрузки')
        mini_feed_warmup(page, random.randint(15, 30))

    progress('upload', min(base_pct + step, 99), f'{label}: «{title[:50]}» — {"OK" if ok else "не опубликовано"}')
    return payload


def main():
    from common.utils import load_config
    config = load_config()
    config['threads'] = 1
    run_playwright_sessions(config, 'upload', run_session, 'Симуляция загрузки видео')


if __name__ == '__main__':
    main()
