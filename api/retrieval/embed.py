"""bge-small embeddings from the provider the config names.

local: fastembed (ONNX on CPU, no torch, works with wifi off).
cloudflare: the Workers AI REST API, for a laptop that tests against the same vectors the
cloud backend uses. Needs WSC_CF_AI_TOKEN and an account id, and it is not offline.

Vectors are normalized, so a dot product is the cosine similarity.
"""
import json
import os
import urllib.request
from functools import lru_cache

import numpy as np

from config import CONFIG, EMBED_MODEL, EMBED_PROVIDER, MODEL_DIR

# bge v1.5 retrieves better when the query, and only the query, carries this instruction.
# The cloud backend sends the same prefix, so both sides embed a question the same way.
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "
CF_BATCH = 100


@lru_cache(maxsize=1)
def model():
    from fastembed import TextEmbedding
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    return TextEmbedding(model_name=EMBED_MODEL, cache_dir=str(MODEL_DIR))


def _cloudflare(texts: list[str]) -> np.ndarray:
    account = os.environ.get("WSC_CF_ACCOUNT_ID") or CONFIG["cloudflare"]["account_id"]
    token = os.environ.get("WSC_CF_AI_TOKEN")
    if not (account and token):
        raise RuntimeError("models.embed is cloudflare: set WSC_CF_AI_TOKEN and WSC_CF_ACCOUNT_ID (or cloudflare.account_id)")
    url = f"https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{EMBED_MODEL}"
    out = []
    for i in range(0, len(texts), CF_BATCH):
        req = urllib.request.Request(url, data=json.dumps({"text": texts[i:i + CF_BATCH]}).encode(), method="POST",
                                     headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            out.extend(json.load(resp)["result"]["data"])
    return np.array(out)


def _raw(texts: list[str]) -> np.ndarray:
    if EMBED_PROVIDER == "cloudflare":
        return _cloudflare(texts)
    return np.array(list(model().embed(texts)))


def _norm(m: np.ndarray) -> np.ndarray:
    m = m.astype(np.float32)
    return m / np.clip(np.linalg.norm(m, axis=-1, keepdims=True), 1e-12, None)


def embed_docs(texts: list[str]) -> np.ndarray:
    return _norm(_raw(texts))


def embed_query(text: str) -> np.ndarray:
    return _norm(_raw([QUERY_PREFIX + text]))[0]
