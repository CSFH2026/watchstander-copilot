"""Watchstander Copilot API. One process serves the API under /api and the built UI at /.

Run: make demo  (or from api/: ../.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000)
"""
import time
from typing import Literal
from collections import defaultdict
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import casrep
from config import AUDIT_PATH, CONFIG, DATASET, EMBED_MODEL, INDEX_PATH, NODE_ID, OPERATOR_IDS, UI_DIR
from policy.engine import PolicyEngine
from retrieval.indexer import ensure_index
from retrieval.embed import embed_query
from retrieval.search import Retriever
from trust import keys
from trust.audit import GENESIS, AuditLog, check_entry, ref, verify_file

state: dict = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    if not INDEX_PATH.exists():
        print(f"building the {DATASET['name']} index once; a large dataset takes a few minutes", flush=True)
    built = ensure_index()
    if built:
        print(f"index rebuilt: {built['procedures']} procedures, {built['steps']} steps in {built['seconds']} s")
    keys.ensure_identities()
    retriever = Retriever()
    # Said at every start, so whoever runs the demo can see which corpus answers before the first question.
    print(f"serving dataset {DATASET['name']} ({DATASET['kind']}): {len(retriever.procedures)} procedures, "
          f"{len(retriever.steps)} steps. Pick another with DATASET=<name>; make datasets lists them.", flush=True)
    # Loads the ONNX model now, so the first real question is fast. Called directly because
    # search() skips the model for out-of-scope text.
    embed_query("low lube oil pressure")
    by_proc = defaultdict(list)
    for s in retriever.steps:
        by_proc[s["procedure_id"]].append(s)
    policy = PolicyEngine(retriever.step_by_id, dict(by_proc))
    audit = AuditLog(AUDIT_PATH)
    policy.replay(audit.entries())
    state.update(retriever=retriever, policy=policy, audit=audit)
    yield


