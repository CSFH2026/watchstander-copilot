"""One copilot run in the audit log mapped to the CASREP Board's create body, from the screen and from make casrep. No network."""
import importlib.util
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import casrep

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("casrep_cli", ROOT / "scripts" / "casrep.py")
cli = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cli)

OP = "EOOW-02"
CORPUS = ROOT / "corpus" / "ddg"
CFG = {"CASREP_URL": casrep.DEFAULT_URL, **casrep.DEFAULTS}
VERIFIED = {"ok": True, "entries": 9}

# Drives the local app to write a real signed run.
pytestmark = pytest.mark.skipif(bool(os.environ.get("WSC_BASE_URL")), reason="local backend only")


def _entry(seq, event, payload, actor=OP, ts="2026-11-04T14:15:02-0500"):
    return {"seq": seq, "ts": ts, "actor": actor, "event": event, "payload": payload, "hash": f"{seq:064x}"}


def _q(seq, pid="EOCC-SSGTG-LLOP", text="low lube oil pressure on number two SSGTG", **kw):
    return _entry(seq, "query", {"summary": f'query "{text}" -> {pid} (clear)', "text": text, "input": "typed",
                                 "procedure_id": pid}, **kw)


def _a(seq, step, allowed=True, pid="EOCC-SSGTG-LLOP", **extra):
    return _entry(seq, "action", {"procedure_id": pid, "step_id": f"{pid}-{step}", "allowed": allowed,
                                  "reason": "ok" if allowed else f"Blocked: step {step} requires step 04 first."} | extra)


def _has(pid):
    return (CORPUS / f"{pid}.md").exists()


def test_dtg_is_utc_navy_form():
    assert casrep.dtg("2026-11-04T14:15:02-0500") == "041915Z NOV 26"
    assert casrep.dtg("2026-12-31T22:00:00-0500") == "010300Z JAN 27"


def test_query_id_forms():
    assert casrep.parse_query_id("q-0003") == 3
    assert casrep.parse_query_id("12") == 12
    with pytest.raises(casrep.CasrepError):
        casrep.parse_query_id("EOCC-SSGTG-LLOP")


def test_run_window_stops_at_reset_and_keeps_paper_from_its_sheet():
    entries = [_q(1), _a(2, "01"), _a(3, "05", allowed=False), _a(4, "02"),
               _entry(5, "action", {"procedure_id": "EOCC-SSGTG-LLOP", "step_id": "EOCC-SSGTG-LLOP-03", "allowed": True},
                      actor="EOOW-01"),
               _entry(6, "reset", {"summary": "drill reset"}),
               _a(7, "01"),
               _a(8, "03", source="paper", sheet="q-0001", reading="18 psig", done_at="14:32")]
    run = casrep.find_run(entries, 1, _has)
    assert [e["seq"] for e in run["done"]] == [2, 4, 8]
    assert [e["seq"] for e in run["blocked"]] == [3]


def test_newest_run_with_a_step_is_the_default():
    entries = [_q(1), _a(2, "01"), _q(3, pid="WH-146241", text="replace the battery"), _q(4, pid="EOCC-AC-CHWL")]
    assert casrep.find_run(entries, None, _has)["query"]["seq"] == 1
    with pytest.raises(casrep.CasrepError, match="not a ddg casualty"):
        casrep.find_run(entries, 3, _has)
    with pytest.raises(casrep.CasrepError, match="not a query"):
        casrep.find_run(entries, 2, _has)


def test_field_mapping():
    entries = [_q(3), _a(4, "01"), _a(5, "05", allowed=False),
               _a(6, "02", source="paper", sheet="q-0003", reading="18 psig", done_at="14:32", note="Leak at the filter")]
    run = casrep.find_run(entries, 3, _has)
    proc = casrep.load_procedure(CORPUS, "EOCC-SSGTG-LLOP")
    c = casrep.build(run, proc, VERIFIED, CFG)

    assert c["report_type"] == "INITIAL"
    assert c["serial"] == "N99999/0003" and c["uic"] == "N99999" and c["unit"] == "USS EXAMPLE (DDG 999)"
    assert c["dtg"] == "041915Z NOV 26"
    assert c["equipment"] == f"{proc['system']}: {proc['title']}"
    assert c["poc_name"] == c["actor_name"] == OP
    assert (c["category"], c["mission_areas"], c["assistance"], c["parts"], c["etr"], c["eic"]) == (2, ["MOB"], "none", [], None, None)
    assert '"low lube oil pressure on number two SSGTG"' in c["description"]
    assert f"Actions taken (2 of {len(proc['steps'])} steps)" in c["description"]
    assert "(on screen; audit #4)" in c["description"]
    assert "(paper sheet q-0003, done 14:32, reading 18 psig, note: Leak at the filter; audit #6)" in c["description"]
    assert "Steps not yet done: 03" in c["description"]
    assert "#5 05: Blocked" in c["remarks"] and "Audit chain verified: 9 entries." in c["remarks"]
    # Exactly the board's create fields: an unknown key is a 400 there.
    assert set(c) == {"serial", "unit", "uic", "report_type", "category", "dtg", "equipment", "eic", "description",
                      "mission_areas", "parts", "assistance", "etr", "remarks", "poc_name", "poc_contact", "actor_name"}


