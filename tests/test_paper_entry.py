"""Steps done on a printed checklist and typed in later: logged as paper, with the sheet's fields, under the same policy."""
import os

import pytest
from fastapi.testclient import TestClient

OP = "EOOW-01"

# Reads single entries through /api/audit/{seq}, which only the local app has.
pytestmark = pytest.mark.skipif(bool(os.environ.get("WSC_BASE_URL")), reason="local backend only")


@pytest.fixture(scope="module")
def client():
    from main import app
    with TestClient(app) as c:
        c.post("/api/reset", json={"operator_id": OP})
        yield c
        # The audit log is shared across test files, and replay would carry these acknowledgements over.
        c.post("/api/reset", json={"operator_id": OP})


def _procedure(client):
    client.post("/api/reset", json={"operator_id": OP})
    example = client.get("/api/health").json()["dataset"]["examples"][0]
    r = client.post("/api/query", json={"operator_id": OP, "text": example}).json()
    assert r["procedure"], f"the dataset's own example found nothing: {example!r}"
    return r


def _ack(client, q, step_id, **paper):
    return client.post("/api/action", json={"operator_id": OP, "procedure_id": q["procedure"]["procedure_id"],
                                            "step_id": step_id} | paper)


def test_paper_step_logs_the_sheet_fields(client):
    q = _procedure(client)
    first = q["steps"][0]["step_id"]
    a = _ack(client, q, first, source="paper", sheet="q-0001", reading=" 18 psig ", done_at="14:32", note="").json()
    assert a["allowed"]
    p = client.get(f"/api/audit/{a['audit']['seq']}").json()["entry"]["payload"]
    assert p["source"] == "paper" and p["sheet"] == "q-0001" and p["reading"] == "18 psig" and p["done_at"] == "14:32"
    assert "note" not in p, "an empty field is left out of the payload"
    assert p["summary"] == f"acknowledge {first} from paper: allowed"


def test_screen_step_logs_as_before(client):
    q = _procedure(client)
    a = _ack(client, q, q["steps"][0]["step_id"]).json()
    p = client.get(f"/api/audit/{a['audit']['seq']}").json()["entry"]["payload"]
    assert set(p) == {"summary", "procedure_id", "step_id", "allowed", "reason"}


def test_paper_step_out_of_order_is_blocked(client):
    q = _procedure(client)
    locked = next((s for s in q["steps"] if s["state"] == "locked"), None)
    if locked is None:
        pytest.skip("the example procedure has no locked step")
    a = _ack(client, q, locked["step_id"], source="paper", sheet="q-0001").json()
    assert not a["allowed"] and "requires" in a["reason"]


@pytest.mark.parametrize("bad", [{"source": "radio"}, {"note": "x" * 501}, {"reading": "x" * 201}])
def test_bad_paper_fields_are_rejected(client, bad):
    q = _procedure(client)
    assert _ack(client, q, q["steps"][0]["step_id"], **bad).status_code == 422
