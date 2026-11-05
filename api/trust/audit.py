"""Append-only, hash-chained, signed audit log in JSON lines.

Each line's hash covers every other field and the previous line's hash, and is signed by
the identity that acted. Editing, deleting, or reordering any line breaks verification at
that line. The file stays human readable on purpose: the demo opens it and edits a word.
"""
import hashlib
import json
import threading
import time
from pathlib import Path

from trust import keys

GENESIS = "0" * 64
HASHED_FIELDS = ("seq", "ts", "actor", "event", "payload_hash", "prev_hash", "signer")


def canonical(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def entry_hash(entry: dict) -> str:
    return sha256(canonical({k: entry[k] for k in HASHED_FIELDS}))


def _lines(text: str) -> list[str]:
    # Records end at "\n" only. str.splitlines() also breaks at U+2028, U+2029 and U+0085, which
    # ensure_ascii=False writes raw, so a query holding one would split its own record in two.
    return [l for l in text.split("\n") if l.strip()]


class AuditLog:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.touch(exist_ok=True)
        self._lock = threading.Lock()
        last = self._last_entry()
        self._seq = last["seq"] if last else 0
        self._prev = last["hash"] if last else GENESIS

    def _last_entry(self) -> dict | None:
        """The newest readable entry. A damaged tail must not stop the server: verify still reports the break."""
        lines = _lines(self.path.read_text(encoding="utf-8"))
        for back, line in enumerate(reversed(lines)):
            try:
                e = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(e, dict) and isinstance(e.get("seq"), int) and isinstance(e.get("hash"), str):
                if back:
                    print(f"audit log {self.path}: the last {back} line(s) are unreadable; "
                          f"new entries follow #{e['seq']} and verify will report the break", flush=True)
                return e
        if lines:
            print(f"audit log {self.path}: no readable entry; verify will report the break", flush=True)
        return None

    def append(self, actor: str, event: str, payload: dict, signer: str) -> dict:
        with self._lock:
            entry = {
                "seq": self._seq + 1,
                "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                "actor": actor,
                "event": event,
                "payload": payload,
                "payload_hash": sha256(canonical(payload)),
                "prev_hash": self._prev,
                "signer": signer,
            }
            entry["hash"] = entry_hash(entry)
            entry["signature"] = keys.sign(signer, entry["hash"].encode())
            with self.path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
            self._seq, self._prev = entry["seq"], entry["hash"]
            return entry

    def entries(self) -> list[dict]:
        out = []
        for line in _lines(self.path.read_text(encoding="utf-8")):
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                out.append({"_unparseable": line})
        return out


def ref(entry: dict) -> dict:
    return {k: entry[k] for k in ("seq", "hash", "prev_hash", "signature", "signer")}


def check_entry(e: dict, prev_hash: str, roster: dict | None = None) -> dict:
    """The checks verify_file makes, for one entry, each reported on its own instead of stopping at the first."""
    roster = roster if roster is not None else keys.load_roster()
    try:
        hash_ok = entry_hash(e) == e.get("hash")
    except KeyError:
        hash_ok = False
    return {
        "prev_link_ok": e.get("prev_hash") == prev_hash,
        "payload_ok": sha256(canonical(e.get("payload"))) == e.get("payload_hash"),
        "hash_ok": hash_ok,
        "signature_ok": keys.verify(e.get("signer", ""), str(e.get("hash", "")).encode(), e.get("signature", ""), roster),
    }


def verify_file(path: Path, roster: dict | None = None) -> dict:
    roster = roster if roster is not None else keys.load_roster()
    prev, n = GENESIS, 0
    lines = _lines(path.read_text(encoding="utf-8")) if path.exists() else []
    for n, line in enumerate(lines, start=1):
        try:
            e = json.loads(line)
        except json.JSONDecodeError:
            return {"ok": False, "entries": len(lines), "broken_seq": n, "reason": "line is not valid JSON"}
        seq = e.get("seq", n)
        if seq != n:
            return {"ok": False, "entries": len(lines), "broken_seq": n, "reason": f"expected seq {n}, found {seq}"}
        if e.get("prev_hash") != prev:
            return {"ok": False, "entries": len(lines), "broken_seq": seq, "reason": "chain link to the previous entry is broken"}
        if sha256(canonical(e.get("payload"))) != e.get("payload_hash"):
            return {"ok": False, "entries": len(lines), "broken_seq": seq, "reason": "payload hash does not match"}
        try:
            recomputed = entry_hash(e)
        except KeyError as missing:
            return {"ok": False, "entries": len(lines), "broken_seq": seq, "reason": f"field {missing} is missing"}
        if recomputed != e.get("hash"):
            return {"ok": False, "entries": len(lines), "broken_seq": seq, "reason": "entry hash does not match"}
        if not keys.verify(e["signer"], e["hash"].encode(), e.get("signature", ""), roster):
            return {"ok": False, "entries": len(lines), "broken_seq": seq, "reason": f"signature by {e['signer']} is not valid"}
        prev = e["hash"]
    return {"ok": True, "entries": len(lines)}
