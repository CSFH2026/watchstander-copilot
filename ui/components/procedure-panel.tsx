'use client';

import type { Candidate, Procedure } from '../lib/api';
import { Evidence, StrengthMeter } from './candidate-list';

interface Props {
  procedure: Procedure;
  candidates: Candidate[];
  /** How many of the question's words the corpus holds, for "9 of 10 words". */
  words: number;
  confidence: 'clear' | 'ambiguous' | 'none';
  notice: string | null;
  keywords: string[];
  latencyMs: number;
  clientMs: number | null;
  busy: boolean;
  onPick: (procedureId: string) => void;
}

/** What matched, where it comes from, and how fast. The citation is shown in full. */
export function ProcedurePanel({ procedure, candidates, words, confidence, notice, keywords, latencyMs, clientMs, busy, onPick }: Props) {
  const ambiguous = confidence === 'ambiguous';
  const open = candidates.find((c) => c.procedure_id === procedure.procedure_id) ?? null;
  // Of the two that fit, the one not on screen, so the button always offers the other.
  const other = candidates.slice(0, 2).find((c) => c.procedure_id !== procedure.procedure_id);
  const more = candidates.length - 1;
  return (
    <section className="card procedure" aria-labelledby="proc-title">
      <div className="proc-meta">
        <code className="proc-id">{procedure.procedure_id}</code>
        <span className="latency" title={`Server latency ${latencyMs} ms`}>
          Answered in {((clientMs ?? latencyMs) / 1000).toFixed(1)} s<span className="latency-server"> (server {latencyMs} ms)</span>
        </span>
      </div>
      {ambiguous ? (
        <div className="notice-warn" role="status">
          <strong>Confirm the casualty.</strong> {notice}
          {other ? (
            <button type="button" disabled={busy} onClick={() => onPick(other.procedure_id)}>
              Switch to {other.procedure_id}
            </button>
          ) : null}
        </div>
      ) : null}
      {open ? (
        <div className="cand-line">
          <span className="cand-rank">#{open.rank}</span>
          <span>{open.rank === 1 ? 'Top match' : `Picked from ${candidates.length} matches`}</span>
          <StrengthMeter candidate={open} />
          <Evidence candidate={open} words={words} />
          {more ? (
            <a className="cand-jump" href="#candidates">
              {more === 1 ? '1 other match' : `${more} other matches`}
            </a>
          ) : null}
        </div>
      ) : null}
      <h1 id="proc-title" className="proc-title">
        {procedure.title}
      </h1>
      <p className="source">
        <span className="label">Source</span>
        {procedure.source}
      </p>
      {keywords.length ? (
        <div className="matched">
          <span className="label">Matched on</span>
          <ul className="tag-list">
            {keywords.map((k) => (
              <li key={k} className="tag tag-match">
                {k}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {procedure.symptoms.length ? (
        <div className="symptoms">
          <span className="label">Symptoms</span>
          <ul className="tag-list">
            {procedure.symptoms.map((s) => (
              <li key={s} className="tag">
                {s}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
