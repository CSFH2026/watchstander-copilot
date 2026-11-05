"""Drafts a CASREP from one copilot run in the signed audit log and sends it to the CASREP Board.

The same draft the "Draft CASREP" button shows, from a terminal. It is printed and written to
audit/casrep-<query id>.json, and nothing goes over the network until the person types y; --dry-run
never sends. A send from here is not written to the audit log, because the running server owns the
log's chain; the button does write one.

Run: make casrep [QUERY=q-0003] [DRY=1] [CASREP_ARGS="--category 3"]
Board URL and Originator key: CASREP_URL and CASREP_KEY, from the environment or the gitignored
.casrep.local file at the repo root. See docs/CASREP.md.
"""
import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "api"))

from casrep import ASSISTANCE, MISSION_AREAS, CasrepError, draft, parse_query_id, query_id, render, sent_for, settings, submit  # noqa: E402


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

    # Imported here so --help works without a config file.
    from config import AUDIT_PATH, REPO_ROOT
    from trust.audit import AuditLog, verify_file

    cfg = settings()
    if args.url:
        cfg["CASREP_URL"] = args.url
    log = args.log or AUDIT_PATH
    if not log.exists():
        raise CasrepError(f"{log} does not exist; run the copilot and handle a casualty first")
    areas = [a.strip().upper() for a in args.mission_areas.split(",") if a.strip()] if args.mission_areas else None
    if areas and not set(areas) <= set(MISSION_AREAS):
        raise CasrepError(f"mission areas must come from {', '.join(MISSION_AREAS)}")
    entries = AuditLog(log).entries()
    run, casrep = draft(entries, verify_file(log), parse_query_id(args.query) if args.query else None, cfg,
                        {"category": args.category, "mission_areas": areas, "assistance": args.assistance,
                         "equipment": args.equipment, "serial": args.serial, "poc_name": args.poc_name})
    qid = query_id(run["query"]["seq"])

    # Written before any network call, so the draft survives a board that cannot be reached.
    out = args.out or REPO_ROOT / "audit" / f"casrep-{qid}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(casrep, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(render(casrep))
    print(f"\nDraft written to {out}")
    if args.dry_run:
        print("Dry run: nothing was sent.")
        return 0
    if prior := sent_for(entries, run["query"]["seq"]):
        raise CasrepError(f"{qid} was already sent as {prior['payload']['serial']} (audit #{prior['seq']}); "
                          "update that CASREP on the board instead")

    print(f"Board: {cfg['CASREP_URL']} (Originator key {'set' if cfg.get('CASREP_KEY') else 'missing'})")
    if not args.yes and input("Send this CASREP to the board? [y/N] ").strip().lower() != "y":
        print("Not sent. The draft stays in the file above.")
        return 0
    created = submit(casrep, cfg)
    print(f"Created CASREP {created['serial']} at the Originator step: {created['link']}")
    print("On the board the Originator submits it up the chain, or saves a CASCAN to dismiss it.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except CasrepError as err:
        print(f"casrep: {err}", file=sys.stderr)
        sys.exit(1)
