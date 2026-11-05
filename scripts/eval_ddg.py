"""Measures the ddg dataset on tests/fixtures/ddg_symptom_queries.yaml: hit rate, refusals, and latency.

Retriever latency is Retriever.search alone; API latency is POST /api/query through the FastAPI test
client, which adds the policy engine and the signed audit entry.

Run: WSC_DATASET=ddg .venv/bin/python scripts/eval_ddg.py
"""
import os
import statistics
import sys
import tempfile
import time
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parent.parent
os.environ.setdefault("WSC_DATASET", "ddg")
os.environ.setdefault("HF_HUB_OFFLINE", "1")
# The API writes signed audit entries; keep this run's out of the demo log.
os.environ.setdefault("WSC_AUDIT_PATH", str(Path(tempfile.mkdtemp(prefix="wsc-eval-")) / "log.jsonl"))
sys.path.insert(0, str(REPO / "api"))

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402
from retrieval.indexer import ensure_index  # noqa: E402
from retrieval.search import Retriever  # noqa: E402


def pct(xs: list[float], q: float) -> float:
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(round(q * (len(xs) - 1))))]


def main() -> None:
    queries = yaml.safe_load((REPO / "tests" / "fixtures" / "ddg_symptom_queries.yaml").read_text(encoding="utf-8"))
    covered = [(q, pid) for pid, qs in queries["covered"].items() for q in qs]
    ensure_index()
    r = Retriever()
    r.search("warm up")

    hit1 = hit2 = ambiguous = 0
    misses, times = [], []
    for q, pid in covered:
        t0 = time.perf_counter()
        res = r.search(q)
        times.append((time.perf_counter() - t0) * 1000)
        top = [p for p, _ in res["ranked"][:2]]
        hit1 += top[:1] == [pid]
        hit2 += pid in top
        ambiguous += res["confidence"] == "ambiguous"
        if top[:1] != [pid]:
            misses.append((q, pid, top, res["confidence"]))
    leaks = [(q, r.search(q)["ranked"][0][0]) for q in queries["refused"] if r.search(q)["ranked"]]
    near = [(q, r.search(q)["ranked"][0][0]) for q in queries.get("near_miss", []) if r.search(q)["ranked"]]

    api_times = []
    with TestClient(app) as client:
        for q, _ in covered:
            t0 = time.perf_counter()
            client.post("/api/query", json={"operator_id": "EOOW-01", "text": q})
            api_times.append((time.perf_counter() - t0) * 1000)

    n = len(covered)
    print(f"procedures {len(r.procedures)}, steps {len(r.steps)}, questions {n}, refusal questions {len(queries['refused'])}")
    print(f"hit@1 {hit1}/{n} = {hit1 / n:.1%}   hit@2 {hit2}/{n} = {hit2 / n:.1%}   ambiguous {ambiguous}")
    print(f"refused {len(queries['refused']) - len(leaks)}/{len(queries['refused'])}   near misses answered {len(near)}/{len(queries.get('near_miss', []))}")
    print(f"retriever ms  p50 {statistics.median(times):.1f}  p95 {pct(times, 0.95):.1f}  max {max(times):.1f}")
    print(f"/api/query ms p50 {statistics.median(api_times):.1f}  p95 {pct(api_times, 0.95):.1f}  max {max(api_times):.1f}")
    for q, pid, top, conf in misses:
        print(f"  miss@1: {q!r} expected {pid}, got {top} ({conf})")
    for q, pid in leaks + near:
        print(f"  leak: {q!r} -> {pid}")


if __name__ == "__main__":
    main()
