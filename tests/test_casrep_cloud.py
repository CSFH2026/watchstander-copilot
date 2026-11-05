"""The cloud CASREP draft and send (cloud/src/casrep.ts) give what api/casrep.py gives, against a stand-in board.

The local app writes a real signed run. The same audit entries go into an in-memory D1, and the Pages Functions
code answers the same requests under Node (tests/cloud/run.mjs), with the bundle python -m retrieval.export builds.
The board is e2e/fake_board.py in a thread. Skips without Node 24, which runs TypeScript and has node:sqlite.
"""
import base64
import importlib.util
import json
import os
import re
import shutil
import subprocess
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import casrep
from config import AUDIT_PATH, KEYS_DIR
from trust import keys
from trust.audit import check_entry, verify_file

ROOT = Path(__file__).resolve().parent.parent
HARNESS = ROOT / "tests" / "cloud" / "run.mjs"
OP = "EOOW-02"
KEY = "originator-key-never-shown"


def _node_major() -> int:
    node = shutil.which("node")
    if not node:
        return 0
    out = subprocess.run([node, "--version"], capture_output=True, text=True).stdout
    return int(m.group(1)) if (m := re.match(r"v(\d+)", out)) else 0


pytestmark = [
    pytest.mark.skipif(bool(os.environ.get("WSC_BASE_URL")), reason="local backend only"),
    pytest.mark.skipif(_node_major() < 24, reason="needs Node 24 to run cloud/src under node:sqlite"),
]

_spec = importlib.util.spec_from_file_location("fake_board", ROOT / "e2e" / "fake_board.py")
fake_board = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fake_board)


@pytest.fixture()
def board():
    """The stand-in board on a free port, which takes a create only with the Originator key."""
    fake_board.ORIGINATOR_KEY = KEY
    fake_board.CREATED.clear()
    fake_board.SENT.clear()
    server = ThreadingHTTPServer(("127.0.0.1", 0), fake_board.Board)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


@pytest.fixture()
def run(board, monkeypatch, tmp_path_factory):
    """The local app with one finished run: step 01 on screen, step 05 blocked, step 02 from paper. Then the cloud bundle."""
    monkeypatch.setenv("CASREP_KEY", KEY)
    monkeypatch.setenv("CASREP_URL", board)
    monkeypatch.delenv("CASREP_SITE", raising=False)
    monkeypatch.setattr(casrep, "LOCAL_FILE", ROOT / "no-such-file")
    from main import app
    with TestClient(app) as client:
        client.post("/api/reset", json={"operator_id": OP})
        q = client.post("/api/query", json={"operator_id": OP, "text": "low lube oil pressure on number two SSGTG"}).json()
        pid = q["procedure"]["procedure_id"]
        ack = lambda step, **paper: client.post("/api/action", json={"operator_id": OP, "procedure_id": pid,
                                                                      "step_id": f"{pid}-{step}"} | paper)
        ack("01")
        ack("05")
        ack("02", source="paper", sheet=q["query_id"], reading="18 psig", note="strainer \"B\" fouled")
        yield client, q, _bundle(tmp_path_factory.mktemp("cloud") / "bundle.json")
        client.post("/api/reset", json={"operator_id": OP})


def _bundle(path: Path) -> Path:
    from retrieval import export
    bundle = export.build()["bundle"]
    # The cloud verifies against the laptop's keys here, since the run was signed on the laptop.
    bundle["roster"] = keys._roster()
    path.write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")
    return path


def _rows(path: Path = AUDIT_PATH) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _seed(identity: str) -> str:
    return base64.b64encode((KEYS_DIR / f"{identity}.key").read_bytes()).decode()


def cloud(bundle: Path, requests: list[dict], env: dict, rows: list[dict] | None = None) -> tuple[list[dict], list[dict]]:
    spec = {"rows": _rows() if rows is None else rows, "env": env, "requests": requests}
    out = subprocess.run(["node", "--experimental-transform-types", "--no-warnings", str(HARNESS)], input=json.dumps(spec),
                         capture_output=True, text=True, env=os.environ | {"WSC_CLOUD_BUNDLE": str(bundle)}, timeout=60)
    assert out.returncode == 0, out.stderr
    got = json.loads(out.stdout)
    return got["responses"], got["rows"]


def _env(board_url: str, key: str | None = KEY) -> dict:
    return {"CASREP_URL": board_url, **({"CASREP_KEY": key} if key else {}), f"WSC_KEY_{OP.replace('-', '_')}": _seed(OP)}


def _laptop_error(entries: list[dict], verified: dict, query_id: str) -> str:
    with pytest.raises(casrep.CasrepError) as err:
        casrep.draft(entries, verified, casrep.parse_query_id(query_id), casrep.settings())
    return str(err.value)[0].upper() + str(err.value)[1:] + "."


def test_cloud_draft_is_the_laptop_draft(run, board):
    client, q, bundle = run
    laptop = client.get("/api/casrep/draft", params={"query_id": q["query_id"]}).json()
    (got,), _ = cloud(bundle, [{"method": "GET", "path": f"/api/casrep/draft?query_id={q['query_id']}"}], _env(board))
    assert got["status"] == 200, got
    assert got["body"]["casrep"] == laptop["casrep"]
    assert got["body"]["query_id"] == laptop["query_id"] and got["body"]["sent"] is None
    assert got["body"]["board"] == {"url": board, "site": board, "ready": True}
    # The run itself is what the draft says it is, so the parity is over a real one.
    assert "Actions taken (2 of" in laptop["casrep"]["description"] and "reading 18 psig" in laptop["casrep"]["description"]
    assert "05: Blocked" in laptop["casrep"]["remarks"]
    assert fake_board.SENT == []


