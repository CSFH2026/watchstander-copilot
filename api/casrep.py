"""A CASREP drafted from one copilot run in the signed audit log, and the send to the CASREP Board.

A run is one query and the steps its operator acknowledged after it, on screen or from the paper sheet
that carries the query id. The board is a separate app; this module only builds its create body and
POSTs it. Used by the /api/casrep routes and by scripts/casrep.py. See docs/CASREP.md.
"""
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import yaml

from retrieval.parse import parse_file

REPO = Path(__file__).resolve().parent.parent
# CASREPs cover the DDG-51 engineering casualties only, whatever dataset the server answers from.
CORPUS = REPO / "corpus" / "ddg"
LOCAL_FILE = REPO / ".casrep.local"
DEFAULT_URL = "http://localhost:8787"
# The board's own sample ship, so a drafted report sits beside the seeded ones. Synthetic, like everything on the board.
DEFAULTS = {"CASREP_UNIT": "USS EXAMPLE (DDG 999)", "CASREP_UIC": "N99999", "CASREP_POC_CONTACT": "Main Control, EOOW"}
MONTHS = ("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC")
# The board's limits (worker/src/lib/fields.ts); a longer value is a 400 there, so it is cut here with a mark.
MAX_TEXT, MAX_EQUIPMENT, MAX_NAME = 4000, 120, 80
MISSION_AREAS = ("MOB", "AAW", "ASW", "SUW", "STW", "AMW", "MIW", "C2W", "CCC", "INT", "LOG", "NCO", "FSO")
ASSISTANCE = ("none", "tech_assist", "parts", "both")
USER_AGENT = "watchstander-copilot/1.0 (casrep export)"
# A procedure id names a corpus file, so it is checked before any path is built from it.
PROCEDURE_ID_RE = re.compile(r"[A-Z0-9]+(?:-[A-Z0-9]+){1,5}")


class CasrepError(Exception):
    pass


def settings(environ=os.environ, local_file: Path | None = None) -> dict:
    """The environment wins over .casrep.local, which wins over the training defaults."""
    local_file = local_file or LOCAL_FILE
    out = {"CASREP_URL": DEFAULT_URL, **DEFAULTS}
    if local_file.exists():
        for line in local_file.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.strip().partition("=")
            if sep and not key.startswith("#"):
                out[key.strip()] = value.strip().strip("'\"")
    out.update({k: v for k, v in environ.items() if k.startswith("CASREP_") and v})
    return out


def query_id(seq: int) -> str:
    return f"q-{seq:04d}"


def parse_query_id(text: str) -> int:
    m = re.fullmatch(r"q-?(\d+)|(\d+)", text.strip())
    if not m:
        raise CasrepError(f"{text!r} is not a query id; use the id on the screen or the sheet, such as q-0003")
    return int(m.group(1) or m.group(2))


def dtg(ts: str) -> str:
    """An audit timestamp as a Navy date-time group in UTC, such as 041915Z NOV 26."""
    t = datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S%z").astimezone(timezone.utc)
    return f"{t:%d%H%M}Z {MONTHS[t.month - 1]} {t:%y}"


def find_run(entries: list[dict], seq: int | None, has_procedure) -> dict:
    """The query entry and every action of its run. With no seq, the newest run with at least one allowed step."""
    queries = [e for e in entries if e.get("event") == "query" and (e.get("payload") or {}).get("procedure_id")]
    if seq is not None:
        match = [e for e in entries if e.get("seq") == seq]
        if not match or match[0].get("event") != "query":
            raise CasrepError(f"{query_id(seq)} is not a query in this audit log")
        if not match[0]["payload"].get("procedure_id"):
            raise CasrepError(f"{query_id(seq)} found no procedure, so there is no casualty to report")
        if not has_procedure(match[0]["payload"]["procedure_id"]):
            raise CasrepError(f"{query_id(seq)} matched {match[0]['payload']['procedure_id']}, which is not a ddg casualty procedure")
        return _run(entries, match[0])
    for q in reversed(queries):
        if has_procedure(q["payload"]["procedure_id"]):
            run = _run(entries, q)
            if run["done"]:
                return run
    raise CasrepError("no run in this audit log has an acknowledged ddg step; acknowledge a step first or pass --query")


def _run(entries: list[dict], q: dict) -> dict:
    actor, pid, sheet = q["actor"], q["payload"]["procedure_id"], query_id(q["seq"])
    done, blocked, open_window = [], [], True
    for e in entries:
        if e.get("seq", 0) <= q["seq"] or e.get("actor") != actor:
            continue
        p = e.get("payload") or {}
        # The run ends at this operator's reset, or when they ask again and land on the same procedure.
        if e.get("event") == "reset" or (e.get("event") == "query" and p.get("procedure_id") == pid):
            open_window = False
        if e.get("event") != "action" or p.get("procedure_id") != pid:
            continue
        # A paper sheet carries the query id, so its steps belong to this run whenever they are typed in.
        if open_window or (p.get("source") == "paper" and p.get("sheet") == sheet):
            (done if p.get("allowed") else blocked).append(e)
    return {"query": q, "done": done, "blocked": blocked}


