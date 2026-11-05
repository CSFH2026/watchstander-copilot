'use client';

import { useEffect, useState } from 'react';
import { api, type AuditEntry, type AuditEntryDetail } from '../lib/api';
import { outcome, stamp } from './audit-time';
import { Dialog } from './dialog';

interface Props {
  seq: number | null;
  /** The list row for this seq, shown while the full entry loads or when the backend has no entry route. */
  row: AuditEntry | undefined;
  onClose: () => void;
}

function Copyable({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be refused; the full value is still in the title tooltip.
    }
  }
  return (
    <div className="proof-row">
      <dt>{label}</dt>
      <dd>
        <code title={value}>{value.length > 20 ? `${value.slice(0, 12)}…${value.slice(-6)}` : value}</code>
        <button type="button" className="copy-btn" onClick={() => void copy()} aria-label={`Copy ${label.toLowerCase()}`}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </dd>
    </div>
  );
}

/** A check reads as a full sentence either way, so a failure says what is wrong, not just a red cross. */
function Check({ ok, pass, fail }: { ok: boolean; pass: string; fail: string }) {
  return (
    <li className={ok ? 'check check-ok' : 'check check-bad'}>
      <span aria-hidden="true">{ok ? '✓' : '✗'}</span> {ok ? pass : fail}
    </li>
  );
}

/** One audit entry: what happened, who signed it, and whether its proof holds on its own. */
export function EntryModal({ seq, row, onClose }: Props) {
  // Keyed by seq, so an answer for the previously opened entry is never shown for this one.
  const [loaded, setLoaded] = useState<{ seq: number; detail: AuditEntryDetail | null } | null>(null);

  useEffect(() => {
    if (seq === null) return;
    let live = true;
    api
      .auditEntry(seq)
      .then((d) => live && setLoaded({ seq, detail: d }))
      .catch(() => live && setLoaded({ seq, detail: null }));
    return () => {
      live = false;
    };
  }, [seq]);

  const current = loaded && loaded.seq === seq ? loaded : null;
  const detail = current?.detail ?? null;
  const unavailable = !!current && !current.detail;

  const e = detail?.entry;
  const payload = e?.payload ?? {};
  const facts = e ?? row;
  const kind = facts ? outcome({ event: facts.event, allowed: e ? (payload.allowed as boolean | undefined) : row?.allowed, summary: facts.summary ?? row?.summary ?? '' }) : '';
  const reason = typeof payload.reason === 'string' ? payload.reason : null;
  const stepId = (payload.step_id as string | undefined) ?? row?.step_id ?? null;
  const procedureId = (payload.procedure_id as string | undefined) ?? row?.procedure_id ?? null;

  return (
    <Dialog open={seq !== null} onClose={onClose} labelledBy="entry-title" className="modal entry-modal">
      <div className="dialog-head">
        <h2 id="entry-title">Audit entry #{seq}</h2>
        {kind ? <span className={`outcome outcome-${kind}`}>{kind}</span> : null}
        <button type="button" className="dialog-close" onClick={onClose} aria-label="Close">
          Close
        </button>
      </div>

      {facts ? (
        <dl className="entry-facts">
          <div><dt>Time</dt><dd>{stamp(facts.ts)}</dd></div>
          <div><dt>Operator</dt><dd>{facts.actor}</dd></div>
          <div><dt>Event</dt><dd>{facts.event}</dd></div>
          {procedureId ? <div><dt>Procedure</dt><dd><code>{procedureId}</code></dd></div> : null}
          {stepId ? <div><dt>Step</dt><dd><code>{stepId}</code></dd></div> : null}
          {payload.source === 'paper' ? <div><dt>Entered from</dt><dd>Paper sheet {String(payload.sheet ?? '')}</dd></div> : null}
          {typeof payload.done_at === 'string' ? <div><dt>Time on sheet</dt><dd>{payload.done_at}</dd></div> : null}
          {typeof payload.reading === 'string' ? <div><dt>Reading</dt><dd>{payload.reading}</dd></div> : null}
          {typeof payload.note === 'string' ? <div className="entry-wide"><dt>Note</dt><dd>{payload.note}</dd></div> : null}
          {typeof payload.reason === 'string' ? <div><dt>Flag</dt><dd>{payload.reason === 'not_possible' ? 'Not possible in this situation' : payload.reason === 'not_correct' ? 'Not correct for this issue/procedure' : payload.reason}</dd></div> : null}
          {typeof payload.explanation === 'string' ? <div className="entry-wide"><dt>Explanation</dt><dd>{payload.explanation}</dd></div> : null}
          {typeof payload.evidence === 'string' ? <div className="entry-wide"><dt>Evidence</dt><dd>{payload.evidence}</dd></div> : null}
          {typeof payload.text === 'string' ? <div><dt>Question</dt><dd>&ldquo;{payload.text}&rdquo;</dd></div> : null}
          {typeof payload.latency_ms === 'number' ? <div><dt>Answered in</dt><dd>{payload.latency_ms} ms</dd></div> : null}
          <div className="entry-wide"><dt>{reason ? 'Policy reason' : 'Summary'}</dt><dd>{reason ?? (e?.payload?.summary as string | undefined) ?? row?.summary}</dd></div>
        </dl>
      ) : (
        <p className="muted">Loading entry #{seq}</p>
      )}

      {facts ? (
        <section className="entry-proof" aria-labelledby="proof-title">
          <h3 id="proof-title">Proof</h3>
          <dl>
            <div className="proof-row"><dt>Signed by</dt><dd>{facts.signer}</dd></div>
            {e ? <Copyable label="Signature" value={e.signature} /> : null}
            <Copyable label="Hash" value={facts.hash} />
            <Copyable label="Previous hash" value={facts.prev_hash} />
            {e ? <Copyable label="Payload hash" value={e.payload_hash} /> : null}
          </dl>
          {detail ? (
            <ul className="checks" aria-label="Checks on this entry">
              <Check
                ok={detail.checks.prev_link_ok}
                pass={seq === 1 ? 'Starts the chain' : `Links to entry #${(seq ?? 1) - 1}`}
                fail={seq === 1 ? 'Does not start from the chain origin' : `Does not link to entry #${(seq ?? 1) - 1}`}
              />
              <Check ok={detail.checks.payload_ok} pass="Payload matches its hash" fail="Payload does not match its hash: it was changed" />
              <Check ok={detail.checks.hash_ok} pass="Entry hash matches its fields" fail="Entry hash does not match its fields" />
              <Check ok={detail.checks.signature_ok} pass={`Signature by ${facts.signer} is valid`} fail={`Signature by ${facts.signer} is not valid`} />
            </ul>
          ) : unavailable ? (
            <p className="muted">This backend does not check single entries. Verify log checks the whole chain.</p>
          ) : null}
        </section>
      ) : null}
    </Dialog>
  );
}
