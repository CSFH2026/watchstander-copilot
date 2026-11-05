// Cloud twin of api/known.py: open CASREPs from the CASREP Board, cached in D1, matched to a procedure.
// The match terms come from the bundle, computed by api/known.py, so this file holds only the rules.
// A query reads the cache and never waits on the board; a stale cache is refreshed after the answer.
import { bundle } from './bundle.ts';
import type { Env } from './types.ts';

const C = bundle.casrep;
const STOPWORDS = new Set(C.stopwords);
const PROCEDURE_RE = /\b[A-Z]{2,6}(?:-[A-Z0-9]{2,8}){2,3}\b/g;
const SYNC_SECONDS = 60;
const STALE_SECONDS = 5 * SYNC_SECONDS;
const ARCHIVE_ROWS = 20;
const USER_AGENT = 'watchstander-copilot/1.0 (casrep export)';

type Bundle = { casrep: Record<string, unknown> & { id: string }; versions: Record<string, unknown>[]; events: Record<string, unknown>[] };
export type Known = Record<string, unknown> & { id: string; serial: string; status: string; category: number; procedure_ids: string[]; equipment: string };

const word = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

export function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().match(/[a-z0-9]+(?:[-/][a-z0-9]+)*/g) ?? []) {
    const expanded = C.abbreviations[w];
    for (const part of [w, ...(expanded ? (expanded.match(/[a-z0-9]+/g) ?? []) : [])]) if (!STOPWORDS.has(part)) out.add(word(part));
  }
  return out;
}

export function match(procedureId: string, c: Known): 'procedure' | 'system' | null {
  if (c.procedure_ids.includes(procedureId)) return 'procedure';
  const equipment = tokens(c.equipment ?? '');
  return (C.terms[procedureId] ?? []).some((t) => t.every((w) => equipment.has(w))) ? 'system' : null;
}

export function boardOf(env: Env) {
  const url = (env.CASREP_URL ?? '').replace(/\/+$/, '');
  return { url, site: (env.CASREP_SITE ?? url.replace(':8787', ':3000')).replace(/\/+$/, '') };
}

function summarize(b: Bundle, site: string): Known {
  const c = b.casrep;
  const v = (b.versions[b.versions.length - 1] ?? {}) as Record<string, unknown>;
  const step = Number(c.current_step ?? 0);
  const at = Math.min(step, C.step_names.length - 1);
  const text = ['equipment', 'description', 'remarks'].map((k) => String(v[k] ?? '')).join(' ');
  const moved = [...b.events].reverse().find((e) => e.action !== 'commented');
  return {
    id: c.id, serial: String(c.serial), unit: c.unit ?? null, uic: c.uic ?? null, status: String(c.status),
    closed_by: c.status === 'corrected' ? 'CASCOR' : c.status === 'cancelled' ? 'CASCAN' : null,
    step, step_name: C.step_names[at], step_phrase: C.step_phrases[at],
    report_type: v.report_type ?? null, category: Number(v.category ?? 0), equipment: String(v.equipment ?? ''), eic: v.eic ?? null,
    dtg: v.dtg ?? null, etr: v.etr ?? null, parts: v.parts ?? [], assistance: v.assistance ?? null, version_no: v.version_no ?? null,
    last_update: c.updated_at ?? null, last_action: moved?.action ?? null,
    procedure_ids: [...new Set(text.match(PROCEDURE_RE) ?? [])].sort(),
    link: `${site}/casrep/?id=${c.id}`,
  };
}

async function call(env: Env, path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const { url } = boardOf(env);
  let res: Response;
  try {
    res = await fetch(`${url}/api/v1${path}`, {
      headers: { 'X-Admin-API-Key': env.CASREP_READ_KEY ?? '', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    throw new Error(`cannot reach the CASREP Board at ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = { message: res.statusText };
  }
  return { status: res.status, body };
}

/** Pulls this ship's open CASREPs and the recently closed, with each one's detail, into D1. */
export async function sync(env: Env): Promise<void> {
  const { url } = boardOf(env);
  const now = new Date().toISOString().replace(/\.\d+Z$/, '+00:00');
  const uic = env.CASREP_UIC ?? 'N99999';
  try {
    if (!env.CASREP_READ_KEY) throw new Error('no CASREP read key is set; see docs/CASREP.md');
    const rows: Record<string, unknown>[] = [];
    for (const q of ['scope=active&limit=200', `scope=archive&limit=${ARCHIVE_ROWS}&sort=updated`]) {
      const { status, body } = await call(env, `/casreps?${q}`);
      if (status !== 200) throw new Error(`the board refused the list (${status}): ${String(body.message ?? '')}`);
      rows.push(...((body.casreps as Record<string, unknown>[]) ?? []).filter((r) => r.uic === uic));
    }
    const details = await Promise.all(rows.map((r) => call(env, `/casreps/${String(r.id)}`)));
    const bundles = details.filter((d) => d.status === 200).map((d) => d.body);
    await env.DB.prepare(
      `INSERT INTO casrep_cache (board, as_of, payload, last_attempt, last_error) VALUES (?, ?, ?, ?, NULL)
       ON CONFLICT(board) DO UPDATE SET as_of = excluded.as_of, payload = excluded.payload, last_attempt = excluded.last_attempt, last_error = NULL`,
    ).bind(url, now, JSON.stringify(bundles), now).run();
  } catch (err) {
    await env.DB.prepare(
      `INSERT INTO casrep_cache (board, last_attempt, last_error) VALUES (?, ?, ?)
       ON CONFLICT(board) DO UPDATE SET last_attempt = excluded.last_attempt, last_error = excluded.last_error`,
    ).bind(url, now, err instanceof Error ? err.message : String(err)).run();
  }
}

/** The cached CASREPs, open first, and how old they are. Schedules a pull after the answer when the copy is old. */
export async function snapshot(env: Env, waitUntil?: (p: Promise<unknown>) => void) {
  const board = boardOf(env);
  const row = await env.DB.prepare('SELECT as_of, payload, last_attempt, last_error FROM casrep_cache WHERE board = ?')
    .bind(board.url)
    .first<{ as_of: string | null; payload: string | null; last_attempt: string | null; last_error: string | null }>();
  const bundles = (row?.payload ? JSON.parse(row.payload) : []) as Bundle[];
  const age = row?.as_of ? Math.round((Date.now() - Date.parse(row.as_of)) / 1000) : null;
  const attempted = row?.last_attempt ? (Date.now() - Date.parse(row.last_attempt)) / 1000 : Infinity;
  if (waitUntil && attempted > SYNC_SECONDS) waitUntil(sync(env));
  const casreps = bundles.map((b) => summarize(b, board.site));
  casreps.sort((a, b) => Number(a.status !== 'open') - Number(b.status !== 'open') || b.category - a.category || a.serial.localeCompare(b.serial));
  return {
    board, read: !!env.CASREP_READ_KEY, as_of: row?.as_of ?? null, age_seconds: age,
    stale: age === null || age > STALE_SECONDS || !!row?.last_error, error: row?.last_error ?? null, last_attempt: row?.last_attempt ?? null,
    casreps, bundles: Object.fromEntries(bundles.map((b) => [b.casrep.id, b])),
  };
}

export function forProcedure(procedureId: string, snap: { casreps: Known[] }) {
  return snap.casreps
    .filter((c) => c.status === 'open')
    .map((c) => ({ c, m: match(procedureId, c) }))
    .filter((x) => x.m)
    .sort((a, b) => Number(a.m !== 'procedure') - Number(b.m !== 'procedure') || b.c.category - a.c.category)
    .map(({ c, m }) => ({ ...c, match: m }));
}