def _procedure_path(corpus_dir: Path, procedure_id: str) -> Path | None:
    if not isinstance(procedure_id, str) or not PROCEDURE_ID_RE.fullmatch(procedure_id):
        return None
    path = corpus_dir / f"{procedure_id}.md"
    return path if path.resolve().is_relative_to(corpus_dir.resolve()) else None


def load_procedure(corpus_dir: Path, procedure_id: str) -> dict:
    path = _procedure_path(corpus_dir, procedure_id)
    if path is None:
        raise CasrepError(f"{procedure_id!r} is not a procedure id")
    proc = parse_file(path)
    meta = yaml.safe_load(path.read_text(encoding="utf-8").split("---", 2)[1]) or {}
    return proc | {"system": str(meta.get("system") or "")}


def _cut(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 3].rstrip() + "..."


def _short(step_id: str) -> str:
    return step_id.rsplit("-", 1)[-1]


def _step_line(entry: dict, text_by_id: dict) -> str:
    p = entry["payload"]
    how = "on screen"
    if p.get("source") == "paper":
        bits = [f"paper sheet {p['sheet']}" if p.get("sheet") else "paper"]
        bits += [f"done {p['done_at']}" if p.get("done_at") else "", f"reading {p['reading']}" if p.get("reading") else "",
                 f"note: {p['note']}" if p.get("note") else ""]
        how = ", ".join(b for b in bits if b)
    return f"- {_short(p['step_id'])} {text_by_id.get(p['step_id'], p['step_id'])} ({how}; audit #{entry['seq']})"


def build(run: dict, proc: dict, verified: dict, cfg: dict, opts: dict | None = None) -> dict:
    """The board's create body. Pure: same run, procedure and settings give the same CASREP."""
    opts = opts or {}
    q, payload = run["query"], run["query"]["payload"]
    operator = q["actor"]
    text_by_id = {s["step_id"]: s["text"] for s in proc["steps"]}
    done_ids = {e["payload"]["step_id"] for e in run["done"]}
    remaining = [_short(s["step_id"]) for s in proc["steps"] if s["step_id"] not in done_ids]
    confidence = re.search(r"\((clear|ambiguous)\)$", payload.get("summary", ""))

    lines = [
        f"Casualty: {proc['title']}.",
        f"Reported to the Watchstander Copilot at {dtg(q['ts'])} by {operator} ({payload.get('input', 'typed')}): "
        f"\"{payload.get('text', '').strip()}\".",
        f"Matched procedure {proc['procedure_id']}" + (f" ({confidence.group(1)} match)." if confidence else "."),
        f"Symptoms on the card: {'; '.join(proc['symptoms'])}.",
        f"Actions taken ({len(run['done'])} of {len(proc['steps'])} steps):",
        *([_step_line(e, text_by_id) for e in run["done"]] or ["- none yet"]),
        f"Steps not yet done: {', '.join(remaining)}." if remaining else "All steps of the procedure are done.",
    ]
    proof = [
        f"Drafted by make casrep from the signed copilot audit log. Query {query_id(q['seq'])} is audit #{q['seq']}, "
        f"hash {q['hash'][:16]}.",
        f"Step entries: {', '.join('#' + str(e['seq']) for e in run['done']) or 'none'}, each signed by {operator}.",
    ]
    if run["blocked"]:
        proof.append("Blocked by the policy engine: " + "; ".join(
            f"#{e['seq']} {_short(e['payload']['step_id'])}: {e['payload'].get('reason', '')}" for e in run["blocked"]))
    proof.append(f"Audit chain verified: {verified['entries']} entries." if verified.get("ok") else
                 f"Audit chain NOT verified: {verified.get('reason')} at #{verified.get('broken_seq')}.")
    proof.append(f"Procedure source: {proc['source']}")

    uic = opts.get("uic") or cfg["CASREP_UIC"]
    equipment = opts.get("equipment") or (f"{proc['system']}: {proc['title']}" if proc["system"] else proc["title"])
    return {
        "serial": opts.get("serial") or f"{uic}/{q['seq'] % 10000:04d}",
        "unit": cfg["CASREP_UNIT"],
        "uic": uic,
        "report_type": "INITIAL",
        "category": int(opts.get("category") or 2),
        "dtg": dtg(q["ts"]),
        "equipment": _cut(equipment, MAX_EQUIPMENT),
        "eic": None,
        "description": _cut("\n".join(lines), MAX_TEXT),
        "mission_areas": list(opts.get("mission_areas") or ["MOB"]),
        "parts": [],
        "assistance": opts.get("assistance") or "none",
        "etr": None,
        "remarks": _cut("\n".join(proof), MAX_TEXT),
        "poc_name": _cut(opts.get("poc_name") or operator, MAX_NAME),
        "poc_contact": cfg["CASREP_POC_CONTACT"],
        "actor_name": _cut(opts.get("poc_name") or operator, MAX_NAME),
    }


