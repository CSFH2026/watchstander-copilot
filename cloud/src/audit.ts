// Twin of api/trust/audit.py over a D1 table. Hashes use the same canonical JSON (sorted keys,
// compact separators, raw unicode), so an exported table verifies with `python -m trust.verify`.
import { sign, verify } from './keys.ts';
import type { AuditEntry, AuditRef, Env } from './types.ts';

const GENESIS = '0'.repeat(64);

/** Every retry lost the race for the next seq. The message is safe to show; app.ts answers 503 with it. */
export class AuditBusy extends Error {}
const HASHED_FIELDS = ['seq', 'ts', 'actor', 'event', 'payload_hash', 'prev_hash', 'signer'] as const;

type Row = Omit<AuditEntry, 'payload'> & { payload: string };

// json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False). Payloads hold only
// strings, integers, booleans, and null, so number formatting cannot differ from Python.
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(',')}}`;
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const entryHash = (e: Pick<AuditEntry, (typeof HASHED_FIELDS)[number]>) =>
  sha256(canonical(Object.fromEntries(HASHED_FIELDS.map((k) => [k, e[k]]))));

// time.strftime("%Y-%m-%dT%H:%M:%S%z") in UTC.
const timestamp = () => new Date().toISOString().slice(0, 19) + '+0000';

export async function append(env: Env, actor: string, event: string, payload: Record<string, unknown>, signer: string): Promise<AuditEntry> {
  // seq is the primary key, so two requests racing for the same seq cannot both land; the loser retries.
  for (let attempt = 0; attempt < 12; attempt++) {
    // Jitter, so writers that collided do not collide again on the next try.
    if (attempt) await new Promise((r) => setTimeout(r, Math.random() * 25 * attempt));
    const last = await env.DB.prepare('SELECT seq, hash FROM audit ORDER BY seq DESC LIMIT 1').first<{ seq: number; hash: string }>();
    const base = {
      seq: (last?.seq ?? 0) + 1,
      ts: timestamp(),
      actor,
      event,
      payload,
      payload_hash: await sha256(canonical(payload)),
      prev_hash: last?.hash ?? GENESIS,
      signer,
    };
    const hash = await entryHash(base);
    const entry: AuditEntry = { ...base, hash, signature: await sign(env, signer, hash) };
    try {
      await env.DB.prepare(
        'INSERT INTO audit (seq, ts, actor, event, payload, payload_hash, prev_hash, hash, signer, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
        .bind(entry.seq, entry.ts, actor, event, canonical(payload), entry.payload_hash, entry.prev_hash, hash, signer, entry.signature)
        .run();
      return entry;
    } catch (err) {
      if (!String(err).includes('UNIQUE') && !String(err).includes('PRIMARY KEY')) throw err;
    }
  }
  throw new AuditBusy('Audit log is busy; try again.');
}

export const ref = (e: AuditEntry): AuditRef => ({ seq: e.seq, hash: e.hash, prev_hash: e.prev_hash, signature: e.signature, signer: e.signer });

async function rows(env: Env, sql: string, ...args: unknown[]): Promise<AuditEntry[]> {
  const res = await env.DB.prepare(sql).bind(...args).all<Row>();
  return res.results.map((r) => ({ ...r, payload: JSON.parse(r.payload) as Record<string, unknown> }));
}

export async function latest(env: Env, limit: number): Promise<AuditEntry[]> {
  return rows(env, 'SELECT * FROM audit ORDER BY seq DESC LIMIT ?', Math.max(1, Math.min(limit, 200)));
}

export async function verifyAll(env: Env) {
  const all = await rows(env, 'SELECT * FROM audit ORDER BY seq');
  const fail = (n: number, reason: string) => ({ ok: false, entries: all.length, broken_seq: n, reason });
  let prev = GENESIS;
  for (const [i, e] of all.entries()) {
    const n = i + 1;
    if (e.seq !== n) return fail(n, `expected seq ${n}, found ${e.seq}`);
    if (e.prev_hash !== prev) return fail(n, 'chain link to the previous entry is broken');
    if ((await sha256(canonical(e.payload))) !== e.payload_hash) return fail(n, 'payload hash does not match');
    if ((await entryHash(e)) !== e.hash) return fail(n, 'entry hash does not match');
    if (!(await verify(e.signer, e.hash, e.signature))) return fail(n, `signature by ${e.signer} is not valid`);
    prev = e.hash;
  }
  return { ok: true, entries: all.length };
}
