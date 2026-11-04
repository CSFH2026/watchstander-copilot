"""Shorthand expansion and tokenizing, used the same way at index time and query time."""
import re
from functools import lru_cache

import yaml

from config import ABBREVIATIONS_PATH

TOKEN_RE = re.compile(r"[a-z0-9]+")
# Words that carry no casualty meaning and would let BM25 match on filler.
STOPWORDS = {
    "a", "an", "the", "and", "or", "of", "on", "in", "to", "is", "are", "at", "for", "with", "by", "from",
    "it", "its", "this", "that", "be", "if", "as", "number", "one", "two", "three", "four", "we", "have",
    "has", "i", "my", "our", "there", "what", "do", "now", "not", "no", "then", "when", "into",
}


@lru_cache(maxsize=1)
def abbreviations() -> dict[str, str]:
    raw = yaml.safe_load(ABBREVIATIONS_PATH.read_text(encoding="utf-8")) or {}
    return {str(k): str(v) for k, v in raw.items()}


def expand(text: str) -> str:
    """Appends the long form after each known abbreviation, so both forms are searchable."""
    out = text
    for short, long in abbreviations().items():
        out = re.sub(rf"\b{re.escape(short)}\b", f"{short} ({long})", out, flags=re.IGNORECASE)
    return out


def tokens(text: str) -> list[str]:
    return [t for t in TOKEN_RE.findall(expand(text).lower()) if t not in STOPWORDS]