def test_overrides_and_board_limits():
    run = casrep.find_run([_q(12345), _a(12346, "01")], 12345, _has)
    proc = casrep.load_procedure(CORPUS, "EOCC-SSGTG-LLOP")
    c = casrep.build(run, proc | {"symptoms": ["x" * 5000]}, VERIFIED, CFG,
                     {"category": 4, "mission_areas": ["MOB", "AAW"], "equipment": "SSDG 2 " + "y" * 200, "poc_name": "MM1 Lee"})
    assert c["serial"] == "N99999/2345"
    assert (c["category"], c["mission_areas"], c["poc_name"]) == (4, ["MOB", "AAW"], "MM1 Lee")
    assert len(c["equipment"]) == 120 and len(c["description"]) == 4000


def test_board_calls_name_the_copilot(monkeypatch):
    seen = []

    def fake_urlopen(req, timeout):
        seen.append(req)
        raise urllib.error.URLError("offline")
    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    with pytest.raises(casrep.CasrepError, match="cannot reach the CASREP Board at https://board.test"):
        casrep.send({}, "https://board.test", "k")
    # Cloudflare answers Python's default User-Agent with error 1010 before the board sees the request.
    assert seen[0].get_header("User-agent") == casrep.USER_AGENT and seen[0].get_header("X-admin-api-key") == "k"


def test_settings_env_beats_local_file(tmp_path):
    f = tmp_path / ".casrep.local"
    f.write_text("# local board\nCASREP_URL=http://localhost:9999\nCASREP_KEY='from-file'\nCASREP_UIC=N12345\n")
    s = casrep.settings({"CASREP_KEY": "from-env", "PATH": "/bin"}, f)
    assert (s["CASREP_URL"], s["CASREP_KEY"], s["CASREP_UIC"]) == ("http://localhost:9999", "from-env", "N12345")
    assert "PATH" not in s and s["CASREP_UNIT"] == casrep.DEFAULTS["CASREP_UNIT"]


def test_dry_run_from_a_real_signed_run_sends_nothing(tmp_path, monkeypatch, capsys):
    from config import AUDIT_PATH
    from main import app
    with TestClient(app) as client:
        client.post("/api/reset", json={"operator_id": OP})
        q = client.post("/api/query", json={"operator_id": OP, "text": "low lube oil pressure on number two SSGTG"}).json()
        pid = q["procedure"]["procedure_id"]
        first, second = q["steps"][0]["step_id"], q["steps"][1]["step_id"]
        client.post("/api/action", json={"operator_id": OP, "procedure_id": pid, "step_id": first})
        client.post("/api/action", json={"operator_id": OP, "procedure_id": pid, "step_id": second, "source": "paper",
                                         "sheet": q["query_id"], "reading": "18 psig"})
        client.post("/api/reset", json={"operator_id": OP})

    def no_network(*_a, **_k):
        raise AssertionError("a dry run must not touch the network")
    monkeypatch.setattr(urllib.request, "urlopen", no_network)
    monkeypatch.setenv("CASREP_KEY", "never-printed-key")
    out = tmp_path / "draft.json"
    assert cli.main(["--query", q["query_id"], "--log", str(AUDIT_PATH), "--dry-run", "--out", str(out)]) == 0
    c = json.loads(out.read_text())
    assert c["poc_name"] == OP and f"{pid}" in c["description"]
    assert f"(paper sheet {q['query_id']}, reading 18 psig; audit #" in c["description"]
    assert "never-printed-key" not in capsys.readouterr().out + out.read_text()


