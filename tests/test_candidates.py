"""The ranked candidate list on POST /api/query and the pick that opens another candidate.

Runs against any backend with WSC_BASE_URL, like tests/test_happy_path.py.
"""
import os

import pytest
from fastapi.testclient import TestClient

BASE_URL = os.environ.get("WSC_BASE_URL")
OP = "EOOW-01"
LLOP = "low lube oil pressure on number two SSGTG"
MRG = "MRG LO pressure dropping on shaft 2"


def _served_dataset() -> str:
    if BASE_URL:
        import httpx
        return httpx.get(BASE_URL + "/api/health", timeout=30).json().get("dataset", {}).get("name", "ddg")
    from config import DATASET_NAME
    return DATASET_NAME


pytestmark = pytest.mark.skipif(_served_dataset() != "ddg", reason="the backend does not serve the ddg doctrine")


@pytest.fixture(scope="module")
def client():
    if BASE_URL:
        import httpx
        with httpx.Client(base_url=BASE_URL, timeout=30) as c:
            c.post("/api/reset", json={"operator_id": OP})
            yield c
        return
    from main import app
    with TestClient(app) as c:
        yield c


def ask(client, text, **extra):
    return client.post("/api/query", json={"operator_id": OP, "text": text, **extra})


def test_candidates_rank_the_top_match_first_with_its_evidence(client):
    r = ask(client, LLOP).json()
    c = r["candidates"]
    assert 2 <= len(c) <= 5
    assert [x["rank"] for x in c] == list(range(1, len(c) + 1))
    assert c[0]["procedure_id"] == r["procedure"]["procedure_id"] == "EOCC-SSGTG-LLOP"
    assert c[0]["relative"] == 1 and c[0]["strength"] == "strong"
    assert {"lube", "oil", "pressure", "ssgtg"} <= set(c[0]["keyword"])
    assert all(set(x["keyword"]) <= set(r["matched"]["keyword"]) for x in c)
    # Best first, bands follow the share of the top score, and nothing calls itself a probability.
    assert [x["score"] for x in c] == sorted((x["score"] for x in c), reverse=True)
    for x in c[1:]:
        assert x["strength"] == ("strong" if x["relative"] >= 0.94 else "possible" if x["relative"] >= 0.8 else "weak")
    assert r["alternates"] == [{k: x[k] for k in ("procedure_id", "title", "score")} for x in c[1:3]]


@pytest.mark.skipif(bool(BASE_URL), reason="reads the local preset's floors")
def test_every_listed_candidate_passes_the_floors_on_its_own(client):
    from config import RETRIEVAL
    for text in (LLOP, MRG, "pitch is drifting toward astern on shaft two", "loss of firemain pressure"):
        for x in ask(client, text).json()["candidates"][1:]:
            assert x["cosine"] >= RETRIEVAL["min_cosine"], (text, x)
            assert x["keyword"] or x["cosine"] >= RETRIEVAL["min_cosine_without_keywords"], (text, x)


def test_ambiguous_question_lists_both_fits_as_strong(client):
    r = ask(client, MRG).json()
    top_two = r["candidates"][:2]
    assert r["confidence"] == "ambiguous"
    assert {x["procedure_id"] for x in top_two} == {"EOCC-MRG-LLOP", "EOCC-MRG-LOPF"}
    assert all(x["strength"] == "strong" for x in top_two)


@pytest.mark.parametrize("text", ["how do I bake bread", "low lube oil pressure on number two SSDG", "pizza for lunch"])
def test_refused_question_lists_no_candidates(client, text):
    r = ask(client, text).json()
    assert r["procedure"] is None and r["steps"] == [] and r["candidates"] == [] and r["alternates"] == []


def test_pick_opens_another_candidate_and_logs_it(client):
    first = ask(client, MRG).json()
    second = first["candidates"][1]
    r = ask(client, MRG, pick=second["procedure_id"]).json()
    assert r["procedure"]["procedure_id"] == second["procedure_id"]
    assert r["steps"][0]["step_id"].startswith(second["procedure_id"] + "-")
    # The list does not move: the watch can go back to the top match with one tap.
    assert [x["procedure_id"] for x in r["candidates"]] == [x["procedure_id"] for x in first["candidates"]]
    assert r["confidence"] == "ambiguous"
    latest = client.get("/api/audit?limit=1").json()["entries"][0]
    assert latest["seq"] == r["audit"]["seq"] and latest["event"] == "query"
    assert latest["summary"].endswith(f"-> {second['procedure_id']} (ambiguous), picked rank 2 of {len(r['candidates'])}")
    assert latest["procedure_id"] == second["procedure_id"]


def test_picked_procedure_still_follows_the_policy_engine(client):
    client.post("/api/reset", json={"operator_id": OP})
    pid = ask(client, MRG).json()["candidates"][1]["procedure_id"]
    ask(client, MRG, pick=pid)
    blocked = client.post("/api/action", json={"operator_id": OP, "procedure_id": pid, "step_id": f"{pid}-02"}).json()
    assert blocked["allowed"] is False and "requires step 01" in blocked["reason"]


@pytest.mark.parametrize("text,pick", [
    (LLOP, "EOCC-MRG-LLOP"),             # a real procedure, but not on this question's list
    ("how do I bake bread", "EOCC-SSGTG-LLOP"),  # a refused question opens nothing, even by pick
])
def test_pick_outside_the_list_is_refused(client, text, pick):
    r = ask(client, text, pick=pick)
    assert r.status_code == 422
    assert "not a candidate for this question" in r.json()["detail"]
