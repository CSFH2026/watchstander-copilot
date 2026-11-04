"""Watchstander Copilot API. One process serves the API under /api and the built UI at /.

Run: make demo  (or: .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000)
"""
import time
from collections import defaultdict
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from config import AUDIT_PATH, CONFIG, DATASET, EMBED_MODEL, NODE_ID, OPERATOR_IDS, UI_DIR
from policy.engine import PolicyEngine
from retrieval.indexer import ensure_index
from retrieval.embed import embed_query
from retrieval.search import Retriever
from trust import keys
from trust.audit import AuditLog, ref, verify_file

state: dict = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    built = ensure_index()
    if built:
        print(f"index rebuilt: {built['procedures']} procedures, {built['steps']} steps in {built['seconds']} s")
    keys.ensure_identities()
    retriever = Retriever()
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
            "dataset": {k: DATASET[k] for k in ("name", "title", "kind", "source", "license", "examples")}}


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
    entry = state["audit"].append(op, "action", {
        "summary": f"acknowledge {body.step_id}: {'allowed' if allowed else 'blocked'}",
        "procedure_id": body.procedure_id, "step_id": body.step_id, "allowed": allowed, "reason": reason,
    }, signer=op)
    return {"allowed": allowed, "reason": reason, "step_id": body.step_id,
            "steps": policy.states(op, body.procedure_id), "audit": ref(entry)}


@app.post("/api/reset")
def reset(body: ResetIn):
    op = _operator(body.operator_id)
    state["policy"].reset(op)
    entry = state["audit"].append(op, "reset", {"summary": "drill reset"}, signer=op)
    return {"ok": True, "audit": ref(entry)}


@app.get("/api/audit")
def audit_list(limit: int = 20):
    out = []
    for e in reversed(state["audit"].entries()[-max(1, min(limit, 200)):]):
        if "_unparseable" in e:
            out.append({"seq": None, "ts": "", "actor": "?", "event": "unreadable", "summary": "unreadable line",
                        "hash": "", "prev_hash": "", "signer": ""})
            continue
        out.append({"seq": e["seq"], "ts": e["ts"], "actor": e["actor"], "event": e["event"],
                    "summary": (e.get("payload") or {}).get("summary", ""), "hash": e["hash"],
                    "prev_hash": e["prev_hash"], "signer": e["signer"]})
    return {"entries": out}


@app.get("/api/audit/verify")
def audit_verify():
    return verify_file(AUDIT_PATH)


# The built UI, served last so /api routes win. Absent until `make ui` has run once.
if UI_DIR.exists():
    app.mount("/", StaticFiles(directory=UI_DIR, html=True), name="ui")
