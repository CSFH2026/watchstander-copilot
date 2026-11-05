// The cloud twin's answers to the Nov 5 security review: findings b8946e5f (masked 500s), ecf82082 (field
// limits), 1dd168f9 (refresh fan-out), and the cloud half of 8eec673b (no key on a redirect, encoded ids).
// Run: cd cloud && npm test
import assert from 'node:assert/strict';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, test } from 'node:test';

import { handle } from '../src/app.ts';
import { fakeD1 } from './d1.ts';

const seed = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
const KEYS = { WSC_KEY_EOOW_01: seed(), WSC_KEY_EOOW_02: seed(), WSC_KEY_COPILOT_NODE_01: seed() };

function env(extra: Record<string, unknown> = {}) {
  return { DB: fakeD1(), ...KEYS, ...extra } as never;
}

const post = (e: never, path: string, body: unknown) =>
  handle(new Request(`https://preview.test${path}`, { method: 'POST', body: JSON.stringify(body) }), e);

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// b8946e5f
test('an unexpected error answers 500 without its own text', async () => {
  const broken = { DB: { prepare: () => { throw new Error('D1_ERROR: no such table: audit (WSC_KEY_EOOW_01)'); } }, ...KEYS } as never;
  const r = await post(broken, '/api/reset', { operator_id: 'EOOW-01' });
  assert.equal(r.status, 500);
  const { detail } = (await r.json()) as { detail: string };
  assert.doesNotMatch(detail, /D1_ERROR|audit|WSC_KEY/);
});

test('an expected refusal still says why', async () => {
  const r = await post(env(), '/api/reset', { operator_id: 'EOOW-99' });
  assert.equal(r.status, 400);
  assert.match(((await r.json()) as { detail: string }).detail, /Unknown operator EOOW-99/);
});

// ecf82082, twin of tests/test_request_limits.py
test('ids at the limit reach the policy engine and are blocked there', async () => {
  const r = await post(env(), '/api/action', { operator_id: 'EOOW-02', procedure_id: 'P'.repeat(80), step_id: 'S'.repeat(80) });
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as { allowed: boolean }).allowed, false);
});

for (const field of ['procedure_id', 'step_id', 'action']) {
  test(`an overlong ${field} is a 422 and is not logged`, async () => {
    const e = env();
    const body = { operator_id: 'EOOW-02', procedure_id: 'EOCC-X-Y', step_id: 'EOCC-X-Y-01', [field]: 'X'.repeat(81) };
    assert.equal((await post(e, '/api/action', body)).status, 422);
    assert.equal((e as { DB: ReturnType<typeof fakeD1> }).DB.raw.prepare('SELECT COUNT(*) AS n FROM audit').get()!.n, 0);
  });
}

test('a missing step id is a 422, as on the laptop', async () => {
  assert.equal((await post(env(), '/api/action', { operator_id: 'EOOW-02', procedure_id: 'EOCC-X-Y' })).status, 422);
});

for (const [route, body] of [
  ['/api/query', { text: 'low lube oil pressure' }],
  ['/api/action', { procedure_id: 'EOCC-X-Y', step_id: 'EOCC-X-Y-01' }],
  ['/api/reset', {}],
] as const) {
  test(`an overlong operator is a 422 on ${route}`, async () => {
    assert.equal((await post(env(), route, { operator_id: 'E'.repeat(41), ...body })).status, 422);
  });
}

test('an overlong input label is a 422 before any search', async () => {
  const r = await post(env(), '/api/query', { operator_id: 'EOOW-02', text: 'low lube oil pressure', input: 'v'.repeat(21) });
  assert.equal(r.status, 422);
});

// 1dd168f9 and 8eec673b
type Seen = { url: string; init?: RequestInit };

function fakeBoard(rows: number, ids: (n: number) => string = (n) => `c${n}`) {
  const seen: Seen[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, init });
    if (url.includes('/casreps?')) {
      const active = url.includes('scope=active');
      return Response.json({ casreps: active ? Array.from({ length: rows }, (_, n) => ({ id: ids(n), uic: 'N99999' })) : [] });
    }
    const id = decodeURIComponent(url.slice(url.lastIndexOf('/') + 1));
    return Response.json({ casrep: { id, serial: `N99999/${id}`, status: 'open', current_step: 0 }, versions: [], events: [] });
  }) as typeof fetch;
  return seen;
}

const BOARD = { CASREP_URL: 'https://board.test', CASREP_READ_KEY: 'read-key', CASREP_UIC: 'N99999' };

test('refreshes in the same few seconds make one pull, even when they arrive together', async () => {
  const seen = fakeBoard(3);
  const e = env(BOARD);
  const answers = await Promise.all(Array.from({ length: 6 }, () => post(e, '/api/casreps/refresh', {})));
  assert.ok(answers.every((r) => r.status === 200));
  assert.equal(seen.length, 2 + 3);
  // Once the gap has passed, the next refresh pulls again.
  (e as { DB: ReturnType<typeof fakeD1> }).DB.raw.exec("UPDATE casrep_cache SET last_attempt = '2000-01-01T00:00:00+00:00'");
  await post(e, '/api/casreps/refresh', {});
  assert.equal(seen.length, 2 * (2 + 3));
});

test('one pull fetches at most 40 details, inside the 50-subrequest limit', async () => {
  const seen = fakeBoard(222);
  const r = await post(env(BOARD), '/api/casreps/refresh', {});
  assert.equal(r.status, 200);
  assert.equal(seen.length, 2 + 40);
  assert.equal(((await r.json()) as { casreps: unknown[] }).casreps.length, 40);
});

test('CASREP ids are encoded in the detail path, and no board call follows a redirect', async () => {
  const seen = fakeBoard(2, (n) => (n ? 'plain-1' : 'a/../b?x=1#y'));
  await post(env(BOARD), '/api/casreps/refresh', {});
  const details = seen.filter((s) => !s.url.includes('/casreps?')).map((s) => s.url);
  assert.deepEqual(details.sort(), ['https://board.test/api/v1/casreps/a%2F..%2Fb%3Fx%3D1%23y', 'https://board.test/api/v1/casreps/plain-1']);
  assert.ok(seen.every((s) => s.init?.redirect === 'manual'));
});

test('a board that redirects never sends the key on, and the cache says why', async () => {
  const listen = (fn: (h: IncomingHttpHeaders, res: import('node:http').ServerResponse) => void) =>
    new Promise<{ url: string; close: () => void }>((resolve) => {
      const srv = createServer((req, res) => fn(req.headers, res)).listen(0, '127.0.0.1', () =>
        resolve({ url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`, close: () => srv.close() }));
    });
  const targetSeen: IncomingHttpHeaders[] = [];
  const target = await listen((h, res) => { targetSeen.push(h); res.end('{"casreps":[]}'); });
  const first = await listen((_h, res) => { res.writeHead(302, { Location: `${target.url}/api/v1/casreps` }).end(); });
  try {
    const e = env({ ...BOARD, CASREP_URL: first.url });
    const r = await post(e, '/api/casreps/refresh', {});
    const snap = (await r.json()) as { error: string | null; stale: boolean };
    assert.equal(targetSeen.length, 0);
    assert.equal(snap.stale, true);
    assert.match(snap.error ?? '', /redirect/);
  } finally {
    first.close();
    target.close();
  }
});

test('a malformed id in the CASREP path is a 404, not a 500', async () => {
  const e = env(BOARD);
  const r = await handle(new Request('https://preview.test/api/casreps/%E0%A4%A'), e);
  assert.equal(r.status, 404);
});
