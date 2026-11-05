/**
 * In-browser stand-in for the FastAPI backend, used only when NEXT_PUBLIC_MOCK=1.
 * It lets the UI be checked while api/ is still being written. It mimics the contract
 * shapes and the policy rules, not the real retrieval, keys, or signatures.
 */
import type { ActionResult, AuditEntry, AuditRef, Health, QueryResult, Step, VerifyResult } from './api';

type MockProcedure = {
  procedure_id: string;
  title: string;
  source: string;
  symptoms: string[];
  keywords: string[];
  steps: { text: string; danger?: string }[];
};

const COMSC = 'COMSCINST 3541.6A Engineering Casualty Control Exercises (MSC, 15 May 1986)';
const ARCHIVE = 'https://web.archive.org/web/20050208220520id_/http://www.msc.navy.mil/instructions/pdf/m35416a.pdf';

const PROCEDURES: MockProcedure[] = [
  {
    procedure_id: 'EOCC-SSDG-LLOP',
    title: 'Low Lube Oil Pressure, Ship Service Diesel Generator',
    source: `${COMSC}, exercise D-15 "Low Lube Oil Pressure" and E-4 "Hot Bearings of Ship's Service Generator", ${ARCHIVE} ; NAVEDTRA Engineman 1 & C, chapter 9 "Diesel engine casualties", https://www.tpub.com/engine1/en1-190.htm`,
    symptoms: ['low lube oil pressure alarm', 'LO pressure below 25 psig', 'lube oil pressure gauge reads low', 'engine noise increases'],
    keywords: ['lube', 'lo', 'oil', 'bearing'],
    steps: [
      { text: 'Verify low lube oil pressure at the local gauge and compare with the remote indication.' },
      { text: 'Report the casualty to the EOOW and the bridge, and notify the Chief Engineer.' },
      { text: 'Start the standby ship service diesel generator and parallel it to the bus.' },
      { text: 'Shift electrical load to the standby generator; trip non-vital circuits if the standby unit cannot carry the full load.' },
      {
        text: 'Secure the affected generator: open its breaker, then stop the engine.',
        danger: 'never before 04 while the affected unit is the only source on the bus; if LO pressure falls below the trip point or bearing noise is heard, stop the engine at once and report the loss of power.',
      },
      { text: 'Check the LO level in the sump, and check the LO strainers, filters, and lines for restriction or leaks.' },
      { text: 'Check LO pump capacity and the pressure regulator; test the LO for fuel dilution and check LO temperature.' },
      { text: 'Correct the cause. Do not restart the engine until the cause is corrected and LO pressure is verified at the local gauge.' },
      { text: 'Report the generator ready for service to the EOOW and restore the normal electrical lineup.' },
    ],
  },
  {
    procedure_id: 'EOCC-SSDG-HJWT',
    title: 'High Jacket Water Temperature, Ship Service Diesel Generator',
    source: `${COMSC}, exercise D-19 "High Fresh Water Cooling Temperature" and D-20 "Low Salt Water Cooling Pressure", ${ARCHIVE}`,
    symptoms: ['high jacket water temperature alarm', 'jacket water outlet temperature above 195 F', 'low sea water pressure'],
    keywords: ['jacket', 'water', 'temp', 'temperature', 'cooling', 'overheat'],
    steps: [
      { text: 'Verify high jacket water temperature at the local thermometer, and read fresh water and sea water cooling pressures.' },
      { text: 'Report the casualty to the EOOW and the bridge, and notify the Chief Engineer.' },
      { text: 'Reduce load on the affected generator.' },
      { text: 'Check the fresh water level in the expansion tank and fresh water pump operation; vent air from the system.' },
      { text: 'Check the temperature regulating valve; if the regulator binds or fails, operate the bypass by hand.' },
      { text: 'Check the sea water side: clean the sea water strainer, check the sea water pump and vent it.' },
      {
        text: 'If jacket water temperature keeps rising past the high limit, start the standby generator, shift the load, and secure the affected generator.',
        danger: 'never before 03; securing a loaded, overheated engine without first reducing load can crack the heads or liners.',
      },
      { text: 'Check the cylinders for cracks or gasket leaks between the fresh water side and the combustion side.' },
      { text: 'Correct the cause, restore cooling, restart the engine, verify normal jacket water temperature, and report ready for service.' },
    ],
  },
  {
    procedure_id: 'EOCC-SSDG-LFOP',
    title: 'Loss of Fuel Oil Pressure, Ship Service Diesel Generator',
    source: `${COMSC}, exercise D-14 "Loss of Fuel Oil Pressure", ${ARCHIVE} ; NAVEDTRA Engineman 1 & C, chapter 9 "Fuel oil casualties", https://www.tpub.com/engine1/en1-191.htm`,
    symptoms: ['low fuel oil pressure alarm', 'engine slows down or stops', 'irregular engine operation', 'engine unable to carry load'],
    keywords: ['fuel', 'hunting', 'hunt', 'irregular'],
    steps: [
      { text: 'Verify low fuel oil pressure at the local gauge; note whether the engine is slowing, hunting, or unable to carry load.' },
      { text: 'Report the casualty to the EOOW and the bridge, and notify the Chief Engineer.' },
      { text: 'Check the fuel oil service tank level and confirm the remote fuel shutoff has not been operated.' },
      { text: 'Check the fuel oil pump; start the standby fuel oil booster pump and bleed air from the booster pump and lines.' },
      { text: 'Check the fuel oil filters and strainers for restriction and shift to the clean element.' },
      { text: 'Check for water in the fuel oil; drain water from all filters, strainers, and lines.' },
      {
        text: 'If fuel oil pressure cannot be restored, start the standby generator, shift the load, and secure the affected generator.',
        danger: 'never before the standby generator is paralleled and carrying the load; opening the breaker on a sole source blacks out the bus.',
      },
      { text: 'Check the fuel oil pressure regulating valve and relief valve for a broken spring.' },
      { text: 'With fuel oil pressure restored, turn the engine over with test cocks open, then restart and report ready for service.' },
    ],
  },
];

