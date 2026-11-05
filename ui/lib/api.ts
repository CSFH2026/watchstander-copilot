/**
 * Typed client for the FastAPI backend. Shapes mirror docs/CONTRACTS.md version 2.
 * In production the API base is empty because FastAPI serves this UI on the same origin.
 */

export type StepState = 'done' | 'next' | 'locked';

export type Step = {
  step_id: string;
  seq: number;
  text: string;
  requires: string[];
  danger: string | null;
  state: StepState;
  /** The audit entry that acknowledged a done step. Absent on a backend that does not send it yet. */
  audit_seq?: number | null;
};

export type AuditRef = { seq: number; hash: string; prev_hash: string; signature: string; signer: string };

export type Health = {
  ok: boolean;
  offline: boolean;
  procedures: number;
  steps: number;
  model: string;
  operator_ids: string[];
  /** Where the backend runs, from the hoster config: "local" or "cloudflare". */
  target: 'local' | 'cloudflare';
  /** Provider and model per slot, such as "cloudflare:@cf/baai/bge-small-en-v1.5", or "off". */
  models: Record<'embed' | 'transcribe' | 'rewrite' | 'rerank', string>;
  /** The corpus this backend answers from. "stand-in" data is not Navy doctrine, and the banner says so. */
  dataset?: Dataset;
  /** The CASREP Board this backend sends to. Absent on a backend without the CASREP routes, which hides the button. */
  casrep?: CasrepBoard;
};

/**
 * url is the board's API and site its dashboard. ready is false until the board's Originator key is set on the backend;
 * the key itself never reaches the browser. site is absent on a backend older than the nav link.
 */
/** drafts is false on a backend that reads the board but cannot draft or send, such as the Cloudflare preset. */
export type CasrepBoard = { url: string; site?: string; ready: boolean; read?: boolean; drafts?: boolean };

/** One CASREP from the board, as the local cache holds it. step runs 0 (Originator) to 6 (Released). */
export type KnownCasualty = {
  id: string;
  serial: string;
  unit: string | null;
  uic: string | null;
  status: 'open' | 'corrected' | 'cancelled';
  closed_by: 'CASCOR' | 'CASCAN' | null;
  step: number;
  step_name: string;
  /** "at DH review", as the banner says it. */
  step_phrase: string;
  report_type: string;
  category: number;
  equipment: string;
  eic: string | null;
  dtg: string;
  etr: string | null;
  parts: { nsn: string; nomenclature: string; qty: number }[];
  assistance: string;
  version_no: number;
  last_update: string;
  last_action: string | null;
  link: string;
  /** How it matched the procedure: it names the procedure id, or its equipment names the procedure's system. */
  match?: 'procedure' | 'system';
};

/** The cache's copy of the board. as_of is null until the first good pull; stale says the copy may be out of date. */
export type KnownList = {
  board: { url: string; site: string };
  read: boolean;
  as_of: string | null;
  age_seconds: number | null;
  stale: boolean;
  error: string | null;
  casreps: KnownCasualty[];
};

export type KnownVersion = {
  version_no: number;
  report_type: string;
  category: number;
  change_summary: string;
  description: string;
  remarks: string | null;
  actor_name: string;
  actor_role: string;
  created_at: string;
};

export type KnownEvent = { id: number; step_name: string; action: string; comment: string | null; actor_name: string; actor_role: string; created_at: string };

export type KnownDetail = { casrep: KnownCasualty; versions: KnownVersion[]; events: KnownEvent[]; as_of: string | null; stale: boolean };

/** The CASREP Board's create body, as docs/CASREP.md maps it from one run. */
export type Casrep = {
  serial: string;
  unit: string;
  uic: string;
  report_type: 'INITIAL';
  category: 2 | 3 | 4;
  dtg: string;
  equipment: string;
  eic: string | null;
  description: string;
  mission_areas: string[];
  parts: { nsn: string; nomenclature: string; qty: number }[];
  assistance: 'none' | 'tech_assist' | 'parts' | 'both';
  etr: string | null;
  remarks: string | null;
  poc_name: string;
  poc_contact: string;
  actor_name: string;
};

