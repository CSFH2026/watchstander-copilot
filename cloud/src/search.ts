// Query-time twin of Retriever.search in api/retrieval/search.py: scope gate, BM25 + cosine,
// reciprocal rank fusion, cosine floors, then group by procedure.
// BM25 reads the precomputed postings of only the question's terms from D1. Cosine comes from
// Vectorize's 50 nearest steps; a step outside them adds no semantic rank, where the laptop ranks
// every step. For a dataset of 50 steps or fewer the two are identical.
import { bundle } from './bundle.ts';
import { embedQuery } from './embed.ts';
import { escapeRe, expand, tokens } from './normalize.ts';
import { postings, procedureOf } from './store.ts';
import type { Env } from './types.ts';

const { rrf_k: RRF_K, ambiguous_ratio: AMBIGUOUS_RATIO, min_cosine: MIN_COSINE, min_cosine_without_keywords: MIN_COSINE_WITHOUT_KEYWORDS } =
  bundle.retrieval;
const NO_MATCH = bundle.scope.no_match;
const DOMAIN_TOKENS = new Set(bundle.scope.domain_tokens);
const DOMAIN_BIGRAMS = new Set(bundle.scope.domain_bigrams);
// returnValues makes Vectorize score exactly. Without it the scores are approximate, and on wikiHow
// they fell from 0.85 to 0.52 for a question the laptop answers, so the floors stopped working.
// Exact scoring allows at most 50 matches.
const TOP_K = 50;
// Twins of MAX_CANDIDATES and POSSIBLE_RATIO in search.py: the ranked list and its strength bands.
const MAX_CANDIDATES = 5;
const POSSIBLE_RATIO = 0.8;

export type Strength = 'strong' | 'possible' | 'weak';

export type Candidate = { procedure_id: string; score: number; relative: number; strength: Strength; cosine: number; keyword: string[] };

const strength = (relative: number): Strength => (relative >= AMBIGUOUS_RATIO ? 'strong' : relative >= POSSIBLE_RATIO ? 'possible' : 'weak');

export type SearchResult = {
  ranked: [string, number][];
  candidates: Candidate[];
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

// rank_bm25 BM25Okapi.get_scores, term by term (repeats included), over the steps that hold each term.
// Also returns which question words each procedure's steps hold, for the candidate list.
type Bm25 = { scores: Map<string, number>; known: Set<string>; words: Map<string, Set<string>> };

async function bm25(env: Env, q: string[]): Promise<Bm25> {
  const { k1, b, avgdl } = bundle.bm25;
  const rows = await postings(env, q);
  const scores = new Map<string, number>();
  const words = new Map<string, Set<string>>();
  for (const term of q) {
    const entry = rows.get(term);
    if (!entry) continue;
    for (const [sid, tf, dl] of entry.list) {
      scores.set(sid, (scores.get(sid) ?? 0) + (entry.idf * (tf * (k1 + 1))) / (tf + k1 * (1 - b + (b * dl) / avgdl)));
      const pid = procedureOf(sid);
      words.set(pid, (words.get(pid) ?? new Set()).add(term));
    }
  }
  return { scores, known: new Set(rows.keys()), words };
}

// Descending by score; ties keep step id order, which is the laptop's (procedure_id, seq) order.
const byScore = (a: [string, number], c: [string, number]) => c[1] - a[1] || (a[0] < c[0] ? -1 : a[0] > c[0] ? 1 : 0);

export async function search(env: Env, text: string): Promise<SearchResult> {
  const q = tokens(text);
  const empty: SearchResult = { ranked: [], candidates: [], keyword_hits: [], semantic_top: null, max_cosine: 0, confidence: 'none', notice: NO_MATCH };
  if (!text.trim()) return empty;
  const notice = scopeCheck(text, q);
  if (notice) return { ...empty, notice };

  const [{ scores: kw, known, words }, matches] = await Promise.all([
    q.length ? bm25(env, q) : Promise.resolve<Bm25>({ scores: new Map(), known: new Set(), words: new Map() }),
    embedQuery(env, text).then((v) => env.VECTORS.query(v, { topK: TOP_K, returnValues: true, returnMetadata: 'none' })),
  ]);
  const semantic = matches.matches.map((m) => [m.id, m.score] as [string, number]).sort(byScore);

  const fused = new Map<string, number>();
  const add = (sid: string, rank: number) => fused.set(sid, (fused.get(sid) ?? 0) + 1 / (RRF_K + rank + 1));
  const kwOrder = [...kw.entries()].filter(([, s]) => s > 0).sort(byScore);
  kwOrder.forEach(([sid], rank) => add(sid, rank));
  semantic.forEach(([sid], rank) => add(sid, rank));

  const topCos = Math.max(0, semantic[0]?.[1] ?? 0);
  if (topCos < MIN_COSINE || (!kwOrder.length && topCos < MIN_COSINE_WITHOUT_KEYWORDS)) return { ...empty, max_cosine: topCos };

  const best = new Map<string, number>();
  for (const [sid, score] of [...fused.entries()].sort((a, c) => (a[0] < c[0] ? -1 : 1))) {
    const pid = procedureOf(sid);
    best.set(pid, Math.max(best.get(pid) ?? 0, score));
  }
  const ranked = [...best.entries()].sort(byScore);

  // A procedure's cosine is its best step among the Vectorize matches. A procedure with no step there
  // has no cosine to show, so it cannot pass the floors below; the laptop scores every step instead.
  const procCos = new Map<string, number>();
  for (const [sid, score] of semantic) {
    const pid = procedureOf(sid);
    procCos.set(pid, Math.max(procCos.get(pid) ?? -1, score));
  }
  const keywordHits = [...new Set(q.filter((t) => known.has(t)))].sort();
  const candidates: Candidate[] = [];
  for (const [rank, [pid, score]] of ranked.entries()) {
    if (candidates.length === MAX_CANDIDATES) break;
    const cosine = procCos.get(pid) ?? 0;
    const hits = keywordHits.filter((t) => words.get(pid)?.has(t));
    // The top match is the answer; any other candidate must pass the same floors on its own steps.
    if (rank && (cosine < MIN_COSINE || (!hits.length && cosine < MIN_COSINE_WITHOUT_KEYWORDS))) continue;
    candidates.push({ procedure_id: pid, score, relative: 0, strength: 'weak', cosine, keyword: hits });
  }
  for (const c of candidates) {
    c.relative = c.score / candidates[0].score;
    c.strength = strength(c.relative);
  }
  const ambiguous = candidates.length > 1 && candidates[1].relative >= AMBIGUOUS_RATIO;
  return {
    ranked: candidates.map((c) => [c.procedure_id, c.score]),
    candidates,
    confidence: ambiguous ? 'ambiguous' : 'clear',
    notice: ambiguous
      ? `Two procedures fit this description: ${candidates[0].procedure_id} and ${candidates[1].procedure_id}. Confirm which casualty it is.`
      : null,
    keyword_hits: keywordHits,
    semantic_top: semantic[0]?.[0] ?? null,
    max_cosine: topCos,
  };
}
