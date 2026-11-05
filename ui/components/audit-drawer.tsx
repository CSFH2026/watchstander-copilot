'use client';

import { useMemo, useState } from 'react';
import type { AuditEntry, VerifyResult } from '../lib/api';
import { clock, outcome } from './audit-time';
import { Dialog } from './dialog';

interface Props {
  open: boolean;
  entries: AuditEntry[];
  verify: VerifyResult | null;
  verifying: boolean;
  resetting: boolean;
  resetDisabled?: boolean;
  operator: string;
  onClose: () => void;
  onOpenEntry: (seq: number) => void;
  onVerify: () => void;
  onReset: () => void;
}

const RESULTS = ['all', 'allowed', 'blocked', 'query', 'reset'] as const;

/** The whole log beside the steps, filtered by who, which procedure, and what happened. */
export function AuditDrawer({ open, entries, verify, verifying, resetting, resetDisabled = false, operator, onClose, onOpenEntry, onVerify, onReset }: Props) {
  const [who, setWho] = useState('all');
  const [proc, setProc] = useState('all');
  const [result, setResult] = useState<(typeof RESULTS)[number]>('all');

  const actors = useMemo(() => [...new Set(entries.map((e) => e.actor))].sort(), [entries]);
  const procedures = useMemo(
    () => [...new Set(entries.map((e) => e.procedure_id).filter((p): p is string => !!p))].sort(),
    [entries],
  );
  const shown = entries.filter(
    (e) => (who === 'all' || e.actor === who) && (proc === 'all' || e.procedure_id === proc) && (result === 'all' || outcome(e) === result),
  );

  return (
    <Dialog open={open} onClose={onClose} labelledBy="drawer-title" className="drawer">
      <div className="dialog-head">
        <h2 id="drawer-title">Audit log</h2>
        <span className="muted">Signed, hash-chained</span>
        <button type="button" className="dialog-close" onClick={onClose} aria-label="Close">
          Close
        </button>
      </div>

      <div className="drawer-actions">
        <button type="button" onClick={onVerify} disabled={verifying}>
          {verifying ? 'Verifying' : 'Verify log'}
        </button>
        <button type="button" className="reset-btn" onClick={onReset} disabled={resetting || resetDisabled} title={`Clear acknowledged steps for ${operator}`}>
          {resetting ? 'Resetting' : 'Reset drill'}
        </button>
      </div>
      {verify ? (
        <p className={verify.ok ? 'verify verify-ok' : 'verify verify-bad'} role={verify.ok ? 'status' : 'alert'}>
          {verify.ok
            ? `Chain intact, ${verify.entries} entries`
            : `Chain broken at entry ${verify.broken_seq ?? '?'}: ${verify.reason ?? 'no reason given'}`}
        </p>
      ) : null}

      <div className="drawer-filters">
        <label>
          <span className="label">Operator</span>
          <select value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="all">All</option>
            {actors.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label>
          <span className="label">Procedure</span>
          <select value={proc} onChange={(e) => setProc(e.target.value)}>
            <option value="all">All</option>
            {procedures.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>
          <span className="label">Result</span>
          <select value={result} onChange={(e) => setResult(e.target.value as (typeof RESULTS)[number])}>
            {RESULTS.map((r) => <option key={r} value={r}>{r === 'all' ? 'All' : r[0].toUpperCase() + r.slice(1)}</option>)}
          </select>
        </label>
      </div>

      <p className="muted drawer-count">
        {shown.length} of {entries.length} entries
      </p>
      <ol className="audit-list">
        {shown.map((e) => (
          <li key={e.seq} className={`audit-entry event-${e.event}${outcome(e) === 'blocked' ? ' is-blocked' : ''}`}>
            <button type="button" className="audit-row" onClick={() => onOpenEntry(e.seq)}>
              <span className="audit-line">
                <span className="audit-seq">#{e.seq}</span>
                <span className="audit-time">{clock(e.ts)}</span>
                <span className="audit-actor">{e.actor}</span>
                <span className={`outcome outcome-${outcome(e)}`}>{outcome(e)}</span>
              </span>
              <span className="audit-summary">{e.summary}</span>
            </button>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}
