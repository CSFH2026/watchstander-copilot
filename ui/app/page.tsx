'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionBanner } from '../components/action-banner';
import { ProcedurePanel } from '../components/procedure-panel';
import { SiteHeader } from '../components/site-header';
import { StepList } from '../components/step-list';
import { EXAMPLES, ExampleChips, SymptomInput } from '../components/symptom-input';
import { AuditDrawer } from '../components/audit-drawer';
import { EntryModal } from '../components/entry-modal';
import { TrustStrip } from '../components/trust-strip';
import { api, describeError, type ActionResult, type AuditEntry, type Health, type QueryResult, type Step, type VerifyResult } from '../lib/api';

const DEFAULT_OPERATOR = 'EOOW-01';
// The drawer shows the whole recent log; the API caps a page at 200.
const AUDIT_ROWS = 200;

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
  const [logOpen, setLogOpen] = useState(false);
  const [entrySeq, setEntrySeq] = useState<number | null>(null);

  // Guards against an older query landing after a newer one.
  const queryToken = useRef(0);
  // Lock immediately, before React renders disabled controls.
  const requestInFlight = useRef(false);

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
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    const token = ++queryToken.current;
    const started = performance.now();
    setBusy(true);
    setError(null);
    setResult(null);
    setSteps([]);
    setLastQuery(null);
    setClientMs(null);
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
      requestInFlight.current = false;
      if (token === queryToken.current) setBusy(false);
      void loadAudit();
    }
  }

  async function acknowledge(step: Step) {
    if (requestInFlight.current || !result?.procedure) return;
    requestInFlight.current = true;
    const token = queryToken.current;
    setPendingStep(step.step_id);
    setError(null);
    setAction(null);
    try {
      const res = await api.action(operator, result.procedure.procedure_id, step.step_id);
      if (token !== queryToken.current) return;
      setSteps(res.steps ?? steps);
      setAction({ result: res, seq: step.seq });
    } catch (err) {
      if (token === queryToken.current) setError(describeError(err));
    } finally {
      requestInFlight.current = false;
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
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    queryToken.current += 1;
    setResetting(true);
    try {
      await api.reset(operator);
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
      requestInFlight.current = false;
      setResetting(false);
      void loadAudit();
    }
  }

  function switchOperator(id: string) {
    if (requestInFlight.current) return;
    queryToken.current += 1;
    setOperator(id);
    setAction(null);
    // Step state is per operator on the server, so redraw it for whoever is on watch now.
    if (lastQuery) void ask(lastQuery, id);
  }

  function askAlternate(title: string) {
    if (requestInFlight.current) return;
    setText(title);
    void ask(title);
  }

  const operators = health?.operator_ids?.length ? health.operator_ids : [DEFAULT_OPERATOR];
  const controlsLocked = busy || pendingStep !== null || resetting;
  const examples = health?.dataset?.examples?.length ? health.dataset.examples : EXAMPLES;

  return (
    <>
      <SiteHeader health={health} healthError={healthError} operator={operator} operators={operators} disabled={controlsLocked} onOperator={switchOperator} />
      <main className="page">
        <div className="layout">
          <TrustStrip
            latest={audit[0] ?? null}
            error={auditError}
            verify={verify}
            verifying={verifying}
            onVerify={() => void runVerify()}
            onOpenLog={() => setLogOpen(true)}
            onOpenEntry={setEntrySeq}
          />
          <div className="main-col">
            <SymptomInput value={text} busy={busy} disabled={controlsLocked} examples={examples} onChange={setText} onAsk={(q) => void ask(q)} />

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
                <ExampleChips busy={controlsLocked} examples={examples} onPick={(q) => { setText(q); void ask(q); }} />
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
                  busy={controlsLocked}
                  onAlternate={askAlternate}
                />
                <StepList steps={steps} pendingStep={pendingStep} disabled={controlsLocked} onAcknowledge={(s) => void acknowledge(s)} onOpenEntry={setEntrySeq} />
                {action ? (
                  <ActionBanner result={action.result} seq={action.seq} onDismiss={() => setAction(null)} onOpenEntry={setEntrySeq} />
                ) : null}
              </div>
            ) : null}
          </div>

        </div>
      </main>

      <AuditDrawer
        open={logOpen}
        entries={audit}
        verify={verify}
        verifying={verifying}
        resetting={resetting}
        resetDisabled={controlsLocked}
        operator={operator}
        onClose={() => setLogOpen(false)}
        onOpenEntry={setEntrySeq}
        onVerify={() => void runVerify()}
        onReset={() => void resetDrill()}
      />
      <EntryModal seq={entrySeq} row={audit.find((e) => e.seq === entrySeq)} onClose={() => setEntrySeq(null)} />
    </>
  );
}
