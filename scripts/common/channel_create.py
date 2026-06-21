"""Create YouTube channel when account has none."""
import re

from common.human_sim import HumanSimulator
from common.utils import random_delay


CREATE_PATTERNS = re.compile(
    r'create a channel|create channel|get started|создать канал|создайте канал|начать',
    re.I,
)


def create_channel_if_needed(page):
    """Try to create a channel from YouTube home / channel switcher. Returns True if clicked."""
    human = HumanSimulator(page)
    urls = [
        'https://www.youtube.com/channel_switcher',
        'https://www.youtube.com',
    ]
    for url in urls:
        try:
            human.goto(url, wait_until='domcontentloaded', timeout=90000)
            human.random_micro_action()
            random_delay(1.5, 3)
        except Exception:
            continue

        selectors = [
            'ytd-button-renderer a[href*="channel"]',
            'tp-yt-paper-button',
            'button',
            'a',
        ]
        for sel in selectors:
            try:
                loc = page.locator(sel)
                count = min(loc.count(), 40)
                for i in range(count):
                    el = loc.nth(i)
                    if not el.is_visible(timeout=500):
                        continue
                    text = (el.inner_text(timeout=500) or '').strip()
                    if text and CREATE_PATTERNS.search(text):
                        human.human_click(el)
                        random_delay(1.5, 3)
                        confirm = page.get_by_role('button', name=CREATE_PATTERNS).first
                        if confirm.is_visible(timeout=3000):
                            human.human_click(confirm)
                            random_delay(1.5, 2.5)
                        name_input = page.locator(
                            '#channel-name-input input, ytd-channel-creation-dialog input[type="text"], '
                            'tp-yt-paper-dialog input[type="text"], #input-0, #text-input'
                        ).first
                        if name_input.is_visible(timeout=5000):
                            return True
                        return True
            except Exception:
                continue

        try:
            btn = page.get_by_role('button', name=CREATE_PATTERNS).first
            if btn.is_visible(timeout=2000):
                human.human_click(btn)
                random_delay(1.5, 3)
                return True
        except Exception:
            pass

        try:
            link = page.get_by_role('link', name=CREATE_PATTERNS).first
            if link.is_visible(timeout=2000):
                human.human_click(link)
                random_delay(1.5, 3)
                return True
        except Exception:
            pass

    return False
