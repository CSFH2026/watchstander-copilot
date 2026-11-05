"""Writes what the cloud backend needs from the corpus, computed by the same Python the laptop uses.

  cloud/data/bundle.json  small, compiled into the code: config, scope words, shorthand, BM25 constants,
                          the known-casualty match terms of every ddg procedure, and what a CASREP draft
                          reads from each ddg procedure
  cloud/data/seed.sql     D1 rows: one per procedure (its steps) and one per keyword (its postings)
  cloud/data/embed.jsonl  one line per step: the id and the search text the cloud embeds into Vectorize

Parsing, search text, BM25 statistics, and scope words exist only here, so the TypeScript side runs
per-question code and cannot drift on corpus logic. The cloud embeds with its own model, so both
halves of a cosine come from one model.

Run: WSC_CONFIG=config/cloudflare.yaml python -m retrieval.export
"""
import json
import sys
from collections import Counter
from pathlib import Path
from types import SimpleNamespace

from rank_bm25 import BM25Okapi

import casrep
import known
from config import (CONFIG, CORPUS_DIR, DATASET, DATASET_NAME, EMBED_MODEL, NODE_ID, OPERATOR_IDS, REPO_ROOT,
                    RETRIEVAL)
from retrieval.indexer import corpus_hash, search_text
from retrieval.normalize import STOPWORDS, TOKEN_RE, abbreviations, tokens
from retrieval.parse import load_corpus
from retrieval.search import NO_MATCH, Retriever

OUT = REPO_ROOT / "cloud" / "data"
ROSTER_PATH = REPO_ROOT / "cloud" / ".keys" / "roster.json"
BUNDLE_VERSION = 3
# D1 refuses a statement over 100 KB; stay well under it.
MAX_STATEMENT_BYTES = 90_000


def sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def inserts(table: str, rows: list[str]) -> list[str]:
    """Multi-row INSERT statements, each under the D1 statement limit."""
    out, chunk, size = [], [], 0
    head = f"INSERT INTO {table} VALUES "
    for row in rows:
        if chunk and size + len(row.encode()) + 1 > MAX_STATEMENT_BYTES - len(head):
            out.append(head + ",".join(chunk) + ";")
            chunk, size = [], 0
        chunk.append(row)
        size += len(row.encode()) + 1
    if chunk:
        out.append(head + ",".join(chunk) + ";")
    return out


def casrep_matching() -> dict:
    systems, abbreviations_lower = known.load_corpus_index()
    return {"terms": {pid: [sorted(t) for t in known.system_terms(system, abbreviations_lower)] for pid, system in systems.items()},
            "abbreviations": abbreviations_lower, "stopwords": sorted(known.STOPWORDS),
            "step_names": list(known.STEP_NAMES), "step_phrases": list(known.STEP_PHRASES)}


def casrep_drafting() -> dict:
    """What cloud/src/casrep.ts needs to draft the CASREP api/casrep.py drafts: its defaults and limits, and every
    ddg procedure as casrep.load_procedure reads it. Always ddg, whatever dataset this deployment answers from."""
    procs = {}
    for path in sorted(casrep.CORPUS.glob("*.md")):
        p = casrep.load_procedure(casrep.CORPUS, path.stem)
        procs[path.stem] = {"procedure_id": p["procedure_id"], "title": p["title"], "source": p["source"], "system": p["system"],
                            "symptoms": p["symptoms"], "steps": [{"step_id": s["step_id"], "text": s["text"]} for s in p["steps"]]}
    return {"defaults": casrep.DEFAULTS, "limits": {"text": casrep.MAX_TEXT, "equipment": casrep.MAX_EQUIPMENT, "name": casrep.MAX_NAME},
            "mission_areas": list(casrep.MISSION_AREAS), "assistance": list(casrep.ASSISTANCE), "months": list(casrep.MONTHS),
            "user_agent": casrep.USER_AGENT, "procedures": procs}


