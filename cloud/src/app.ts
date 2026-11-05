// The six endpoints from docs/CONTRACTS.md, answered the way api/main.py answers them.
import { append, canonical, latest, ref, sha256, verifyAll } from './audit.ts';
import { bundle } from './bundle.ts';
import { embed } from './embed.ts';
import { verify } from './keys.ts';
import { check, doneSteps, states } from './policy.ts';
import { procedure, procedures } from './store.ts';
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
    procedures: bundle.counts.procedures,
    steps: bundle.counts.steps,
    model: bundle.embed_model,
    operator_ids: bundle.operator_ids,
    target: bundle.config.target,
    models,
    dataset: bundle.dataset,
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
  const shown = found.ranked.slice(0, 3);
  const rows = await procedures(env, shown.map(([pid]) => pid));
  const top = shown[0];
  const p = top ? rows.get(top[0]) ?? null : null;
  const proc = p && top
    ? { procedure_id: p.procedure_id, title: p.title, source: p.source, score: round4(top[1]), symptoms: p.symptoms }
    : null;
  const steps = p ? states(await doneSteps(env, op), p) : [];
  const alternates = shown.slice(1).map(([pid, s]) => ({ procedure_id: pid, title: rows.get(pid)?.title ?? pid, score: round4(s) }));
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
  const [allowed, reason] = await check(env, done, procedureId, stepId);
  if (allowed) done.add(stepId);
  const entry = await append(env, op, 'action', {
    summary: `acknowledge ${stepId}: ${allowed ? 'allowed' : 'blocked'}`,
    procedure_id: procedureId,
    step_id: stepId,
    allowed,
    reason,
  }, op);
  return { allowed, reason, step_id: stepId, steps: states(done, await procedure(env, procedureId)), audit: ref(entry) };
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

// Deploy-time only: scripts/run.py sends step texts in batches, signed by the node key, and this
// route embeds them with Workers AI into Vectorize. The node key is the deployer's, so no extra
// secret is needed; the timestamp bounds replay, and the corpus hash rejects a stale deployment.
const ADMIN_WINDOW_MS = 5 * 60 * 1000;

async function adminEmbed(env: Env, b: Record<string, unknown>) {
  const items = b.items as { id: string; text: string }[] | undefined;
  const signed = { corpus_sha256: b.corpus_sha256, items, ts: b.ts };
  if (!Array.isArray(items) || !items.length || items.length > 100) throw new HttpError(422, 'items must hold 1 to 100 steps');
  if (typeof b.ts !== 'number' || Math.abs(Date.now() - b.ts) > ADMIN_WINDOW_MS) throw new HttpError(401, 'Request timestamp is missing or too old');
  if (!(await verify(bundle.node_id, await sha256(canonical(signed)), String(b.signature ?? ''))))
    throw new HttpError(401, `Not signed by ${bundle.node_id}`);
  if (b.corpus_sha256 !== bundle.corpus_sha256) throw new HttpError(409, 'This deployment serves a different corpus; wait for the new one');
  const vectors = await embed(env, items.map((i) => i.text));
  await env.VECTORS.upsert(items.map((item, i) => ({ id: item.id, values: vectors[i] })));
  return { upserted: items.length };
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
      case 'POST /api/admin/embed': return json(await adminEmbed(env, await body(request)));
      default: return json({ detail: 'Not Found' }, 404);
    }
  } catch (err) {
    if (err instanceof HttpError) return json({ detail: err.detail }, err.status);
    console.error(err);
    return json({ detail: err instanceof Error ? err.message : 'Internal error' }, 500);
  }
}