def render(casrep: dict) -> str:
    head = [f"{k.upper():<14}{casrep[k]}" for k in ("serial", "unit", "uic", "report_type", "category", "dtg", "equipment",
                                                     "mission_areas", "assistance", "poc_name", "poc_contact")]
    return "\n".join(head + ["", "DESCRIPTION", casrep["description"], "", "REMARKS", casrep["remarks"]])


def site_url(api_url: str, cfg: dict) -> str:
    # Locally the board's site runs on :3000 beside the API on :8787; deployed, they share one host.
    return cfg.get("CASREP_SITE") or api_url.replace(":8787", ":3000")


def _call(method: str, url: str, key: str, body: dict | None = None) -> tuple[int, dict]:
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 # Cloudflare refuses Python's default User-Agent (error 1010), so the live board needs a name.
                                 headers={"Content-Type": "application/json", "X-Admin-API-Key": key, "User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.load(e)
        except ValueError:
            return e.code, {"message": e.reason}
    except (urllib.error.URLError, TimeoutError) as e:
        raise CasrepError(f"cannot reach the CASREP Board at {url.split('/api/')[0]}: {getattr(e, 'reason', e)}") from e


def free_serial(api: str, key: str, serial: str) -> str:
    """The serial itself, or the next number for the same UIC that the board does not hold yet."""
    uic, num = serial.split("/")
    status, body = _call("GET", f"{api}/api/v1/casreps?scope=all&limit=200&q={urllib.parse.quote(uic)}", key)
    if status != 200:
        raise CasrepError(f"the board refused the list ({status}): {body.get('message')}")
    taken = {c["serial"] for c in body.get("casreps", [])}
    n = int(num)
    while f"{uic}/{n:0{len(num)}d}" in taken:
        n += 1
    return f"{uic}/{n:0{len(num)}d}"


def send(casrep: dict, api: str, key: str) -> dict:
    status, body = _call("POST", f"{api}/api/v1/casreps", key, casrep)
    if status != 201:
        hint = " The key must be the Originator key." if status in (401, 403) else ""
        raise CasrepError(f"the board refused the CASREP ({status}): {body.get('message')}.{hint}")
    return body["casrep"]


def has_procedure(procedure_id: str) -> bool:
    path = _procedure_path(CORPUS, procedure_id)
    return path is not None and path.exists()


def sent_for(entries: list[dict], seq: int) -> dict | None:
    """The audit entry that recorded this run's CASREP going to the board, if one did."""
    qid = query_id(seq)
    return next((e for e in reversed(entries) if e.get("event") == "casrep" and (e.get("payload") or {}).get("query_id") == qid), None)


def draft(entries: list[dict], verified: dict, seq: int | None, cfg: dict, opts: dict | None = None) -> tuple[dict, dict]:
    """The run and its CASREP. A log that fails verification gives no draft, since the draft is its evidence."""
    if not verified.get("ok"):
        raise CasrepError(f"the audit log fails verification at #{verified.get('broken_seq')} ({verified.get('reason')}); "
                          "a CASREP is not drafted from a broken log")
    run = find_run(entries, seq, has_procedure)
    proc = load_procedure(CORPUS, run["query"]["payload"]["procedure_id"])
    return run, build(run, proc, verified, cfg, opts)


def board(cfg: dict) -> dict:
    """Where a CASREP would go, its dashboard, and whether this laptop holds the Originator key. Never the key itself."""
    url = cfg["CASREP_URL"].rstrip("/")
    return {"url": url, "site": site_url(url, cfg).rstrip("/"), "ready": bool(cfg.get("CASREP_KEY"))}


def submit(casrep: dict, cfg: dict) -> dict:
    """Sends the CASREP, on the next free serial, and returns what the board created with a link to it."""
    api, key = cfg["CASREP_URL"].rstrip("/"), cfg.get("CASREP_KEY", "")
    if not key:
        raise CasrepError("CASREP_KEY is not set; put the board's Originator key in .casrep.local or the environment")
    body = casrep | {"serial": free_serial(api, key, casrep["serial"])}
    created = send(body, api, key)
    return {"id": created["id"], "serial": created["serial"], "link": f"{site_url(api, cfg)}/casrep/?id={created['id']}",
            "board": api, "casrep": body}
