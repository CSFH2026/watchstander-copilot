'use client';

import { useState } from 'react';
import { pad2, type Step, type StepFlag } from '../lib/api';
import { CheckIcon, LockIcon, NextIcon, WarnIcon } from './icons';
import { StepFlagDialog } from './step-flag';

const STATE_LABEL = { done: 'Done', next: 'Next', locked: 'Locked' } as const;

interface Props {
  steps: Step[];
  pendingStep: string | null;
  onAcknowledge: (step: Step) => void;
  onOpenEntry: (seq: number) => void;
  onPrint: () => void;
  onPaper: () => void;
  flags: StepFlag[];
  onFlag: (step: Step, reason: StepFlag['reason'], explanation: string, evidence: string) => Promise<void>;
  /** Absent when the backend has no CASREP routes; the button then does not show. */
  onCasrep?: () => void;
}

/**
 * Every step in order. The Acknowledge button stays live on locked steps on purpose:
 * the server's policy engine is the authority, and the drill shows it refusing.
 */
export function StepList({ steps, pendingStep, onAcknowledge, onOpenEntry, onPrint, onPaper, onCasrep, flags, onFlag }: Props) {
  const [flagStep, setFlagStep] = useState<Step | null>(null);
  const [savingFlag, setSavingFlag] = useState(false);
  const doneCount = steps.filter((s) => s.state === 'done').length;
  return (
    <section className="steps" aria-labelledby="steps-title">
      <div className="steps-head">
        <h2 id="steps-title">Procedure steps</h2>
        <span className="progress">
          {doneCount} of {steps.length} done
        </span>
        <div className="steps-tools">
          <button type="button" onClick={onPrint}>
            Print checklist
          </button>
          <button type="button" onClick={onPaper}>
            Enter paper results
          </button>
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
        {steps.map((step) => (
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
              {step.danger ? (
                <p className="step-danger">
                  <WarnIcon />
                  <span>
                    <strong>Danger:</strong> {step.danger}
                  </span>
                </p>
              ) : null}
              {flags.filter((f) => f.step_id === step.step_id).map((flag) => (
                <div className="step-flag-note" key={flag.audit_seq}>
                  <strong>{flag.reason === 'not_possible' ? 'Flagged: not possible' : 'Flagged: not correct for this issue/procedure'}</strong>
                  {flag.explanation ? <p>{flag.explanation}</p> : null}
                  {flag.evidence ? <p><span className="label">Evidence:</span> {flag.evidence}</p> : null}
                  <button type="button" className="link-btn" onClick={() => onOpenEntry(flag.audit_seq)}>Review entry #{flag.audit_seq}</button>
                </div>
              ))}
            </div>
            <div className="step-action">
              {step.state === 'done' && step.audit_seq ? (
                <button
                  type="button"
                  className="link-btn ack-done"
                  onClick={() => onOpenEntry(step.audit_seq as number)}
                  aria-label={`Step ${pad2(step.seq)} acknowledged, open audit entry ${step.audit_seq}`}
                >
                  Acknowledged #{step.audit_seq}
                </button>
              ) : step.state === 'done' ? (
                <span className="ack-done">Acknowledged</span>
              ) : (
                <button
                  type="button"
                  className={step.state === 'next' ? 'primary ack-btn' : 'ack-btn'}
                  disabled={pendingStep !== null}
                  onClick={() => onAcknowledge(step)}
                  aria-label={`Acknowledge step ${pad2(step.seq)}`}
                >
                  {pendingStep === step.step_id ? 'Signing' : 'Acknowledge'}
                </button>
              )}
              <button type="button" className="flag-step-btn" onClick={() => setFlagStep(step)}>Flag step</button>
            </div>
          </li>
        ))}
      </ol>
      <StepFlagDialog
        key={flagStep?.step_id ?? 'closed'}
        step={flagStep}
        saving={savingFlag}
        onClose={() => setFlagStep(null)}
        onSave={async (reason, explanation, evidence) => {
          if (!flagStep) return;
          setSavingFlag(true);
          try {
            await onFlag(flagStep, reason, explanation, evidence);
            setFlagStep(null);
          } finally {
            setSavingFlag(false);
          }
        }}
      />
    </section>
  );
}
