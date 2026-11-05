'use client';

import { useState } from 'react';
import { pad2, type Step, type StepFlag } from '../lib/api';
import { Dialog } from './dialog';

interface Props {
  step: Step | null;
  saving: boolean;
  onClose: () => void;
  onSave: (reason: StepFlag['reason'], explanation: string, evidence: string) => Promise<void>;
}

export function StepFlagDialog({ step, saving, onClose, onSave }: Props) {
  const [reason, setReason] = useState<StepFlag['reason']>('not_possible');
  const [explanation, setExplanation] = useState('');
  const [evidence, setEvidence] = useState('');
  const [error, setError] = useState<string | null>(null);

  function close() {
    setReason('not_possible');
    setExplanation('');
    setEvidence('');
    setError(null);
    onClose();
  }

  return (
    <Dialog open={step !== null} onClose={close} labelledBy="flag-title" className="modal flag-modal">
      {step ? (
        <>
          <div className="dialog-head">
            <h2 id="flag-title">Flag step {pad2(step.seq)}</h2>
            <button type="button" className="dialog-close" onClick={close} aria-label="Close">Close</button>
          </div>
          <form onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            void onSave(reason, explanation, evidence).catch((err: unknown) => {
              setError(err instanceof Error ? err.message : 'Could not save this flag.');
            });
          }}>
            <p className="muted flag-copy">Flagging records a concern for review. It does not mark the step complete or alter the approved procedure.</p>
            <fieldset className="flag-options">
              <legend>Why are you flagging this step?</legend>
              <label><input type="radio" name="flag-reason" checked={reason === 'not_possible'} onChange={() => setReason('not_possible')} /> Not possible in this situation</label>
              <label><input type="radio" name="flag-reason" checked={reason === 'not_correct'} onChange={() => setReason('not_correct')} /> Not correct for this issue or procedure</label>
            </fieldset>
            <label className="flag-field">Explanation (optional)
              <textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} maxLength={500} rows={3} />
            </label>
            <label className="flag-field">Relevant evidence (optional)
              <textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} maxLength={500} rows={3} />
            </label>
            {error ? <p className="error-banner" role="alert">{error}</p> : null}
            <div className="flag-actions">
              <button type="button" onClick={close} disabled={saving}>Cancel</button>
              <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving' : 'Save flag'}</button>
            </div>
          </form>
        </>
      ) : null}
    </Dialog>
  );
}