def test_cloud_send_posts_once_and_its_signed_entry_verifies_on_the_laptop(run, board):
    client, q, bundle = run
    seq = casrep.parse_query_id(q["query_id"])
    taken = f"N99999/{seq % 10000:04d}"
    # The draft's own serial is taken on the board, so the send moves to the next free number, as on the laptop.
    fake_board.CREATED.append({"id": "older", "serial": taken, "status": "open", "uic": "N99999"})
    choices = {"operator_id": OP, "query_id": q["query_id"], "category": 3, "mission_areas": ["MOB", "AAW"],
               "assistance": "parts", "equipment": "SSGTG 2", "poc_name": "GSM2 Rivera"}
    opts = {k: choices[k] for k in ("category", "mission_areas", "assistance", "equipment", "poc_name")}
    _, laptop = casrep.draft(_rows(), verify_file(AUDIT_PATH), seq, casrep.settings(), opts)

    (health, sent, again, after), rows = cloud(bundle, [
        {"method": "GET", "path": "/api/health"},
        {"method": "POST", "path": "/api/casrep/send", "body": choices},
        {"method": "POST", "path": "/api/casrep/send", "body": choices},
        {"method": "GET", "path": f"/api/casrep/draft?query_id={q['query_id']}"},
    ], _env(board))

    assert health["body"]["casrep"] == {"url": board, "site": board, "ready": True, "read": False, "drafts": True}
    assert sent["status"] == 200, sent
    assert len(fake_board.SENT) == 1
    post = fake_board.SENT[0]
    assert post["key"] == KEY and post["user_agent"].startswith("watchstander-copilot/")
    assert post["body"] == laptop | {"serial": f"N99999/{seq % 10000 + 1:04d}"}
    assert sent["body"]["serial"] == post["body"]["serial"] and sent["body"]["link"] == f"{board}/casrep/?id=fake-2"

    entry = rows[-1]
    assert entry["seq"] == sent["body"]["audit"]["seq"] and entry["event"] == "casrep" and entry["signer"] == OP
    assert entry["payload"] == {"summary": f"casrep {post['body']['serial']} sent for {q['query_id']}", "query_id": q["query_id"],
                                "procedure_id": q["procedure"]["procedure_id"], "serial": post["body"]["serial"],
                                "casrep_id": "fake-2", "board": board, "link": sent["body"]["link"], "report_type": "INITIAL",
                                "category": 3}
    # The table the cloud wrote is a log the laptop verifier accepts, cloud entry included.
    log = AUDIT_PATH.parent / "cloud-after-send.jsonl"
    log.write_text("".join(json.dumps(e, ensure_ascii=False) + "\n" for e in rows), encoding="utf-8")
    assert verify_file(log) == {"ok": True, "entries": len(rows)}
    assert all(check_entry(entry, rows[-2]["hash"]).values())

    assert again["status"] == 409 and "already sent as " + post["body"]["serial"] in again["body"]["detail"]
    assert after["body"]["sent"] == {"serial": post["body"]["serial"], "link": sent["body"]["link"], "audit_seq": entry["seq"]}
    assert KEY not in json.dumps([health, sent, again, after, rows])


def test_cloud_refuses_what_the_laptop_refuses(run, board):
    client, q, bundle = run
    qid = q["query_id"]
    draft = lambda query_id: {"method": "GET", "path": f"/api/casrep/draft?query_id={query_id}"}
    send = lambda **kw: {"method": "POST", "path": "/api/casrep/send", "body": {"operator_id": OP, "query_id": qid} | kw}

    (unknown, bad_area, bad_cat, bad_op), _ = cloud(bundle, [
        draft("q-99999"), send(mission_areas=["ZZZ"]), send(category=1), send(operator_id="EOOW-99")], _env(board))
    assert unknown["status"] == 422
    assert unknown["body"]["detail"] == client.get("/api/casrep/draft", params={"query_id": "q-99999"}).json()["detail"]
    assert (bad_area["status"], bad_cat["status"], bad_op["status"]) == (422, 422, 400)

    # A broken chain gives no draft, with the laptop's own sentence.
    rows = _rows()
    rows[1]["payload"]["summary"] += " (edited)"
    broken = AUDIT_PATH.parent / "broken.jsonl"
    broken.write_text("".join(json.dumps(e, ensure_ascii=False) + "\n" for e in rows), encoding="utf-8")
    (got,), _ = cloud(bundle, [draft(qid)], _env(board), rows)
    assert got["status"] == 422 and got["body"]["detail"] == _laptop_error(rows, verify_file(broken), qid)
    assert "a CASREP is not drafted from a broken log" in got["body"]["detail"]

    # No key: the draft still works, the send says what is missing; a wrong key and a dead board are 502s.
    (health, drafted, nokey), _ = cloud(bundle, [{"method": "GET", "path": "/api/health"}, draft(qid), send()], _env(board, key=None))
    assert health["body"]["casrep"]["ready"] is False and drafted["status"] == 200 and nokey["status"] == 400
    (wrong,), _ = cloud(bundle, [send()], _env(board, key="divo-key"))
    assert wrong["status"] == 502 and "The key must be the Originator key." in wrong["body"]["detail"]
    (down,), _ = cloud(bundle, [send()], _env("http://127.0.0.1:9"))
    assert down["status"] == 502 and down["body"]["detail"].startswith("Cannot reach the CASREP Board at http://127.0.0.1:9")
    assert not [s for s in fake_board.SENT if s["key"] == KEY]

    # Without a board the routes do not exist, as before.
    (health, gone), _ = cloud(bundle, [{"method": "GET", "path": "/api/health"}, draft(qid)], {})
    assert "casrep" not in health["body"] and gone["status"] == 404
