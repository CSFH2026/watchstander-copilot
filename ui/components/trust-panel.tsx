'use client';

import type { AuditEntry, VerifyResult } from '../lib/api';

interface Props {
  entries: AuditEntry[];
  error: string | null;
  verify: VerifyResult | null;
  verifying: boolean;
  resetting: boolean;
  operator: string;
  onVerify: () => void;
  onReset: () => void;
}

function clock(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

/** The evidence column: the signed, hash-chained log, and the check that it is intact. */
export function TrustPanel({ entries, error, verify, verifying, resetting, operator, onVerify, onReset }: Props) {
  return (
    <aside className="card trust" aria-labelledby="trust-title">
      <div className="trust-head">
        <h2 id="trust-title">Audit log</h2>
        <span className="muted">Signed, hash-chained</span>
      </div>
      <div className="trust-actions">
        <button type="button" onClick={onVerify} disabled={verifying}>
          {verifying ? 'Verifying' : 'Verify log'}
        </button>
        <button type="button" className="reset-btn" onClick={onReset} disabled={resetting} title={`Clear acknowledged steps for ${operator}`}>
          {resetting ? 'Resetting' : 'Reset drill'}
        </button>
      </div>
      {verify ? (
        verify.ok ? (
          <p className="verify verify-ok" role="status">
            Chain intact, {verify.entries} entries
          </p>
        ) : (
          <p className="verify verify-bad" role="alert">
            Chain broken at entry {verify.broken_seq ?? '?'}: {verify.reason ?? 'no reason given'}
          </p>
        )
      ) : null}
      {error ? <p className="inline-error">{error}</p> : null}
      {entries.length ? (
        <ol className="audit-list">
          {entries.map((e) => (
            <li key={e.seq} className={`audit-entry event-${e.event}${/blocked/i.test(e.summary) ? ' is-blocked' : ''}`}>
              <div className="audit-line">
                <span className="audit-seq">#{e.seq}</span>
                <span className="audit-time">{clock(e.ts)}</span>
                <span className="audit-actor">{e.actor}</span>
                <code className="audit-hash" title={e.hash}>
                  {e.hash.slice(0, 8)}
                </code>
              </div>
              <p className="audit-summary">{e.summary}</p>
            </li>
          ))}
        </ol>
      ) : !error ? (
        <p className="muted">No entries yet. Every query and acknowledge is logged here.</p>
      ) : null}
    </aside>
  );
}
