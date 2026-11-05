// Twin of api/casrep.py: a CASREP drafted from one run in the signed D1 audit table, and the send to the
// CASREP Board with the Originator key. The texts, limits, and ddg procedures come from the bundle, which
// python -m retrieval.export fills from api/casrep.py, so the cloud draft is the laptop draft for the same run.
// tests/test_casrep_cloud.py holds the two to that.
import type { Verified } from './audit.ts';
import { bundle } from './bundle.ts';
import { boardOf } from './casreps.ts';
import type { AuditEntry, CasrepProcedure, Env } from './types.ts';

const D = bundle.casrep_draft;

export class CasrepError extends Error {}

type Run = { query: AuditEntry; done: AuditEntry[]; blocked: AuditEntry[] };
export type Opts = { category?: number; mission_areas?: string[]; assistance?: string; equipment?: string | null; poc_name?: string | null; serial?: string };
export type Casrep = Record<string, unknown> & { serial: string; report_type: string; category: number };

const p = (e: AuditEntry) => e.payload as Record<string, string | boolean | null | undefined>;

export const queryId = (seq: number) => `q-${String(seq).padStart(4, '0')}`;

export function parseQueryId(text: string): number {
  const m = /^(?:q-?(\d+)|(\d+))$/.exec(text.trim());
  if (!m) throw new CasrepError(`'${text}' is not a query id; use the id on the screen or the sheet, such as q-0003`);
  return Number(m[1] ?? m[2]);
}

/** An audit timestamp as a Navy date-time group in UTC, such as 041915Z NOV 26. */
export function dtg(ts: string): string {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)([+-])(\d\d):?(\d\d)$/.exec(ts);
  if (!m) throw new CasrepError(`audit time ${ts} is not in the log's format`);
  const offset = (m[7] === '-' ? -1 : 1) * (Number(m[8]) * 60 + Number(m[9]));
  const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - offset * 60_000);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(t.getUTCDate())}${two(t.getUTCHours())}${two(t.getUTCMinutes())}Z ${D.months[t.getUTCMonth()]} ${two(t.getUTCFullYear() % 100)}`;
}

export const hasProcedure = (id: string) => Object.hasOwn(D.procedures, id);

export function findRun(entries: AuditEntry[], seq: number | null): Run {
  const queries = entries.filter((e) => e.event === 'query' && p(e).procedure_id);
  if (seq !== null) {
    const q = entries.find((e) => e.seq === seq);
    if (!q || q.event !== 'query') throw new CasrepError(`${queryId(seq)} is not a query in this audit log`);
    const pid = p(q).procedure_id;
    if (!pid) throw new CasrepError(`${queryId(seq)} found no procedure, so there is no casualty to report`);
    if (!hasProcedure(String(pid))) throw new CasrepError(`${queryId(seq)} matched ${pid}, which is not a ddg casualty procedure`);
    return runOf(entries, q);
  }
  for (const q of [...queries].reverse()) {
    if (!hasProcedure(String(p(q).procedure_id))) continue;
    const run = runOf(entries, q);
    if (run.done.length) return run;
  }
  throw new CasrepError('no run in this audit log has an acknowledged ddg step; acknowledge a step first or pass --query');
}

function runOf(entries: AuditEntry[], q: AuditEntry): Run {
  const actor = q.actor;
  const pid = p(q).procedure_id;
  const sheet = queryId(q.seq);
  const done: AuditEntry[] = [];
  const blocked: AuditEntry[] = [];
  let open = true;
  for (const e of entries) {
    if (e.seq <= q.seq || e.actor !== actor) continue;
    const ep = p(e);
    // The run ends at this operator's reset, or when they ask again and land on the same procedure.
    if (e.event === 'reset' || (e.event === 'query' && ep.procedure_id === pid)) open = false;
    if (e.event !== 'action' || ep.procedure_id !== pid) continue;
    // A paper sheet carries the query id, so its steps belong to this run whenever they are typed in.
    if (open || (ep.source === 'paper' && ep.sheet === sheet)) (ep.allowed ? done : blocked).push(e);
  }
  return { query: q, done, blocked };
}

// Python's len() and slicing count code points, so this does too.
function cut(text: string, limit: number): string {
  const chars = [...text];
  return chars.length <= limit ? text : chars.slice(0, limit - 3).join('').trimEnd() + '...';
}

const short = (stepId: string) => stepId.slice(stepId.lastIndexOf('-') + 1);

function stepLine(e: AuditEntry, textById: Map<string, string>): string {
  const ep = p(e);
  let how = 'on screen';
  if (ep.source === 'paper') {
    const bits = [ep.sheet ? `paper sheet ${ep.sheet}` : 'paper', ep.done_at ? `done ${ep.done_at}` : '',
      ep.reading ? `reading ${ep.reading}` : '', ep.note ? `note: ${ep.note}` : ''];
    how = bits.filter(Boolean).join(', ');
  }
  const id = String(ep.step_id);
  return `- ${short(id)} ${textById.get(id) ?? id} (${how}; audit #${e.seq})`;
}

