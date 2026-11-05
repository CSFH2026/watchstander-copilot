'use client';

import type { AuditEntry, VerifyResult } from '../lib/api';
import { clock } from './audit-time';

interface Props {
  latest: AuditEntry | null;
  error: string | null;
  verify: VerifyResult | null;
  verifying: boolean;
  onVerify: () => void;
  onOpenLog: () => void;
  onOpenEntry: (seq: number) => void;
}

/**
 * One line of trust evidence under the header. The entry count rises with every query and
 * acknowledge, so the room sees each action recorded without a column of hashes.
 */
export function TrustStrip({ latest, error, verify, verifying, onVerify, onOpenLog, onOpenEntry }: Props) {
  let status = <span className="strip-status strip-unknown">Not verified yet</span>;
  if (verify?.ok) status = <span className="strip-status verify-ok">Chain intact</span>;
  else if (verify) {
    status = (
      <span className="strip-status verify-bad" role="alert">
        Chain broken at entry {verify.broken_seq ?? '?'}: {verify.reason ?? 'no reason given'}
      </span>
    );
  }

  return (
    <section className="card trust-strip" aria-label="Audit log">
      <div className="strip-facts">
        {status}
        <span className="strip-count">
          <strong>{latest?.seq ?? 0}</strong> entries, signed and hash-chained
        </span>
        {latest ? (
          <button type="button" className="link-btn strip-last" onClick={() => onOpenEntry(latest.seq)}>
            Last #{latest.seq} {latest.event} by {latest.actor} at {clock(latest.ts)}
          </button>
        ) : null}
        {error ? <span className="inline-error">{error}</span> : null}
      </div>
      <div className="strip-actions">
        <button type="button" onClick={onVerify} disabled={verifying}>
          {verifying ? 'Verifying' : 'Verify log'}
        </button>
        <button type="button" onClick={onOpenLog}>
          Open log
        </button>
      </div>
    </section>
  );
}
