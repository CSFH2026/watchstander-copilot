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
};

export type Procedure = {
  procedure_id: string;
  title: string;
  source: string;
  score: number;
  symptoms: string[];
};

export type Alternate = { procedure_id: string; title: string; score: number };

export type QueryResult = {
  query_id: string;
  latency_ms: number;
  procedure: Procedure | null;
  steps: Step[];
  alternates: Alternate[];
  /** "ambiguous" when a second procedure scored close to the first; "none" when nothing in scope matched. */
  confidence: 'clear' | 'ambiguous' | 'none';
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
    detail: string,
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
  query: (operator_id: string, text: string) => post<QueryResult>('/api/query', { operator_id, text, input: 'typed' }),
  action: (operator_id: string, procedure_id: string, step_id: string) =>
    post<ActionResult>(
      '/api/action',
      { operator_id, procedure_id, step_id, action: 'acknowledge' },
      (body) => !!body && typeof body === 'object' && 'allowed' in body && 'steps' in body,
    ),
  reset: (operator_id: string) => post<ResetResult>('/api/reset', { operator_id }),
  audit: (limit: number) => request<{ entries: AuditEntry[] }>(`/api/audit?limit=${limit}`),
  verify: () => request<VerifyResult>('/api/audit/verify'),
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
