"""python -m trust.verify [log.jsonl]  ->  OK, or the first broken entry. Exit 1 when broken or missing.

With no argument it checks config.AUDIT_PATH, the log the server writes (WSC_AUDIT_PATH, else audit/log.jsonl).
"""
import sys
from pathlib import Path

from config import AUDIT_PATH
from trust.audit import verify_file

if __name__ == "__main__":
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else AUDIT_PATH
    # verify_file reads a missing log as an empty chain; here that almost always means the wrong path.
    if not path.is_file():
        print(f"MISSING: no audit log at {path}. Set WSC_AUDIT_PATH or pass the log's path.")
        sys.exit(1)
    r = verify_file(path)
    if r["ok"]:
        print(f"OK: chain intact, {r['entries']} entries, every signature valid ({path})")
    else:
        print(f"BROKEN at entry {r['broken_seq']} of {r['entries']}: {r['reason']} ({path})")
        sys.exit(1)
