'use client';

import { useState } from 'react';
import { pad2, type FlagType, type Step } from '../lib/api';
import { CheckIcon, LockIcon, NextIcon, WarnIcon } from './icons';

const STATE_LABEL = { done: 'Done', next: 'Next', locked: 'Locked' } as const;
type Draft = { reading: string; note: string; flag: FlagType; explanation: string; evidence: string };
const blank = (): Draft => ({ reading: '', note: '', flag: 'not_possible', explanation: '', evidence: '' });

interface Props {
  steps: Step[];
  pendingStep: string | null;
  runId: string;
  onAcknowledge: (step: Step, reading: string, note: string) => void;
  onFlag?: (step: Step, flag: FlagType, explanation: string, evidence: string) => void;
  flagged: Record<string, string>;
  onOpenEntry: (seq: number) => void;
  onPrint: () => void;
  onPaper: () => void;
  onFinish?: () => void;
  /** Absent when the backend has no CASREP routes; the button then does not show. */
  onCasrep?: () => void;
}

/**
 * Every step in order. The Acknowledge button stays live on locked steps on purpose:
 * the server's policy engine is the authority, and the drill shows it refusing.
 */
export function StepList({ steps, pendingStep, runId, onAcknowledge, onFlag, flagged, onOpenEntry, onPrint, onPaper, onFinish, onCasrep }: Props) {
  const doneCount = steps.filter((s) => s.state === 'done').length;
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const draft = (id: string) => drafts[id] ?? blank();
  const edit = (id: string, patch: Partial<Draft>) =>
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] ?? blank()), ...patch } }));
  return (
    <section className="steps" aria-labelledby="steps-title">
      <div className="steps-head">
        <h2 id="steps-title">Procedure steps</h2>
        <span className="progress">{doneCount} of {steps.length} done</span>
        <div className="steps-tools">
          <button type="button" onClick={onPrint}>Print checklist</button>
          <button type="button" onClick={onPaper}>Enter paper results</button>
          {onFinish ? <button type="button" onClick={onFinish}>Record outcome</button> : null}
          {onCasrep ? (
            <button type="button" onClick={onCasrep} disabled={!doneCount} title={doneCount ? undefined : 'Acknowledge a step first'}>
              Draft CASREP
            </button>
          ) : null}
        </div>
      </div>
      <div className="progress-bar" aria-hidden="true">
        <span style={{ width: `${steps.length ? (doneCount / steps.length) * 100 : 0}%` }} />
      </div>
      <ol className="step-list">
        {steps.map((step) => {
          const d = draft(step.step_id);
          return (
            <li key={step.step_id} className={`step step-${step.state}`}>
              <div className="step-marker" aria-hidden="true">
                {step.state === 'done' ? <CheckIcon /> : step.state === 'next' ? <NextIcon /> : <LockIcon />}
              </div>
              <div className="step-body">
                <div className="step-top">
                  <span className="step-seq">{pad2(step.seq)}</span>
                  <span className="step-state">{STATE_LABEL[step.state]}</span>
                </div>
                <p className="step-text">{step.text}</p>
                {step.danger ? <p className="step-danger"><WarnIcon /><span><strong>Danger:</strong> {step.danger}</span></p> : null}
                {step.record ? (
                  <div className="step-evidence">
                    <label>
                      <span className="label">{step.record.prompt} ({step.record.unit})</span>
                      <input value={d.reading} maxLength={200} aria-label={`Reading for step ${pad2(step.seq)}: ${step.record.prompt} (${step.record.unit})`}
                        onChange={(e) => edit(step.step_id, { reading: e.target.value })} />
                    </label>
                    {step.record.limit ? (
                      <p className="muted">{step.record.limit}{step.record.training_value ? ' · training value' : ''}</p>
                    ) : null}
                    <label>
                      <span className="label">Observation or note (optional)</span>
                      <textarea value={d.note} maxLength={500} rows={2} onChange={(e) => edit(step.step_id, { note: e.target.value })} />
                    </label>
                  </div>
                ) : null}
                {flagged[step.step_id] ? <p className="step-flagged" role="status">Flag recorded: {flagged[step.step_id]}</p> : null}
                {onFlag ? <details className="step-flag">
                  <summary>Flag this step</summary>
                  <div className="step-flag-fields">
                    <label>
                      <span className="label">Reason</span>
                      <select value={d.flag} onChange={(e) => edit(step.step_id, { flag: e.target.value as FlagType })}>
                        <option value="not_possible">Not possible in this situation</option>
                        <option value="incorrect">Incorrect for this issue or procedure</option>
                      </select>
                    </label>
                    <label>
                      <span className="label">Explanation (optional)</span>
                      <textarea value={d.explanation} maxLength={500} rows={2} onChange={(e) => edit(step.step_id, { explanation: e.target.value })} />
                    </label>
                    <label>
                      <span className="label">Evidence or observation (optional)</span>
                      <textarea value={d.evidence} maxLength={500} rows={2} onChange={(e) => edit(step.step_id, { evidence: e.target.value })} />
                    </label>
                    <button type="button" onClick={() => onFlag?.(step, d.flag, d.explanation, d.evidence)}>Record flag</button>
                  </div>
                </details> : null}
              </div>
              <div className="step-action">
                {step.state === 'done' && step.audit_seq ? (
                  <button type="button" className="link-btn ack-done" onClick={() => onOpenEntry(step.audit_seq as number)}
                    aria-label={`Step ${pad2(step.seq)} acknowledged, open audit entry ${step.audit_seq}`}>
                    Acknowledged #{step.audit_seq}
                  </button>
                ) : step.state === 'done' ? <span className="ack-done">Acknowledged</span> : (
                  <button type="button" className={step.state === 'next' ? 'primary ack-btn' : 'ack-btn'}
                    disabled={pendingStep !== null} onClick={() => onAcknowledge(step, d.reading, d.note)}
                    aria-label={`Acknowledge step ${pad2(step.seq)}`}>
                    {pendingStep === step.step_id ? 'Signing' : 'Acknowledge'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {onFlag ? <p className="muted">Checklist run {runId}. Flags are recorded for review and never count as completed steps.</p> : null}
    </section>
  );
}
