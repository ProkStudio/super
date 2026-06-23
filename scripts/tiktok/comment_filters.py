"""TikTok — фильтры комментариев (конкуренты, homoglyph)."""
from __future__ import annotations

import re

_HOMOGLYPH_MAP = str.maketrans({
    "о": "o", "О": "O",
    "а": "a", "А": "A",
    "у": "y", "У": "Y",
    "е": "e", "Е": "E",
})

_SERVICE_OFFER_RE = re.compile(
    r"(?:"
    r"научу|обучу|обуча|дам\s+схем|скину\s+схем|даю\s+схем|есть\s+схем|"
    r"кидайте?\s+юз|кидай\s+юз|юзернейм|юз\s+в\s+лс|"
    r"пиши\s+в\s+лс|пишите\s+в\s+лс|\bв\s+лс\b|напиши\s+мне|напишите\s+мне|"
    r"мой\s+тг|мой\s+телег|телеграм|telegram|whatsapp|ватсап|"
    r"раскруч|продам|продаю|услуг[иа]?|консульт|заработ|зарабатыв|"
    r"схем[ауеы]|курс\b|ментор|помогу\s+зара|пассивн|"
    r"арбитраж|лидоген|вынесу|под\s+ключ|обращайтесь"
    r")",
    re.IGNORECASE,
)


def apply_homoglyphs(text: str) -> str:
    return (text or "").translate(_HOMOGLYPH_MAP)


_DASH_RE = re.compile(r"[—–‐‑‒−\-]+")


def humanize_tiktok_comment(text: str) -> str:
    """Живой TikTok-стиль: без тире/дефисов и «канцелярской» пунктуации."""
    t = (text or "").strip()
    if not t:
        return ""
    t = re.sub(r"^(ответ|reply|comment)\s*:\s*", "", t, flags=re.I)
    t = _DASH_RE.sub(" ", t)
    t = re.sub(r"[,;:]", " ", t)
    t = re.sub(r'[«»"\'`]', "", t)
    t = re.sub(r"\.{2,}", " ", t)
    t = t.rstrip(".")
    t = re.sub(r"\s+", " ", t).strip()
    return t


_META_LEAK_RE = re.compile(
    r"(the user|constraints|tiktok style|comment reply|you are a|as an ai|"
    r"language model|верни только|правила:|стиль \(обязательно\)|"
    r"single tiktok|age 18|conversational)",
    re.IGNORECASE,
)


def is_valid_tiktok_comment(text: str) -> bool:
    """Отсекает «протечки» промпта и ответы не на русском."""
    t = (text or "").strip()
    if len(t) < 8 or len(t) > 160:
        return False
    if _META_LEAK_RE.search(t):
        return False
    cyrillic = len(re.findall(r"[а-яёА-ЯЁ]", t))
    if cyrillic < 8:
        return False
    if len(re.findall(r"\b[a-zA-Z]{4,}\b", t)) >= 2:
        return False
    return True


def parent_offers_service(text: str) -> bool:
    blob = re.sub(r"\s+", " ", (text or "").strip())
    if not blob:
        return False
    return bool(_SERVICE_OFFER_RE.search(blob))