const done = new Map<string, Set<string>>(); // operator -> acknowledged step ids
const log: (AuditEntry & { signature: string })[] = [];
let queryCount = 0;

function fakeHash(input: string): string {
  // FNV-1a, repeated to 64 hex chars. Looks like a digest; proves nothing.
  let out = '';
  let h = 0x811c9dc5;
  for (let round = 0; round < 8; round++) {
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i) + round;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out += h.toString(16).padStart(8, '0');
  }
  return out;
}

function append(actor: string, event: string, summary: string, signer: string): AuditRef {
  const prev_hash = log.length ? log[log.length - 1].hash : '0'.repeat(64);
  const seq = log.length + 1;
  const ts = new Date().toISOString();
  const hash = fakeHash(`${seq}|${ts}|${actor}|${event}|${summary}|${prev_hash}`);
  const entry = { seq, ts, actor, event, summary, hash, prev_hash, signer, signature: fakeHash(`sig|${hash}`) };
  log.push(entry);
  return { seq, hash, prev_hash, signature: entry.signature, signer };
}

function stepId(p: MockProcedure, i: number) {
  return `${p.procedure_id}-${String(i + 1).padStart(2, '0')}`;
}

function stepsFor(p: MockProcedure, operator: string): Step[] {
  const acked = done.get(operator) ?? new Set<string>();
  return p.steps.map((s, i) => {
    const id = stepId(p, i);
    const requires = i === 0 ? [] : [stepId(p, i - 1)];
    const state = acked.has(id) ? 'done' : requires.every((r) => acked.has(r)) ? 'next' : 'locked';
    return { step_id: id, seq: i + 1, text: s.text, requires, danger: s.danger ?? null, state };
  });
}

