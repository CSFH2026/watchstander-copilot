// Shapes from docs/CONTRACTS.md, and the bundle that api/retrieval/export.py writes.

export type Env = {
  DB: D1Database;
  AI: Ai;
  VECTORS: VectorizeIndex;
  [secret: `WSC_KEY_${string}`]: string | undefined;
};

export type ProcedureStep = { step_id: string; seq: number; text: string; requires: string[]; danger: string | null };

export type Procedure = {
  procedure_id: string;
  title: string;
  source: string;
  symptoms: string[];
  steps: ProcedureStep[];
};

export type Slot = { provider: 'local' | 'cloudflare' | 'off'; model: string | null };

export type DatasetInfo = { name: string; title: string; kind: 'doctrine' | 'stand-in'; source: string; license: string; examples: string[] };

// The small part of the corpus export that is compiled into the code. Procedures and keyword
// postings are in D1, and step vectors are in Vectorize.
export type Bundle = {
  version: number;
  corpus_sha256: string;
  dataset: DatasetInfo;
  config: { target: string; offline: boolean; models: Record<string, Slot> };
  embed_model: string;
  retrieval: { rrf_k: number; ambiguous_ratio: number; min_cosine: number; min_cosine_without_keywords: number };
  node_id: string;
  operator_ids: string[];
  roster: Record<string, string>;
  counts: { procedures: number; steps: number };
  bm25: { k1: number; b: number; avgdl: number };
  normalize: { token_re: string; stopwords: string[]; abbreviations: [string, string][] };
  scope: { covered: string[]; uncovered: string[]; domain_tokens: string[]; domain_bigrams: string[]; no_match: string };
};

export type StepState = 'done' | 'next' | 'locked';
export type Step = { step_id: string; seq: number; text: string; requires: string[]; danger: string | null; state: StepState };

export type AuditEntry = {
  seq: number;
  ts: string;
  actor: string;
  event: string;
  payload: Record<string, unknown>;
  payload_hash: string;
  prev_hash: string;
  hash: string;
  signer: string;
  signature: string;
};

export type AuditRef = { seq: number; hash: string; prev_hash: string; signature: string; signer: string };
