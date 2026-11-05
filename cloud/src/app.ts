// The six endpoints from docs/CONTRACTS.md, answered the way api/main.py answers them.
import { append, AuditBusy, canonical, latest, ref, sha256, verifyAll } from './audit.ts';
import { bundle } from './bundle.ts';
import { boardOf, forProcedure, refresh, snapshot } from './casreps.ts';
import { embed } from './embed.ts';
import { examples } from './examples.ts';
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

// Twin of the Field limits in api/main.py (docs/CONTRACTS.md): one request cannot grow the signed log without limit.
const OPERATOR_MAX = 40;
const ID_MAX = 80;
const LABEL_MAX = 20;

function bounded(b: Record<string, unknown>, key: string, max: number, fallback?: string): string {
  const v = b[key] ?? fallback;
  if (typeof v !== 'string' || v.length > max) throw new HttpError(422, `${key} must be text of ${max} characters or fewer`);
  return v;
}

function operator(id: unknown): string {
  if (typeof id === 'string' && id.length > OPERATOR_MAX) throw new HttpError(422, `operator_id must be text of ${OPERATOR_MAX} characters or fewer`);
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

type WaitUntil = (p: Promise<unknown>) => void;

function health(env: Env) {
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
    // Known casualties only: this preset reads the CASREP Board but drafts no CASREP, so drafts is false.
    ...(env.CASREP_URL ? { casrep: { ...boardOf(env), ready: false, read: !!env.CASREP_READ_KEY, drafts: false } } : {}),
  };
}

async function query(env: Env, b: Record<string, unknown>, waitUntil?: WaitUntil) {
  const t0 = Date.now();
  const op = operator(b.operator_id);
  if (typeof b.text !== 'string') throw new HttpError(422, 'text is required');
  if (b.text.length > 500) throw new HttpError(422, 'text must be 500 characters or fewer');
  const text = b.text;
  const input = bounded(b, 'input', LABEL_MAX, 'typed');
  if (b.pick !== undefined && b.pick !== null && typeof b.pick !== 'string') throw new HttpError(422, 'pick must be a procedure id');
  const pick = typeof b.pick === 'string' && b.pick ? b.pick : null;
  const found = await search(env, text);
  const rows = await procedures(env, found.candidates.map((c) => c.procedure_id));
  const candidates = found.candidates.map((c, i) => ({
    rank: i + 1,
    procedure_id: c.procedure_id,
    title: rows.get(c.procedure_id)?.title ?? c.procedure_id,
    score: round4(c.score),
    relative: Math.round(c.relative * 1000) / 1000,
    strength: c.strength,
    cosine: round4(c.cosine),
    keyword: c.keyword,
  }));
  // Twin of pick in api/main.py: only a procedure on this question's own list can be opened.
  const chosen = pick ? candidates.find((c) => c.procedure_id === pick) : candidates[0];
  if (pick && !chosen) throw new HttpError(422, `${pick} is not a candidate for this question. Ask again.`);
  const p = chosen ? rows.get(chosen.procedure_id) ?? null : null;
  const proc = p && chosen
    ? { procedure_id: p.procedure_id, title: p.title, source: p.source, score: chosen.score, symptoms: p.symptoms }
    : null;
  const steps = p ? states(await doneSteps(env, op), p) : [];
  const alternates = candidates.slice(1, 3).map((c) => ({ procedure_id: c.procedure_id, title: c.title, score: c.score }));
  const latency_ms = Date.now() - t0;
  const outcome = (proc ? `${proc.procedure_id} (${found.confidence})` : 'no authorized procedure') +
    (pick && chosen ? `, picked rank ${chosen.rank} of ${candidates.length}` : '');
  const entry = await append(env, op, 'query', {
    summary: `query "${text.slice(0, 60)}" -> ${outcome}`,
    text,
    input,
    procedure_id: proc?.procedure_id ?? null,
    latency_ms,
    ...(pick && chosen ? { picked_rank: chosen.rank } : {}),
  }, bundle.node_id);
  // From the D1 cache only; an old cache is pulled again after this answer, never before it.
  const known = proc && env.CASREP_URL ? forProcedure(proc.procedure_id, await snapshot(env, waitUntil)) : [];
  return {
    query_id: `q-${String(entry.seq).padStart(4, '0')}`,
    latency_ms,
    procedure: proc,
    steps,
    known_casualties: known,
    candidates,
    alternates,
    confidence: found.confidence,
    notice: found.notice,
    matched: { keyword: found.keyword_hits, semantic_top: found.semantic_top, max_cosine: round4(found.max_cosine) },
    audit: ref(entry),
  };
}

