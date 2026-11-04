'use client';

import type { Alternate, Procedure } from '../lib/api';

interface Props {
  procedure: Procedure;
  alternates: Alternate[];
  confidence: 'clear' | 'ambiguous' | 'none';
  notice: string | null;
  keywords: string[];
  latencyMs: number;
  clientMs: number | null;
  busy: boolean;
  onAlternate: (title: string) => void;
}

/** What matched, where it comes from, and how fast. The citation is shown in full. */
export function ProcedurePanel({ procedure, alternates, confidence, notice, keywords, latencyMs, clientMs, busy, onAlternate }: Props) {
  const ambiguous = confidence === 'ambiguous';
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
          {alternates[0] ? (
            <button type="button" disabled={busy} onClick={() => onAlternate(alternates[0].title)}>
              Switch to {alternates[0].procedure_id}
            </button>
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
      {alternates.length ? (
        <div className="alternates">
          <span className="label">{ambiguous ? 'Also fits' : 'Not this one?'}</span>
          {alternates.map((alt) => (
            <button key={alt.procedure_id} type="button" className="link-btn" disabled={busy} onClick={() => onAlternate(alt.title)}>
              {alt.title}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