type Settings = { unit: string; uic: string; poc_contact: string };

export function settings(env: Env): Settings {
  return {
    unit: env.CASREP_UNIT || D.defaults.CASREP_UNIT,
    uic: env.CASREP_UIC || D.defaults.CASREP_UIC,
    poc_contact: env.CASREP_POC_CONTACT || D.defaults.CASREP_POC_CONTACT,
  };
}

/** The board's create body. Pure: same run, procedure and settings give the same CASREP. */
export function build(run: Run, proc: CasrepProcedure, verified: Verified, cfg: Settings, opts: Opts = {}): Casrep {
  const q = run.query;
  const qp = p(q);
  const operator = q.actor;
  const textById = new Map(proc.steps.map((s) => [s.step_id, s.text]));
  const doneIds = new Set(run.done.map((e) => String(p(e).step_id)));
  const remaining = proc.steps.filter((s) => !doneIds.has(s.step_id)).map((s) => short(s.step_id));
  const confidence = /\((clear|ambiguous)\)$/.exec(String(qp.summary ?? ''));

  const lines = [
    `Casualty: ${proc.title}.`,
    `Reported to the Watchstander Copilot at ${dtg(q.ts)} by ${operator} (${qp.input ?? 'typed'}): "${String(qp.text ?? '').trim()}".`,
    `Matched procedure ${proc.procedure_id}` + (confidence ? ` (${confidence[1]} match).` : '.'),
    `Symptoms on the card: ${proc.symptoms.join('; ')}.`,
    `Actions taken (${run.done.length} of ${proc.steps.length} steps):`,
    ...(run.done.length ? run.done.map((e) => stepLine(e, textById)) : ['- none yet']),
    remaining.length ? `Steps not yet done: ${remaining.join(', ')}.` : 'All steps of the procedure are done.',
  ];
  const proof = [
    `Drafted by make casrep from the signed copilot audit log. Query ${queryId(q.seq)} is audit #${q.seq}, hash ${q.hash.slice(0, 16)}.`,
    `Step entries: ${run.done.map((e) => `#${e.seq}`).join(', ') || 'none'}, each signed by ${operator}.`,
  ];
  if (run.blocked.length)
    proof.push('Blocked by the policy engine: ' + run.blocked.map((e) => `#${e.seq} ${short(String(p(e).step_id))}: ${p(e).reason ?? ''}`).join('; '));
  proof.push(verified.ok ? `Audit chain verified: ${verified.entries} entries.` : `Audit chain NOT verified: ${verified.reason} at #${verified.broken_seq}.`);
  proof.push(`Procedure source: ${proc.source}`);

  const uic = cfg.uic;
  const equipment = opts.equipment || (proc.system ? `${proc.system}: ${proc.title}` : proc.title);
  const poc = cut(opts.poc_name || operator, D.limits.name);
  return {
    serial: opts.serial || `${uic}/${String(q.seq % 10000).padStart(4, '0')}`,
    unit: cfg.unit,
    uic,
    report_type: 'INITIAL',
    category: opts.category || 2,
    dtg: dtg(q.ts),
    equipment: cut(equipment, D.limits.equipment),
    eic: null,
    description: cut(lines.join('\n'), D.limits.text),
    mission_areas: [...(opts.mission_areas?.length ? opts.mission_areas : ['MOB'])],
    parts: [],
    assistance: opts.assistance || 'none',
    etr: null,
    remarks: cut(proof.join('\n'), D.limits.text),
    poc_name: poc,
    poc_contact: cfg.poc_contact,
    actor_name: poc,
  };
}