app = FastAPI(title="Watchstander Copilot", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:3100", "http://localhost:3100"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class QueryIn(BaseModel):
    operator_id: str
    text: str = Field(max_length=500)
    input: str = "typed"


class ActionIn(BaseModel):
    operator_id: str
    procedure_id: str
    step_id: str
    action: str = "acknowledge"
    # A step done on a printed checklist and typed in later says so, with what the Sailor wrote on the sheet.
    source: Literal["screen", "paper"] = "screen"
    sheet: str | None = Field(default=None, max_length=40)
    reading: str | None = Field(default=None, max_length=200)
    done_at: str | None = Field(default=None, max_length=40)
    note: str | None = Field(default=None, max_length=500)


def _paper_fields(body: ActionIn) -> dict:
    """The sheet fields that were filled in; an on-screen action without them logs exactly as before."""
    extra = {k: v.strip() for k in ("sheet", "reading", "done_at", "note") if (v := getattr(body, k)) and v.strip()}
    return ({"source": "paper"} if body.source == "paper" else {}) | extra


class ResetIn(BaseModel):
    operator_id: str


def _operator(operator_id: str) -> str:
    if operator_id not in OPERATOR_IDS:
        raise HTTPException(400, f"Unknown operator {operator_id}. Enrolled: {', '.join(OPERATOR_IDS)}")
    return operator_id


@app.get("/api/health")
def health():
    r: Retriever = state["retriever"]
    return {"ok": True, "offline": CONFIG["offline"], "procedures": len(r.procedures), "steps": len(r.steps),
            "model": EMBED_MODEL, "operator_ids": OPERATOR_IDS, "target": CONFIG["target"],
            "models": {slot: v["provider"] if v["provider"] == "off" else f"{v['provider']}:{v['model']}"
                       for slot, v in CONFIG["models"].items()},
            "dataset": {k: DATASET[k] for k in ("name", "title", "kind", "source", "license", "examples")},
            # Read from the settings at each call, so a key added to .casrep.local shows without a restart.
            "casrep": casrep.board(casrep.settings())}


@app.post("/api/query")
def query(body: QueryIn):
    t0 = time.perf_counter()
    op = _operator(body.operator_id)
    r: Retriever = state["retriever"]
    policy: PolicyEngine = state["policy"]
    found = r.search(body.text)
    ranked = found["ranked"]
    proc = None
    if ranked:
        pid, score = ranked[0]
        p = r.procedures[pid]
        proc = {"procedure_id": pid, "title": p["title"], "source": p["source"], "score": round(score, 4),
                "symptoms": p["symptoms"]}
    steps = policy.states(op, proc["procedure_id"]) if proc else []
    alternates = [{"procedure_id": pid, "title": r.procedures[pid]["title"], "score": round(s, 4)} for pid, s in ranked[1:3]]
    latency_ms = round((time.perf_counter() - t0) * 1000)
    outcome = f"{proc['procedure_id']} ({found['confidence']})" if proc else "no authorized procedure"
    summary = f"query \"{body.text[:60]}\" -> {outcome}"
    entry = state["audit"].append(op, "query", {
        "summary": summary, "text": body.text, "input": body.input,
        "procedure_id": proc["procedure_id"] if proc else None, "latency_ms": latency_ms,
    }, signer=NODE_ID)
    return {
        "query_id": f"q-{entry['seq']:04d}",
        "latency_ms": latency_ms,
        "procedure": proc,
        "steps": steps,
        "alternates": alternates,
        "confidence": found["confidence"],
        "notice": found["notice"],
        "matched": {"keyword": found["keyword_hits"], "semantic_top": found["semantic_top"],
                    "max_cosine": round(found["max_cosine"], 4)},
        "audit": ref(entry),
    }


@app.post("/api/action")
def action(body: ActionIn):
    op = _operator(body.operator_id)
    if body.action != "acknowledge":
        raise HTTPException(400, "Only the acknowledge action is supported")
    policy: PolicyEngine = state["policy"]
    allowed, reason = policy.apply(op, body.procedure_id, body.step_id)
    via = " from paper" if body.source == "paper" else ""
    entry = state["audit"].append(op, "action", {
        "summary": f"acknowledge {body.step_id}{via}: {'allowed' if allowed else 'blocked'}",
        "procedure_id": body.procedure_id, "step_id": body.step_id, "allowed": allowed, "reason": reason,
    } | _paper_fields(body), signer=op)
    if allowed:
        policy.record(op, body.step_id, entry["seq"])
    return {"allowed": allowed, "reason": reason, "step_id": body.step_id,
            "steps": policy.states(op, body.procedure_id), "audit": ref(entry)}


@app.post("/api/reset")
def reset(body: ResetIn):
    op = _operator(body.operator_id)
    state["policy"].reset(op)
    entry = state["audit"].append(op, "reset", {"summary": "drill reset"}, signer=op)
    return {"ok": True, "audit": ref(entry)}


class CasrepIn(BaseModel):
    """The fields a person decides before a send. Everything else comes from the signed run on the server."""
    operator_id: str
    query_id: str
    category: Literal[2, 3, 4] = 2
    mission_areas: list[Literal[casrep.MISSION_AREAS]] = Field(default_factory=lambda: ["MOB"], min_length=1)
    assistance: Literal[casrep.ASSISTANCE] = "none"
    equipment: str | None = Field(default=None, max_length=120)
    poc_name: str | None = Field(default=None, max_length=80)


def _casrep_draft(query_id: str, opts: dict | None = None) -> tuple[dict, dict, list[dict]]:
    entries = state["audit"].entries()
    try:
        run, draft = casrep.draft(entries, verify_file(AUDIT_PATH), casrep.parse_query_id(query_id), casrep.settings(), opts)
    except casrep.CasrepError as err:
        raise HTTPException(422, str(err)[0].upper() + str(err)[1:] + ".")
    return run, draft, entries


@app.get("/api/casrep/draft")
def casrep_draft(query_id: str):
    """The CASREP this run would send, built offline from the audit log. Nothing leaves the laptop."""
    run, draft, entries = _casrep_draft(query_id)
    prior = casrep.sent_for(entries, run["query"]["seq"])
    return {"query_id": casrep.query_id(run["query"]["seq"]), "casrep": draft, "board": casrep.board(casrep.settings()),
            "sent": prior and {"serial": prior["payload"]["serial"], "link": prior["payload"]["link"], "audit_seq": prior["seq"]}}


@app.post("/api/casrep/send")
def casrep_send(body: CasrepIn):
    """Sends the run's CASREP to the board with the Originator key held here, and logs the send signed by the operator."""
    op = _operator(body.operator_id)
    opts = body.model_dump(include={"category", "mission_areas", "assistance", "equipment", "poc_name"})
    run, draft, entries = _casrep_draft(body.query_id, opts)
    qid = casrep.query_id(run["query"]["seq"])
    if prior := casrep.sent_for(entries, run["query"]["seq"]):
        raise HTTPException(409, f"{qid} was already sent as {prior['payload']['serial']}. Update it on the CASREP Board.")
    cfg = casrep.settings()
    if not casrep.board(cfg)["ready"]:
        raise HTTPException(400, "The CASREP Board key is not set on this laptop. Put CASREP_KEY in .casrep.local; see docs/CASREP.md.")
    try:
        created = casrep.submit(draft, cfg)
    except casrep.CasrepError as err:
        raise HTTPException(502, str(err)[0].upper() + str(err)[1:] + ".")
    entry = state["audit"].append(op, "casrep", {
        "summary": f"casrep {created['serial']} sent for {qid}", "query_id": qid,
        "procedure_id": run["query"]["payload"]["procedure_id"], "serial": created["serial"], "casrep_id": created["id"],
        "board": created["board"], "link": created["link"], "report_type": draft["report_type"], "category": draft["category"],
    }, signer=op)
    return {"serial": created["serial"], "id": created["id"], "link": created["link"], "casrep": created["casrep"],
            "audit": ref(entry)}


@app.get("/api/audit")
def audit_list(limit: int = 20):
    out = []
    for e in reversed(state["audit"].entries()[-max(1, min(limit, 200)):]):
        if "_unparseable" in e:
            out.append({"seq": None, "ts": "", "actor": "?", "event": "unreadable", "summary": "unreadable line",
                        "hash": "", "prev_hash": "", "signer": ""})
            continue
        p = e.get("payload") or {}
        out.append({"seq": e["seq"], "ts": e["ts"], "actor": e["actor"], "event": e["event"],
                    "summary": p.get("summary", ""), "hash": e["hash"],
                    "prev_hash": e["prev_hash"], "signer": e["signer"],
                    # For filtering the full log by procedure and by allowed or blocked.
                    "procedure_id": p.get("procedure_id"), "step_id": p.get("step_id"), "allowed": p.get("allowed")})
    return {"entries": out}


@app.get("/api/audit/verify")
def audit_verify():
    return verify_file(AUDIT_PATH)


# Declared after /api/audit/verify so "verify" never reaches the int path parameter.
@app.get("/api/audit/{seq}")
def audit_entry(seq: int):
    """One entry in full, with each check reported on its own, for the entry view in the UI."""
    entries = state["audit"].entries()
    if not 1 <= seq <= len(entries) or entries[seq - 1].get("seq") != seq:
        raise HTTPException(404, f"No audit entry #{seq}")
    e = entries[seq - 1]
    prev = entries[seq - 2].get("hash", "") if seq > 1 else GENESIS
    return {"entry": e, "checks": check_entry(e, prev)}


# The built UI, served last so /api routes win. Absent until `make ui` has run once.
if UI_DIR.exists():
    app.mount("/", StaticFiles(directory=UI_DIR, html=True), name="ui")
