#!/usr/bin/env python3
"""Common utilities for Nexus Toolkit automation scripts."""
import json
import sys
import random
import time
import io


def _ensure_utf8_stdio():
    for stream_name in ('stdout', 'stderr'):
        stream = getattr(sys, stream_name, None)
        if stream is None:
            continue
        try:
            if hasattr(stream, 'reconfigure'):
                stream.reconfigure(encoding='utf-8', errors='replace')
            elif hasattr(stream, 'buffer'):
                wrapper = io.TextIOWrapper(stream.buffer, encoding='utf-8', errors='replace', line_buffering=True)
                setattr(sys, stream_name, wrapper)
        except Exception:
            pass


_ensure_utf8_stdio()


def load_config():
    for i, arg in enumerate(sys.argv):
        if arg == '--config' and i + 1 < len(sys.argv):
            with open(sys.argv[i + 1], 'r', encoding='utf-8') as f:
                return json.load(f)
    return {}


def progress(stage, percent, message=''):
    print(f'PROGRESS:{json.dumps({"stage": stage, "percent": percent, "message": message}, ensure_ascii=False)}', flush=True)


def result(data):
    print(f'RESULT:{json.dumps(data, ensure_ascii=False)}', flush=True)


def emit_upload_session(data):
    """Сразу отправить результат одной загрузки в Electron (блок «Результаты»)."""
    print(f'UPLOAD_SESSION:{json.dumps(data, ensure_ascii=False)}', flush=True)


def random_delay(min_s=1.0, max_s=3.0):
    time.sleep(random.uniform(min_s, max_s))
