'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionBanner } from '../components/action-banner';
import { ProcedurePanel } from '../components/procedure-panel';
import { SiteHeader } from '../components/site-header';
import { StepList } from '../components/step-list';
import { ExampleChips, SymptomInput } from '../components/symptom-input';
import { TrustPanel } from '../components/trust-panel';
import { api, describeError, type ActionResult, type AuditEntry, type Health, type QueryResult, type Step, type VerifyResult } from '../lib/api';

const DEFAULT_OPERATOR = 'EOOW-01';
const AUDIT_ROWS = 10;

/** Resolves after the browser has painted the frame that holds the latest render. */
function afterPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

export default function Home() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [operator, setOperator] = useState(DEFAULT_OPERATOR);

  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [clientMs, setClientMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [pendingStep, setPendingStep] = useState<string | null>(null);
  const [action, setAction] = useState<{ result: ActionResult; seq: number | null } | null>(null);

  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Guards against an older query landing after a newer one.
  const queryToken = useRef(0);

  const loadAudit = useCallback(async () => {
    try {
      const { entries } = await api.audit(AUDIT_ROWS);
      setAudit(entries.slice(0, AUDIT_ROWS));
      setAuditError(null);
      // A verdict on an older chain would mislead once new entries land.
      setVerify(null);
    } catch (err) {
      setAuditError(describeError(err));
    }
  }, []);

  useEffect(() => {
    api
      .health()
      .then((h) => {
        setHealth(h);
        setHealthError(false);
        const ids = h.operator_ids ?? [];
        setOperator((current) => (ids.length && !ids.includes(current) ? ids[0] : current));
      })
      .catch((err) => {
        setHealthError(true);
        setError(describeError(err));
      });
    api
      .audit(AUDIT_ROWS)
      .then(({ entries }) => setAudit(entries.slice(0, AUDIT_ROWS)))
      .catch((err) => setAuditError(describeError(err)));
  }, []);

  async function ask(query: string, asOperator: string = operator) {
    const token = ++queryToken.current;
    const started = performance.now();
    setBusy(true);
    setError(null);
    setAction(null);
    try {
      const res = await api.query(asOperator, query);
      if (token !== queryToken.current) return;
      setResult(res);
      setSteps(res.steps ?? []);
      setLastQuery(query);
      setClientMs(null);
      await afterPaint();
      if (token === queryToken.current) setClientMs(performance.now() - started);
    } catch (err) {
      if (token === queryToken.current) setError(describeError(err));
    } finally {
      if (token === queryToken.current) setBusy(false);
      void loadAudit();
    }
  }

  async function acknowledge(step: Step) {
    if (!result?.procedure) return;
    setPendingStep(step.step_id);
    setError(null);
    try {
      const res = await api.action(operator, result.procedure.procedure_id, step.step_id);
      setSteps(res.steps ?? steps);
      setAction({ result: res, seq: step.seq });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPendingStep(null);
      void loadAudit();
    }
  }

  async function runVerify() {
    setVerifying(true);
    try {
      setVerify(await api.verify());
      setAuditError(null);
    } catch (err) {
      setVerify(null);
      setAuditError(describeError(err));
    } finally {
      setVerifying(false);
    }
  }

  async function resetDrill() {
    setResetting(true);
    try {
      await api.reset(operator);
      queryToken.current += 1;
      setResult(null);
      setSteps([]);
      setText('');
      setLastQuery(null);
      setAction(null);
      setClientMs(null);
      setError(null);
      setBusy(false);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setResetting(false);
      void loadAudit();
    }
  }

  function switchOperator(id: string) {
    setOperator(id);
    setAction(null);
    // Step state is per operator on the server, so redraw it for whoever is on watch now.
    if (lastQuery) void ask(lastQuery, id);
  }

  function askAlternate(title: string) {
    setText(title);
    void ask(title);
  }

  const operators = health?.operator_ids?.length ? health.operator_ids : [DEFAULT_OPERATOR];

  return (
    <>
      <SiteHeader health={health} healthError={healthError} operator={operator} operators={operators} onOperator={switchOperator} />
      <main className="page">
        <div className="layout">
          <div className="main-col">
            <SymptomInput value={text} busy={busy} onChange={setText} onAsk={(q) => void ask(q)} />

            {error ? (
              <div className="error-banner" role="alert">
                <strong>Cannot complete the request.</strong> {error}
              </div>
            ) : null}

            {busy && !result ? <p className="muted loading">Searching procedures</p> : null}

            {!result && !busy ? (
              <section className="empty">
                <p className="empty-lead">Type the symptom the way you would report it: the indication and the equipment.</p>
                <p className="muted">The matching casualty control procedure appears here. Acknowledge each step in order; every action is signed and logged.</p>
              </section>
            ) : null}

            {result && !result.procedure ? (
              <section className="empty">
                <p className="empty-lead">{result.notice ?? 'No authorized procedure matches this description.'}</p>
                <p className="muted">
                  Nothing was guessed for &ldquo;{lastQuery}&rdquo;. Name the indication and the equipment, or start from an example.
                </p>
                <ExampleChips busy={busy} onPick={(q) => { setText(q); void ask(q); }} />
              </section>
            ) : null}

            {result?.procedure ? (
              <div className={busy ? 'result is-busy' : 'result'} aria-busy={busy}>
                <ProcedurePanel
                  procedure={result.procedure}
                  alternates={result.alternates ?? []}
                  confidence={result.confidence ?? 'clear'}
                  notice={result.notice ?? null}
                  keywords={result.matched?.keyword ?? []}
                  latencyMs={result.latency_ms}
                  clientMs={clientMs}
                  busy={busy}
                  onAlternate={askAlternate}
                />
                <StepList steps={steps} pendingStep={pendingStep} onAcknowledge={(s) => void acknowledge(s)} />
                {action ? <ActionBanner result={action.result} seq={action.seq} onDismiss={() => setAction(null)} /> : null}
              </div>
            ) : null}
          </div>

          <TrustPanel
            entries={audit}
            error={auditError}
            verify={verify}
            verifying={verifying}
            resetting={resetting}
            operator={operator}
            onVerify={() => void runVerify()}
            onReset={() => void resetDrill()}
          />
        </div>
      </main>
    </>
  );
}
