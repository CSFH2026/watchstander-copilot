"""bge-small embeddings through fastembed (ONNX on CPU, no torch).

Vectors are normalized, so a dot product is the cosine similarity.
"""
from functools import lru_cache

import numpy as np

from config import EMBED_MODEL, MODEL_DIR

# bge v1.5 retrieves better when the query, and only the query, carries this instruction.
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "


@lru_cache(maxsize=1)
def model():
    from fastembed import TextEmbedding
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    return TextEmbedding(model_name=EMBED_MODEL, cache_dir=str(MODEL_DIR))


def _norm(m: np.ndarray) -> np.ndarray:
    m = m.astype(np.float32)
    return m / np.clip(np.linalg.norm(m, axis=-1, keepdims=True), 1e-12, None)


def embed_docs(texts: list[str]) -> np.ndarray:
    return _norm(np.array(list(model().embed(texts))))


def embed_query(text: str) -> np.ndarray:
    return _norm(np.array(list(model().embed([QUERY_PREFIX + text])))[0])
