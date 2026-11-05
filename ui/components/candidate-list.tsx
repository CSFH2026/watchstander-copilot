'use client';

import type { Candidate, Strength } from '../lib/api';

const LABEL: Record<Strength, string> = { strong: 'Strong', possible: 'Possible', weak: 'Weak' };
const FILLED: Record<Strength, number> = { strong: 3, possible: 2, weak: 1 };

/**
 * Three segments and a word, so the band reads by shape in red light too. The bar is a band on the
 * fused rank score against the top match, not a probability; the title gives the exact share.
 */
export function StrengthMeter({ candidate }: { candidate: Candidate }) {
  const { strength, relative } = candidate;
  return (
    <span className={`strength strength-${strength}`} title={`${Math.round(relative * 100)}% of the top match's fused score`}>
      <span className="strength-bar" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span key={n} className={n <= FILLED[strength] ? 'on' : undefined} />
        ))}
      </span>
      {LABEL[strength]}
    </span>
  );
}

/** "cosine 0.80 · 9 of 10 words": the two raw signals behind the rank. */
export function Evidence({ candidate, words }: { candidate: Candidate; words: number }) {
  return (
    <span className="cand-evidence">
      cosine {candidate.cosine.toFixed(2)}
      {words ? (
        <>
          {' · '}
          {candidate.keyword.length} of {words} words
        </>
      ) : null}
    </span>
  );
}

interface Props {
  candidates: Candidate[];
  /** The procedure open above. It stays off this list. */
  openId: string;
  /** How many of the question's words the corpus holds, for "9 of 10 words". */
  words: number;
  busy: boolean;
  onPick: (procedureId: string) => void;
}

/** The other procedures this question could be, best first. The open one is the default; this list helps confirm it. */
export function CandidateList({ candidates, openId, words, busy, onPick }: Props) {
  const others = candidates.filter((c) => c.procedure_id !== openId);
  if (!others.length) return null;
  return (
    <section className="card candidates" id="candidates" aria-labelledby="cand-title">
      <div className="cand-head">
        <h2 id="cand-title">Other matches for this question</h2>
        <p className="muted cand-note">
          Ranked by keyword and meaning match. Strength compares each to the top match; it is not a probability.
        </p>
      </div>
      <ol className="cand-list">
        {others.map((c) => (
          <li key={c.procedure_id}>
            <button
              type="button"
              className="cand-row"
              disabled={busy}
              onClick={() => onPick(c.procedure_id)}
              aria-label={`Open rank ${c.rank}, ${c.title}, ${LABEL[c.strength]} match`}
            >
              <span className="cand-rank">#{c.rank}</span>
              <span className="cand-main">
                <span className="cand-title">{c.title}</span>
                <span className="cand-sub">
                  <code>{c.procedure_id}</code>
                  {c.rank === 1 ? <span className="cand-top">Top match</span> : null}
                </span>
              </span>
              <span className="cand-score">
                <StrengthMeter candidate={c} />
                <Evidence candidate={c} words={words} />
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
