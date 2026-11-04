'use client';

import type { FormEvent } from 'react';

export const EXAMPLES = [
  'low lube oil pressure on number two SSDG',
  'high jacket water temp on number three SSDG',
  'loss of fuel oil pressure, engine hunting',
];

interface Props {
  value: string;
  busy: boolean;
  onChange: (text: string) => void;
  onAsk: (text: string) => void;
}

/** The one input on the page. A form so Enter submits; chips fill and submit at once. */
export function SymptomInput({ value, busy, onChange, onAsk }: Props) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (value.trim()) onAsk(value.trim());
  }

  return (
    <section className="ask" aria-label="Describe the casualty">
      <form className="ask-row" onSubmit={submit}>
        <label className="sr-only" htmlFor="symptom">
          Casualty symptom
        </label>
        <input
          id="symptom"
          className="ask-input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="Describe the symptom, for example: low lube oil pressure on number two SSDG"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {/* Slot reserved for a push-to-talk button. */}
        <button type="submit" className="primary ask-btn" disabled={busy || !value.trim()}>
          {busy ? 'Asking' : 'Ask'}
        </button>
      </form>
      <ExampleChips busy={busy} onPick={(text) => { onChange(text); onAsk(text); }} />
    </section>
  );
}

export function ExampleChips({ busy, onPick }: { busy: boolean; onPick: (text: string) => void }) {
  return (
    <div className="chips" role="group" aria-label="Example symptoms">
      {EXAMPLES.map((text) => (
        <button key={text} type="button" className="chip" disabled={busy} onClick={() => onPick(text)}>
          {text}
        </button>
      ))}
    </div>
  );
}
