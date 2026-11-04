"""Writes cloud/data/bundle.json: everything the cloud backend needs that comes from the corpus.

Parsing, search text, BM25 document statistics, and the scope word sets are computed here, by the
same Python the laptop uses, so the TypeScript side only runs per-question code and cannot drift on
corpus logic. Embeddings are not in the bundle: the cloud embeds documents and questions with its
own model, so both sides of a cosine come from one model.

Run: WSC_CONFIG=config/cloudflare.yaml python -m retrieval.export
"""
import json
import sys
from pathlib import Path
from types import SimpleNamespace

from rank_bm25 import BM25Okapi

from config import CONFIG, CORPUS_DIR, EMBED_MODEL, NODE_ID, OPERATOR_IDS, REPO_ROOT, RETRIEVAL
from retrieval.indexer import corpus_hash, search_text
from retrieval.normalize import STOPWORDS, TOKEN_RE, abbreviations, tokens
from retrieval.search import NO_MATCH, Retriever

BUNDLE_PATH = REPO_ROOT / "cloud" / "data" / "bundle.json"
ROSTER_PATH = REPO_ROOT / "cloud" / ".keys" / "roster.json"
BUNDLE_VERSION = 1


def build(corpus_dir: Path = CORPUS_DIR) -> dict:
    from retrieval.parse import load_corpus
    procs = load_corpus(corpus_dir)
    procedures, steps = {}, []
    for p in procs:
        procedures[p["procedure_id"]] = {k: p[k] for k in ("procedure_id", "ship_class", "title", "source",
                                                           "symptoms", "causes", "effects")}
        for s in p["steps"]:
            steps.append({k: s[k] for k in ("step_id", "procedure_id", "seq", "text", "requires", "danger")}
                         | {"search_text": search_text(p, s)})
    # Same order as the laptop Retriever (ORDER BY procedure_id, seq), so rank ties break the same way.
    steps.sort(key=lambda s: (s["procedure_id"], s["seq"]))
    doc_tokens = [tokens(s["search_text"]) for s in steps]
    bm25 = BM25Okapi(doc_tokens)

    scope = SimpleNamespace(procedures=procedures)
    Retriever._load_scope(scope)
    roster = json.loads(ROSTER_PATH.read_text()) if ROSTER_PATH.exists() else {}
    return {
        "version": BUNDLE_VERSION,
        "corpus_sha256": corpus_hash(corpus_dir),
        "config": {"target": CONFIG["target"], "offline": CONFIG["offline"], "models": CONFIG["models"]},
        "embed_model": EMBED_MODEL,
        "retrieval": RETRIEVAL,
        "node_id": NODE_ID,
        "operator_ids": OPERATOR_IDS,
        "roster": roster,
        "procedures": procedures,
        "steps": steps,
        "bm25": {
            "k1": bm25.k1, "b": bm25.b, "avgdl": bm25.avgdl, "doc_len": bm25.doc_len,
            "idf": {t: float(v) for t, v in bm25.idf.items()},
            "doc_freqs": bm25.doc_freqs,
        },
        "normalize": {"token_re": TOKEN_RE.pattern, "stopwords": sorted(STOPWORDS),
                      "abbreviations": list(abbreviations().items())},
        "scope": {"covered": scope.covered, "uncovered": scope.uncovered,
                  "domain_tokens": sorted(scope.domain_tokens),
                  "domain_bigrams": sorted(" ".join(bg) for bg in scope.domain_bigrams),
                  "no_match": NO_MATCH},
    }


if __name__ == "__main__":
    corpus = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else CORPUS_DIR
    b = build(corpus)
    BUNDLE_PATH.parent.mkdir(parents=True, exist_ok=True)
    BUNDLE_PATH.write_text(json.dumps(b, ensure_ascii=False, indent=1), encoding="utf-8")
    if not b["roster"]:
        print("warning: no cloud roster yet; run scripts/keys_cloud.py before deploying", file=sys.stderr)
    print(f"bundle: {len(b['procedures'])} procedures, {len(b['steps'])} steps, model {b['embed_model']} -> {BUNDLE_PATH}")
