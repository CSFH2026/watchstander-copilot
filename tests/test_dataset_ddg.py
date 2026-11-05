"""The ddg dataset as a whole: generated files are current, every procedure says how much of it is
doctrine, every watchstander question finds its procedure, and questions outside the corpus are refused.

Runs only when the backend serves ddg (the default for make test; see tests/conftest.py).
scripts/eval_ddg.py prints the same question set as a hit rate with latency.
"""
import os
import sys
from pathlib import Path

import pytest
import yaml

REPO = Path(__file__).resolve().parent.parent
QUERIES = yaml.safe_load((Path(__file__).parent / "fixtures" / "ddg_symptom_queries.yaml").read_text(encoding="utf-8"))
KNOWN_MISSES = set(QUERIES["known_misses"])
COVERED = [pytest.param(q, pid, marks=pytest.mark.xfail(strict=True, reason="known miss")) if q in KNOWN_MISSES else (q, pid)
           for pid, qs in QUERIES["covered"].items() for q in qs]
NEAR_MISS = [pytest.param(q, marks=pytest.mark.xfail(strict=True, reason="known near miss")) for q in QUERIES["near_miss"]]


def _served_dataset() -> str:
    if os.environ.get("WSC_BASE_URL"):
        import httpx
        return httpx.get(os.environ["WSC_BASE_URL"] + "/api/health", timeout=30).json().get("dataset", {}).get("name", "ddg")
    from config import DATASET_NAME
    return DATASET_NAME


pytestmark = pytest.mark.skipif(_served_dataset() != "ddg", reason="the backend does not serve the ddg doctrine")


@pytest.fixture(scope="module")
def retriever():
    from retrieval.indexer import ensure_index
    from retrieval.search import Retriever
    ensure_index()
    return Retriever()


@pytest.fixture(scope="module")
def corpus():
    from config import CORPUS_DIR
    from retrieval.parse import load_corpus
    return {p["procedure_id"]: p for p in load_corpus(CORPUS_DIR)}


def test_generated_files_match_the_extracts():
    sys.path.insert(0, str(REPO / "scripts"))
    import build_ddg
    expected = build_ddg.build()
    on_disk = {p.name: p.read_text(encoding="utf-8") for p in build_ddg.OUT.glob("EOCC-*.md")}
    assert set(on_disk) == set(expected), "rerun scripts/build_ddg.py"
    assert [n for n in expected if on_disk[n] != expected[n]] == [], "rerun scripts/build_ddg.py"


def test_every_procedure_says_how_much_is_doctrine():
    from config import CORPUS_DIR
    for path in sorted(CORPUS_DIR.glob("EOCC-*.md")):
        front = yaml.safe_load(path.read_text(encoding="utf-8").split("---", 2)[1])
        assert front["tier"] in ("taken", "adapted", "pattern"), path.name
        assert front["status"].startswith("training copy, unclassified."), path.name
        if front["tier"] == "adapted":
            assert "Synthetic, not from any source:" in front["status"], path.name
        if front["tier"] == "pattern":
            assert "All steps are synthetic." in front["status"], path.name


def test_indexed_citations_match_procedure_front_matter(retriever):
    from config import CORPUS_DIR

    sources = {}
    for path in sorted(CORPUS_DIR.glob("EOCC-*.md")):
        front = yaml.safe_load(path.read_text(encoding="utf-8").split("---", 2)[1])
        sources[front["procedure_id"]] = front["source"]

    assert set(retriever.procedures) == set(sources)
    for procedure_id, source in sources.items():
        assert retriever.procedures[procedure_id]["source"] == source, procedure_id


def test_question_set_names_every_procedure_and_nothing_else(corpus):
    assert set(QUERIES["covered"]) == set(corpus)


@pytest.mark.parametrize("text,expected", COVERED)
def test_watchstander_question_finds_its_procedure(retriever, text, expected):
    r = retriever.search(text)
    top = [pid for pid, _ in r["ranked"][:2]]
    # An ambiguous answer shows both procedures and asks the Sailor to confirm, so second place counts there.
    found = top[:1] == [expected] or (r["confidence"] == "ambiguous" and expected in top)
    assert found, f"got {top} ({r['confidence']}), notice: {r['notice']}"


def test_known_lists_name_real_questions():
    covered = {q for qs in QUERIES["covered"].values() for q in qs}
    assert KNOWN_MISSES <= covered and not set(QUERIES["near_miss"]) & set(QUERIES["refused"])


@pytest.mark.parametrize("text", QUERIES["refused"] + NEAR_MISS)
def test_question_outside_the_corpus_is_refused(retriever, text):
    r = retriever.search(text)
    assert r["ranked"] == [], f"answered with {r['ranked'][0][0]}"
