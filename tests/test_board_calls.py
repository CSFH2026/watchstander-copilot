"""Calls to the CASREP Board: the key never follows a redirect, ids are encoded, and refresh cannot fan out.

Findings 8eec673b and c43a7952 of the Nov 5 security review. Local HTTP servers on 127.0.0.1 only.
"""
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
from fastapi.testclient import TestClient

import casrep
import known

pytestmark = pytest.mark.skipif(bool(os.environ.get("WSC_BASE_URL")), reason="local backend only")
CFG = {"CASREP_URL": "http://board.test", **casrep.DEFAULTS, "CASREP_READ_KEY": "read-key"}


def _server(handler_body):
    """A one-route HTTP server on a free port. handler_body(handler) answers; every request's headers are kept."""
    seen = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            seen.append(self.headers)  # an email.message.Message: header lookups ignore case, as HTTP does
            handler_body(self)

        def log_message(self, *a):
            pass

    srv = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, seen


def _json(h, status, body):
    data = json.dumps(body).encode()
    h.send_response(status)
    h.send_header("Content-Type", "application/json")
    h.send_header("Content-Length", str(len(data)))
    h.end_headers()
    h.wfile.write(data)


@pytest.fixture
def elsewhere():
    srv, seen = _server(lambda h: _json(h, 200, {"casreps": []}))
    yield f"http://127.0.0.1:{srv.server_port}", seen
    srv.shutdown()


def test_the_key_goes_to_the_board_itself(elsewhere):
    url, seen = elsewhere
    status, body = casrep._call("GET", f"{url}/api/v1/casreps", "the-key")
    assert status == 200 and body == {"casreps": []}
    assert seen[0].get("X-Admin-API-Key") == "the-key"


@pytest.mark.parametrize("code", [301, 302, 307, 308])
def test_the_key_never_follows_a_redirect(elsewhere, code):
    target, target_seen = elsewhere

    def redirect(h):
        h.send_response(code)
        h.send_header("Location", f"{target}/api/v1/casreps")
        h.send_header("Content-Length", "0")
        h.end_headers()
    srv, first_seen = _server(redirect)
    try:
        casrep._call("GET", f"http://127.0.0.1:{srv.server_port}/api/v1/casreps", "the-key")
    finally:
        srv.shutdown()
    assert first_seen[0].get("X-Admin-API-Key") == "the-key"
    assert target_seen and all("X-Admin-API-Key" not in h for h in target_seen)


def _board(calls, rows, fail=False):
    def call(method, url, key, body=None):
        calls.append(url)
        if fail:
            raise casrep.CasrepError("cannot reach the CASREP Board")
        if "/casreps?" in url:
            return 200, {"casreps": rows if "scope=active" in url else []}
        cid = url.rsplit("/", 1)[1]
        return 200, {"casrep": {"id": cid, "serial": "N99999/0001", "status": "open", "current_step": 0},
                     "versions": [], "events": []}
    return call


def test_casrep_ids_are_encoded_in_the_detail_path(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(casrep, "_call", _board(calls, [{"id": "a/../b?x=1#y", "uic": "N99999"}, {"id": "plain-1", "uic": "N99999"}]))
    known.KnownCasualties(tmp_path / "c.sqlite").sync(CFG)
    details = [u for u in calls if "/casreps?" not in u]
    assert details == ["http://board.test/api/v1/casreps/a%2F..%2Fb%3Fx%3D1%23y", "http://board.test/api/v1/casreps/plain-1"]


def test_a_refresh_right_after_a_good_pull_reads_the_cache(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(casrep, "_call", _board(calls, [{"id": "c1", "uic": "N99999"}]))
    k = known.KnownCasualties(tmp_path / "c.sqlite")
    k.sync(CFG, min_gap=10)
    first = len(calls)
    for _ in range(5):
        k.sync(CFG, min_gap=10)
    assert first == 3 and len(calls) == first
    # The background pull passes no gap, so it still runs on its own schedule.
    k.sync(CFG)
    assert len(calls) == 2 * first


def test_a_failed_pull_never_holds_back_the_next_refresh(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(casrep, "_call", _board(calls, [], fail=True))
    k = known.KnownCasualties(tmp_path / "c.sqlite")
    k.sync(CFG, min_gap=10)
    k.sync(CFG, min_gap=10)
    assert len(calls) == 2 and k.snapshot(CFG)["error"]


def test_the_refresh_route_does_not_fan_out(monkeypatch):
    monkeypatch.setenv("CASREP_URL", "http://board.test")
    monkeypatch.setenv("CASREP_READ_KEY", "read-key")
    calls = []
    monkeypatch.setattr(casrep, "_call", _board(calls, [{"id": "c1", "uic": "N99999"}]))
    from main import app
    with TestClient(app) as client:
        for _ in range(4):
            r = client.post("/api/casreps/refresh")
            assert r.status_code == 200 and [c["id"] for c in r.json()["casreps"]] == ["c1"]
    assert len(calls) == 3
