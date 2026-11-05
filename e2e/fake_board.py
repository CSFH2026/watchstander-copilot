"""A stand-in for the CASREP Board's API: the two GET routes the copilot reads, and the create a send makes.

It serves tests/fixtures/casrep_board.json, so the e2e run needs no board, no key, and no network.
A create is kept in memory and listed after it; with ORIGINATOR_KEY set, only that key may create, as on the board.
tests/test_casrep_cloud.py runs it in a thread and reads SENT to see what reached it.
Run: python3 e2e/fake_board.py <port>
"""
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

BOARD = json.loads((Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "casrep_board.json").read_text())
BY_ID = {b["casrep"]["id"]: b for b in BOARD["bundles"]}
ORIGINATOR_KEY = None
CREATED: list[dict] = []
SENT: list[dict] = []
_lock = threading.Lock()


class Board(BaseHTTPRequestHandler):
    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/v1/health":
            return self.send({"status": "ok", "service": "fake-casrep-board"})
        if not self.headers.get("X-Admin-API-Key"):
            return self.send({"error": "UNAUTHORIZED"}, 401)
        if url.path == "/api/v1/casreps":
            scope = parse_qs(url.query).get("scope", ["all"])[0]
            rows = BOARD["rows"] + CREATED
            return self.send({"casreps": [r for r in rows if scope == "all" or (r["status"] == "open") == (scope == "active")]})
        bundle = BY_ID.get(url.path.rsplit("/", 1)[-1]) if url.path.startswith("/api/v1/casreps/") else None
        return self.send(bundle, 200) if bundle else self.send({"error": "NOT_FOUND"}, 404)

    def do_POST(self):
        if urlparse(self.path).path != "/api/v1/casreps":
            return self.send({"error": "NOT_FOUND"}, 404)
        key = self.headers.get("X-Admin-API-Key")
        if not key:
            return self.send({"error": "UNAUTHORIZED"}, 401)
        if ORIGINATOR_KEY and key != ORIGINATOR_KEY:
            return self.send({"error": "FORBIDDEN", "message": "only the Originator may open a CASREP"}, 403)
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        with _lock:
            SENT.append({"body": body, "user_agent": self.headers.get("User-Agent"), "key": key})
            if any(r["serial"] == body.get("serial") for r in BOARD["rows"] + CREATED):
                return self.send({"error": "CONFLICT", "message": f"serial {body.get('serial')} is taken"}, 409)
            created = body | {"id": f"fake-{len(CREATED) + 1}", "status": "open", "current_step": 0}
            CREATED.append(created)
        return self.send({"casrep": created}, 201)

    def send(self, body, status=200):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), Board).serve_forever()
