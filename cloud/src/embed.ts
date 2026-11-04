// Workers AI embeddings with the same bge-small model and query prefix as api/retrieval/embed.py.
// Step vectors are written to Vectorize at deploy time (POST /api/admin/embed); a question needs
// only its own vector.
import { bundle } from './bundle.ts';
import type { Env } from './types.ts';

const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';

export async function embed(env: Env, texts: string[]): Promise<number[][]> {
  // The model id comes from config at export time, so the binding's literal model union cannot type it.
  const res = (await env.AI.run(bundle.embed_model as Parameters<Ai['run']>[0], { text: texts } as never)) as { data: number[][] };
  return res.data;
}

export async function embedQuery(env: Env, text: string): Promise<number[]> {
  return (await embed(env, [QUERY_PREFIX + text]))[0];
}
