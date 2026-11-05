"""The demo script as tests. If this file passes, the five demo beats work."""
import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


# Set WSC_BASE_URL to run this same file against any backend that speaks docs/CONTRACTS.md, for
# example the cloud backend under `make run` with the cloudflare preset (http://127.0.0.1:8788).
BASE_URL = os.environ.get("WSC_BASE_URL")



def _served_dataset() -> str:
    """The dataset this run tests: the remote backend's own, or the local config's."""
    if os.environ.get("WSC_BASE_URL"):
        import httpx
        return httpx.get(os.environ["WSC_BASE_URL"] + "/api/health", timeout=30).json().get("dataset", {}).get("name", "ddg")
    from config import DATASET_NAME
    return DATASET_NAME


# These tests are about the ddg casualty doctrine. tests/test_dataset_wikihow.py covers wikiHow.
pytestmark = pytest.mark.skipif(_served_dataset() != "ddg", reason="the backend does not serve the ddg doctrine")

@pytest.fixture(scope="module")
def client():
    if BASE_URL:
        import httpx
        with httpx.Client(base_url=BASE_URL, timeout=30) as c:
            # A remote backend keeps state between runs; start each run from a clean drill.
            c.post("/api/reset", json={"operator_id": "EOOW-01"})
            yield c
        return
    from main import app
    with TestClient(app) as c:
        yield c


OP = "EOOW-01"


# tests/test_dataset_ddg.py asks two questions of every procedure; these few walk the whole API.
@pytest.mark.parametrize("text,expected", [
    ("low lube oil pressure on number two SSGTG", "EOCC-SSGTG-LLOP"),
    ("SSGTG lube oil temperature high", "EOCC-SSGTG-HLOT"),
    ("loss of fuel oil pressure on the number 3 SSGTG", "EOCC-SSGTG-LFOP"),
    ("LO pressure dropping on number 1 gas turbine generator", "EOCC-SSGTG-LLOP"),
])
def test_symptom_finds_its_procedure(client, text, expected):
    r = client.post("/api/query", json={"operator_id": OP, "text": text}).json()
    assert r["procedure"]["procedure_id"] == expected
    assert r["procedure"]["source"].startswith("COMSCINST 3541.6A")
    assert len(r["steps"]) >= 3 and r["steps"][0]["state"] == "next"
    assert r["latency_ms"] < 5000
    assert r["audit"]["signer"] == "copilot-node-01"


def test_off_topic_question_gets_no_procedure(client):
    r = client.post("/api/query", json={"operator_id": OP, "text": "pizza for lunch"}).json()
    assert r["procedure"] is None and r["steps"] == []


def test_guardrail_blocks_out_of_order_then_allows_in_order(client):
    client.post("/api/reset", json={"operator_id": OP})
    pid = "EOCC-SSGTG-LLOP"
    blocked = client.post("/api/action", json={"operator_id": OP, "procedure_id": pid, "step_id": f"{pid}-05"}).json()
    assert blocked["allowed"] is False
    assert "requires step 04" in blocked["reason"] and "Danger" in blocked["reason"]
    assert blocked["audit"]["signer"] == OP

    for n in ("01", "02", "03", "04", "05"):
        ok = client.post("/api/action", json={"operator_id": OP, "procedure_id": pid, "step_id": f"{pid}-{n}"}).json()
        assert ok["allowed"] is True, ok["reason"]
    states = {s["seq"]: s["state"] for s in ok["steps"]}
    assert states[5] == "done" and states[6] == "next" and states[7] == "locked"

    again = client.post("/api/action", json={"operator_id": OP, "procedure_id": pid, "step_id": f"{pid}-05"}).json()
    assert again["allowed"] is False and "already acknowledged" in again["reason"]


def test_unknown_and_cross_procedure_steps_are_blocked(client):
    r = client.post("/api/action", json={"operator_id": OP, "procedure_id": "EOCC-SSGTG-LLOP", "step_id": "EOCC-XXX-99"}).json()
    assert r["allowed"] is False and "not a step in any authorized procedure" in r["reason"]
    r = client.post("/api/action", json={"operator_id": OP, "procedure_id": "EOCC-SSGTG-LLOP", "step_id": "EOCC-SSGTG-HLOT-01"}).json()
    assert r["allowed"] is False and "not the active procedure" in r["reason"]


def test_unknown_operator_is_refused(client):
    assert client.post("/api/query", json={"operator_id": "MALLORY", "text": "low lube oil"}).status_code == 400


@pytest.mark.skipif(bool(BASE_URL), reason="edits the local audit file; a remote backend keeps its log elsewhere")
def test_tamper_is_detected_at_the_edited_entry(client):
    assert client.get("/api/audit/verify").json()["ok"] is True
    path = Path(os.environ["WSC_AUDIT_PATH"])
    lines = path.read_text().splitlines()
    target = next(i for i, l in enumerate(lines) if '"allowed": false' in l)
    lines[target] = lines[target].replace('"allowed": false', '"allowed": true', 1)
    path.write_text("\n".join(lines) + "\n")
    r = client.get("/api/audit/verify").json()
    assert r["ok"] is False and r["broken_seq"] == json.loads(lines[target])["seq"]


@pytest.mark.parametrize("text,notice_part", [
    ("how do I change the oil in my truck", "No authorized procedure matches"),
    ("what tire pressure should I run", "No authorized procedure matches"),
    # A DDG has gas turbine generators, so diesel generator questions are about another ship class.
    ("low lube oil pressure on number two SSDG", "ship service diesel generator"),
    ("EDG low lube oil pressure", "emergency diesel generator"),
    ("boiler water level out of sight", "boiler"),
    ("pizza for lunch", "No authorized procedure matches"),
])
def test_out_of_scope_questions_get_no_procedure(client, text, notice_part):
    r = client.post("/api/query", json={"operator_id": OP, "text": text}).json()
    assert r["procedure"] is None and r["steps"] == []
    assert r["confidence"] == "none" and notice_part in r["notice"]


def test_overlapping_symptoms_are_flagged_ambiguous(client):
    # Low pressure and a failed pump look the same from the console; the Sailor confirms which.
    r = client.post("/api/query", json={"operator_id": OP, "text": "MRG LO pressure dropping on shaft 2"}).json()
    assert r["confidence"] == "ambiguous"
    assert {r["procedure"]["procedure_id"], r["alternates"][0]["procedure_id"]} == {"EOCC-MRG-LLOP", "EOCC-MRG-LOPF"}


def test_clear_questions_are_marked_clear(client):
    r = client.post("/api/query", json={"operator_id": OP, "text": "low lube oil pressure on number two SSGTG"}).json()
    assert r["confidence"] == "clear" and r["notice"] is None


def test_health_names_the_target_and_models(client):
    h = client.get("/api/health").json()
    assert h["target"] in ("local", "cloudflare")
    assert set(h["models"]) == {"embed", "transcribe", "rewrite", "rerank"}
    assert h["offline"] is (h["target"] == "local" and all(v == "off" or v.startswith("local:") for v in h["models"].values()))