export type CasrepSent = { serial: string; link: string; audit_seq: number };

export type CasrepDraft = { query_id: string; casrep: Casrep; board: CasrepBoard; sent: CasrepSent | null };

/** What the person decides before a send; the rest is built on the server from the signed run. */
export type CasrepChoices = Pick<Casrep, 'category' | 'mission_areas' | 'assistance' | 'equipment' | 'poc_name'>;

export type CasrepSendResult = { serial: string; id: string; link: string; casrep: Casrep; audit: AuditRef };

export type Dataset = { name: string; title: string; kind: 'doctrine' | 'stand-in'; source: string; license: string; examples: string[] };

/** A chip under the search box: an open CASREP's procedure, one asked often here, or a fixed example. */
export type ExampleChip = {
  text: string;
  procedure_id: string | null;
  reason: 'open' | 'often' | 'example';
  serial?: string;
  count?: number;
};

export type ExamplesResult = { examples: ExampleChip[]; window_days: number };

export type Procedure = {
  procedure_id: string;
  title: string;
  source: string;
  score: number;
  symptoms: string[];
};

export type Alternate = { procedure_id: string; title: string; score: number };

/** A band on the fused score as a share of the top match's. A rank, never a probability. See docs/CONTRACTS.md. */
export type Strength = 'strong' | 'possible' | 'weak';

/** One procedure on the ranked list. Only procedures that pass the floors on their own steps are listed. */
export type Candidate = {
  rank: number;
  procedure_id: string;
  title: string;
  score: number;
  /** score divided by the top match's score: 1 for the top match. */
  relative: number;
  strength: Strength;
  /** The best cosine between the question and any step of this procedure. */
  cosine: number;
  /** The question's words that this procedure's steps hold. */
  keyword: string[];
};

export type QueryResult = {
  query_id: string;
  latency_ms: number;
  procedure: Procedure | null;
  steps: Step[];
  /** The top match and up to four others, best first. procedure is candidates[0] unless the query named a pick. */
  candidates: Candidate[];
  alternates: Alternate[];
  /** "ambiguous" when a second procedure scored close to the first; "none" when nothing in scope matched. */
  confidence: 'clear' | 'ambiguous' | 'none';
  /** Open CASREPs that may be this casualty, from the backend's cache. Absent on a backend without the CASREP routes. */
  known_casualties?: KnownCasualty[];
  /** A sentence for the Sailor whenever confidence is not "clear". */
  notice: string | null;
  /** max_cosine is the best semantic score before the floors; it shows how close a refused question came. */
  matched?: { keyword: string[]; semantic_top: string | null; max_cosine?: number };
  audit: AuditRef;
};

export type ActionResult = {
  allowed: boolean;
  reason: string | null;
  step_id: string;
  steps: Step[];
  audit: AuditRef;
};

/** What a Sailor wrote on a printed checklist, sent with a step entered later. See docs/CONTRACTS.md. */
export type PaperFields = { source: 'paper'; sheet: string; reading?: string; done_at?: string; note?: string };

export type ResetResult = { ok: boolean; audit: AuditRef };

export type AuditEntry = {
  seq: number;
  ts: string;
  actor: string;
  event: string;
  summary: string;
  hash: string;
  prev_hash: string;
  signer: string;
  /** Present for actions and queries; null for a reset. Used by the log's filters. */
  procedure_id?: string | null;
  step_id?: string | null;
  allowed?: boolean | null;
};

/** One log line in full, as written to audit/log.jsonl. */
export type AuditRecord = {
  seq: number;
  ts: string;
  actor: string;
  event: string;
  payload: Record<string, unknown> & { summary?: string };
  payload_hash: string;
  prev_hash: string;
  hash: string;
  signer: string;
  signature: string;
  summary?: string;
};

/** Each check on one entry, reported on its own so the view can say which one failed. */
export type AuditEntryDetail = {
  entry: AuditRecord;
  checks: { prev_link_ok: boolean; payload_ok: boolean; hash_ok: boolean; signature_ok: boolean };
};

