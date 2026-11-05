"""The example chips: every chip finds its procedure as a clear match, the log is counted but never quoted,
and an empty log and cache give the dataset's fixed examples. Local backend, ddg dataset."""
import os
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import examples
from config import DATASET, DATASET_NAME

pytestmark = pytest.mark.skipif(bool(os.environ.get("WSC_BASE_URL")) or DATASET_NAME != "ddg",
                                reason="local backend serving ddg only")

NOW = datetime(2026, 11, 5, 12, 0, tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def chips():
    from retrieval.indexer import ensure_index
    from retrieval.search import Retriever
    ensure_index()
    return examples.Chips(Retriever(), DATASET["examples"])


def query(pid: str, text: str = "words a person typed", days_ago: float = 1) -> dict:
    ts = (NOW - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%S%z")
    return {"event": "query", "ts": ts, "payload": {"text": text, "procedure_id": pid}}


def casrep(serial: str, pids: list[str], status: str = "open") -> dict:
    return {"serial": serial, "status": status, "procedure_ids": pids}


def test_every_procedure_has_a_chip_from_its_own_symptoms(chips):
    # A chip may show for any procedure, so each one needs a phrase the corpus holds and the search agrees with.
    for pid, p in chips.r.procedures.items():
        text = chips.phrase(pid)
        assert text in p["symptoms"], f"{pid} has no symptom that finds it as a clear match"
        found = chips.r.search(text)
        assert (found["confidence"], found["candidates"][0]["procedure_id"]) == ("clear", pid)


def test_fixed_examples_are_clear_matches(chips):
    for text in DATASET["examples"]:
        found = chips.r.search(text)
        assert found["confidence"] == "clear", f"{text!r} is {found['confidence']}"


def test_empty_log_and_cache_give_the_fixed_examples(chips):
    picked = chips.pick([], [], NOW)
    assert [c["text"] for c in picked] == DATASET["examples"]
    assert {c["reason"] for c in picked} == {"example"}


def test_open_then_often_then_fixed_and_no_logged_words(chips):
    secret = "EOOW Smith says the GTM oil is low again"
    log = [query("EOCC-GTM-LLOP", secret)] * 4 + [query("EOCC-GTM-HVIB")] * 2 + [query("EOCC-AIR-LOSP")]
    cache = [casrep("N99999/0103", ["EOCC-AC-CHWL"]), casrep("N99999/0101", ["EOCC-SSGTG-HLOT"], "corrected")]
    picked = chips.pick(log, cache, NOW)
    assert [(c["procedure_id"], c["reason"]) for c in picked[:3]] == [
        ("EOCC-AC-CHWL", "open"), ("EOCC-GTM-LLOP", "often"), ("EOCC-GTM-HVIB", "often")]
    assert picked[0]["serial"] == "N99999/0103" and picked[1]["count"] == 4
    # A closed CASREP and a procedure asked once give no chip; the rest fill from the fixed list.
    assert {c["procedure_id"] for c in picked}.isdisjoint({"EOCC-SSGTG-HLOT", "EOCC-AIR-LOSP"})
    assert [c["reason"] for c in picked[3:]] == ["example"] * 3
    assert len(picked) == examples.MAX_CHIPS
    assert all(c["text"] != secret for c in picked)
    assert len({c["procedure_id"] for c in picked}) == len(picked)


def test_window_and_other_events_are_not_counted():
    ids = {"EOCC-GTM-LLOP", "EOCC-GTM-HVIB"}
    action = {"event": "action", "ts": query("x")["ts"], "payload": {"procedure_id": "EOCC-GTM-HVIB"}}
    log = [query("EOCC-GTM-LLOP", days_ago=40)] * 5 + [action] * 3 + [query("WH-146241")] * 3
    assert examples.often(log, ids, NOW) == []


def test_a_fixed_example_for_a_chosen_procedure_is_skipped(chips):
    first = DATASET["examples"][0]
    pid = chips.fixed_procedure(first)
    picked = chips.pick([], [casrep("N99999/0200", [pid])], NOW)
    assert picked[0]["procedure_id"] == pid and picked[0]["reason"] == "open"
    assert first not in [c["text"] for c in picked]


def test_the_route_logs_nothing():
    from main import app, state
    with TestClient(app) as client:
        before = len(state["audit"].entries())
        body = client.get("/api/examples").json()
        assert body["window_days"] == examples.WINDOW_DAYS
        assert body["examples"] and all(c["reason"] in ("open", "often", "example") for c in body["examples"])
        assert len(state["audit"].entries()) == before
