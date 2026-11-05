'use client';

import { useEffect, useState } from 'react';
import { api, describeError, type AuditEntry, type AuditEntryDetail, type OutcomeResult, type ResolutionOutcome } from '../lib/api';
import { outcome, stamp } from './audit-time';
import { Dialog } from './dialog';

interface Props {
  seq: number | null;
  operator: string;
  /** The list row for this seq, shown while the full entry loads or when the backend has no entry route. */
  row: AuditEntry | undefined;
  onClose: () => void;
  onOutcomeCorrected: (result: OutcomeResult) => void;
}

const OUTCOME_LABELS: Record<ResolutionOutcome, string> = {
  fully_resolved: 'Fully resolved',
  partially_resolved: 'Partially resolved',
  unresolved: 'Unresolved',
};

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
export function EntryModal({ seq, operator, row, onClose, onOutcomeCorrected }: Props) {
  // Keyed by seq, so an answer for the previously opened entry is never shown for this one.
  const [loaded, setLoaded] = useState<{ seq: number; detail: AuditEntryDetail | null } | null>(null);
  const [latest, setLatest] = useState<OutcomeResult | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftOutcome, setDraftOutcome] = useState<ResolutionOutcome>('fully_resolved');
  const [draftNote, setDraftNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);

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
  const isOutcome = e?.event === 'outcome' || e?.event === 'outcome_correction';
  const queryId = isOutcome && typeof payload.query_id === 'string' ? payload.query_id : null;
  const currentOutcome = latest?.query_id === queryId ? latest : null;
  const facts = e ?? row;
  const kind = facts ? outcome({ event: facts.event, allowed: e ? (payload.allowed as boolean | undefined) : row?.allowed, summary: facts.summary ?? row?.summary ?? '' }) : '';
  const reason = typeof payload.reason === 'string' ? payload.reason : null;
  const stepId = (payload.step_id as string | undefined) ?? row?.step_id ?? null;
  const procedureId = (payload.procedure_id as string | undefined) ?? row?.procedure_id ?? null;

  useEffect(() => {
    if (!queryId) return;
    let live = true;
    api.latestOutcome(queryId)
      .then((result) => {
        if (!live) return;
        setLatest(result);
        setDraftOutcome(result.outcome);
        setDraftNote(result.note ?? '');
        setEditing(false);
        setCorrectionError(null);
      })
      .catch((err) => live && setCorrectionError(describeError(err)));
    return () => { live = false; };
  }, [queryId, seq]);

  async function saveCorrection() {
    if (!currentOutcome || !e) return;
    setSaving(true);
    setCorrectionError(null);
    try {
      const saved = await api.correctOutcome(operator, currentOutcome.audit.seq, draftOutcome, draftNote);
      setLatest(saved);
      setEditing(false);
      onOutcomeCorrected(saved);
    } catch (err) {
      setCorrectionError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

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
          {typeof payload.outcome === 'string' ? <div><dt>Outcome</dt><dd>{OUTCOME_LABELS[payload.outcome as ResolutionOutcome] ?? payload.outcome}</dd></div> : null}
          {typeof payload.corrects_seq === 'number' ? <div><dt>Corrects entry</dt><dd>#{payload.corrects_seq}</dd></div> : null}
          {typeof payload.text === 'string' ? <div><dt>Question</dt><dd>&ldquo;{payload.text}&rdquo;</dd></div> : null}
          {typeof payload.latency_ms === 'number' ? <div><dt>Answered in</dt><dd>{payload.latency_ms} ms</dd></div> : null}
          <div className="entry-wide"><dt>{reason ? 'Policy reason' : 'Summary'}</dt><dd>{reason ?? (e?.payload?.summary as string | undefined) ?? row?.summary}</dd></div>
        </dl>
      ) : (
        <p className="muted">Loading entry #{seq}</p>
      )}

      {isOutcome ? (
        <section className="entry-correction" aria-labelledby="correction-title">
          <h3 id="correction-title">Current checklist outcome</h3>
          {currentOutcome ? (
            <>
              <p><strong>{OUTCOME_LABELS[currentOutcome.outcome]}</strong> - {currentOutcome.note ?? 'No note'}</p>
              {currentOutcome.audit.seq !== seq ? <p className="muted">Latest saved entry #{currentOutcome.audit.seq}</p> : null}
              {operator !== e?.actor ? (
                <p className="muted">Select {e?.actor} in the header to correct this answer.</p>
              ) : editing ? (
                <div className="entry-correction-form">
                  <label><span className="label">Outcome</span>
                    <select value={draftOutcome} disabled={saving} onChange={(event) => setDraftOutcome(event.target.value as ResolutionOutcome)}>
                      {Object.entries(OUTCOME_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label><span className="label">Optional note</span>
                    <textarea value={draftNote} maxLength={500} rows={3} disabled={saving} onChange={(event) => setDraftNote(event.target.value)} />
                  </label>
                  <div className="entry-correction-actions">
                    <button type="button" disabled={saving} onClick={() => { setEditing(false); setCorrectionError(null); }}>Cancel</button>
                    <button type="button" className="primary" disabled={saving || (draftOutcome === currentOutcome.outcome && draftNote.trim() === (currentOutcome.note ?? ''))} onClick={() => void saveCorrection()}>
                      {saving ? 'Signing correction' : 'Save correction'}
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => { setDraftOutcome(currentOutcome.outcome); setDraftNote(currentOutcome.note ?? ''); setEditing(true); }}>Edit current answer</button>
              )}
            </>
          ) : <p className="muted">Loading latest answer</p>}
          {correctionError ? <p className="inline-error" role="alert">{correctionError}</p> : null}
        </section>
      ) : null}

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
