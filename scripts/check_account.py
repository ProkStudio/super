#!/usr/bin/env python3

"""Check Google/YouTube account state via MostLogin CDP session."""

import sys

import os



sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common.utils import load_config, progress, result, random_delay

from common.session_runner import get_sessions, connect_page

from common.account_status import inspect_account_page





def check_session(page, label, session, index, total, config):

    email = session.get('login') or session.get('email') or label

    progress('check_account', int((index / max(total, 1)) * 40), f'{email}: открываю YouTube Studio')



    page.goto('https://studio.youtube.com/', wait_until='domcontentloaded', timeout=90000)

    try:

        page.wait_for_load_state('networkidle', timeout=15000)

    except Exception:

        pass

    random_delay(2, 4)

    status, message = inspect_account_page(page)



    if status in ('logged_out', 'unknown', 'no_channel'):

        progress('check_account', int((index / max(total, 1)) * 50 + 20), f'{email}: доп. проверка YouTube')

        page.goto('https://www.youtube.com/', wait_until='domcontentloaded', timeout=90000)

        try:

            page.wait_for_load_state('networkidle', timeout=12000)

        except Exception:

            pass

        random_delay(2, 3)

        status2, message2 = inspect_account_page(page)

        if status == 'no_channel' and status2 == 'active':

            status, message = status2, message2

        elif status2 not in ('unknown',) and status in ('logged_out', 'unknown'):

            status, message = status2, message2



    if status in ('logged_out', 'unknown'):

        progress('check_account', int((index / max(total, 1)) * 50 + 35), f'{email}: проверка Google Account')

        page.goto('https://myaccount.google.com/', wait_until='domcontentloaded', timeout=90000)

        random_delay(2, 3)

        status3, message3 = inspect_account_page(page)

        if status3 not in ('unknown',):

            status, message = status3, message3



    progress('check_account', int(((index + 1) / max(total, 1)) * 100), f'{email}: {message}')

    return {

        'accountId': session.get('accountId'),

        'profileId': session.get('profileId'),

        'login': email,

        'status': status,

        'message': message,

    }





def main():

    config = load_config()

    sessions = get_sessions(config)

    accounts = config.get('accounts') or []



    if not sessions and accounts:

        progress('check_account', 100, 'Нет профилей MostLogin для проверки')

        result({

            'ok': True,

            'results': [

                {

                    'accountId': a.get('id'),

                    'login': a.get('login'),

                    'status': 'no_profile',

                    'message': 'Привяжите профиль MostLogin на странице Профили',

                }

                for a in accounts

            ],

        })

        return



    if not sessions:

        progress('check_account', 100, 'Нет сессий для проверки')

        result({'ok': False, 'error': 'no sessions'})

        return



    try:

        from playwright.sync_api import sync_playwright

    except ImportError:

        result({'ok': False, 'error': 'playwright not installed'})

        return



    stats = []

    total = len(sessions)



    with sync_playwright() as playwright:

        for i, session in enumerate(sessions):

            label = session.get('login') or session.get('profileId', f'profile-{i}')

            try:

                browser, page = connect_page(playwright, session['cdpUrl'])

                stat = check_session(page, label, session, i, total, config)

                stats.append(stat)

            except Exception as e:

                stats.append({

                    'accountId': session.get('accountId'),

                    'profileId': session.get('profileId'),

                    'login': label,

                    'status': 'error',

                    'message': str(e)[:200],

                })



    result({'ok': True, 'results': stats})





if __name__ == '__main__':

    main()

