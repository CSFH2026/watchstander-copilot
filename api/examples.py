"""The example chips under the search box, picked for this ship instead of a fixed list.

Order: one chip per open CASREP that names a procedure, then the procedures this laptop answered most
often in the signed audit log, then the dataset's fixed examples. A data chip's text is a symptom phrase
from that procedure's own front matter, and only one that finds the procedure as a clear match, so a chip
never puts words in the watch's mouth that the corpus does not hold. The log is only counted: a logged
question's own words never show, so nothing a person typed reaches a chip.

Everything here reads local data: the audit log file and the CASREP cache. A search runs once per
procedure and is cached, and none of it is on the /api/query path.
"""
from collections import Counter
from datetime import datetime, timedelta, timezone

WINDOW_DAYS = 30
MAX_CHIPS = 6
MAX_OPEN = 3
MAX_OFTEN = 3
# One question is not "often". Two answers of the same procedure in the window are the least that is.
MIN_OFTEN = 2


def _ts(entry: dict) -> datetime | None:
    try:
        return datetime.strptime(entry["ts"], "%Y-%m-%dT%H:%M:%S%z")
    except (KeyError, TypeError, ValueError):
        return None


def often(entries: list[dict], known_ids, now: datetime | None = None, days: int = WINDOW_DAYS) -> list[tuple[str, int]]:
    """Procedures answered at least MIN_OFTEN times in the window, most first; ties go to the latest."""
    since = (now or datetime.now(timezone.utc)) - timedelta(days=days)
    counts: Counter = Counter()
    last: dict[str, datetime] = {}
    for e in entries:
        pid = (e.get("payload") or {}).get("procedure_id")
        ts = _ts(e)
        if e.get("event") != "query" or pid not in known_ids or ts is None or ts < since:
            continue
        counts[pid] += 1
        last[pid] = max(ts, last.get(pid, ts))
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], -last[kv[0]].timestamp(), kv[0]))
    return [(pid, n) for pid, n in ranked if n >= MIN_OFTEN]


class Chips:
    """Holds the per-procedure phrase cache; the corpus does not change while the server runs."""

    def __init__(self, retriever, fixed: list[str]):
        self.r = retriever
        self.fixed = fixed
        self._phrase: dict[str, str | None] = {}
        self._fixed_pid: dict[str, str | None] = {}

    def clear_match(self, text: str, procedure_id: str) -> bool:
        found = self.r.search(text)
        return found["confidence"] == "clear" and found["candidates"][0]["procedure_id"] == procedure_id

    def phrase(self, procedure_id: str) -> str | None:
        """The first of the procedure's own symptoms that finds it as a clear match, or None."""
        if procedure_id not in self._phrase:
            symptoms = self.r.procedures.get(procedure_id, {}).get("symptoms") or []
            self._phrase[procedure_id] = next((s for s in symptoms if self.clear_match(s, procedure_id)), None)
        return self._phrase[procedure_id]

    def fixed_procedure(self, text: str) -> str | None:
        if text not in self._fixed_pid:
            found = self.r.search(text)
            self._fixed_pid[text] = found["candidates"][0]["procedure_id"] if found["candidates"] else None
        return self._fixed_pid[text]

    def pick(self, entries: list[dict], casreps: list[dict], now: datetime | None = None) -> list[dict]:
        chips: list[dict] = []
        seen: set[str] = set()

        def add(pid: str, reason: str, **extra) -> bool:
            text = self.phrase(pid) if pid not in seen else None
            if text:
                seen.add(pid)
                chips.append({"text": text, "procedure_id": pid, "reason": reason} | extra)
            return bool(text)

        # Only a CASREP that names the procedure: an equipment match can fit several procedures.
        opened = 0
        for c in casreps:
            if c.get("status") != "open" or opened >= MAX_OPEN:
                continue
            pid = next((p for p in c.get("procedure_ids") or [] if p in self.r.procedures and p not in seen), None)
            if pid and add(pid, "open", serial=c.get("serial")):
                opened += 1
        added = 0
        for pid, n in often(entries, self.r.procedures, now):
            if added >= MAX_OFTEN or len(chips) >= MAX_CHIPS:
                break
            if add(pid, "often", count=n):
                added += 1
        for text in self.fixed:
            if len(chips) >= MAX_CHIPS:
                break
            pid = self.fixed_procedure(text)
            if pid in seen:
                continue
            if pid:
                seen.add(pid)
            chips.append({"text": text, "procedure_id": pid, "reason": "example"})
        return chips[:MAX_CHIPS]
