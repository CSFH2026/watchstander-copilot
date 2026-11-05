"""Checklist completion feedback is saved as a signed audit event on the run."""
import os

import pytest
from fastapi.testclient import TestClient

OP = "EOOW-01"

pytestmark = pytest.mark.skipif(bool(os.environ.get("WSC_BASE_URL")), reason="local backend only")


@pytest.fixture(scope="module")
def client():
    from main import app
    with TestClient(app) as c:
        c.post("/api/reset", json={"operator_id": OP})
        yield c
        c.post("/api/reset", json={"operator_id": OP})


def _query(client):
    client.post("/api/reset", json={"operator_id": OP})
    r = client.post("/api/query", json={"operator_id": OP, "text": "low lube oil pressure on number two SSGTG"}).json()
    assert r["procedure"]
    return r


def _ack_all(client, q):
    pid = q["procedure"]["procedure_id"]
    latest = q
    for step in q["steps"]:
        latest = client.post("/api/action", json={"operator_id": OP, "procedure_id": pid, "step_id": step["step_id"]}).json()
        assert latest["allowed"], latest["reason"]
    return latest


def test_outcome_requires_a_completed_checklist(client):
    q = _query(client)
    r = client.post("/api/outcome", json={
        "operator_id": OP,
        "query_id": q["query_id"],
        "procedure_id": q["procedure"]["procedure_id"],
        "outcome": "fully_resolved",
    })
    assert r.status_code == 409
    assert "Checklist is not complete" in r.json()["detail"]


def test_completed_checklist_outcome_is_signed_with_the_run(client):
    q = _query(client)
    _ack_all(client, q)
    r = client.post("/api/outcome", json={
        "operator_id": OP,
        "query_id": q["query_id"],
        "procedure_id": q["procedure"]["procedure_id"],
        "outcome": "partially_resolved",
        "note": "  Bearing noise improved; leak still present.  ",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["query_id"] == q["query_id"]
    assert body["outcome"] == "partially_resolved"
    assert body["note"] == "Bearing noise improved; leak still present."
    assert body["audit"]["signer"] == OP

    payload = client.get(f"/api/audit/{body['audit']['seq']}").json()["entry"]["payload"]
    assert payload == {
        "summary": f"outcome {q['query_id']} partially_resolved",
        "query_id": q["query_id"],
        "procedure_id": q["procedure"]["procedure_id"],
        "outcome": "partially_resolved",
        "note": "Bearing noise improved; leak still present.",
    }
    assert client.get("/api/audit/verify").json()["ok"] is True

    original_seq = body["audit"]["seq"]
    assert client.get("/api/outcome", params={"query_id": q["query_id"]}).json()["audit"]["seq"] == original_seq
    correction = client.post("/api/outcome/correction", json={
        "operator_id": OP, "corrects_seq": original_seq,
        "outcome": "unresolved", "note": "  Leak remains; corrected outcome.  ",
    })
    assert correction.status_code == 200, correction.text
    corrected = correction.json()
    assert corrected["outcome"] == "unresolved"
    assert corrected["note"] == "Leak remains; corrected outcome."
    assert corrected["corrects_seq"] == original_seq
    assert corrected["audit"]["signer"] == OP
    corrected_entry = client.get(f"/api/audit/{corrected['audit']['seq']}").json()["entry"]
    assert corrected_entry["event"] == "outcome_correction"
    assert corrected_entry["payload"] == {
        "summary": f"correct outcome {q['query_id']} #{original_seq}",
        "query_id": q["query_id"], "procedure_id": q["procedure"]["procedure_id"],
        "outcome": "unresolved", "corrects_seq": original_seq,
        "note": "Leak remains; corrected outcome.",
    }
    assert client.get(f"/api/audit/{original_seq}").json()["entry"]["payload"] == payload
    assert client.get("/api/outcome", params={"query_id": q["query_id"]}).json()["audit"]["seq"] == corrected["audit"]["seq"]

    assert client.post("/api/outcome/correction", json={
        "operator_id": OP, "corrects_seq": original_seq,
        "outcome": "fully_resolved", "note": "stale",
    }).status_code == 409
    assert client.post("/api/outcome/correction", json={
        "operator_id": OP, "corrects_seq": corrected["audit"]["seq"],
        "outcome": "unresolved", "note": "Leak remains; corrected outcome.",
    }).status_code == 409
    assert client.post("/api/outcome/correction", json={
        "operator_id": "EOOW-02", "corrects_seq": corrected["audit"]["seq"],
        "outcome": "fully_resolved", "note": "not my entry",
    }).status_code == 422
    assert client.post("/api/outcome/correction", json={
        "operator_id": OP, "corrects_seq": int(q["query_id"][2:]),
        "outcome": "fully_resolved", "note": "not an outcome entry",
    }).status_code == 422
    assert client.post("/api/outcome/correction", json={
        "operator_id": OP, "corrects_seq": corrected["audit"]["seq"],
        "outcome": "fixed", "note": "invalid choice",
    }).status_code == 422
    assert client.post("/api/outcome/correction", json={
        "operator_id": OP, "corrects_seq": corrected["audit"]["seq"],
        "outcome": "unresolved", "note": "x" * 501,
    }).status_code == 422

    cleared = client.post("/api/outcome/correction", json={
        "operator_id": OP, "corrects_seq": corrected["audit"]["seq"],
        "outcome": "unresolved", "note": "  ",
    })
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["note"] is None
    assert "note" not in client.get(f"/api/audit/{cleared.json()['audit']['seq']}").json()["entry"]["payload"]
    assert client.get("/api/outcome", params={"query_id": q["query_id"]}).json()["note"] is None
    assert client.get("/api/audit/verify").json()["ok"] is True

    duplicate = client.post("/api/outcome", json={
        "operator_id": OP, "query_id": q["query_id"],
        "procedure_id": q["procedure"]["procedure_id"], "outcome": "fully_resolved",
    })
    assert duplicate.status_code == 409


@pytest.mark.parametrize("bad", [
    {"outcome": "fixed"},
    {"note": "x" * 501, "outcome": "unresolved"},
])
def test_bad_outcome_fields_are_rejected(client, bad):
    q = _query(client)
    _ack_all(client, q)
    assert client.post("/api/outcome", json={
        "operator_id": OP,
        "query_id": q["query_id"],
        "procedure_id": q["procedure"]["procedure_id"],
        **bad,
    }).status_code == 422
