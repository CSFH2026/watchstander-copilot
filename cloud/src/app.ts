// The six endpoints from docs/CONTRACTS.md, answered the way api/main.py answers them.
import { append, latest, ref, verifyAll } from './audit.ts';
import { bundle } from './bundle.ts';
import { check, doneSteps, states } from './policy.ts';
import { search } from './search.ts';
import type { Env } from './types.ts';

class HttpError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

function operator(id: unknown): string {
  if (typeof id !== 'string' || !bundle.operator_ids.includes(id))
    throw new HttpError(400, `Unknown operator ${String(id)}. Enrolled: ${bundle.operator_ids.join(', ')}`);
  return id;
}

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const b = await request.json();
    if (b && typeof b === 'object' && !Array.isArray(b)) return b as Record<string, unknown>;
  } catch {
    // Falls through to the same 422 FastAPI sends for a body it cannot read.
  }
  throw new HttpError(422, 'Request body must be a JSON object');
}

function health() {
  const models = Object.fromEntries(
    Object.entries(bundle.config.models).map(([slot, v]) => [slot, v.provider === 'off' ? 'off' : `${v.provider}:${v.model}`]),
  );
  return {
    ok: true,
    offline: bundle.config.offline,
    procedures: Object.keys(bundle.procedures).length,
    steps: bundle.steps.length,
    model: bundle.embed_model,
    operator_ids: bundle.operator_ids,
    target: bundle.config.target,
    models,
  };
}

async function query(env: Env, b: Record<string, unknown>) {
  const t0 = Date.now();
  const op = operator(b.operator_id);
  if (typeof b.text !== 'string') throw new HttpError(422, 'text is required');
  if (b.text.length > 500) throw new HttpError(422, 'text must be 500 characters or fewer');
  const text = b.text;
  const input = typeof b.input === 'string' ? b.input : 'typed';
  const found = await search(env, text);
  const top = found.ranked[0];
  const p = top ? bundle.procedures[top[0]] : null;
  const proc = p && top
    ? { procedure_id: p.procedure_id, title: p.title, source: p.source, score: round4(top[1]), symptoms: p.symptoms }
    : null;
  const steps = proc ? states(await doneSteps(env, op), proc.procedure_id) : [];
  const alternates = found.ranked.slice(1, 3).map(([pid, s]) => ({ procedure_id: pid, title: bundle.procedures[pid].title, score: round4(s) }));
  const latency_ms = Date.now() - t0;
  const outcome = proc ? `${proc.procedure_id} (${found.confidence})` : 'no authorized procedure';
  const entry = await append(env, op, 'query', {
    summary: `query "${text.slice(0, 60)}" -> ${outcome}`,
    text,
    input,
    procedure_id: proc?.procedure_id ?? null,
    latency_ms,
  }, bundle.node_id);
  return {
    query_id: `q-${String(entry.seq).padStart(4, '0')}`,
    latency_ms,
    procedure: proc,
    steps,
    alternates,
    confidence: found.confidence,
    notice: found.notice,
    matched: { keyword: found.keyword_hits, semantic_top: found.semantic_top, max_cosine: round4(found.max_cosine) },
    audit: ref(entry),
  };
}

async function action(env: Env, b: Record<string, unknown>) {
  const op = operator(b.operator_id);
  if ((b.action ?? 'acknowledge') !== 'acknowledge') throw new HttpError(400, 'Only the acknowledge action is supported');
  const procedureId = String(b.procedure_id ?? '');
  const stepId = String(b.step_id ?? '');
  const done = await doneSteps(env, op);
  const [allowed, reason] = check(done, procedureId, stepId);
  if (allowed) done.add(stepId);
  const entry = await append(env, op, 'action', {
    summary: `acknowledge ${stepId}: ${allowed ? 'allowed' : 'blocked'}`,
    procedure_id: procedureId,
    step_id: stepId,
    allowed,
    reason,
  }, op);
  return { allowed, reason, step_id: stepId, steps: states(done, procedureId), audit: ref(entry) };
}

async function reset(env: Env, b: Record<string, unknown>) {
  const op = operator(b.operator_id);
  const entry = await append(env, op, 'reset', { summary: 'drill reset' }, op);
  return { ok: true, audit: ref(entry) };
}

async function auditList(env: Env, url: URL) {
  const limit = Number(url.searchParams.get('limit') ?? 20) || 20;
  const entries = (await latest(env, limit)).map((e) => ({
    seq: e.seq, ts: e.ts, actor: e.actor, event: e.event, summary: String(e.payload.summary ?? ''),
    hash: e.hash, prev_hash: e.prev_hash, signer: e.signer,
  }));
  return { entries };
}

export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const route = `${request.method} ${url.pathname.replace(/\/+$/, '')}`;
  try {
    switch (route) {
      case 'GET /api/health': return json(health());
      case 'POST /api/query': return json(await query(env, await body(request)));
      case 'POST /api/action': return json(await action(env, await body(request)));
      case 'POST /api/reset': return json(await reset(env, await body(request)));
      case 'GET /api/audit': return json(await auditList(env, url));
      case 'GET /api/audit/verify': return json(await verifyAll(env));
      default: return json({ detail: 'Not Found' }, 404);
    }
  } catch (err) {
    if (err instanceof HttpError) return json({ detail: err.detail }, err.status);
    console.error(err);
    return json({ detail: err instanceof Error ? err.message : 'Internal error' }, 500);
  }
}
