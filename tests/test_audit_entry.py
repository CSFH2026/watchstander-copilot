"""The entry view: one audit entry in full, with each check on its own, and the step that links to it."""
import json
import os

import pytest
from fastapi.testclient import TestClient

OP = "EOOW-01"

# The cloud backend has no per-entry route yet, so these run only against the local app.
pytestmark = pytest.mark.skipif(bool(os.environ.get("WSC_BASE_URL")), reason="local backend only")


@pytest.fixture(scope="module")
def client():
    from main import app
    with TestClient(app) as c:
        c.post("/api/reset", json={"operator_id": OP})
        yield c
        # The audit log is shared across test files, and replay would carry these acknowledgements over.
        c.post("/api/reset", json={"operator_id": OP})


def _first_procedure(client):
    """Any dataset works: ask its own first example question and use whatever it finds."""
    example = client.get("/api/health").json()["dataset"]["examples"][0]
    r = client.post("/api/query", json={"operator_id": OP, "text": example}).json()
    assert r["procedure"], f"the dataset's own example found nothing: {example!r}"
    return r


def test_acknowledged_step_links_to_its_entry(client):
    q = _first_procedure(client)
    first = q["steps"][0]
    assert first["state"] == "next" and first["audit_seq"] is None
    a = client.post("/api/action", json={"operator_id": OP, "procedure_id": q["procedure"]["procedure_id"],
                                         "step_id": first["step_id"]}).json()
    assert a["allowed"]
    step = next(s for s in a["steps"] if s["step_id"] == first["step_id"])
    assert step["state"] == "done" and step["audit_seq"] == a["audit"]["seq"]

    e = client.get(f"/api/audit/{a['audit']['seq']}").json()
    assert e["entry"]["payload"]["step_id"] == first["step_id"]
    assert e["entry"]["signer"] == OP
    assert e["checks"] == {"prev_link_ok": True, "payload_ok": True, "hash_ok": True, "signature_ok": True}


def test_blocked_action_entry_carries_the_reason(client):
    client.post("/api/reset", json={"operator_id": OP})
    q = _first_procedure(client)
    locked = next((s for s in q["steps"] if s["state"] == "locked"), None)
    if locked is None:
        pytest.skip("the example procedure has no locked step")
    a = client.post("/api/action", json={"operator_id": OP, "procedure_id": q["procedure"]["procedure_id"],
                                         "step_id": locked["step_id"]}).json()
    assert not a["allowed"]
    e = client.get(f"/api/audit/{a['audit']['seq']}").json()
    assert e["entry"]["payload"]["allowed"] is False
    assert e["entry"]["payload"]["reason"] == a["reason"]
    listed = client.get("/api/audit?limit=1").json()["entries"][0]
    assert listed["seq"] == a["audit"]["seq"] and listed["allowed"] is False and listed["step_id"] == locked["step_id"]


def test_unknown_seq_is_404_and_verify_still_routes(client):
    assert client.get("/api/audit/999999").status_code == 404
    assert client.get("/api/audit/verify").json()["ok"] is True


def test_check_entry_names_each_failed_check(tmp_path):
    from trust import keys
    from trust.audit import GENESIS, AuditLog, check_entry

    keys.ensure_identities()
    log = AuditLog(tmp_path / "log.jsonl")
    one = log.append(OP, "action", {"summary": "acknowledge X-01: allowed", "step_id": "X-01", "allowed": True}, signer=OP)
    two = log.append(OP, "action", {"summary": "acknowledge X-02: allowed", "step_id": "X-02", "allowed": True}, signer=OP)
    assert all(check_entry(two, one["hash"]).values())

    # The demo's tamper: edit a word in the payload of line 1.
    edited = json.loads(json.dumps(one))
    edited["payload"]["allowed"] = False
    checks = check_entry(edited, GENESIS)
    assert checks["payload_ok"] is False and checks["prev_link_ok"] is True and checks["signature_ok"] is True

    # Entry 2 points at the old hash of entry 1, so a rewritten entry 1 breaks the link.
    forged = dict(edited, payload_hash="0" * 64)
    assert check_entry(two, "f" * 64)["prev_link_ok"] is False
    assert check_entry(forged, GENESIS)["hash_ok"] is False
