'use client';

import { pad2, type ActionResult } from '../lib/api';
import { BlockIcon, CheckIcon } from './icons';

/** The server's verdict on the last acknowledge. A block is logged too, so it shows its audit number. */
export function ActionBanner({
  result,
  seq,
  onDismiss,
  onOpenEntry,
}: {
  result: ActionResult;
  seq: number | null;
  onDismiss: () => void;
  onOpenEntry: (seq: number) => void;
}) {
  const entry = (
    <button type="button" className="link-btn banner-entry" onClick={() => onOpenEntry(result.audit.seq)}>
      audit #{result.audit.seq}
    </button>
  );
  const dismiss = (
    <button type="button" className="banner-dismiss" onClick={onDismiss} aria-label="Dismiss">
      Dismiss
    </button>
  );
  const step = seq !== null ? `Step ${pad2(seq)}` : result.step_id;
  if (result.allowed) {
    return (
      <div className="action-banner allowed" role="status">
        <CheckIcon />
        <p>
          {step} acknowledged, signed by {result.audit.signer}, {entry}
        </p>
        {dismiss}
      </div>
    );
  }
  return (
    <div className="action-banner blocked" role="alert">
      <BlockIcon />
      <div>
        <p className="blocked-reason">{result.reason ?? `${step} blocked by policy.`}</p>
        <p className="blocked-meta">
          Not executed. Block logged as {entry}, signed by {result.audit.signer}.
        </p>
      </div>
      {dismiss}
    </div>
  );
}
