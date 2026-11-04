"""Turns one corpus markdown file into a procedure dict and its ordered steps.

Lane 2 writes these files by hand, so every error names the file and line to fix.
"""
import re
from pathlib import Path

import yaml

STEP_RE = re.compile(r"^\s*\d+\.\s*\[step:\s*([A-Za-z0-9-]+)\]\s*(.+?)\s*$")
REQUIRED = ("procedure_id", "title", "source", "symptoms")


class CorpusError(ValueError):
    pass


def _full_id(procedure_id: str, ref: str) -> str:
    # "04" is shorthand for a step in the same procedure; a full id may point anywhere.
    ref = ref.strip().rstrip(".")
    return ref if "-" in ref else f"{procedure_id}-{ref.zfill(2)}"


def parse_file(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    parts = text.split("---", 2)
    if len(parts) < 3 or parts[0].strip():
        raise CorpusError(f"{path}: must start with a --- front matter block")
    meta = yaml.safe_load(parts[1]) or {}
    missing = [k for k in REQUIRED if not meta.get(k)]
    if missing:
        raise CorpusError(f"{path}: front matter is missing {', '.join(missing)}")
    pid = str(meta["procedure_id"])
    body_start = text.count("\n", 0, len(parts[0]) + len(parts[1]) + 6) + 1

    steps = []
    for offset, line in enumerate(parts[2].splitlines()):
        if not line.strip():
            continue
        m = STEP_RE.match(line)
        if not m:
            raise CorpusError(f"{path}:{body_start + offset}: not a step line: {line.strip()[:60]}")
        step_id, rest = m.group(1), m.group(2)
        if " requires:" not in rest:
            raise CorpusError(f"{path}:{body_start + offset}: step {step_id} has no 'requires:'")
        step_text, tail = rest.rsplit(" requires:", 1)
        danger = None
        if "danger:" in tail:
            tail, danger = tail.split("danger:", 1)
            danger = danger.strip()
        req_raw = tail.strip().rstrip(".").strip()
        requires = [] if req_raw.lower() in ("", "none") else [_full_id(pid, r) for r in req_raw.split(",")]
        steps.append({
            "step_id": step_id,
            "procedure_id": pid,
            "seq": int(step_id.rsplit("-", 1)[-1]),
            "text": step_text.strip(),
            "requires": requires,
            "danger": danger,
        })
    if not steps:
        raise CorpusError(f"{path}: has no step lines")

    known = {s["step_id"] for s in steps}
    for s in steps:
        for r in s["requires"]:
            if r.startswith(pid) and r not in known:
                raise CorpusError(f"{path}: step {s['step_id']} requires {r}, which is not in this file")

    as_list = lambda v: [str(x) for x in v] if isinstance(v, list) else ([str(v)] if v else [])
    return {
        "procedure_id": pid,
        "ship_class": path.parent.name,
        "title": str(meta["title"]),
        "source": str(meta["source"]),
        "symptoms": as_list(meta.get("symptoms")),
        "causes": as_list(meta.get("causes")),
        "associated": as_list(meta.get("associated")),
        "file": str(path),
        "steps": steps,
    }


def load_corpus(corpus_dir: Path) -> list[dict]:
    files = sorted(p for p in corpus_dir.glob("*/*.md"))
    procs = [parse_file(p) for p in files]
    seen = {}
    for p in procs:
        if p["procedure_id"] in seen:
            raise CorpusError(f"{p['file']}: procedure_id {p['procedure_id']} also used in {seen[p['procedure_id']]}")
        seen[p["procedure_id"]] = p["file"]
    return procs
