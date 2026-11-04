'use client';

import { pad2, type Step } from '../lib/api';
import { CheckIcon, LockIcon, NextIcon, WarnIcon } from './icons';

const STATE_LABEL = { done: 'Done', next: 'Next', locked: 'Locked' } as const;

interface Props {
  steps: Step[];
  pendingStep: string | null;
  disabled?: boolean;
  onAcknowledge: (step: Step) => void;
}

/**
 * Every step in order. The Acknowledge button stays live on locked steps on purpose:
 * the server's policy engine is the authority, and the drill shows it refusing.
 */
export function StepList({ steps, pendingStep, disabled = false, onAcknowledge }: Props) {
  const doneCount = steps.filter((s) => s.state === 'done').length;
  return (
    <section className="steps" aria-labelledby="steps-title">
      <div className="steps-head">
        <h2 id="steps-title">Procedure steps</h2>
        <span className="progress">
          {doneCount} of {steps.length} done
        </span>
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
            </div>
            <div className="step-action">
              {step.state === 'done' ? (
                <span className="ack-done">Acknowledged</span>
              ) : (
                <button
                  type="button"
                  className={step.state === 'next' ? 'primary ack-btn' : 'ack-btn'}
                  disabled={disabled || pendingStep !== null}
                  onClick={() => onAcknowledge(step)}
                  aria-label={`Acknowledge step ${pad2(step.seq)}`}
                >
                  {pendingStep === step.step_id ? 'Signing' : 'Acknowledge'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