@pytest.fixture()
def run_client(monkeypatch):
    """The local app with one finished run: step 01 on screen, step 05 blocked, step 02 from paper."""
    monkeypatch.setenv("CASREP_KEY", "never-printed-key")
    monkeypatch.setenv("CASREP_URL", "http://board.test")
    from main import app
    with TestClient(app) as client:
        client.post("/api/reset", json={"operator_id": OP})
        q = client.post("/api/query", json={"operator_id": OP, "text": "low lube oil pressure on number two SSGTG"}).json()
        pid = q["procedure"]["procedure_id"]
        ack = lambda step, **paper: client.post("/api/action", json={"operator_id": OP, "procedure_id": pid,
                                                                      "step_id": f"{pid}-{step}"} | paper)
        ack("01")
        ack("05")
        ack("02", source="paper", sheet=q["query_id"], reading="18 psig")
        yield client, q
        client.post("/api/reset", json={"operator_id": OP})


def test_health_names_the_board_but_never_the_key(run_client):
    client, _ = run_client
    h = client.get("/api/health").json()
    assert h["casrep"] == {"url": "http://board.test", "ready": True}
    assert "never-printed-key" not in json.dumps(h)


def test_draft_route_is_offline_and_maps_the_run(run_client, monkeypatch):
    client, q = run_client
    monkeypatch.setattr(urllib.request, "urlopen", lambda *a, **k: (_ for _ in ()).throw(AssertionError("draft went online")))
    d = client.get("/api/casrep/draft", params={"query_id": q["query_id"]}).json()
    assert d["query_id"] == q["query_id"] and d["sent"] is None and d["board"]["ready"]
    assert "Actions taken (2 of" in d["casrep"]["description"] and "(paper sheet " + q["query_id"] in d["casrep"]["description"]
    assert "05: Blocked" in d["casrep"]["remarks"]
    assert client.get("/api/casrep/draft", params={"query_id": "q-99999"}).status_code == 422


def test_send_route_posts_once_and_signs_the_send(run_client, monkeypatch):
    client, q = run_client
    sent = []

    def fake_submit(body, cfg):
        sent.append(body)
        return {"id": "abc", "serial": body["serial"], "link": "http://board.test/casrep/?id=abc", "board": cfg["CASREP_URL"], "casrep": body}
    monkeypatch.setattr(casrep, "submit", fake_submit)
    choices = {"operator_id": OP, "query_id": q["query_id"], "category": 3, "mission_areas": ["MOB", "AAW"],
               "assistance": "parts", "equipment": "SSGTG 2", "poc_name": "GSM2 Rivera"}
    r = client.post("/api/casrep/send", json=choices)
    assert r.status_code == 200, r.text
    body = sent[0]
    assert (body["category"], body["mission_areas"], body["assistance"], body["equipment"], body["poc_name"]) == (
        3, ["MOB", "AAW"], "parts", "SSGTG 2", "GSM2 Rivera")
    entry = client.get(f"/api/audit/{r.json()['audit']['seq']}").json()
    assert entry["entry"]["event"] == "casrep" and entry["entry"]["signer"] == OP and all(entry["checks"].values())
    assert entry["entry"]["payload"]["query_id"] == q["query_id"]
    assert "never-printed-key" not in json.dumps(entry)
    assert client.get("/api/audit/verify").json()["ok"]

    again = client.post("/api/casrep/send", json=choices)
    assert again.status_code == 409 and len(sent) == 1
    assert client.get("/api/casrep/draft", params={"query_id": q["query_id"]}).json()["sent"]["serial"] == body["serial"]


def test_send_route_refusals(run_client, monkeypatch):
    client, q = run_client
    base = {"operator_id": OP, "query_id": q["query_id"]}
    assert client.post("/api/casrep/send", json=base | {"mission_areas": ["ZZZ"]}).status_code == 422
    assert client.post("/api/casrep/send", json=base | {"category": 1}).status_code == 422

    def board_down(body, cfg):
        raise casrep.CasrepError("cannot reach the CASREP Board at http://board.test: refused")
    monkeypatch.setattr(casrep, "submit", board_down)
    r = client.post("/api/casrep/send", json=base)
    assert r.status_code == 502 and "Cannot reach the CASREP Board" in r.json()["detail"]

    monkeypatch.delenv("CASREP_KEY")
    monkeypatch.setattr(casrep, "LOCAL_FILE", ROOT / "no-such-file")
    assert client.post("/api/casrep/send", json=base).status_code == 400
