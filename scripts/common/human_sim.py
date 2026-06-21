#!/usr/bin/env python3
"""Human behavior simulation for Playwright (Truwas workers/human_sim.py parity)."""
import math
import random
import time

_PUNCT = set('.,!?;:@#')

_VERIFY_TYPED_JS = '''
(el, val) => {
    if (!el) return;
    if (!el.isContentEditable) {
        if (el.value !== val) el.value = val;
        el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    } else {
        const actual = (el.innerText || el.textContent || '').trim();
        if (actual !== val.trim()) {
            el.focus();
            const range = document.createRange();
            range.selectNodeContents(el);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            document.execCommand("insertText", false, val);
        }
    }
    el.blur();
}
'''


class HumanSimulator:
    """Virtual mouse/keyboard via CDP — does not move the real desktop cursor."""

    def __init__(self, page):
        self.page = page
        self._last_mouse_x = random.randint(120, 900)
        self._last_mouse_y = random.randint(80, 600)

    def human_delay(self, lo=None, hi=None, base=0.35, variance=0.32, min_delay=None, max_delay=None):
        """Log-normal delay — mostly short pauses, occasional longer ones."""
        if lo is not None and hi is not None:
            base = (lo + hi) / 2.0
            min_delay = lo
            max_delay = hi * 1.2
        min_delay = min_delay if min_delay is not None else 0.08
        max_delay = max_delay if max_delay is not None else 1.6
        mu = math.log(max(base, 0.01))
        delay = random.lognormvariate(mu, variance)
        time.sleep(max(min_delay, min(max_delay, delay)))

    def move_mouse_to(self, x, y, steps=None):
        """Move mouse along a natural quadratic Bezier curve."""
        steps = steps or random.randint(8, 18)
        sx, sy = self._last_mouse_x, self._last_mouse_y
        cx = (sx + x) / 2 + random.uniform(-45, 45)
        cy = (sy + y) / 2 + random.uniform(-35, 35)
        for i in range(1, steps + 1):
            t = i / steps
            bx = (1 - t) ** 2 * sx + 2 * (1 - t) * t * cx + t ** 2 * x
            by = (1 - t) ** 2 * sy + 2 * (1 - t) * t * cy + t ** 2 * y
            self.page.mouse.move(bx, by)
            time.sleep(random.uniform(0.006, 0.018))
        self._last_mouse_x = x
        self._last_mouse_y = y

    def _mouse_jiggle(self):
        try:
            vp = self.page.viewport_size or {'width': 1280, 'height': 720}
            x = random.randint(int(vp['width'] * 0.28), int(vp['width'] * 0.72))
            y = random.randint(int(vp['height'] * 0.22), int(vp['height'] * 0.78))
            for _ in range(random.randint(2, 5)):
                self.move_mouse_to(
                    x + random.randint(-18, 18),
                    y + random.randint(-14, 14),
                    steps=random.randint(2, 5),
                )
                time.sleep(random.uniform(0.03, 0.09))
        except Exception:
            pass

    def random_micro_action(self):
        choice = random.choices(
            ('mouse_jiggle', 'tiny_scroll', 'pause'),
            weights=(0.45, 0.3, 0.25),
            k=1,
        )[0]
        if choice == 'mouse_jiggle':
            self._mouse_jiggle()
        elif choice == 'tiny_scroll':
            self.smooth_scroll(
                random.choice(('down', 'up')),
                amount=random.randint(50, 200),
            )
        else:
            self.human_delay(0.18, 0.55)

    def idle_mouse_movement(self, duration_sec=2.0, stop_event=None):
        end = time.time() + max(0.0, float(duration_sec))
        while time.time() < end:
            if stop_event is not None and getattr(stop_event, 'is_set', lambda: False)():
                break
            try:
                vp = self.page.viewport_size or {'width': 1280, 'height': 720}
                self.move_mouse_to(
                    random.randint(int(vp['width'] * 0.15), int(vp['width'] * 0.85)),
                    random.randint(int(vp['height'] * 0.15), int(vp['height'] * 0.85)),
                )
            except Exception:
                pass
            time.sleep(random.uniform(0.25, 0.85))

    def _resolve_click_point(self, locator, move_to=True):
        """Return (x, y) inside the element, or None if unknown."""
        try:
            box = locator.bounding_box()
            if box and move_to and box.get('width') and box.get('height'):
                x = box['x'] + box['width'] * random.uniform(0.28, 0.72)
                y = box['y'] + box['height'] * random.uniform(0.28, 0.72)
                return x, y
        except Exception:
            pass
        return None

    def _click_at_point(self, x, y):
        """Click exactly where the virtual mouse was moved (CDP coordinates)."""
        self.page.mouse.move(x, y)
        time.sleep(random.uniform(0.02, 0.06))
        self.page.mouse.down()
        time.sleep(random.uniform(0.03, 0.09))
        self.page.mouse.up()

    def human_click(self, locator, timeout=3000, move_to=True, force=False):
        try:
            locator.scroll_into_view_if_needed(timeout=timeout)
        except Exception:
            pass
        self.human_delay(0.1, 0.35)

        click_x, click_y = None, None
        try:
            click_x, click_y = self._resolve_click_point(locator, move_to=move_to)
            if click_x is not None and click_y is not None:
                self.move_mouse_to(click_x, click_y)
                time.sleep(random.uniform(0.04, 0.14))
        except Exception:
            click_x, click_y = None, None

        if force:
            if click_x is not None and click_y is not None:
                try:
                    self._click_at_point(click_x, click_y)
                except Exception:
                    locator.click(timeout=timeout, force=True)
            else:
                locator.click(timeout=timeout, force=True)
            self.human_delay(0.15, 0.5)
            return

        targets = [locator]
        try:
            inner = locator.locator('button, a, #button').first
            if inner.count() > 0:
                targets.insert(0, inner)
        except Exception:
            pass

        last_err = None
        for target in targets:
            tx, ty = click_x, click_y
            if target is not locator:
                try:
                    pt = self._resolve_click_point(target, move_to=move_to)
                    if pt[0] is not None:
                        tx, ty = pt
                        self.move_mouse_to(tx, ty)
                        time.sleep(random.uniform(0.04, 0.12))
                except Exception:
                    tx, ty = click_x, click_y

            if tx is not None and ty is not None:
                try:
                    self._click_at_point(tx, ty)
                    self.human_delay(0.15, 0.5)
                    return
                except Exception as exc:
                    last_err = exc

            try:
                target.click(timeout=timeout)
                self.human_delay(0.15, 0.5)
                return
            except Exception as exc:
                last_err = exc

        if last_err:
            raise last_err
        self.human_delay(0.15, 0.5)

    def smooth_scroll(self, direction='down', amount=None):
        total = amount if amount is not None else random.randint(380, 920)
        sign = -1 if direction == 'up' else 1
        steps = random.randint(3, 7)
        chunk = max(40, total // steps)
        try:
            for _ in range(steps):
                self.page.mouse.wheel(0, sign * chunk)
                time.sleep(random.uniform(0.05, 0.14))
            time.sleep(random.uniform(0.15, 0.45))
            return True
        except Exception:
            return False

    def scroll_to_element(self, locator):
        try:
            locator.scroll_into_view_if_needed(timeout=4000)
            self.human_delay(0.12, 0.32)
            return True
        except Exception:
            return False

    def goto(self, url, wait_until='domcontentloaded', timeout=90000, referer=None):
        kwargs = {'wait_until': wait_until, 'timeout': timeout}
        if referer:
            kwargs['referer'] = referer
        self.page.goto(url, **kwargs)
        self.human_delay(0.45, 1.35)
        return self.page

    def _char_delay(self, ch, prev_ch, base_delay_ms=55):
        base = base_delay_ms / 1000.0
        if ch in _PUNCT:
            return random.uniform(base * 2.0, base * 4.5)
        if ch == ' ':
            return random.uniform(base * 1.2, base * 2.8)
        if prev_ch in (' ', '\n', None):
            return random.uniform(base * 1.0, base * 2.5)
        return random.uniform(base * 0.45, base * 1.4)

    def human_type(self, locator, text, *, clear=True, verify=True, base_delay_ms=55):
        """Type text character-by-character with variable speed."""
        text = '' if text is None else str(text)

        self.scroll_to_element(locator)
        self.human_click(locator)

        if clear:
            for _ in range(2):
                self.page.keyboard.press('Control+A')
                self.human_delay(0.04, 0.1)
            self.page.keyboard.press('Backspace')
            self.human_delay(0.05, 0.12)
            self.page.keyboard.press('Delete')
            self.human_delay(0.05, 0.12)

        prev = None
        for ch in text:
            time.sleep(self._char_delay(ch, prev, base_delay_ms))
            self.page.keyboard.insert_text(ch)
            prev = ch

        if verify:
            try:
                locator.evaluate(_VERIFY_TYPED_JS, text)
            except Exception:
                pass

        self.human_delay(0.12, 0.32)

    def watch_for(self, seconds):
        end = time.time() + max(0, float(seconds))
        while time.time() < end:
            chunk = min(random.uniform(0.7, 2.4), end - time.time())
            if chunk <= 0:
                break
            time.sleep(chunk)
            if random.random() < 0.24:
                self.idle_mouse_movement(duration_sec=random.uniform(0.4, 1.2))
            elif random.random() < 0.14:
                self.random_micro_action()
