"""Drafts a CASREP from one copilot run in the signed audit log and sends it to the CASREP Board.

A run is one query and the steps its operator acknowledged after it, on screen or from the paper sheet
that carries the query id. The draft is printed and written to audit/casrep-<query id>.json. Nothing
goes over the network until the person types y, so the demo stays offline; --dry-run never sends.

Run: make casrep [QUERY=q-0003] [DRY=1] [CASREP_ARGS="--category 3"]
Board URL and Originator key: CASREP_URL and CASREP_KEY, from the environment or the gitignored
.casrep.local file at the repo root. See docs/CASREP.md.
"""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "api"))

import yaml  # noqa: E402

from retrieval.parse import parse_file  # noqa: E402

LOCAL_FILE = REPO / ".casrep.local"
DEFAULT_URL = "http://localhost:8787"
# The board's own sample ship, so a drafted report sits beside the seeded ones. Synthetic, like everything on the board.
DEFAULTS = {"CASREP_UNIT": "USS EXAMPLE (DDG 999)", "CASREP_UIC": "N99999", "CASREP_POC_CONTACT": "Main Control, EOOW"}
MONTHS = ("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC")
# The board's limits (worker/src/lib/fields.ts); a longer value is a 400 there, so it is cut here with a mark.
MAX_TEXT, MAX_EQUIPMENT, MAX_NAME = 4000, 120, 80
MISSION_AREAS = ("MOB", "AAW", "ASW", "SUW", "STW", "AMW", "MIW", "C2W", "CCC", "INT", "LOG", "NCO", "FSO")
ASSISTANCE = ("none", "tech_assist", "parts", "both")


class CasrepError(Exception):
    pass


def settings(environ=os.environ, local_file: Path = LOCAL_FILE) -> dict:
    """The environment wins over .casrep.local, which wins over the training defaults."""
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


def load_procedure(corpus_dir: Path, procedure_id: str) -> dict:
    path = corpus_dir / f"{procedure_id}.md"
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
                                 headers={"Content-Type": "application/json", "X-Admin-API-Key": key})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.load(e)
        except ValueError:
            return e.code, {"message": e.reason}


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


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Draft a CASREP from one copilot run and send it to the CASREP Board.")
    ap.add_argument("--query", help="the run's query id, such as q-0003 (the paper sheet carries the same id); default: the newest run")
    ap.add_argument("--log", type=Path, help="audit log to read; default: the copilot's audit/log.jsonl")
    ap.add_argument("--dry-run", action="store_true", help="write the CASREP JSON and stop; nothing is sent")
    ap.add_argument("--out", type=Path, help="where to write the JSON; default: audit/casrep-<query id>.json")
    ap.add_argument("--url", help="board base URL; default: CASREP_URL, else http://localhost:8787")
    ap.add_argument("--category", type=int, choices=(2, 3, 4), help="CASREP category; default 2")
    ap.add_argument("--mission-areas", help=f"comma-separated, from {','.join(MISSION_AREAS)}; default MOB")
    ap.add_argument("--assistance", choices=ASSISTANCE, help="default none")
    ap.add_argument("--equipment", help="default: the procedure's system and title")
    ap.add_argument("--serial", help="UIC/serial, such as N99999/0003; default: the UIC and the query number")
    ap.add_argument("--poc-name", help="default: the operator id that asked the question")
    ap.add_argument("--yes", action="store_true", help="send without the prompt")
    args = ap.parse_args(argv)

    # Imported here so --help works without a config file, and tests can import the mapping alone.
    from config import AUDIT_PATH, REPO_ROOT
    from trust.audit import AuditLog, verify_file

    cfg = settings()
    corpus = REPO_ROOT / "corpus" / "ddg"
    log = args.log or AUDIT_PATH
    if not log.exists():
        raise CasrepError(f"{log} does not exist; run the copilot and handle a casualty first")
    entries = AuditLog(log).entries()
    verified = verify_file(log)
    if not verified["ok"]:
        raise CasrepError(f"the audit log fails verification at #{verified['broken_seq']} ({verified['reason']}); "
                          "a CASREP is not drafted from a broken log")
    run = find_run(entries, parse_query_id(args.query) if args.query else None, lambda pid: (corpus / f"{pid}.md").exists())
    proc = load_procedure(corpus, run["query"]["payload"]["procedure_id"])
    areas = [a.strip().upper() for a in args.mission_areas.split(",") if a.strip()] if args.mission_areas else None
    if areas and not set(areas) <= set(MISSION_AREAS):
        raise CasrepError(f"mission areas must come from {', '.join(MISSION_AREAS)}")
    casrep = build(run, proc, verified, cfg, {"category": args.category, "mission_areas": areas, "assistance": args.assistance,
                                               "equipment": args.equipment, "serial": args.serial, "poc_name": args.poc_name})

    # Written before any network call, so the draft survives a board that cannot be reached.
    out = args.out or REPO_ROOT / "audit" / f"casrep-{query_id(run['query']['seq'])}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    write = lambda: out.write_text(json.dumps(casrep, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    write()

    api = (args.url or cfg["CASREP_URL"]).rstrip("/")
    key = cfg.get("CASREP_KEY", "")
    if not args.dry_run:
        if not key:
            raise CasrepError("CASREP_KEY is not set; put the Originator key in .casrep.local or the environment, or use --dry-run")
        casrep["serial"] = free_serial(api, key, casrep["serial"])
        write()
    print(render(casrep))
    print(f"\nDraft written to {out}")
    if args.dry_run:
        print("Dry run: nothing was sent.")
        return 0

    print(f"Board: {api} (Originator key {'set' if key else 'missing'})")
    if not args.yes and input("Send this CASREP to the board? [y/N] ").strip().lower() != "y":
        print("Not sent. The draft stays in the file above.")
        return 0
    created = send(casrep, api, key)
    print(f"Created CASREP {created['serial']} at the Originator step: {site_url(api, cfg)}/casrep/?id={created['id']}")
    print("On the board the Originator submits it up the chain, or saves a CASCAN to dismiss it.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except CasrepError as err:
        print(f"casrep: {err}", file=sys.stderr)
        sys.exit(1)
    except (urllib.error.URLError, TimeoutError) as err:
        print(f"casrep: cannot reach the board: {err}. The draft JSON was still written; send it later.", file=sys.stderr)
        sys.exit(1)