// Twin of _paper_fields in api/main.py: the sheet fields that were filled in, with their length limits.
const PAPER_LIMITS = { sheet: 40, reading: 200, done_at: 40, note: 500 } as const;

function paperFields(b: Record<string, unknown>): Record<string, string> {
  const source = b.source ?? 'screen';
  if (source !== 'screen' && source !== 'paper') throw new HttpError(422, 'source must be screen or paper');
  const out: Record<string, string> = source === 'paper' ? { source: 'paper' } : {};
  for (const [k, max] of Object.entries(PAPER_LIMITS)) {
    const v = b[k];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string' || v.length > max) throw new HttpError(422, `${k} must be text of ${max} characters or fewer`);
    if (v.trim()) out[k] = v.trim();
  }
  return out;
}

async function action(env: Env, b: Record<string, unknown>) {
  const op = operator(b.operator_id);
  if (bounded(b, 'action', LABEL_MAX, 'acknowledge') !== 'acknowledge') throw new HttpError(400, 'Only the acknowledge action is supported');
  const procedureId = bounded(b, 'procedure_id', ID_MAX);
  const stepId = bounded(b, 'step_id', ID_MAX);
  const paper = paperFields(b);
  const done = await doneSteps(env, op);
  const [allowed, reason] = await check(env, done, procedureId, stepId);
  if (allowed) done.add(stepId);
  const entry = await append(env, op, 'action', {
    summary: `acknowledge ${stepId}${paper.source ? ' from paper' : ''}: ${allowed ? 'allowed' : 'blocked'}`,
    procedure_id: procedureId,
    step_id: stepId,
    allowed,
    reason,
    ...paper,
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

// The cached board without the raw bundles, as GET /api/casreps answers in api/main.py.
async function knownList(env: Env, waitUntil?: WaitUntil) {
  const { bundles: _bundles, ...rest } = await snapshot(env, waitUntil);
  return rest;
}

async function knownDetail(env: Env, id: string) {
  const snap = await snapshot(env);
  const b = snap.bundles[id];
  if (!b) throw new HttpError(404, `No cached CASREP ${id}`);
  return { casrep: snap.casreps.find((c) => c.id === id), versions: b.versions, events: b.events, as_of: snap.as_of, stale: snap.stale };
}

// A malformed %-escape is a CASREP the cache cannot hold, not a server fault.
function decodePath(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    throw new HttpError(404, 'No cached CASREP with that id');
  }
}

export async function handle(request: Request, env: Env, waitUntil?: WaitUntil): Promise<Response> {
  const url = new URL(request.url);
  const route = `${request.method} ${url.pathname.replace(/\/+$/, '')}`;
  try {
    // Without a board configured, the CASREP routes do not exist, as on a backend that predates them.
    if (env.CASREP_URL && route.startsWith('GET /api/casreps/') && route !== 'GET /api/casreps/refresh')
      return json(await knownDetail(env, decodePath(route.slice('GET /api/casreps/'.length))));
    switch (route) {
      case 'GET /api/health': return json(health(env));
      case 'GET /api/examples': return json(await examples(env, waitUntil));
      case 'POST /api/query': return json(await query(env, await body(request), waitUntil));
      case 'GET /api/casreps': if (env.CASREP_URL) return json(await knownList(env, waitUntil)); break;
      case 'POST /api/casreps/refresh': if (env.CASREP_URL) { await refresh(env); return json(await knownList(env)); } break;
      case 'POST /api/action': return json(await action(env, await body(request)));
      case 'POST /api/reset': return json(await reset(env, await body(request)));
      case 'GET /api/audit': return json(await auditList(env, url));
      case 'GET /api/audit/verify': return json(await verifyAll(env));
      case 'POST /api/admin/embed': return json(await adminEmbed(env, await body(request)));
    }
    return json({ detail: 'Not Found' }, 404);
  } catch (err) {
    if (err instanceof HttpError) return json({ detail: err.detail }, err.status);
    if (err instanceof AuditBusy) return json({ detail: err.message }, 503);
    // The detail goes to the Pages log only: an error's own text can name secrets, bindings, or SQL.
    console.error(err);
    return json({ detail: 'Internal error. The server log has the detail.' }, 500);
  }
}
