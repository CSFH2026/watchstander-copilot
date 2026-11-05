"""Exports the cloud audit table to JSON lines and checks it with the laptop verifier.

The same verify_file that checks audit/log.jsonl checks the cloud rows, so a pass proves both
backends write one format. The public keys come from cloud/.keys/roster.json.

Run: .venv/bin/python scripts/cloud_audit.py [--remote] [--out audit/cloud-log.jsonl]
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "api"))
os.environ.setdefault("WSC_CONFIG", str(REPO / "config" / "cloudflare.yaml"))

from config import CONFIG  # noqa: E402
from trust.audit import verify_file  # noqa: E402

FIELDS = ("seq", "ts", "actor", "event", "payload", "payload_hash", "prev_hash", "hash", "signer", "signature")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--remote", action="store_true", help="read the deployed D1 database, not the local one")
    ap.add_argument("--out", default=str(REPO / "audit" / "cloud-log.jsonl"))
    args = ap.parse_args()
    cmd = [str(REPO / "cloud" / "node_modules" / ".bin" / "wrangler"), "d1", "execute", CONFIG["cloudflare"]["d1_database"],
           "--remote" if args.remote else "--local", "--json", "--command", "SELECT * FROM audit ORDER BY seq"]
    out = subprocess.run(cmd, cwd=REPO / "cloud", check=True, capture_output=True, text=True).stdout
    rows = json.loads(out)[0]["results"]
    path = Path(args.out)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps({k: (json.loads(r[k]) if k == "payload" else r[k]) for k in FIELDS}, ensure_ascii=False) + "\n")
    roster = json.loads((REPO / "cloud" / ".keys" / "roster.json").read_text())
    result = verify_file(path, roster)
    print(f"{len(rows)} rows -> {path}")
    print(json.dumps(result))
    sys.exit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
