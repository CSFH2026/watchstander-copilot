"""Request fields are bounded, and the policy check and its audit entry are one step.

Findings 10fffa64 and 3c69947a of the Nov 5 security review. Set WSC_BASE_URL to run the limit checks
against another backend that speaks docs/CONTRACTS.md, such as the cloud twin under `make run`.
"""
import os
import threading

import pytest
from fastapi.testclient import TestClient

BASE_URL = os.environ.get("WSC_BASE_URL")
OP = "EOOW-02"
PROC, STEP1 = "EOCC-SSGTG-LLOP", "EOCC-SSGTG-LLOP-01"


@pytest.fixture(scope="module")
def client():
    if BASE_URL:
        import httpx
        with httpx.Client(base_url=BASE_URL, timeout=30) as c:
            yield c
        return
    from main import app
    with TestClient(app) as c:
        yield c


def _audit_top(client) -> int:
    return client.get("/api/audit", params={"limit": 1}).json()["entries"][0]["seq"]


def test_ids_at_the_limit_are_checked_by_policy_not_refused(client):
    r = client.post("/api/action", json={"operator_id": OP, "procedure_id": "P" * 80, "step_id": "S" * 80})
    assert r.status_code == 200 and r.json()["allowed"] is False


@pytest.mark.parametrize("field", ["procedure_id", "step_id"])
def test_an_overlong_id_is_refused_and_not_logged(client, field):
    client.post("/api/reset", json={"operator_id": OP})
    top = _audit_top(client)
    body = {"operator_id": OP, "procedure_id": PROC, "step_id": STEP1} | {field: "X" * 81}
    assert client.post("/api/action", json=body).status_code == 422
    assert _audit_top(client) == top


@pytest.mark.parametrize("route,body", [
    ("/api/query", {"text": "low lube oil pressure"}),
    ("/api/action", {"procedure_id": PROC, "step_id": STEP1}),
    ("/api/reset", {}),
])
def test_an_overlong_operator_is_refused(client, route, body):
    assert client.post(route, json={"operator_id": "E" * 41} | body).status_code == 422


def test_an_unknown_operator_within_the_limit_is_still_a_400(client):
    assert client.post("/api/reset", json={"operator_id": "EOOW-99"}).status_code == 400


def test_an_overlong_input_label_is_refused(client):
    r = client.post("/api/query", json={"operator_id": OP, "text": "low lube oil pressure", "input": "v" * 21})
    assert r.status_code == 422


@pytest.mark.skipif(bool(BASE_URL), reason="the thread race is about the laptop server's worker threads")
def test_concurrent_clicks_on_one_step_allow_it_once(client):
    client.post("/api/reset", json={"operator_id": OP})
    client.post("/api/query", json={"operator_id": OP, "text": "low lube oil pressure on number two SSGTG"})
    results, start = [], threading.Barrier(8)

    def click():
        start.wait()
        results.append(client.post("/api/action", json={"operator_id": OP, "procedure_id": PROC, "step_id": STEP1}).json())

    threads = [threading.Thread(target=click) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sum(r["allowed"] for r in results) == 1
    # The entry seqs follow the order of the decisions: the one allowed click is logged before any refusal of it.
    allowed_seq = next(r["audit"]["seq"] for r in results if r["allowed"])
    assert all(r["audit"]["seq"] > allowed_seq for r in results if not r["allowed"])
    client.post("/api/reset", json={"operator_id": OP})
