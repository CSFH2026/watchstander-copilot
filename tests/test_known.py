"""Known casualties: matching a procedure to open CASREPs, and the local cache of the board. No network."""
import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import casrep
import known

BOARD = json.loads((Path(__file__).parent / "fixtures" / "casrep_board.json").read_text())
CFG = {"CASREP_URL": "http://board.test", **casrep.DEFAULTS, "CASREP_READ_KEY": "read-key"}
SYSTEMS, ABBREVIATIONS = known.load_corpus_index()
TERMS = {pid: known.system_terms(s, ABBREVIATIONS) for pid, s in SYSTEMS.items()}

pytestmark = pytest.mark.skipif(bool(os.environ.get("WSC_BASE_URL")), reason="local backend only")


def fake_board(calls: list | None = None):
    """casrep._call against the fixture board: the list by scope, then each CASREP's detail."""
    by_id = {b["casrep"]["id"]: b for b in BOARD["bundles"]}

    def call(method, url, key, body=None):
        if calls is not None:
            calls.append((method, url, key))
        assert method == "GET", "the read side never writes to the board"
        path = url.split("/api/v1", 1)[1]
        if path.startswith("/casreps?"):
            active = "scope=active" in path
            return 200, {"casreps": [r for r in BOARD["rows"] if (r["status"] == "open") == active]}
        bundle = by_id.get(path.rsplit("/", 1)[1])
        return (200, bundle) if bundle else (404, {"message": "not found"})
    return call


def matches(procedure_id: str, equipment: str, text: str = "") -> str | None:
    c = known.summarize({"casrep": {"id": "x", "serial": "N99999/0001", "current_step": 0, "status": "open"},
                         "versions": [{"equipment": equipment, "description": text}], "events": []}, "http://site")
    return known.match(procedure_id, TERMS[procedure_id], c, ABBREVIATIONS)


@pytest.mark.parametrize("procedure_id, equipment, expected", [
    ("EOCC-SSGTG-LLOP", "Gas Turbine Generator 1 Air Starter", "system"),     # GTG and the system's words agree
    ("EOCC-SSGTG-LLOP", "SSGTG 2 lube oil pump", "system"),                   # the abbreviation expands
    ("EOCC-SSGTG-LLOP", "Ship Service Diesel Generator 2", None),             # "ship service generator" is not enough
    ("EOCC-AC-CHWL", "AN/SPY-1D Chilled Water Pump 2", "system"),             # one part of "HVAC, chilled water, ..."
    ("EOCC-AC-CHWL", "Air Conditioning Plant 2", None),                       # a gap: no abbreviation ties A/C to HVAC
    ("EOCC-SSGTG-LLOP", "AN/SPS-67 Surface Search Radar", None),
])
def test_system_match(procedure_id, equipment, expected):
    assert matches(procedure_id, equipment) == expected


def test_procedure_match_comes_from_the_casrep_text():
    # Every CASREP the copilot drafts names its procedure; that beats any equipment wording.
    assert matches("EOCC-SSGTG-LLOP", "Number 2 generator", "Matched procedure EOCC-SSGTG-LLOP (clear match).") == "procedure"
    assert matches("EOCC-SSGTG-HLOT", "Number 2 generator", "Matched procedure EOCC-SSGTG-LLOP (clear match).") is None


def test_every_ddg_system_has_terms():
    assert len(SYSTEMS) == 103 and all(TERMS[pid] for pid in SYSTEMS)


def test_sync_caches_this_ship_and_reads_offline(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(casrep, "_call", fake_board(calls))
    k = known.KnownCasualties(tmp_path / "cache.sqlite")
    k.sync(CFG)
    assert all(key == "read-key" for _, _, key in calls)

    def offline(*_a, **_k):
        raise AssertionError("a read of the cache went to the board")
    monkeypatch.setattr(casrep, "_call", offline)
    snap = k.snapshot(CFG)
    assert [c["serial"] for c in snap["casreps"]] == ["N99999/0043", "N99999/0042", "N99999/0044"]  # open first, CAT 3 first; other ship gone
    assert not snap["stale"] and snap["error"] is None and snap["age_seconds"] < 5
    c42 = next(c for c in snap["casreps"] if c["serial"] == "N99999/0042")
    assert (c42["step_name"], c42["step_phrase"], c42["parts"][0]["qty"], c42["etr"]) == ("DH", "at DH review", 1, "2026-11-09")
    assert c42["link"] == "http://board.test/casrep/?id=" + c42["id"]
    closed = snap["casreps"][-1]
    assert (closed["status"], closed["closed_by"]) == ("corrected", "CASCOR")

    found = k.for_procedure("EOCC-SSGTG-LLOP", snap)
    assert [(c["serial"], c["match"]) for c in found] == [("N99999/0042", "procedure"), ("N99999/0043", "system")]
    # The steering CASREP matches EOCC-STR-LOSS by system, but a CASCOR closed it, so it is not a known casualty.
    assert k.for_procedure("EOCC-STR-LOSS", snap) == []


def test_a_board_outage_keeps_the_cache_and_says_stale(tmp_path, monkeypatch):
    monkeypatch.setattr(casrep, "_call", fake_board())
    k = known.KnownCasualties(tmp_path / "cache.sqlite")
    k.sync(CFG)

    def down(*_a, **_k):
        raise casrep.CasrepError("cannot reach the CASREP Board at http://board.test: refused")
    monkeypatch.setattr(casrep, "_call", down)
    k.sync(CFG)
    snap = k.snapshot(CFG)
    assert snap["stale"] and "cannot reach" in snap["error"] and len(snap["casreps"]) == 3


def test_no_read_key_never_calls_the_board(tmp_path, monkeypatch):
    monkeypatch.setattr(casrep, "_call", lambda *a, **k: pytest.fail("called the board without a key"))
    k = known.KnownCasualties(tmp_path / "cache.sqlite")
    cfg = {kk: v for kk, v in CFG.items() if kk != "CASREP_READ_KEY"}
    k.sync(cfg)
    snap = k.snapshot(cfg)
    assert snap["read"] is False and snap["stale"] and snap["casreps"] == [] and "read key" in snap["error"]


def test_routes_and_query_read_the_cache(monkeypatch):
    monkeypatch.setenv("CASREP_URL", "http://board.test")
    monkeypatch.setenv("CASREP_READ_KEY", "read-key")
    monkeypatch.setattr(casrep, "_call", fake_board())
    from main import app
    with TestClient(app) as client:
        assert client.get("/api/health").json()["casrep"]["read"] is True
        refreshed = client.post("/api/casreps/refresh").json()
        assert len(refreshed["casreps"]) == 3 and "_bundles" not in refreshed

        monkeypatch.setattr(casrep, "_call", lambda *a, **k: pytest.fail("a query or a read went to the board"))
        q = client.post("/api/query", json={"operator_id": "EOOW-02", "text": "low lube oil pressure on number two SSGTG"}).json()
        assert [(c["serial"], c["match"]) for c in q["known_casualties"]] == [("N99999/0042", "procedure"), ("N99999/0043", "system")]
        detail = client.get(f"/api/casreps/{q['known_casualties'][0]['id']}").json()
        assert detail["casrep"]["serial"] == "N99999/0042" and len(detail["events"]) == 2 and detail["versions"][0]["version_no"] == 1
        assert client.get("/api/casreps/no-such-id").status_code == 404
        off = client.post("/api/query", json={"operator_id": "EOOW-02", "text": "how do I bake bread"}).json()
        assert off["known_casualties"] == []
        client.post("/api/reset", json={"operator_id": "EOOW-02"})
