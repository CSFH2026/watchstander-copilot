// Reads dataset content from D1. Procedures are cached per isolate; they never change between deploys.
import type { Env, Procedure } from './types.ts';

// D1 binds at most 100 parameters per statement.
const MAX_PARAMS = 100;
const cache = new Map<string, Procedure | null>();

type ProcedureRow = { procedure_id: string; title: string; source: string; symptoms: string; steps: string };

/** "WH-123-04" belongs to "WH-123": a step id is its procedure id plus a two-digit number. */
export const procedureOf = (stepId: string) => stepId.slice(0, stepId.lastIndexOf('-'));

export async function procedures(env: Env, ids: string[]): Promise<Map<string, Procedure>> {
  const missing = [...new Set(ids)].filter((id) => !cache.has(id));
  for (let i = 0; i < missing.length; i += MAX_PARAMS) {
    const chunk = missing.slice(i, i + MAX_PARAMS);
    const rows = await env.DB.prepare(`SELECT * FROM procedures WHERE procedure_id IN (${chunk.map(() => '?').join(',')})`)
      .bind(...chunk)
      .all<ProcedureRow>();
    for (const id of chunk) cache.set(id, null);
    for (const r of rows.results)
      cache.set(r.procedure_id, { ...r, symptoms: JSON.parse(r.symptoms) as string[], steps: JSON.parse(r.steps) as Procedure['steps'] });
  }
  const out = new Map<string, Procedure>();
  for (const id of ids) {
    const p = cache.get(id);
    if (p) out.set(id, p);
  }
  return out;
}

export async function procedure(env: Env, id: string): Promise<Procedure | null> {
  return (await procedures(env, [id])).get(id) ?? null;
}

export type Posting = [stepId: string, tf: number, docLen: number];

/** Every postings row for the given terms, parts joined, with each term's idf. */
export async function postings(env: Env, terms: string[]): Promise<Map<string, { idf: number; list: Posting[] }>> {
  const out = new Map<string, { idf: number; list: Posting[] }>();
  const unique = [...new Set(terms)];
  for (let i = 0; i < unique.length; i += MAX_PARAMS) {
    const chunk = unique.slice(i, i + MAX_PARAMS);
    const rows = await env.DB.prepare(`SELECT term, idf, postings FROM terms WHERE term IN (${chunk.map(() => '?').join(',')}) ORDER BY term, part`)
      .bind(...chunk)
      .all<{ term: string; idf: number; postings: string }>();
    for (const r of rows.results) {
      const entry = out.get(r.term) ?? { idf: r.idf, list: [] };
      entry.list.push(...(JSON.parse(r.postings) as Posting[]));
      out.set(r.term, entry);
    }
  }
  return out;
}
