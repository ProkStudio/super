"""TikTok — генерация ответов: пул офферов + OpenRouter + homoglyph."""
from __future__ import annotations

import json
import random
import re
import urllib.error
import urllib.request

from tiktok.comment_filters import (
    apply_homoglyphs,
    humanize_tiktok_comment,
    is_valid_tiktok_comment,
    parent_offers_service,
)

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

    return expand_spintax(random.choice(lines))


def _build_ai_messages(parent_text: str, caption: str, service_template: str, *, strict: bool = False) -> tuple[str, str]:
    system = (
        "Пиши ТОЛЬКО текст комментария TikTok на русском языке. "
        "Никакого английского. Никаких пояснений, списков и пересказа задания."
    )
    parent = (parent_text or "").strip()[:400] or "привет всем"
    cap = (caption or "").strip()[:300] or "видео про деньги"
    offer = (service_template or "").strip()[:500] or "ютуб Спредофил"
    extra = (
        "\n\nВажно: одна строка на русском. Без слов The user, Constraints, Reply, English."
        if strict
        else ""
    )
    user = (
        f"Коммент под видео: {parent}\n"
        f"О чём видео: {cap}\n"
        f"Вплети смысл оффера: {offer}\n\n"
        "Стиль: как обычный юзер TikTok 18-25 ща норм кста типа без запятых и без тире\n\n"
        "Пример ответа:\n"
        "ага норм тема кста глянь в ютубе Спредофил за пару вечеров реально выйти можно\n\n"
        f"Твой ответ одной строкой:{extra}"
    )
    return system, user


def _call_chat_api(
    cfg: dict,
    system: str,
    user: str,
    *,
    use_ai_flag: bool = True,
    temperature: float = 0.92,
) -> str | None:
    api_key = (cfg.get("aiApiKey") or cfg.get("ai_api_key") or "").strip()
    if not api_key:
        return None
    if use_ai_flag and not cfg.get("useAi"):
        return None

    base_url = (cfg.get("aiBaseUrl") or "https://openrouter.ai/api/v1").rstrip("/")
    model = (
        cfg.get("aiModel")
        or cfg.get("ai_model")
        or "meta-llama/llama-3.2-3b-instruct:free"
    )

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": 160,
        "temperature": temperature,
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
        if text:
            text = humanize_tiktok_comment(text)
        return text[:150] if text else None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError, IndexError):
        return None


def _ai_rewrite(parent_text: str, caption: str, service_template: str, cfg: dict) -> str | None:
    if parent_offers_service(parent_text):
        return None
    for attempt in range(2):
        system, user = _build_ai_messages(
            parent_text, caption, service_template, strict=attempt > 0
        )
        temp = 0.92 if attempt == 0 else 0.75
        text = _call_chat_api(cfg, system, user, use_ai_flag=True, temperature=temp)
        if text and is_valid_tiktok_comment(text):
            return text
    return None


def generate_reply_text(parent_text: str, caption: str, cfg: dict, state: dict | None = None) -> str | None:
    if parent_offers_service(parent_text):
        return None

    service_template = _pick_from_pool(cfg, state)
    use_ai = bool(cfg.get("useAi"))
    text = None

    if use_ai:
        if service_template:
            text = _ai_rewrite(parent_text, caption, service_template, cfg)
        else:
            text = _ai_rewrite(parent_text, caption, "", cfg)

    if not text and service_template:
        text = service_template
    elif not text:
        text = random.choice(["согласен", "в точку", "класс", "так и есть", "огонь"])

    if not text:
        return None

    text = text[:150].strip()
    if use_ai:
        text = humanize_tiktok_comment(text)
    if use_ai or cfg.get("applyHomoglyphs", cfg.get("apply_homoglyphs", True)):
        text = apply_homoglyphs(text)
    return text