function score(p: MockProcedure, text: string) {
  const words = text.toLowerCase().split(/[^a-z0-9]+/);
  return p.keywords.filter((k) => words.includes(k)).length / 30;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function mockRequest<T>(path: string, init?: RequestInit): Promise<T> {
  await sleep(120 + Math.random() * 120);
  const body = init?.body ? JSON.parse(String(init.body)) : {};

  if (path === '/api/health') {
    const health: Health = {
      ok: true, offline: true, procedures: 3, steps: 27, model: 'BAAI/bge-small-en-v1.5', operator_ids: ['EOOW-01', 'EOOW-02'],
      target: 'local', models: { embed: 'local:BAAI/bge-small-en-v1.5', transcribe: 'off', rewrite: 'off', rerank: 'off' },
      dataset: { name: 'ddg', title: 'DDG SSDG casualty procedures', kind: 'doctrine', source: 'COMSCINST 3541.6A', license: 'US Government work, public release', examples: ['low lube oil pressure on number two SSDG', 'high jacket water temp on number three SSDG', 'loss of fuel oil pressure, engine hunting'] },
    };
    return health as T;
  }

  if (path === '/api/query') {
    queryCount += 1;
    const ranked = PROCEDURES.map((p) => ({ p, s: score(p, body.text ?? '') }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s);
    const top = ranked[0]?.p ?? null;
    const audit = append('node', 'query', `query "${body.text}" -> ${top?.procedure_id ?? 'no match'}`, 'node');
    const result: QueryResult = {
      query_id: `q-${String(queryCount).padStart(4, '0')}`,
      latency_ms: 60 + Math.round(Math.random() * 60),
      procedure: top ? { procedure_id: top.procedure_id, title: top.title, source: top.source, score: ranked[0].s, symptoms: top.symptoms } : null,
      steps: top ? stepsFor(top, body.operator_id) : [],
      alternates: top ? PROCEDURES.filter((p) => p !== top).map((p) => ({ procedure_id: p.procedure_id, title: p.title, score: score(p, body.text) })) : [],
      confidence: top ? 'clear' : 'none',
      notice: top ? null : 'No authorized procedure matches this description. Use the EOCC binder.',
      matched: { keyword: [], semantic_top: top ? stepId(top, 0) : null },
      audit,
    };
    return result as T;
  }

  if (path === '/api/action') {
    const operator: string = body.operator_id;
    const p = PROCEDURES.find((x) => x.procedure_id === body.procedure_id);
    if (!p) throw new Error('unknown procedure');
    const steps = stepsFor(p, operator);
    const step = steps.find((s) => s.step_id === body.step_id);
    let reason: string | null = null;
    if (!step) reason = `Blocked: step ${body.step_id} is not part of ${p.procedure_id}.`;
    else if (step.state === 'done') reason = `Blocked: step ${String(step.seq).padStart(2, '0')} is already acknowledged.`;
    else if (step.state === 'locked') {
      const missing = step.requires.map((r) => r.slice(-2)).join(', ');
      reason = `Blocked: step ${String(step.seq).padStart(2, '0')} requires step ${missing} first.${step.danger ? ` Danger: ${step.danger}` : ''}`;
    }
    if (!reason) {
      const set = done.get(operator) ?? new Set<string>();
      set.add(body.step_id);
      done.set(operator, set);
    }
    const via = body.source === 'paper' ? ' from paper' : '';
    const audit = append(operator, 'action', `acknowledge ${body.step_id}${via}: ${reason ? 'blocked' : 'allowed'}`, operator);
    const result: ActionResult = { allowed: !reason, reason, step_id: body.step_id, steps: stepsFor(p, operator), audit };
    return result as T;
  }

  if (path === '/api/reset') {
    done.delete(body.operator_id);
    return { ok: true, audit: append(body.operator_id, 'reset', `reset drill for ${body.operator_id}`, body.operator_id) } as T;
  }

  if (/^\/api\/audit\/\d+$/.test(path)) {
    // The mock keeps no payloads or keys, so the entry view falls back to the list row.
    throw new Error('mock: no single-entry checks');
  }

  if (path.startsWith('/api/audit/verify')) {
    const result: VerifyResult = { ok: true, entries: log.length };
    return result as T;
  }

  if (path.startsWith('/api/audit')) {
    const limit = Number(new URLSearchParams(path.split('?')[1] ?? '').get('limit') ?? 20);
    return { entries: log.slice(-limit).reverse() } as T;
  }

  throw new Error(`mock: no handler for ${path}`);
}
