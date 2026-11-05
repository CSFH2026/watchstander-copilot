'use client';

import { useState, type FormEvent } from 'react';
import { api, describeError, type KeyValueAnswerResult, type KeyValueContextTurn } from '../../lib/api';

export default function SearchDemoPage() {
  const [prompt, setPrompt] = useState('');
  const [threshold, setThreshold] = useState('');
  const [result, setResult] = useState<KeyValueAnswerResult | null>(null);
  const [history, setHistory] = useState<KeyValueContextTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    const question = prompt.trim();
    try {
      const answer = await api.keyValueAnswer(
        question,
        threshold.trim() ? Number(threshold) : undefined,
        history,
      );
      setResult(answer);
      setHistory((turns) => [...turns, {
        prompt: question,
        answer: answer.answer,
        candidates: answer.candidates,
      }]);
    } catch (err) {
      setError(describeError(err));
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  function clearContext() {
    setHistory([]);
    setResult(null);
    setError(null);
  }

  return (
    <main className="page">
      <div className="layout">
        <div className="demo-heading">
          <a className="header-link" href="/">← Watchstander Copilot</a>
          <h1>Retrieve, re-rank, can generate</h1>
          <p className="muted">Your prompt goes through hybrid search and DeBERTa reranking. The reranked samples then ground an OpenAI generated answer.</p>
        </div>

        <div className="demo-notice" role="note">
          <strong>Reference demo only.</strong> WikiHow samples are unverified and are not authorized procedures or action guidance. Your prompt and retrieved samples are sent to OpenAI for generation.
        </div>

        <form className="card demo-form" onSubmit={search}>
          <div className="demo-context-bar">
            <label className="label" htmlFor="demo-prompt">Search prompt</label>
            <div className="demo-context-actions">
              <span className="demo-context-count">{history.length ? `${history.length} turns in context` : 'New conversation'}</span>
              <button type="button" className="demo-clear-context" onClick={clearContext} disabled={busy || history.length === 0}>
                Clear context
              </button>
            </div>
          </div>
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
              {busy ? 'Searching and generating…' : 'Ask'}
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
        {busy ? <p className="loading" role="status">Hybrid search, reranking, and answer generation…</p> : null}

        {result ? (
          <section className="demo-results" aria-live="polite">
            <article className="card demo-answer">
              <div className="demo-answer-head">
                <div className="demo-answer-title">
                  <span className="demo-answer-mark" aria-hidden="true">✦</span>
                  <div>
                    <span className="demo-answer-kicker">AI response</span>
                    <h2>{result.status === 'generated' ? 'Answer' : 'No supported answer'}</h2>
                  </div>
                </div>
                <span className="demo-answer-meta">
                  {result.model ? result.model : 'Generation skipped'}
                  {result.model ? <span aria-hidden="true"> · </span> : null}
                  {result.latency_ms} ms
                </span>
              </div>
              <div className="demo-answer-body"><p>{result.answer}</p></div>
              <div className="demo-answer-foot">
                <span className="demo-answer-source">Based on {result.candidates.length} retrieved {result.candidates.length === 1 ? 'sample' : 'samples'}</span>
                <span className="demo-answer-caveat">Unverified reference content</span>
              </div>
            </article>
            <div className="demo-results-head">
              <h2>Retrieved and reranked samples</h2>
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
