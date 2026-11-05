"""Builds api/data/index.sqlite from the corpus. Run with `make index`.

The index is rebuilt only when the corpus, the abbreviation map, or the model changes,
so the API can call ensure_index() at every start without paying for it.
"""
import hashlib
import json
import sqlite3
import sys
import time
from pathlib import Path

import numpy as np

from config import ABBREVIATIONS_PATH, CORPUS_DIR, EMBED_MODEL, EMBED_PROVIDER, INDEX_PATH

# Bump when the schema or the search text recipe changes, so every laptop rebuilds.
INDEX_VERSION = "2"
from retrieval.embed import embed_docs
from retrieval.normalize import expand
from retrieval.parse import load_corpus

SCHEMA = """
CREATE TABLE procedures (procedure_id TEXT PRIMARY KEY, ship_class TEXT, title TEXT, source TEXT,
                         symptoms TEXT, causes TEXT, effects TEXT, file TEXT);
CREATE TABLE steps (step_id TEXT PRIMARY KEY, procedure_id TEXT, seq INTEGER, text TEXT, requires TEXT,
                    danger TEXT, search_text TEXT, embedding BLOB);
CREATE TABLE edges (src TEXT, dst TEXT, kind TEXT);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
"""


def corpus_hash(corpus_dir: Path) -> str:
    # The provider is part of the key: two providers of the same model give slightly different vectors.
    h = hashlib.sha256(f"{INDEX_VERSION}|{EMBED_PROVIDER}|{EMBED_MODEL}".encode())
    h.update(ABBREVIATIONS_PATH.read_bytes() if ABBREVIATIONS_PATH else b"")
    for p in sorted(corpus_dir.glob("*.md")):
        h.update(str(p.relative_to(corpus_dir)).encode())
        h.update(p.read_bytes())
    return h.hexdigest()


def search_text(proc: dict, step: dict) -> str:
    # Every step carries its procedure's title, symptoms, causes, and effects, so a symptom query
    # lands on the right procedure even when the step wording never mentions the alarm.
    return expand(" . ".join([proc["title"], "; ".join(proc["symptoms"]), "; ".join(proc["causes"]),
                               "; ".join(proc["effects"]), step["text"]]))


def build(corpus_dir: Path = CORPUS_DIR, db_path: Path = INDEX_PATH) -> dict:
    t0 = time.perf_counter()
    procs = load_corpus(corpus_dir)
    rows, texts = [], []
    for p in procs:
        for s in p["steps"]:
            rows.append((p, s))
            texts.append(search_text(p, s))
    vectors = embed_docs(texts)

    db_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = db_path.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    con = sqlite3.connect(tmp)
    con.executescript(SCHEMA)
    for p in procs:
        con.execute("INSERT INTO procedures VALUES (?,?,?,?,?,?,?,?)", (
            p["procedure_id"], p["ship_class"], p["title"], p["source"],
            json.dumps(p["symptoms"]), json.dumps(p["causes"]), json.dumps(p["effects"]), p["file"]))
        for other in p["associated"]:
            con.execute("INSERT INTO edges VALUES (?,?,?)", (p["procedure_id"], other, "associated"))
    for (p, s), text, vec in zip(rows, texts, vectors):
        con.execute("INSERT INTO steps VALUES (?,?,?,?,?,?,?,?)", (
            s["step_id"], s["procedure_id"], s["seq"], s["text"], json.dumps(s["requires"]),
            s["danger"], text, vec.astype(np.float32).tobytes()))
        for r in s["requires"]:
            con.execute("INSERT INTO edges VALUES (?,?,?)", (s["step_id"], r, "requires"))
    stats = {
        "procedures": len(procs),
        "steps": len(rows),
        "edges": con.execute("SELECT COUNT(*) FROM edges").fetchone()[0],
        "model": EMBED_MODEL,
        "dim": int(vectors.shape[1]),
        "corpus_sha256": corpus_hash(corpus_dir),
        "built_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }
    con.executemany("INSERT INTO meta VALUES (?,?)", [(k, str(v)) for k, v in stats.items()])
    con.commit()
    con.close()
    tmp.replace(db_path)
    stats["seconds"] = round(time.perf_counter() - t0, 2)
    return stats


def ensure_index(corpus_dir: Path = CORPUS_DIR, db_path: Path = INDEX_PATH) -> dict | None:
    """Rebuilds only when stale. Returns the build stats, or None when the index was current."""
    if db_path.exists():
        con = sqlite3.connect(db_path)
        try:
            row = con.execute("SELECT value FROM meta WHERE key='corpus_sha256'").fetchone()
        except sqlite3.DatabaseError:
            row = None
        con.close()
        if row and row[0] == corpus_hash(corpus_dir):
            return None
    return build(corpus_dir, db_path)


if __name__ == "__main__":
    args = [arg for arg in sys.argv[1:] if arg != "--force"]
    force = "--force" in sys.argv[1:]
    corpus = Path(args[0]).resolve() if args else CORPUS_DIR
    if force or args:
        s = build(corpus)
    else:
        s = ensure_index()
        if s is None:
            print(f"index is current -> {INDEX_PATH}")
            raise SystemExit(0)
    print(f"indexed {s['procedures']} procedures, {s['steps']} steps, {s['edges']} edges "
          f"with {s['model']} ({s['dim']}-d) in {s['seconds']} s -> {INDEX_PATH}")
