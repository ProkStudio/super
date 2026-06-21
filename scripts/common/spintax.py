#!/usr/bin/env python3
"""Spintax parser: {вариант1|вариант2|вариант3}"""
import re
import random

SPINTAX_RE = re.compile(r'\{([^{}]+)\}')


def spin(text):
    if not text:
        return text
    result = str(text)
    for _ in range(20):
        match = SPINTAX_RE.search(result)
        if not match:
            break
        options = [o.strip() for o in match.group(1).split('|') if o.strip()]
        pick = random.choice(options) if options else ''
        result = result[:match.start()] + pick + result[match.end():]
    return result


def pick_from_list(items, index=0):
    if not items:
        return ''
    return spin(items[index % len(items)])
