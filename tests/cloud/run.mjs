// Runs the Pages Functions code (cloud/src/app.ts) under Node against an in-memory D1, for tests/test_casrep_cloud.py.
//   stdin:  {"rows": [audit entries], "env": {...}, "requests": [{"method", "path", "body"?}]}
//   stdout: {"responses": [{"status", "body"}], "rows": [the audit table after the requests]}
// Needs Node 24: it runs TypeScript (--experimental-transform-types) and has node:sqlite built in.
import { readdirSync, readFileSync } from 'node:fs';
import { register } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

register('./hooks.mjs', import.meta.url);
const { handle } = await import('../../cloud/src/app.ts');

// node:sqlite behind the calls the app makes on D1, with every migration applied.
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../../cloud/migrations/', import.meta.url);
  for (const f of readdirSync(dir).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const statement = (sql, args = []) => ({
    bind: (...a) => statement(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  });
  return { prepare: (sql) => statement(sql), raw: db };
}

const spec = JSON.parse(readFileSync(0, 'utf8'));
const DB = fakeD1();
const insert = DB.raw.prepare('INSERT INTO audit (seq, ts, actor, event, payload, payload_hash, prev_hash, hash, signer, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
for (const e of spec.rows) insert.run(e.seq, e.ts, e.actor, e.event, JSON.stringify(e.payload), e.payload_hash, e.prev_hash, e.hash, e.signer, e.signature);

const env = { ...spec.env, DB };
const responses = [];
for (const r of spec.requests) {
  const init = { method: r.method, headers: { 'Content-Type': 'application/json' } };
  if (r.body !== undefined) init.body = JSON.stringify(r.body);
  const res = await handle(new Request(`https://copilot.test${r.path}`, init), env);
  responses.push({ status: res.status, body: await res.json() });
}
const rows = DB.raw.prepare('SELECT * FROM audit ORDER BY seq').all().map((e) => ({ ...e, payload: JSON.parse(e.payload) }));
process.stdout.write(JSON.stringify({ responses, rows }));
