"""TikTok — генерация текста комментария/ответа (пул + spintax + OpenRouter)."""
from __future__ import annotations

import json
import random
import re
import urllib.error
import urllib.request

_SPINTAX_RE = re.compile(r"\{([^{}]*)\}")


def expand_spintax(text: str, max_iter: int = 12) -> str:
    s = text or ""
    for _ in range(max_iter):
        m = _SPINTAX_RE.search(s)
        if not m:
            break
        options = m.group(1).split("|")
        choice = random.choice(options) if options else ""
        s = s[: m.start()] + choice + s[m.end():]
    return s.strip()


def _pool_lines(cfg) -> list[str]:
    pool = cfg.get("commentPool") or cfg.get("comment_pool") or []
    if isinstance(pool, str):
        return [ln.strip() for ln in pool.splitlines() if ln.strip()]
    return [str(x).strip() for x in pool if str(x).strip()]


def _pick_from_pool(cfg, state: dict | None = None) -> str:
    lines = _pool_lines(cfg)
    if not lines:
        return ""
    mode = (cfg.get("commentPoolMode") or cfg.get("comment_pool_mode") or "random").lower()
    state = state or {}

    if mode == "sequential":
        idx = int(state.get("poolIndex", 0))
        line = lines[idx % len(lines)]
        state["poolIndex"] = idx + 1
        return expand_spintax(line)

    if mode == "weighted":
        expanded = []
        for ln in lines:
            if "|" in ln and ln.rsplit("|", 1)[-1].strip().isdigit():
                text, weight = ln.rsplit("|", 1)
                expanded.extend([text.strip()] * max(1, int(weight.strip())))
            else:
                expanded.append(ln)
        return expand_spintax(random.choice(expanded or lines))

    # random + spintax mode
    return expand_spintax(random.choice(lines))


def _ai_rewrite(parent_text: str, caption: str, template: str, cfg: dict) -> str | None:
    api_key = (cfg.get("aiApiKey") or cfg.get("ai_api_key") or "").strip()
    if not api_key or not cfg.get("useAi"):
        return None

    base_url = (cfg.get("aiBaseUrl") or "https://openrouter.ai/api/v1").rstrip("/")
    model = cfg.get("aiModel") or cfg.get("ai_model") or "openai/gpt-4o-mini"

    system = (
        "Ты живой пользователь TikTok. Напиши ОДИН короткий ответ на чужой комментарий. "
        "Только русский язык, до 150 символов, естественно, без кавычек и рекламы."
    )
    user = (
        f"Комментарий: {parent_text[:300] or '(пусто)'}\n"
        f"Описание видео: {caption[:300] or '(нет)'}\n"
        f"Стиль/шаблон: {template[:200] or '(любой)'}\n"
        "Верни только текст ответа."
    )
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": 120,
        "temperature": 0.9,
    }
    req = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://techpro.app",
            "X-Title": "TechPro",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
        text = (text or "").strip().strip('"').strip("«»").strip()
        return text[:150] if text else None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError, IndexError):
        return None


def generate_reply_text(parent_text: str, caption: str, cfg: dict, state: dict | None = None) -> str | None:
    template = _pick_from_pool(cfg, state)
    text = None

    if cfg.get("useAi"):
        text = _ai_rewrite(parent_text, caption, template, cfg)

    if not text and template:
        text = template
    elif not text:
        text = random.choice(["согласен", "в точку", "класс", "так и есть", "огонь"])

    if not text:
        return None
    return text[:150].strip()
