'use client';

import { useState } from 'react';
import { pad2, type Step } from '../lib/api';
import { Dialog } from './dialog';

export type PaperRow = { step: Step; reading: string; done_at: string; note: string };
export type PaperOutcome = { step: Step; allowed: boolean; reason: string | null; audit_seq: number | null };

interface Props {
  open: boolean;
  procedureId: string;
  steps: Step[];
  sheet: string;
  operator: string;
  onClose: () => void;
  /** Sends the ticked steps in step order and reports each one; the page owns the API calls. */
  onSubmit: (sheet: string, rows: PaperRow[]) => Promise<PaperOutcome[]>;
  onOpenEntry: (seq: number) => void;
}

type Draft = { ticked: boolean; reading: string; done_at: string; note: string };
const EMPTY: Draft = { ticked: false, reading: '', done_at: '', note: '' };

/**
 * Copies a completed paper checklist into the log. Every ticked step goes through the same policy
 * engine as an on-screen tap, so a step done on paper before the step it follows is blocked and logged.
 */
export function PaperEntry({ open, procedureId, steps, sheet, operator, onClose, onSubmit, onOpenEntry }: Props) {
  const [sheetId, setSheetId] = useState(sheet);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [outcomes, setOutcomes] = useState<PaperOutcome[] | null>(null);

  const draft = (id: string) => drafts[id] ?? EMPTY;
  const edit = (id: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? EMPTY), ...patch } }));
  const ticked = steps.filter((s) => s.state !== 'done' && draft(s.step_id).ticked);

  function close() {
    setDrafts({});
    setOutcomes(null);
    setSheetId(sheet);
    onClose();
  }

  async function save() {
    setSaving(true);
    try {
      const rows = ticked.map((step) => ({ step, ...draft(step.step_id) }));
      setOutcomes(await onSubmit(sheetId.trim() || sheet, rows));
      setDrafts({});
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={close} labelledBy="paper-title" className="modal paper-modal">
      <div className="dialog-head">
        <h2 id="paper-title">Enter paper results</h2>
        <button type="button" className="dialog-close" onClick={close} aria-label="Close">
          Close
        </button>
      </div>

      {outcomes ? (
        <>
          <p className="muted">
            {outcomes.filter((o) => o.allowed).length} of {outcomes.length} steps saved from sheet {sheetId.trim() || sheet}, signed by {operator}.
          </p>
          <ul className="paper-outcomes">
            {outcomes.map((o) => (
              <li key={o.step.step_id} className={o.allowed ? 'check check-ok' : 'check check-bad'}>
                <span aria-hidden="true">{o.allowed ? '✓' : '✗'}</span>{' '}
                <span>
                  Step {pad2(o.step.seq)} {o.allowed ? 'saved' : `not saved. ${o.reason ?? 'Blocked.'}`}
                  {o.audit_seq ? (
                    <>
                      {' '}
                      <button type="button" className="link-btn" onClick={() => onOpenEntry(o.audit_seq as number)}>
                        audit #{o.audit_seq}
                      </button>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          <div className="paper-actions">
            <button type="button" className="primary" onClick={close}>
              Done
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <p className="muted">
            Tick each step marked done on {procedureId}, and copy what is written. Every entry is signed by {operator} and logged as
            done on paper.
          </p>
          <label className="paper-sheet">
            <span className="label">Sheet</span>
            <input value={sheetId} onChange={(e) => setSheetId(e.target.value)} maxLength={40} />
          </label>
          <ol className="paper-steps">
            {steps.map((step) => {
              const d = draft(step.step_id);
              const done = step.state === 'done';
              return (
                <li key={step.step_id} className={done ? 'paper-step is-done' : 'paper-step'}>
                  <label className="paper-tick">
                    <input
                      type="checkbox"
                      checked={done || d.ticked}
                      disabled={done || saving}
                      onChange={(e) => edit(step.step_id, { ticked: e.target.checked })}
                    />
                    <span>
                      <span className="step-seq">{pad2(step.seq)}</span> {step.text}
                    </span>
                  </label>
                  {done ? (
                    <p className="muted paper-prior">Already acknowledged{step.audit_seq ? ` in audit #${step.audit_seq}` : ''}.</p>
                  ) : d.ticked ? (
                    <div className="paper-fields">
                      <label>
                        <span className="label">Reading</span>
                        <input value={d.reading} maxLength={200} disabled={saving} onChange={(e) => edit(step.step_id, { reading: e.target.value })} />
                      </label>
                      <label>
                        <span className="label">Time</span>
                        <input value={d.done_at} maxLength={40} placeholder="14:32" disabled={saving} onChange={(e) => edit(step.step_id, { done_at: e.target.value })} />
                      </label>
                      <label className="paper-note">
                        <span className="label">Notes</span>
                        <textarea value={d.note} maxLength={500} rows={2} disabled={saving} onChange={(e) => edit(step.step_id, { note: e.target.value })} />
                      </label>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
          <div className="paper-actions">
            <button type="submit" className="primary" disabled={!ticked.length || saving}>
              {saving ? 'Signing' : `Sign and save ${ticked.length} ${ticked.length === 1 ? 'step' : 'steps'}`}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
