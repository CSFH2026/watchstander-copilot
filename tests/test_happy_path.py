"""The demo script as tests. If this file passes, the five demo beats work."""
import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    from main import app
    with TestClient(app) as c:
        yield c


OP = "EOOW-01"


@pytest.mark.parametrize("text,expected", [
    ("low lube oil pressure on number two SSDG", "EOCC-SSDG-LLOP"),
    ("high jacket water temp on number three SSDG", "EOCC-SSDG-HJWT"),
    ("loss of fuel oil pressure, engine hunting", "EOCC-SSDG-LFOP"),
    ("LO pressure dropping on 1A generator", "EOCC-SSDG-LLOP"),
])
def test_symptom_finds_its_procedure(client, text, expected):
    r = client.post("/api/query", json={"operator_id": OP, "text": text}).json()
    assert r["procedure"]["procedure_id"] == expected
    assert r["procedure"]["source"].startswith("COMSCINST 3541.6A")
    assert len(r["steps"]) == 9 and r["steps"][0]["state"] == "next"
    assert r["latency_ms"] < 5000
    assert r["audit"]["signer"] == "copilot-node-01"


def test_off_topic_question_gets_no_procedure(client):
    r = client.post("/api/query", json={"operator_id": OP, "text": "pizza for lunch"}).json()
    assert r["procedure"] is None and r["steps"] == []


def test_guardrail_blocks_out_of_order_then_allows_in_order(client):
    client.post("/api/reset", json={"operator_id": OP})
    pid = "EOCC-SSDG-LLOP"
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
    r = client.post("/api/action", json={"operator_id": OP, "procedure_id": "EOCC-SSDG-LLOP", "step_id": "EOCC-XXX-99"}).json()
    assert r["allowed"] is False and "not a step in any authorized procedure" in r["reason"]
    r = client.post("/api/action", json={"operator_id": OP, "procedure_id": "EOCC-SSDG-LLOP", "step_id": "EOCC-SSDG-HJWT-01"}).json()
    assert r["allowed"] is False and "not the active procedure" in r["reason"]


def test_unknown_operator_is_refused(client):
    assert client.post("/api/query", json={"operator_id": "MALLORY", "text": "low lube oil"}).status_code == 400


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
    ("gas turbine generator fire in the module", "gas turbine generator"),
    ("main reduction gear low lube oil pressure", "main reduction gear"),
    ("EDG low lube oil pressure", "emergency diesel generator"),
    ("pizza for lunch", "No authorized procedure matches"),
])
def test_out_of_scope_questions_get_no_procedure(client, text, notice_part):
    r = client.post("/api/query", json={"operator_id": OP, "text": text}).json()
    assert r["procedure"] is None and r["steps"] == []
    assert r["confidence"] == "none" and notice_part in r["notice"]


def test_overlapping_symptoms_are_flagged_ambiguous(client):
    r = client.post("/api/query", json={"operator_id": OP, "text": "the generator is overheating"}).json()
    assert r["confidence"] == "ambiguous"
    assert {r["procedure"]["procedure_id"], r["alternates"][0]["procedure_id"]} == {"EOCC-SSDG-HJWT", "EOCC-SSDG-LLOP"}


def test_clear_questions_are_marked_clear(client):
    r = client.post("/api/query", json={"operator_id": OP, "text": "low lube oil pressure on number two SSDG"}).json()
    assert r["confidence"] == "clear" and r["notice"] is None
