"""Known casualties: open CASREPs read from the CASREP Board, cached here, and matched to a procedure.

A CASREP is a readiness report, not a live casualty response, so a match is context for the watch and
never a reason to skip a step. The server pulls the board in the background into a SQLite cache with an
as-of time; a query and the panel read only the cache, so a board that cannot be reached never blocks
or slows the copilot. See docs/CASREP.md.

Matching, strongest first:
  procedure  the CASREP text names the procedure id (every CASREP the copilot drafts does).
  system     every word of one part of the procedure's `system:` front matter is in the CASREP's
             equipment, after both sides expand the dataset's abbreviations.
"""
import json
import re
import sqlite3
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import yaml

import casrep

STEP_NAMES = ("Originator", "DIVO", "DH", "CHENG", "XO", "CO", "Released")
# Where the CASREP sits, as the banner says it: "at DH review".
STEP_PHRASES = ("with the Originator", "at DIVO review", "at DH review", "at CHENG review", "at XO review", "at CO review", "released by the CO")
SYNC_SECONDS = 60
# Older than this, or a failed pull after the last good one, and the UI says the data is stale.
STALE_SECONDS = 5 * SYNC_SECONDS
ARCHIVE_ROWS = 20
# Words that name no system on their own. "ship service" and "main" lead many systems; "plant" and
# "unit" follow many equipment names.
STOPWORDS = {"and", "of", "the", "ship", "service", "main", "plant", "unit", "system", "set"}
PROCEDURE_RE = re.compile(r"\b[A-Z]{2,6}(?:-[A-Z0-9]{2,8}){2,3}\b")


def _word(w: str) -> str:
    # "generators" and "generator" are one word here; "gas" and "class" are not plurals.
    return w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w


def tokens(text: str, abbreviations: dict[str, str]) -> set[str]:
    words = re.findall(r"[a-z0-9]+(?:[-/][a-z0-9]+)*", text.lower())
    out: set[str] = set()
    for w in words:
        expanded = abbreviations.get(w)
        for part in ([w] + (re.findall(r"[a-z0-9]+", expanded) if expanded else [])):
            if part not in STOPWORDS:
                out.add(_word(part))
    return out


def system_terms(system: str, abbreviations: dict[str, str]) -> list[set[str]]:
    """Each part of a system name that identifies it alone: "HVAC, chilled water, refrigeration" has three."""
    inside = re.findall(r"\(([^)]*)\)", system)
    outside = re.sub(r"\([^)]*\)", " ", system)
    parts = re.split(r",|\band\b", outside) + [w for group in inside for w in group.split()]
    return [t for t in (tokens(p, abbreviations) for p in parts) if t]


def match(procedure_id: str, terms: list[set[str]], c: dict, abbreviations: dict[str, str]) -> str | None:
    if procedure_id in c.get("procedure_ids", []):
        return "procedure"
    equipment = tokens(c.get("equipment") or "", abbreviations)
    return "system" if any(t <= equipment for t in terms) else None


def load_corpus_index(corpus: Path = casrep.CORPUS) -> tuple[dict[str, str], dict[str, str]]:
    """The ddg procedures' system names, and the dataset's abbreviations with lower-case keys."""
    systems = {}
    for path in sorted(corpus.glob("EOCC-*.md")):
        meta = yaml.safe_load(path.read_text(encoding="utf-8").split("---", 2)[1]) or {}
        systems[str(meta["procedure_id"])] = str(meta.get("system") or "")
    raw = yaml.safe_load((corpus / "abbreviations.yaml").read_text(encoding="utf-8")) or {}
    return systems, {str(k).lower(): str(v).lower() for k, v in raw.items()}


def summarize(bundle: dict, site: str) -> dict:
    """One CASREP as the banner and the panel show it, from the board's detail bundle."""
    c, versions, events = bundle["casrep"], bundle["versions"], bundle["events"]
    v = versions[-1] if versions else {}
    step = int(c.get("current_step", 0))
    closed_by = {"corrected": "CASCOR", "cancelled": "CASCAN"}.get(c.get("status", ""))
    text = " ".join(str(v.get(k) or "") for k in ("equipment", "description", "remarks"))
    return {
        "id": c["id"], "serial": c["serial"], "unit": c.get("unit"), "uic": c.get("uic"), "status": c.get("status"),
        "closed_by": closed_by, "step": step, "step_name": STEP_NAMES[min(step, len(STEP_NAMES) - 1)],
        "step_phrase": STEP_PHRASES[min(step, len(STEP_PHRASES) - 1)],
        "report_type": v.get("report_type"), "category": v.get("category"), "equipment": v.get("equipment"),
        "eic": v.get("eic"), "dtg": v.get("dtg"), "etr": v.get("etr"), "parts": v.get("parts") or [],
        "assistance": v.get("assistance"), "version_no": v.get("version_no"),
        "last_update": c.get("updated_at"), "last_action": next((e["action"] for e in reversed(events) if e.get("action") != "commented"), None),
        "procedure_ids": sorted(set(PROCEDURE_RE.findall(text))),
        "link": f"{site}/casrep/?id={c['id']}",
    }


