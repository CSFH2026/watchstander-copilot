"""A read-only stand-in for the CASREP Board's API, for the browser tests: the two GET routes the copilot reads.

It serves tests/fixtures/casrep_board.json, so the e2e run needs no board, no key, and no network.
Run: python3 e2e/fake_board.py <port>
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

BOARD = json.loads((Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "casrep_board.json").read_text())
BY_ID = {b["casrep"]["id"]: b for b in BOARD["bundles"]}


class Board(BaseHTTPRequestHandler):
    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/v1/health":
            return self.send({"status": "ok", "service": "fake-casrep-board"})
        if not self.headers.get("X-Admin-API-Key"):
            return self.send({"error": "UNAUTHORIZED"}, 401)
        if url.path == "/api/v1/casreps":
            active = parse_qs(url.query).get("scope", ["all"])[0] == "active"
            return self.send({"casreps": [r for r in BOARD["rows"] if (r["status"] == "open") == active]})
        bundle = BY_ID.get(url.path.rsplit("/", 1)[-1]) if url.path.startswith("/api/v1/casreps/") else None
        return self.send(bundle, 200) if bundle else self.send({"error": "NOT_FOUND"}, 404)

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
