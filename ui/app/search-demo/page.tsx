'use client';

import { useState, type FormEvent } from 'react';
import { api, describeError, type KeyValueSearchResult } from '../../lib/api';

export default function SearchDemoPage() {
  const [prompt, setPrompt] = useState('save files to a USB flash drive');
  const [threshold, setThreshold] = useState('');
  const [result, setResult] = useState<KeyValueSearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api.keyValueSearch(
        prompt.trim(),
        threshold.trim() ? Number(threshold) : undefined,
      ));
    } catch (err) {
      setError(describeError(err));
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="layout">
        <div className="demo-heading">
          <a className="header-link" href="/">← Watchstander Copilot</a>
          <h1>Hybrid search and reranker demo</h1>
          <p className="muted">Search WikiHow title and action samples, then inspect the DeBERTa reranker output.</p>
        </div>

        <div className="demo-notice" role="note">
          <strong>Reference demo only.</strong> WikiHow samples are unverified and are not authorized procedures or action guidance.
        </div>

        <form className="card demo-form" onSubmit={search}>
          <label className="label" htmlFor="demo-prompt">Search prompt</label>
          <div className="ask-row">
            <input
              id="demo-prompt"
              className="ask-input"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              maxLength={500}
              required
            />
            <button className="primary ask-btn" type="submit" disabled={busy || !prompt.trim()}>
              {busy ? 'Searching…' : 'Search'}
            </button>
          </div>
          <label className="label" htmlFor="demo-threshold">Relevance cutoff (optional)</label>
          <input
            id="demo-threshold"
            className="demo-threshold"
            type="number"
            min="0"
            max="1"
            step="0.05"
            placeholder="Use configured default"
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
          />
          <p className="muted">Leave blank to use the backend default. Lower cutoffs show more candidates, including weak matches.</p>
        </form>

        {error ? <div className="error-banner" role="alert"><strong>Search failed.</strong> {error}</div> : null}
        {busy ? <p className="loading" role="status">Hybrid search and reranking…</p> : null}

        {result ? (
          <section className="demo-results" aria-live="polite">
            <div className="demo-results-head">
              <h2>Ranked candidates</h2>
              <span className="muted">{result.candidates.length} results · {result.latency_ms} ms</span>
            </div>
            {result.candidates.length ? (
              <ol className="demo-list">
                {result.candidates.map((candidate, index) => (
                  <li className="card demo-candidate" key={candidate.candidate_id}>
                    <div className="demo-candidate-head">
                      <span className="demo-rank">#{index + 1}</span>
                      <h3>{candidate.candidate_name}</h3>
                      <code>ID {candidate.candidate_id}</code>
                    </div>
                    <pre>{candidate.candidate_value}</pre>
                    <div className="demo-scores">
                      <span>Relevance: {candidate.rerank_score.toFixed(4)}</span>
                      <span>Hybrid rank: {candidate.hybrid_rank}</span>
                      <span>Reranker rank: {candidate.rerank_rank}</span>
                      <span>Blend: {candidate.blend_score.toFixed(6)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="empty">
                <strong>No candidates passed the relevance cutoff.</strong>
                <span>Try a different prompt, or lower the optional cutoff to inspect more results.</span>
              </div>
            )}
            <p className="muted">{result.notice}</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