class KnownCasualties:
    """The cache and the background pull. Every read is local; only sync() touches the network."""

    def __init__(self, path: Path, corpus: Path = casrep.CORPUS):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._db() as db:
            db.execute("CREATE TABLE IF NOT EXISTS snapshot (board TEXT PRIMARY KEY, as_of TEXT, payload TEXT, "
                       "last_attempt TEXT, last_error TEXT)")
        self.systems, self.abbreviations = load_corpus_index(corpus)
        self.terms = {pid: system_terms(s, self.abbreviations) for pid, s in self.systems.items()}
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None

    def _db(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path, timeout=5)

    @staticmethod
    def read_key(cfg: dict) -> str:
        # A read needs any role key; a dedicated one keeps the send key off a read-only machine.
        return cfg.get("CASREP_READ_KEY") or cfg.get("CASREP_KEY") or ""

    def sync(self, cfg: dict | None = None, stop_event: threading.Event | None = None) -> None:
        """Pulls this ship's CASREPs, open ones and the recently closed, with each one's detail."""
        cfg = cfg or casrep.settings()
        api, key, uic = cfg["CASREP_URL"].rstrip("/"), self.read_key(cfg), cfg["CASREP_UIC"]
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        with self._lock:
            try:
                if not key:
                    raise casrep.CasrepError("no CASREP read key is set; see docs/CASREP.md")
                bundles = []
                for scope, extra in (("active", ""), ("archive", f"&sort=updated&limit={ARCHIVE_ROWS}")):
                    if stop_event and stop_event.is_set():
                        return
                    status, body = casrep._call("GET", f"{api}/api/v1/casreps?scope={scope}&limit=200{extra}", key)
                    if status != 200:
                        raise casrep.CasrepError(f"the board refused the list ({status}): {body.get('message')}")
                    for row in body.get("casreps", []):
                        if stop_event and stop_event.is_set():
                            return
                        if row.get("uic") != uic:
                            continue
                        status, detail = casrep._call("GET", f"{api}/api/v1/casreps/{row['id']}", key)
                        if status == 200:
                            bundles.append(detail)
                with self._db() as db:
                    db.execute("INSERT INTO snapshot (board, as_of, payload, last_attempt, last_error) VALUES (?, ?, ?, ?, NULL) "
                               "ON CONFLICT(board) DO UPDATE SET as_of = excluded.as_of, payload = excluded.payload, "
                               "last_attempt = excluded.last_attempt, last_error = NULL", (api, now, json.dumps(bundles), now))
            except casrep.CasrepError as err:
                with self._db() as db:
                    db.execute("INSERT INTO snapshot (board, last_attempt, last_error) VALUES (?, ?, ?) "
                               "ON CONFLICT(board) DO UPDATE SET last_attempt = excluded.last_attempt, last_error = excluded.last_error",
                               (api, now, str(err)))

    def snapshot(self, cfg: dict | None = None) -> dict:
        """The cached CASREPs for the configured board, open first, and how old they are."""
        cfg = cfg or casrep.settings()
        board = casrep.board(cfg)
        with self._db() as db:
            row = db.execute("SELECT as_of, payload, last_attempt, last_error FROM snapshot WHERE board = ?", (board["url"],)).fetchone()
        as_of, payload, last_attempt, last_error = row if row else (None, None, None, None)
        bundles = json.loads(payload) if payload else []
        age = round(time.time() - datetime.fromisoformat(as_of).timestamp()) if as_of else None
        stale = as_of is None or age > STALE_SECONDS or bool(last_error)
        items = [summarize(b, board["site"]) for b in bundles]
        items.sort(key=lambda c: (c["status"] != "open", -(c["category"] or 0), c["serial"]))
        return {"board": {"url": board["url"], "site": board["site"]}, "read": bool(self.read_key(cfg)), "as_of": as_of,
                "age_seconds": age, "stale": stale, "error": last_error, "last_attempt": last_attempt,
                "casreps": items, "_bundles": {b["casrep"]["id"]: b for b in bundles}}

    def for_procedure(self, procedure_id: str, snap: dict | None = None) -> list[dict]:
        """Open CASREPs that may be this casualty, strongest match first. Reads the cache only."""
        snap = snap or self.snapshot()
        terms = self.terms.get(procedure_id)
        if terms is None:
            return []
        found = [(m, c) for c in snap["casreps"] if c["status"] == "open" and (m := match(procedure_id, terms, c, self.abbreviations))]
        found.sort(key=lambda mc: (mc[0] != "procedure", -(mc[1]["category"] or 0)))
        return [c | {"match": m} for m, c in found]

    def start(self, interval: int = SYNC_SECONDS) -> None:
        def loop():
            while not self._stop.is_set():
                try:
                    self.sync(stop_event=self._stop)
                except Exception as err:  # noqa: BLE001 - the pull must never take the server down
                    print(f"known casualties: sync failed: {err}", flush=True)
                self._stop.wait(interval)
        self._thread = threading.Thread(target=loop, name="casrep-sync", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread is not threading.current_thread():
            # Each board request has a 15-second timeout; sync checks the event
            # between calls, so shutdown waits for at most the in-flight request.
            self._thread.join(timeout=16)
            if self._thread.is_alive():
                print("known casualties: sync thread did not stop within 16 seconds", flush=True)
