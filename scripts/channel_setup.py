#!/usr/bin/env python3
"""YouTube channel setup — name, description, avatar, banner, profile links."""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common.utils import progress, random_delay
from common.human_sim import HumanSimulator
from common.spintax import pick_from_list
from common.session_runner import run_playwright_sessions, list_media_files
from common.verification import check_captcha, check_logged_in, check_account_safe, CaptchaDetected, AccountNotLoggedIn, AccountBanned
from common.youtube_studio import (
    open_studio_customization,
    set_channel_name,
    set_channel_description,
    set_profile_links,
    upload_image_file,
    save_customization,
    ensure_profile_tab,
)
from common.channel_create import create_channel_if_needed
from common.image_uniquize import uniqualize_image


IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.jfif', '.heic', '.heif']


def resolve_media_files(config, folder_key, files_key):
    explicit = [f for f in (config.get(files_key) or []) if f and os.path.isfile(f)]
    if explicit:
        return explicit
    return list_media_files(config.get(folder_key, ''), IMAGE_EXTENSIONS, recursive=True)


def run_session(page, label, session, index, total, config):
    base_pct = int((index / max(total, 1)) * 100)
    step = max(1, int(100 / max(total, 1)))
    errors = []
    applied = {}

    names = config.get('channelNames') or []
    descriptions = config.get('channelDescriptions') or []
    link_urls = config.get('linkUrls') or []
    link_title = config.get('linkTitle', '')

    name = pick_from_list(names, index) if config.get('namesEnabled') else ''
    description = pick_from_list(descriptions, index) if config.get('descriptionsEnabled') else ''

    avatar_files = resolve_media_files(config, 'avatarFolder', 'avatarFiles')
    banner_files = resolve_media_files(config, 'bannerFolder', 'bannerFiles')

    progress('channel', base_pct, f'{label}: проверка аккаунта')
    human = HumanSimulator(page)
    try:
        human.goto('https://www.youtube.com', wait_until='domcontentloaded', timeout=90000)
        human.random_micro_action()
        check_captcha(page)
        check_logged_in(page)
        check_account_safe(page)
    except (CaptchaDetected, AccountNotLoggedIn, AccountBanned) as e:
        raise RuntimeError(f'{label}: {e}') from e

    progress('channel', base_pct, f'{label}: открываю настройку канала')

    if config.get('createChannelEnabled'):
        progress('channel', base_pct + 1, f'{label}: проверка / создание канала')
        create_channel_if_needed(page)

    if not open_studio_customization(page):
        raise RuntimeError('Не удалось открыть настройку канала — войдите в Google и откройте YouTube Studio')

    ensure_profile_tab(page)
    progress('channel', base_pct + 2, f'{label}: страница кастомизации открыта')

    # Имя и описание — сразу, с прокруткой вниз (они ниже баннера)
    if name:
        progress('channel', base_pct + step // 3, f'{label}: перезаписываю название — {name[:40]}')
        if set_channel_name(page, name):
            applied['name'] = name
            progress('channel', base_pct + step // 2, f'{label}: название записано')
        else:
            errors.append('не удалось изменить название канала (поле Name / aria-label)')

    if description:
        progress('channel', base_pct + int(step * 0.55), f'{label}: перезаписываю описание')
        if set_channel_description(page, description):
            applied['description'] = description[:80]
            progress('channel', base_pct + int(step * 0.65), f'{label}: описание записано')
        else:
            errors.append('не удалось изменить описание канала (поле Description / aria-label)')

    if config.get('avatarsEnabled') and avatar_files:
        avatar = avatar_files[index % len(avatar_files)]
        upload_path = avatar
        temp_avatar = None
        if config.get('uniqualizeImages'):
            temp_avatar = uniqualize_image(avatar, config)
            upload_path = temp_avatar
        progress('channel', base_pct + int(step * 0.68), f'{label}: загрузка аватара — {os.path.basename(avatar)}')
        if upload_image_file(page, upload_path, 'avatar'):
            applied['avatar'] = os.path.basename(avatar)
        else:
            errors.append('не удалось загрузить аватар')
        if temp_avatar and temp_avatar != avatar and os.path.isfile(temp_avatar):
            try:
                os.remove(temp_avatar)
            except OSError:
                pass
    elif config.get('avatarsEnabled'):
        errors.append('нет файлов аватара в указанной папке')

    if config.get('bannersEnabled') and banner_files:
        banner = banner_files[index % len(banner_files)]
        upload_path = banner
        temp_banner = None
        if config.get('uniqualizeImages'):
            temp_banner = uniqualize_image(banner, config)
            upload_path = temp_banner
        progress('channel', base_pct + int(step * 0.75), f'{label}: загрузка баннера — {os.path.basename(banner)}')
        if upload_image_file(page, upload_path, 'banner'):
            applied['banner'] = os.path.basename(banner)
        else:
            errors.append('не удалось загрузить баннер')
        if temp_banner and temp_banner != banner and os.path.isfile(temp_banner):
            try:
                os.remove(temp_banner)
            except OSError:
                pass
    elif config.get('bannersEnabled'):
        errors.append('нет файлов баннера в указанной папке')

    if config.get('profileLinkEnabled') and link_urls:
        progress('channel', base_pct + int(step * 0.85), f'{label}: ссылки профиля')
        links_added = set_profile_links(page, link_title, link_urls)
        if links_added:
            applied['links'] = len([u for u in link_urls if str(u).strip()])
        else:
            errors.append('не удалось добавить ссылки профиля')

    if not applied and not errors:
        errors.append('ничего не настроено — включите блоки и заполните данные')

    progress('channel', base_pct + int(step * 0.95), f'{label}: сохранение (Publish)')
    if applied and not save_customization(page):
        errors.append('не удалось нажать «Сохранить» / «Опубликовать»')

    if errors and not applied:
        raise RuntimeError('; '.join(errors))

    progress('channel', min(base_pct + step, 99), f'{label}: настройка сохранена')
    random_delay(1, 2)

    return {
        'name': applied.get('name', ''),
        'description': applied.get('description', ''),
        'links': applied.get('links', 0),
        'avatar': applied.get('avatar', ''),
        'banner': applied.get('banner', ''),
        'warnings': errors,
    }


def main():
    from common.utils import load_config
    config = load_config()
    run_playwright_sessions(config, 'channel', run_session, 'Симуляция настройки канала (нет CDP)')


if __name__ == '__main__':
    main()
