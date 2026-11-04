"""Hybrid search over the step index: BM25 keyword score and bge cosine score, merged by
reciprocal rank fusion, then grouped by procedure.

The corpus is tens of procedures, so everything lives in memory and a query is a few
numpy operations. No vector database server.
"""
import json
import sqlite3
from pathlib import Path

import numpy as np
from rank_bm25 import BM25Okapi

from config import INDEX_PATH
from retrieval.embed import embed_query
from retrieval.normalize import tokens

RRF_K = 60
# Below this cosine, with no keyword hit at all, the question is not about any procedure we hold.
MIN_COSINE_WITHOUT_KEYWORDS = 0.62


class Retriever:
    def __init__(self, db_path: Path = INDEX_PATH):
        con = sqlite3.connect(db_path)
        con.row_factory = sqlite3.Row
        self.procedures = {}
        for r in con.execute("SELECT * FROM procedures"):
            self.procedures[r["procedure_id"]] = {
                "procedure_id": r["procedure_id"], "ship_class": r["ship_class"], "title": r["title"],
                "source": r["source"], "symptoms": json.loads(r["symptoms"]), "causes": json.loads(r["causes"]),
            }
        self.steps = []
        vecs = []
        for r in con.execute("SELECT * FROM steps ORDER BY procedure_id, seq"):
            self.steps.append({
                "step_id": r["step_id"], "procedure_id": r["procedure_id"], "seq": r["seq"], "text": r["text"],
                "requires": json.loads(r["requires"]), "danger": r["danger"], "search_text": r["search_text"],
            })
            vecs.append(np.frombuffer(r["embedding"], dtype=np.float32))
        self.meta = {k: v for k, v in con.execute("SELECT key, value FROM meta")}
        con.close()
        self.matrix = np.vstack(vecs)
        self.step_by_id = {s["step_id"]: s for s in self.steps}
        self._doc_tokens = [tokens(s["search_text"]) for s in self.steps]
        self.bm25 = BM25Okapi(self._doc_tokens)

    def procedure_steps(self, procedure_id: str) -> list[dict]:
        return [s for s in self.steps if s["procedure_id"] == procedure_id]

    def search(self, text: str) -> dict:
        q_tokens = tokens(text)
        n = len(self.steps)
        kw = self.bm25.get_scores(q_tokens) if q_tokens else np.zeros(n)
        cos = self.matrix @ embed_query(text) if text.strip() else np.zeros(n)

        fused = np.zeros(n)
        kw_order = [i for i in np.argsort(-kw) if kw[i] > 0]
        for rank, i in enumerate(kw_order):
            fused[i] += 1.0 / (RRF_K + rank + 1)
        for rank, i in enumerate(np.argsort(-cos)):
            fused[i] += 1.0 / (RRF_K + rank + 1)

        if not kw_order and float(cos.max(initial=0.0)) < MIN_COSINE_WITHOUT_KEYWORDS:
            return {"ranked": [], "keyword_hits": [], "semantic_top": None, "max_cosine": float(cos.max(initial=0.0))}

        best: dict[str, float] = {}
        for i, s in enumerate(self.steps):
            best[s["procedure_id"]] = max(best.get(s["procedure_id"], 0.0), float(fused[i]))
        ranked = sorted(best.items(), key=lambda kv: -kv[1])

        vocab = set(t for doc in self._doc_tokens for t in doc)
        return {
            "ranked": ranked,
            "keyword_hits": sorted({t for t in q_tokens if t in vocab}),
            "semantic_top": self.steps[int(np.argmax(cos))]["step_id"],
            "max_cosine": float(cos.max(initial=0.0)),
        }
