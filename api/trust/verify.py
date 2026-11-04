"""python -m trust.verify ../audit/log.jsonl  ->  OK, or the first broken entry. Exit 1 when broken."""
import sys
from pathlib import Path

from config import AUDIT_PATH
from trust.audit import verify_file

if __name__ == "__main__":
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else AUDIT_PATH
    r = verify_file(path)
    if r["ok"]:
        print(f"OK: chain intact, {r['entries']} entries, every signature valid ({path})")
    else:
        print(f"BROKEN at entry {r['broken_seq']} of {r['entries']}: {r['reason']} ({path})")
        sys.exit(1)