/** The audit entry that recorded this run's CASREP going to the board, if one did. */
export function sentFor(entries: AuditEntry[], seq: number): AuditEntry | null {
  const qid = queryId(seq);
  return [...entries].reverse().find((e) => e.event === 'casrep' && p(e).query_id === qid) ?? null;
}

/** The run and its CASREP. A chain that fails verification gives no draft, since the draft is its evidence. */
export function draft(entries: AuditEntry[], verified: Verified, seq: number | null, cfg: Settings, opts: Opts = {}): { run: Run; casrep: Casrep } {
  if (!verified.ok)
    throw new CasrepError(`the audit log fails verification at #${verified.broken_seq} (${verified.reason}); a CASREP is not drafted from a broken log`);
  const run = findRun(entries, seq);
  const casrep = build(run, D.procedures[String(p(run.query).procedure_id)], verified, cfg, opts);
  return { run, casrep };
}

/**
 * Where a CASREP would go, its dashboard, and whether this deployment holds the Originator key. Never the key itself.
 * passcode tells the panel to ask for the send passcode: the preview is public, so a send needs one.
 */
export const board = (env: Env) => ({ ...boardOf(env), ready: !!env.CASREP_KEY, passcode: true });

const digest = async (text: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

/** Whether the typed passcode is the CASREP_SEND_CODE secret, compared over digests so the time does not depend on it. */
export async function passcodeOk(env: Env, typed: string): Promise<boolean> {
  if (!env.CASREP_SEND_CODE) return false;
  const [a, b] = await Promise.all([digest(typed), digest(env.CASREP_SEND_CODE)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function call(method: string, url: string, key: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      // Cloudflare refuses a request without a User-Agent it accepts (error 1010), so the board call names the copilot.
      headers: { 'Content-Type': 'application/json', 'X-Admin-API-Key': key, 'User-Agent': D.user_agent },
      // A followed redirect would carry the Originator key to wherever it points, so a 3xx is an answer, not a hop.
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new CasrepError(`cannot reach the CASREP Board at ${url.split('/api/')[0]}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (res.status >= 300 && res.status < 400) return { status: res.status, body: { message: 'the board answered with a redirect; set CASREP_URL to its final address' } };
  try {
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  } catch {
    return { status: res.status, body: { message: res.statusText } };
  }
}

const message = (body: Record<string, unknown>) => String(body.message ?? body.error ?? '');

/** The serial itself, or the next number for the same UIC that the board does not hold yet. */
async function freeSerial(api: string, key: string, serial: string): Promise<string> {
  const [uic, num] = serial.split('/');
  const { status, body } = await call('GET', `${api}/api/v1/casreps?scope=all&limit=200&q=${encodeURIComponent(uic)}`, key);
  if (status !== 200) throw new CasrepError(`the board refused the list (${status}): ${message(body)}`);
  const taken = new Set(((body.casreps as { serial: string }[]) ?? []).map((c) => c.serial));
  const at = (n: number) => `${uic}/${String(n).padStart(num.length, '0')}`;
  let n = Number(num);
  while (taken.has(at(n))) n++;
  return at(n);
}

/** Sends the CASREP, on the next free serial, and returns what the board created with a link to it. */
export async function submit(casrep: Casrep, env: Env) {
  const { url: api, site } = boardOf(env);
  const key = env.CASREP_KEY ?? '';
  if (!key) throw new CasrepError('CASREP_KEY is not set; set the Pages secret to the board\'s Originator key');
  const body = { ...casrep, serial: await freeSerial(api, key, casrep.serial) };
  const { status, body: answer } = await call('POST', `${api}/api/v1/casreps`, key, body);
  if (status !== 201) {
    const hint = status === 401 || status === 403 ? ' The key must be the Originator key.' : '';
    throw new CasrepError(`the board refused the CASREP (${status}): ${message(answer)}.${hint}`);
  }
  const created = answer.casrep as { id: string; serial: string };
  return { id: created.id, serial: created.serial, link: `${site}/casrep/?id=${created.id}`, board: api, casrep: body };
}
