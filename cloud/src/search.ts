// Query-time twin of Retriever.search in api/retrieval/search.py: scope gate, BM25 + cosine,
// reciprocal rank fusion, cosine floors, then group by procedure. BM25 document statistics come
// precomputed from the bundle, so only the per-question sums happen here.
import { bundle } from './bundle.ts';
import { embedQuery, stepMatrix } from './embed.ts';
import { escapeRe, expand, tokens } from './normalize.ts';
import type { Env } from './types.ts';

const { rrf_k: RRF_K, ambiguous_ratio: AMBIGUOUS_RATIO, min_cosine: MIN_COSINE, min_cosine_without_keywords: MIN_COSINE_WITHOUT_KEYWORDS } =
  bundle.retrieval;
const NO_MATCH = bundle.scope.no_match;
const DOMAIN_TOKENS = new Set(bundle.scope.domain_tokens);
const DOMAIN_BIGRAMS = new Set(bundle.scope.domain_bigrams);
const VOCAB = new Set(bundle.bm25.doc_freqs.flatMap((d) => Object.keys(d)));

export type SearchResult = {
  ranked: [string, number][];
  confidence: 'clear' | 'ambiguous' | 'none';
  notice: string | null;
  keyword_hits: string[];
  semantic_top: string | null;
  max_cosine: number;
};

function mentions(text: string, phrases: string[]): string | null {
  return phrases.find((ph) => new RegExp(`\\b${escapeRe(ph)}\\b`).test(text)) ?? null;
}

export function scopeCheck(text: string, q: string[]): string | null {
  const lowered = expand(text).toLowerCase();
  if (mentions(lowered, bundle.scope.covered)) return null;
  const other = mentions(lowered, bundle.scope.uncovered);
  if (other) return `No authorized procedure is held for ${other}. Use the EOCC binder.`;
  if (q.some((t) => DOMAIN_TOKENS.has(t))) return null;
  for (let i = 0; i + 1 < q.length; i++) if (DOMAIN_BIGRAMS.has(`${q[i]} ${q[i + 1]}`)) return null;
  return NO_MATCH;
}

// rank_bm25 BM25Okapi.get_scores, term by term, including repeated query terms.
export function bm25Scores(q: string[]): number[] {
  const { k1, b, avgdl, doc_len, idf, doc_freqs } = bundle.bm25;
  const scores = new Array<number>(doc_freqs.length).fill(0);
  for (const term of q) {
    const w = idf[term] ?? 0;
    for (let i = 0; i < doc_freqs.length; i++) {
      const f = doc_freqs[i][term] ?? 0;
      scores[i] += (w * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * doc_len[i]) / avgdl));
    }
  }
  return scores;
}

// Indices sorted by descending value; stable, so ties keep step order.
function order(values: number[]): number[] {
  return values.map((_, i) => i).sort((a, c) => values[c] - values[a]);
}

export async function search(env: Env, text: string): Promise<SearchResult> {
  const q = tokens(text);
  const empty: SearchResult = { ranked: [], keyword_hits: [], semantic_top: null, max_cosine: 0, confidence: 'none', notice: NO_MATCH };
  if (!text.trim()) return empty;
  const notice = scopeCheck(text, q);
  if (notice) return { ...empty, notice };

  const steps = bundle.steps;
  const kw = q.length ? bm25Scores(q) : new Array<number>(steps.length).fill(0);
  const [matrix, qv] = await Promise.all([stepMatrix(env), embedQuery(env, text)]);
  const cos = matrix.map((row) => row.reduce((sum, x, j) => sum + x * qv[j], 0));

  const fused = new Array<number>(steps.length).fill(0);
  const kwOrder = order(kw).filter((i) => kw[i] > 0);
  kwOrder.forEach((i, rank) => (fused[i] += 1 / (RRF_K + rank + 1)));
  order(cos).forEach((i, rank) => (fused[i] += 1 / (RRF_K + rank + 1)));

  const topCos = Math.max(0, ...cos);
  if (topCos < MIN_COSINE || (!kwOrder.length && topCos < MIN_COSINE_WITHOUT_KEYWORDS)) return { ...empty, max_cosine: topCos };

  const best = new Map<string, number>();
  steps.forEach((s, i) => best.set(s.procedure_id, Math.max(best.get(s.procedure_id) ?? 0, fused[i])));
  const ranked = [...best.entries()].sort((a, c) => c[1] - a[1]);
  const ambiguous = ranked.length > 1 && ranked[1][1] >= AMBIGUOUS_RATIO * ranked[0][1];
  return {
    ranked,
    confidence: ambiguous ? 'ambiguous' : 'clear',
    notice: ambiguous ? `Two procedures fit this description: ${ranked[0][0]} and ${ranked[1][0]}. Confirm which casualty it is.` : null,
    keyword_hits: [...new Set(q.filter((t) => VOCAB.has(t)))].sort(),
    semantic_top: steps[order(cos)[0]].step_id,
    max_cosine: topCos,
  };
}
