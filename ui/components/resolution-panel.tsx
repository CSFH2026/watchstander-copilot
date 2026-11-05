'use client';

import type { OutcomeResult, ResolutionOutcome } from '../lib/api';

const OPTIONS: { value: ResolutionOutcome; label: string; detail: string }[] = [
  { value: 'fully_resolved', label: 'Fully resolved', detail: 'Casualty corrected and normal condition restored.' },
  { value: 'partially_resolved', label: 'Partially resolved', detail: 'Condition improved, but follow-up remains.' },
  { value: 'unresolved', label: 'Unresolved', detail: 'Casualty remains after checklist completion.' },
];

interface Props {
  note: string;
  value: ResolutionOutcome;
  saved: OutcomeResult | null;
  saving: boolean;
  error: string | null;
  onValue: (value: ResolutionOutcome) => void;
  onNote: (note: string) => void;
  onSubmit: () => void;
  onCorrect: () => void;
  onOpenEntry: (seq: number) => void;
}

export function ResolutionPanel({ note, value, saved, saving, error, onValue, onNote, onSubmit, onCorrect, onOpenEntry }: Props) {
  const unchanged = !!saved && value === saved.outcome && note.trim() === (saved.note ?? '');

  function discardChanges() {
    if (!saved) return;
    onValue(saved.outcome);
    onNote(saved.note ?? '');
  }

  return (
    <section className="resolution card" aria-labelledby="resolution-title">
      <div className="resolution-head">
        <div>
          <h2 id="resolution-title">Checklist outcome</h2>
          <p className="muted">Record the condition at completion for follow-up and reporting.</p>
        </div>
        {saved ? (
          <button type="button" className="link-btn resolution-audit" onClick={() => onOpenEntry(saved.audit.seq)}>
            Saved #{saved.audit.seq}
          </button>
        ) : null}
      </div>
      <fieldset className="resolution-options" disabled={saving}>
        <legend className="sr-only">Resolution outcome</legend>
        {OPTIONS.map((option) => (
          <label key={option.value} className={value === option.value ? 'resolution-option is-selected' : 'resolution-option'}>
            <input
              type="radio"
              name="resolution-outcome"
              value={option.value}
              checked={value === option.value}
              onChange={() => onValue(option.value)}
            />
            <span>
              <strong>{option.label}</strong>
              <span>{option.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="resolution-note">
        <span className="label">Optional note</span>
        <textarea
          value={note}
          maxLength={500}
          rows={3}
          disabled={saving}
          onChange={(event) => onNote(event.target.value)}
          placeholder="What remains, what improved, or what was restored."
        />
      </label>
      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="resolution-actions">
        <span className="muted">{note.length}/500</span>
        {saved ? (
          <>
            {!unchanged ? <span className="muted" role="status">Unsaved changes</span> : null}
            {!unchanged ? <button type="button" disabled={saving} onClick={discardChanges}>Discard changes</button> : null}
            <button type="button" className="primary" disabled={saving || unchanged} onClick={onCorrect}>
              {saving ? 'Signing correction' : 'Save correction'}
            </button>
          </>
        ) : (
          <button type="button" className="primary" disabled={saving} onClick={onSubmit}>
            {saving ? 'Signing outcome' : 'Save outcome'}
          </button>
        )}
      </div>
    </section>
  );
}
