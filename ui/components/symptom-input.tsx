'use client';

import type { FormEvent } from 'react';

interface Props {
  value: string;
  busy: boolean;
  /** The served dataset's own examples from /api/health. A built-in list would offer questions that dataset refuses. */
  examples: string[];
  onChange: (text: string) => void;
  onAsk: (text: string) => void;
}

/** The one input on the page. A form so Enter submits; chips fill and submit at once. */
export function SymptomInput({ value, busy, examples, onChange, onAsk }: Props) {
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
          placeholder={examples[0] ? `Describe the problem, for example: ${examples[0]}` : 'Describe the problem: the indication and the equipment'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {/* Slot reserved for a push-to-talk button. */}
        <button type="submit" className="primary ask-btn" disabled={busy || !value.trim()}>
          {busy ? 'Asking' : 'Ask'}
        </button>
      </form>
      <ExampleChips busy={busy} examples={examples} onPick={(text) => { onChange(text); onAsk(text); }} />
    </section>
  );
}

export function ExampleChips({ busy, examples, onPick }: { busy: boolean; examples: string[]; onPick: (text: string) => void }) {
  if (!examples.length) return null;
  return (
    <div className="chips" role="group" aria-label="Example questions">
      {examples.map((text) => (
        <button key={text} type="button" className="chip" disabled={busy} onClick={() => onPick(text)}>
          {text}
        </button>
      ))}
    </div>
  );
}
