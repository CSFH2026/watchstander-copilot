'use client';

import { pad2, type Dataset, type Procedure, type Step } from '../lib/api';
import { stamp } from './audit-time';

interface Props {
  procedure: Procedure;
  steps: Step[];
  /** The query that opened this procedure, such as "q-0286". It ties the paper back to its run in the log. */
  sheet: string;
  operator: string;
  question: string | null;
  dataset: Dataset | undefined;
  printedAt: Date | null;
}

const short = (stepId: string) => stepId.slice(stepId.lastIndexOf('-') + 1);

/**
 * The paper checklist. Hidden on screen and the only thing the printer sees. A table, because
 * browsers repeat <thead> on every printed page, so a loose page still says which sheet it is from.
 */
export function PrintSheet({ procedure, steps, sheet, operator, question, dataset, printedAt }: Props) {
  const printed = printedAt ? stamp(printedAt.toISOString()) : '';
  const standIn = dataset?.kind === 'stand-in';
  return (
    <section className="print-sheet" aria-hidden="true">
      <header className="ps-head">
        <p className="ps-kicker">
          {standIn ? `Stand-in data: ${dataset?.title}, not Navy doctrine. ` : ''}Training use only. Not for operational use.
        </p>
        <h1>{procedure.title}</h1>
        <dl className="ps-facts">
          <div><dt>Procedure</dt><dd>{procedure.procedure_id}</dd></div>
          <div><dt>Version</dt><dd>{procedure.version.slice(0, 12)}</dd></div>
          <div><dt>Sheet</dt><dd>{sheet}</dd></div>
          <div><dt>Printed for</dt><dd>{operator}</dd></div>
          <div><dt>Printed</dt><dd>{printed}</dd></div>
          {question ? <div className="ps-wide"><dt>Reported</dt><dd>&ldquo;{question}&rdquo;</dd></div> : null}
          <div className="ps-wide"><dt>Source</dt><dd>{procedure.source}</dd></div>
        </dl>
        {/* On the first page, not after the last step, so the sign-off never takes a page of its own. */}
        <div className="ps-signoff">
          <span className="ps-field">Completed by</span>
          <span className="ps-field">Date</span>
          <span className="ps-field">Entered by</span>
        </div>
        <p className="ps-how">
          Work the steps in order. Do not start a step until every step it follows is done. For each step, tick Done,
          write the time and your initials, and write any reading or observation. Back at a console, choose
          Enter paper results and type sheet {sheet}.
        </p>
      </header>

      <table className="ps-table">
        <thead>
          <tr className="ps-running">
            <th colSpan={4}>
              {procedure.procedure_id} &middot; Sheet {sheet} &middot; {operator}
            </th>
          </tr>
          <tr>
            <th className="ps-no">Step</th>
            <th>Action</th>
            <th className="ps-read">Reading or observation</th>
            <th className="ps-sign">Done</th>
          </tr>
        </thead>
        {steps.map((step) => (
          <tbody key={step.step_id} className="ps-step">
            <tr>
              <td className="ps-no">{pad2(step.seq)}</td>
              <td>
                <p className="ps-text">{step.text}</p>
                {step.danger ? (
                  <p className="ps-danger">
                    <strong>Danger:</strong> {step.danger}
                  </p>
                ) : null}
                {step.requires.length ? <p className="ps-after">After step {step.requires.map(short).join(', ')}</p> : null}
              </td>
              <td className="ps-read">
                {step.record ? (
                  <>
                    <strong>{step.record.prompt} ({step.record.unit})</strong>
                    {step.record.limit ? <span className="ps-limit">{step.record.limit}{step.record.training_value ? ' · training value' : ''}</span> : null}
                    <span className="ps-blank" aria-hidden="true" />
                  </>
                ) : null}
              </td>
              <td className="ps-sign">
                {step.state === 'done' ? (
                  <span className="ps-prior">Done on screen{step.audit_seq ? `, audit #${step.audit_seq}` : ''}</span>
                ) : (
                  <>
                    <span className="ps-box" aria-hidden="true" /> Done
                    <span className="ps-field">Time</span>
                    <span className="ps-field">Initials</span>
                  </>
                )}
              </td>
            </tr>
            <tr className="ps-notes">
              <td />
              <td colSpan={3}>
                <span className="ps-field ps-field-wide">Notes</span>
              </td>
            </tr>
          </tbody>
        ))}
      </table>

    </section>
  );
}
