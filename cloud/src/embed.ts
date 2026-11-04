// Workers AI embeddings with the same bge-small model and query prefix as api/retrieval/embed.py.
// Step vectors are computed once per corpus and model, stored in D1, and kept in isolate memory.
import { bundle } from './bundle.ts';
import type { Env } from './types.ts';

const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';
const BATCH = 100;

let cached: { key: string; matrix: Float32Array[] } | null = null;

function normalize(v: number[]): Float32Array {
  const out = Float32Array.from(v);
  let norm = 0;
  for (const x of out) norm += x * x;
  norm = Math.max(Math.sqrt(norm), 1e-12);
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

async function run(env: Env, texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    // The model id comes from config at export time, so the binding's literal model union cannot type it.
    const res = (await env.AI.run(bundle.embed_model as Parameters<Ai['run']>[0], {
      text: texts.slice(i, i + BATCH),
    } as never)) as { data: number[][] };
    out.push(...res.data);
  }
  return out;
}

export async function embedQuery(env: Env, text: string): Promise<Float32Array> {
  return normalize((await run(env, [QUERY_PREFIX + text]))[0]);
}

export async function stepMatrix(env: Env): Promise<Float32Array[]> {
  const key = `${bundle.corpus_sha256}|${bundle.embed_model}`;
  if (cached?.key === key) return cached.matrix;
  const rows = await env.DB.prepare('SELECT step_id, vec FROM vectors WHERE corpus_sha = ? AND model = ?')
    .bind(bundle.corpus_sha256, bundle.embed_model)
    .all<{ step_id: string; vec: string }>();
  const byId = new Map(rows.results.map((r) => [r.step_id, JSON.parse(r.vec) as number[]]));
  let matrix: Float32Array[];
  if (bundle.steps.every((s) => byId.has(s.step_id))) {
    matrix = bundle.steps.map((s) => Float32Array.from(byId.get(s.step_id)!));
  } else {
    const vecs = (await run(env, bundle.steps.map((s) => s.search_text))).map(normalize);
    await env.DB.batch(
      bundle.steps.map((s, i) =>
        env.DB.prepare('INSERT OR REPLACE INTO vectors (corpus_sha, model, step_id, vec) VALUES (?, ?, ?, ?)')
          .bind(bundle.corpus_sha256, bundle.embed_model, s.step_id, JSON.stringify(Array.from(vecs[i]))),
      ),
    );
    matrix = vecs;
  }
  cached = { key, matrix };
  return matrix;
}