def build(corpus_dir: Path = CORPUS_DIR) -> dict:
    procs = load_corpus(corpus_dir)
    steps = []
    for p in procs:
        for s in p["steps"]:
            steps.append((p, s, search_text(p, s)))
    # Same order as the laptop Retriever (ORDER BY procedure_id, seq), so rank ties break the same way.
    steps.sort(key=lambda t: (t[1]["procedure_id"], t[1]["seq"]))
    doc_tokens = [tokens(text) for _, _, text in steps]
    bm25 = BM25Okapi(doc_tokens)

    scope = SimpleNamespace(procedures={p["procedure_id"]: p for p in procs})
    Retriever._load_scope(scope)
    sha = corpus_hash(corpus_dir)

    # One postings row per term: [step_id, term frequency, document length] for every step that holds it.
    postings: dict[str, list] = {}
    for (_, s, _), toks in zip(steps, doc_tokens):
        for term, tf in Counter(toks).items():
            postings.setdefault(term, []).append([s["step_id"], tf, len(toks)])

    proc_rows = []
    for p in sorted(procs, key=lambda p: p["procedure_id"]):
        step_list = [{k: s[k] for k in ("step_id", "seq", "text", "requires", "danger")}
                     for s in sorted(p["steps"], key=lambda s: s["seq"])]
        proc_rows.append("(" + ",".join([
            sql_str(p["procedure_id"]), sql_str(p["title"]), sql_str(p["source"]),
            sql_str(json.dumps(p["symptoms"], ensure_ascii=False)), sql_str(json.dumps(step_list, ensure_ascii=False)),
        ]) + ")")
    term_rows = []
    for term in sorted(postings):
        plist = postings[term]
        # A very common term is split into parts so no row breaks the statement limit.
        for part, i in enumerate(range(0, len(plist), 1500)):
            term_rows.append("(" + ",".join([sql_str(term), str(part), repr(float(bm25.idf[term])),
                                             sql_str(json.dumps(plist[i:i + 1500], separators=(",", ":")))]) + ")")
    seed = [
        "-- Generated by api/retrieval/export.py. Replaces the dataset content; the audit log is untouched.",
        # content_meta keeps its vectors:<index> rows, so switching back to a dataset skips re-embedding.
        "DELETE FROM procedures;", "DELETE FROM terms;", "DELETE FROM content_meta WHERE key IN ('corpus_sha256', 'dataset');",
        *inserts("procedures", proc_rows),
        *inserts("terms", term_rows),
        f"INSERT INTO content_meta VALUES ('corpus_sha256', {sql_str(sha)}), ('dataset', {sql_str(DATASET_NAME)});",
    ]

    roster = json.loads(ROSTER_PATH.read_text()) if ROSTER_PATH.exists() else {}
    bundle = {
        "version": BUNDLE_VERSION,
        "corpus_sha256": sha,
        "dataset": {k: DATASET[k] for k in ("name", "title", "kind", "source", "license", "examples")},
        "config": {"target": CONFIG["target"], "offline": CONFIG["offline"], "models": CONFIG["models"]},
        "embed_model": EMBED_MODEL,
        "retrieval": RETRIEVAL,
        "node_id": NODE_ID,
        "operator_ids": OPERATOR_IDS,
        "roster": roster,
        "counts": {"procedures": len(procs), "steps": len(steps)},
        "bm25": {"k1": bm25.k1, "b": bm25.b, "avgdl": bm25.avgdl},
        "normalize": {"token_re": TOKEN_RE.pattern, "stopwords": sorted(STOPWORDS),
                      "abbreviations": list(abbreviations().items())},
        # api/known.py computes the match terms, so the cloud matches CASREPs with the laptop's rule.
        "casrep": casrep_matching(),
        # api/casrep.py's procedures and limits, so the cloud draft is the laptop draft (tests/test_casrep_cloud.py).
        "casrep_draft": casrep_drafting(),
        "scope": {"covered": scope.covered, "uncovered": scope.uncovered,
                  "domain_tokens": sorted(scope.domain_tokens),
                  "domain_bigrams": sorted(" ".join(bg) for bg in scope.domain_bigrams),
                  "no_match": NO_MATCH},
    }
    embed = [{"id": s["step_id"], "text": text} for _, s, text in steps]
    return {"bundle": bundle, "seed": seed, "embed": embed}


def write(out: dict) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "bundle.json").write_text(json.dumps(out["bundle"], ensure_ascii=False), encoding="utf-8")
    (OUT / "seed.sql").write_text("\n".join(out["seed"]) + "\n", encoding="utf-8")
    with (OUT / "embed.jsonl").open("w", encoding="utf-8") as f:
        for row in out["embed"]:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    corpus = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else CORPUS_DIR
    result = build(corpus)
    write(result)
    b = result["bundle"]
    if not b["roster"]:
        print("warning: no cloud roster yet; run scripts/keys_cloud.py before deploying", file=sys.stderr)
    sizes = ", ".join(f"{p.name} {p.stat().st_size // 1024} KB" for p in sorted(OUT.iterdir()))
    print(f"dataset {DATASET_NAME}: {b['counts']['procedures']} procedures, {b['counts']['steps']} steps, "
          f"model {b['embed_model']} -> {sizes}")
