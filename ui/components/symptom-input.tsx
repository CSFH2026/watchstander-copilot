'use client';

import type { FormEvent } from 'react';
import type { ExampleChip } from '../lib/api';
import { BoardIcon } from './icons';

interface Props {
  value: string;
  busy: boolean;
  /** From /api/examples, else the served dataset's own examples from /api/health. A built-in list would offer questions that dataset refuses. */
  examples: ExampleChip[];
  /** The audit log window behind an "often" chip, from /api/examples. */
  windowDays?: number;
  onChange: (text: string) => void;
  onAsk: (text: string) => void;
  /** Shown once a question is asked: clears the screen and brings the examples back. */
  onClear?: () => void;
}

/** The one input on the page. A form so Enter submits; chips fill and submit at once. */
export function SymptomInput({ value, busy, examples, windowDays = 30, onChange, onAsk, onClear }: Props) {
  // A fixed example reads as a whole question; a chip from the log or a CASREP is a bare symptom.
  const placeholder = (examples.find((c) => c.reason === 'example') ?? examples[0])?.text;

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
          placeholder={placeholder ? `Describe the problem, for example: ${placeholder}` : 'Describe the problem: the indication and the equipment'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {/* Slot reserved for a push-to-talk button. */}
        <button type="submit" className="primary ask-btn" disabled={busy || !value.trim()}>
          {busy ? 'Asking' : 'Ask'}
        </button>
        {onClear ? (
          <button type="button" className="ask-clear" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </form>
      <ExampleChips busy={busy} examples={examples} windowDays={windowDays} onPick={(text) => { onChange(text); onAsk(text); }} />
    </section>
  );
}

// An open CASREP chip carries the CASREP Board's switch icon in place of a word tag; its tooltip names the CASREP.
const TAGS = { open: null, often: 'Often here', example: null } as const;

function why(chip: ExampleChip, windowDays: number): string | undefined {
  if (chip.reason === 'open') return `Open CASREP ${chip.serial} names ${chip.procedure_id}`;
  if (chip.reason === 'often') return `${chip.procedure_id} answered ${chip.count} times on this laptop in the last ${windowDays} days`;
  return undefined;
}

function ExampleChips({ busy, examples, windowDays, onPick }: { busy: boolean; examples: ExampleChip[]; windowDays: number; onPick: (text: string) => void }) {
  if (!examples.length) return null;
  return (
    <div className="chips" role="group" aria-label="Example questions">
      {examples.map((chip) => {
        const tag = TAGS[chip.reason];
        return (
          // The name stays the question alone, so a chip is found by what it asks; the tag says why it shows.
          <button key={chip.text} type="button" className={`chip chip-${chip.reason}`} disabled={busy} aria-label={chip.text}
            title={why(chip, windowDays)} onClick={() => onPick(chip.text)}>
            {chip.reason === 'open' ? (
              <span className="chip-board" aria-hidden="true">
                <BoardIcon />
              </span>
            ) : null}
            {tag ? <span className="chip-tag">{tag}</span> : null}
            {chip.text}
          </button>
        );
      })}
    </div>
  );
}
