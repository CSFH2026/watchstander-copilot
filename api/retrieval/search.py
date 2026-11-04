"""Hybrid search over the step index: BM25 keyword score and bge cosine score, merged by
reciprocal rank fusion, then grouped by procedure.

The corpus is tens of procedures, so everything lives in memory and a query is a few
numpy operations. No vector database server.
"""
import json
import re
import sqlite3
from pathlib import Path

import numpy as np
import yaml
from rank_bm25 import BM25Okapi

from config import API_DIR, INDEX_PATH
from retrieval.embed import embed_query
from retrieval.normalize import expand, tokens

SCOPE_PATH = API_DIR / "retrieval" / "scope.yaml"
# Second place within this share of the first means the question fits both; the Sailor confirms.
AMBIGUOUS_RATIO = 0.94
NO_MATCH = "No authorized procedure matches this description. Use the EOCC binder."

RRF_K = 60
# Below this cosine, with no keyword hit at all, the question is not about any procedure we hold.
MIN_COSINE_WITHOUT_KEYWORDS = 0.62
# Below this cosine nothing is answered, keyword hits or not. Measured 2026-11-04: off-topic wikiHow
# titles peak at 0.528 and the weakest real casualty question sits at 0.579. The off-topic test in
# tests/test_scope_offtopic.py re-checks that margin whenever the corpus changes.
MIN_COSINE = 0.55


class Retriever:
    def __init__(self, db_path: Path = INDEX_PATH):
        con = sqlite3.connect(db_path)
        con.row_factory = sqlite3.Row
        self.procedures = {}
        for r in con.execute("SELECT * FROM procedures"):
            self.procedures[r["procedure_id"]] = {
                "procedure_id": r["procedure_id"], "ship_class": r["ship_class"], "title": r["title"],
                "source": r["source"], "symptoms": json.loads(r["symptoms"]), "causes": json.loads(r["causes"]),
                "effects": json.loads(r["effects"]),
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
        self._load_scope()

    def _load_scope(self) -> None:
        scope = yaml.safe_load(SCOPE_PATH.read_text(encoding="utf-8")) or {}
        self.covered = [str(x).lower() for x in scope.get("covered", [])]
        self.uncovered = [str(x).lower() for x in scope.get("uncovered", [])]
        generic = {str(x).lower() for x in scope.get("generic", [])}
        # Domain words and two-word phrases come from what the procedures say, not from a hand list,
        # so a new procedure widens the scope without code changes.
        self.domain_tokens, self.domain_bigrams = set(), set()
        for p in self.procedures.values():
            for phrase in [p["title"], *p["symptoms"], *p["causes"], *p["effects"]]:
                toks = tokens(phrase)
                self.domain_tokens.update(t for t in toks if t not in generic and not t.isdigit())
                self.domain_bigrams.update(zip(toks, toks[1:]))

    @staticmethod
    def _mentions(text: str, phrases: list[str]) -> str | None:
        return next((ph for ph in phrases if re.search(rf"\b{re.escape(ph)}\b", text)), None)

    def scope_check(self, text: str, q_tokens: list[str]) -> str | None:
        """Returns a notice when the question is outside what the corpus covers, else None."""
        lowered = expand(text).lower()
        if self._mentions(lowered, self.covered):
            return None
        other = self._mentions(lowered, self.uncovered)
        if other:
            return f"No authorized procedure is held for {other}. Use the EOCC binder."
        if any(t in self.domain_tokens for t in q_tokens) or any(bg in self.domain_bigrams for bg in zip(q_tokens, q_tokens[1:])):
            return None
        return NO_MATCH

    def procedure_steps(self, procedure_id: str) -> list[dict]:
        return [s for s in self.steps if s["procedure_id"] == procedure_id]

    def search(self, text: str) -> dict:
        q_tokens = tokens(text)
        empty = {"ranked": [], "keyword_hits": [], "semantic_top": None, "max_cosine": 0.0,
                 "confidence": "none", "notice": NO_MATCH}
        if not text.strip():
            return empty
        notice = self.scope_check(text, q_tokens)
        if notice:
            return empty | {"notice": notice}
        n = len(self.steps)
        kw = self.bm25.get_scores(q_tokens) if q_tokens else np.zeros(n)
        cos = self.matrix @ embed_query(text) if text.strip() else np.zeros(n)

        fused = np.zeros(n)
        kw_order = [i for i in np.argsort(-kw) if kw[i] > 0]
        for rank, i in enumerate(kw_order):
            fused[i] += 1.0 / (RRF_K + rank + 1)
        for rank, i in enumerate(np.argsort(-cos)):
            fused[i] += 1.0 / (RRF_K + rank + 1)

        top_cos = float(cos.max(initial=0.0))
        if top_cos < MIN_COSINE or (not kw_order and top_cos < MIN_COSINE_WITHOUT_KEYWORDS):
            return empty | {"max_cosine": top_cos}

        best: dict[str, float] = {}
        for i, s in enumerate(self.steps):
            best[s["procedure_id"]] = max(best.get(s["procedure_id"], 0.0), float(fused[i]))
        ranked = sorted(best.items(), key=lambda kv: -kv[1])

        vocab = set(t for doc in self._doc_tokens for t in doc)
        ambiguous = len(ranked) > 1 and ranked[1][1] >= AMBIGUOUS_RATIO * ranked[0][1]
        return {
            "ranked": ranked,
            "confidence": "ambiguous" if ambiguous else "clear",
            "notice": (f"Two procedures fit this description: {ranked[0][0]} and {ranked[1][0]}. Confirm which casualty it is."
                       if ambiguous else None),
            "keyword_hits": sorted({t for t in q_tokens if t in vocab}),
            "semantic_top": self.steps[int(np.argmax(cos))]["step_id"],
            "max_cosine": float(cos.max(initial=0.0)),
        }