export type VerifyResult = { ok: boolean; entries: number; broken_seq?: number; reason?: string };

/** Network failure: the backend process is not running or not reachable. */
export class BackendUnreachableError extends Error {
  constructor() {
    super('Backend not reachable.');
    this.name = 'BackendUnreachableError';
  }
}

/** The backend answered, but with an error status. */
export class BackendError extends Error {
  constructor(
    public status: number,
    public path: string,
    public detail: string,
  ) {
    super(`Backend error ${status} on ${path}${detail ? `: ${detail}` : ''}`);
    this.name = 'BackendError';
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

async function request<T>(path: string, init?: RequestInit, acceptBody?: (body: unknown) => boolean): Promise<T> {
  // Inline env check so the bundler drops the mock chunk from the default build.
  if (process.env.NEXT_PUBLIC_MOCK === '1') {
    // Loaded on demand so the mock never ships in the default build path.
    const { mockRequest } = await import('./mock');
    return mockRequest<T>(path, init);
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      cache: 'no-store',
    });
  } catch {
    throw new BackendUnreachableError();
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  // The contract does not fix a status code for a blocked action, so a 4xx that still
  // carries a full action body is treated as the answer, not as an error.
  if (res.ok || (acceptBody && acceptBody(body))) return body as T;
  const detail = body && typeof body === 'object' && 'detail' in body ? String((body as { detail: unknown }).detail) : res.statusText;
  throw new BackendError(res.status, path, detail);
}

function post<T>(path: string, payload: unknown, acceptBody?: (body: unknown) => boolean) {
  return request<T>(path, { method: 'POST', body: JSON.stringify(payload) }, acceptBody);
}

export const api = {
  health: () => request<Health>('/api/health'),
  examples: () => request<ExamplesResult>('/api/examples'),
  // pick opens another candidate of the same question; the server searches again and logs it as a query.
  query: (operator_id: string, text: string, pick?: string) =>
    post<QueryResult>('/api/query', { operator_id, text, input: 'typed', ...(pick ? { pick } : {}) }),
  action: (operator_id: string, procedure_id: string, step_id: string, paper?: PaperFields) =>
    post<ActionResult>(
      '/api/action',
      { operator_id, procedure_id, step_id, action: 'acknowledge', ...paper },
      (body) => !!body && typeof body === 'object' && 'allowed' in body && 'steps' in body,
    ),
  reset: (operator_id: string) => post<ResetResult>('/api/reset', { operator_id }),
  audit: (limit: number) => request<{ entries: AuditEntry[] }>(`/api/audit?limit=${limit}`),
  verify: () => request<VerifyResult>('/api/audit/verify'),
  auditEntry: (seq: number) => request<AuditEntryDetail>(`/api/audit/${seq}`),
  casrepDraft: (query_id: string) => request<CasrepDraft>(`/api/casrep/draft?query_id=${encodeURIComponent(query_id)}`),
  known: () => request<KnownList>('/api/casreps'),
  knownRefresh: () => post<KnownList>('/api/casreps/refresh', {}),
  knownDetail: (id: string) => request<KnownDetail>(`/api/casreps/${encodeURIComponent(id)}`),
  casrepSend: (operator_id: string, query_id: string, choices: CasrepChoices) =>
    post<CasrepSendResult>('/api/casrep/send', { operator_id, query_id, ...choices }),
};

/** One message per failure kind, so every panel says the same thing. */
export function describeError(err: unknown): string {
  if (err instanceof BackendUnreachableError) {
    return 'Backend not reachable. Start it with "make run" from the project folder, then try again.';
  }
  if (err instanceof BackendError) {
    // A 404 on /api/ usually means the page is served by something other than the backend.
    return err.status === 404 || err.status >= 502
      ? `${err.message}. The backend is not reachable at this address; start it with "make run".`
      : err.message;
  }
  return err instanceof Error ? err.message : 'Unexpected error.';
}

/** "5" becomes "05", to match the step ids in the doctrine. */
export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
