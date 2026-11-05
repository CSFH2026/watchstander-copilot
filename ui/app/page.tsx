'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionBanner } from '../components/action-banner';
import { ProcedurePanel } from '../components/procedure-panel';
import { SiteHeader } from '../components/site-header';
import { StepList } from '../components/step-list';
import { SymptomInput } from '../components/symptom-input';
import { CandidateList } from '../components/candidate-list';
import { AuditDrawer } from '../components/audit-drawer';
import { EntryModal } from '../components/entry-modal';
import { TrustStrip } from '../components/trust-strip';
import { PaperEntry, type PaperOutcome, type PaperRow } from '../components/paper-entry';
import { PrintSheet } from '../components/print-sheet';
import { CasrepModal } from '../components/casrep-modal';
import { KnownBanner, KnownDrawer } from '../components/known-casualties';
import { api, describeError, type ActionResult, type AuditEntry, type Health, type KnownList, type QueryResult, type Step, type VerifyResult } from '../lib/api';

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
  // The candidate the watch opened instead of the top match, kept so an operator switch reopens it.
  const [picked, setPicked] = useState<string | null>(null);
  // The example chips show until the first question, and again only after Clear or a drill reset.
  const [asked, setAsked] = useState(false);
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
  const [printedAt, setPrintedAt] = useState<Date | null>(null);
  const [paperOpen, setPaperOpen] = useState(false);
  const [casrepOpen, setCasrepOpen] = useState(false);
  const [known, setKnown] = useState<KnownList | null>(null);
  const [knownError, setKnownError] = useState<string | null>(null);
  const [knownOpen, setKnownOpen] = useState(false);
  const [knownSelected, setKnownSelected] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  // Reads the backend's cache only, so it is quick and works with the board unreachable.
  const loadKnown = useCallback(async () => {
    try {
      setKnown(await api.known());
      setKnownError(null);
    } catch (err) {
      setKnownError(describeError(err));
    }
  }, []);

  // The cache is refreshed in the background on the server; this redraws its age and contents each minute.
  useEffect(() => {
    if (!health?.casrep) return;
    const first = setTimeout(() => void loadKnown(), 0);
    const timer = setInterval(() => void loadKnown(), 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [health, loadKnown]);

  async function refreshKnown() {
    setRefreshing(true);
    try {
      setKnown(await api.knownRefresh());
      setKnownError(null);
    } catch (err) {
      setKnownError(describeError(err));
    } finally {
      setRefreshing(false);
    }
  }

  function openKnown(id: string | null) {
    setKnownSelected(id);
    setKnownOpen(true);
  }

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

  async function ask(query: string, asOperator: string = operator, pick?: string) {
    const token = ++queryToken.current;
    const started = performance.now();
    setAsked(true);
    setBusy(true);
    setError(null);
    setAction(null);
    try {
      const res = await api.query(asOperator, query, pick);
      if (token !== queryToken.current) return;
      setResult(res);
      setSteps(res.steps ?? []);
      setLastQuery(query);
      setPicked(pick ?? null);
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

  async function printChecklist() {
    setPrintedAt(new Date());
    // The sheet carries the print time, so let it render before the print dialog freezes the page.
    await afterPaint();
    window.print();
  }

  /** Paper steps go in step order, one signed action each, so the policy engine sees them as they were done. */
  async function enterPaper(sheet: string, rows: PaperRow[]): Promise<PaperOutcome[]> {
    if (!result?.procedure) return [];
    const procedureId = result.procedure.procedure_id;
    const out: PaperOutcome[] = [];
    try {
      for (const { step, reading, done_at, note } of [...rows].sort((a, b) => a.step.seq - b.step.seq)) {
        const res = await api.action(operator, procedureId, step.step_id, { source: 'paper', sheet, reading, done_at, note });
        out.push({ step, allowed: res.allowed, reason: res.reason, audit_seq: res.audit?.seq ?? null });
        setSteps(res.steps ?? steps);
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      void loadAudit();
    }
    return out;
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
      setPicked(null);
      setAsked(false);
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
    if (lastQuery) void ask(lastQuery, id, picked ?? undefined);
  }

  /** Opens another candidate of the same question. The server searches again and logs the pick as a query. */
  function pickCandidate(procedureId: string) {
    if (!lastQuery) return;
    setText(lastQuery);
    void ask(lastQuery, operator, procedureId);
  }

  /** Clears the screen only. Acknowledged steps stay; Reset drill in the log clears those. */
  function clearScreen() {
    queryToken.current += 1;
    setResult(null);
    setSteps([]);
    setText('');
    setLastQuery(null);
    setPicked(null);
    setAsked(false);
    setAction(null);
    setClientMs(null);
    setError(null);
    setBusy(false);
  }

  const operators = health?.operator_ids?.length ? health.operator_ids : [DEFAULT_OPERATOR];
  // No chips until the health check names the served dataset, so a chip never asks a question it refuses.
  const examples = health?.dataset?.examples ?? [];
  const candidates = result?.candidates ?? [];
  const openCandidate = candidates.find((c) => c.procedure_id === result?.procedure?.procedure_id);
  // The denominator for "9 of 10 words": the question's words that the corpus holds at all.
  const words = result?.matched?.keyword.length ?? 0;

  return (
    <>
      <SiteHeader
        health={health}
        healthError={healthError}
        operator={operator}
        operators={operators}
        onOperator={switchOperator}
        knownCount={health?.casrep ? (known?.casreps.filter((c) => c.status === 'open').length ?? 0) : null}
        onKnown={() => openKnown(null)}
      />
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
            <SymptomInput
              value={text}
              busy={busy}
              examples={asked ? [] : examples}
              onChange={setText}
              onAsk={(q) => void ask(q)}
              onClear={asked ? clearScreen : undefined}
            />

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
                  Nothing was guessed for &ldquo;{lastQuery}&rdquo;. Name the indication and the equipment, or press Clear to see the examples.
                </p>
              </section>
            ) : null}

            {result?.procedure ? (
              <div className={busy ? 'result is-busy' : 'result'} aria-busy={busy}>
                <KnownBanner casualties={result.known_casualties ?? []} stale={known?.stale ?? false} onOpen={openKnown} />
                <ProcedurePanel
                  procedure={result.procedure}
                  candidates={candidates}
                  words={words}
                  confidence={result.confidence ?? 'clear'}
                  notice={result.notice ?? null}
                  keywords={openCandidate?.keyword ?? result.matched?.keyword ?? []}
                  latencyMs={result.latency_ms}
                  clientMs={clientMs}
                  busy={busy}
                  onPick={pickCandidate}
                />
                <StepList
                  steps={steps}
                  pendingStep={pendingStep}
                  onAcknowledge={(s) => void acknowledge(s)}
                  onOpenEntry={setEntrySeq}
                  onPrint={() => void printChecklist()}
                  onPaper={() => setPaperOpen(true)}
                  onCasrep={health?.casrep && health.casrep.drafts !== false ? () => setCasrepOpen(true) : undefined}
                />
                {action ? (
                  <ActionBanner result={action.result} seq={action.seq} onDismiss={() => setAction(null)} onOpenEntry={setEntrySeq} />
                ) : null}
                <CandidateList
                  candidates={candidates}
                  openId={result.procedure.procedure_id}
                  words={words}
                  busy={busy}
                  onPick={pickCandidate}
                />
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
        operator={operator}
        onClose={() => setLogOpen(false)}
        onOpenEntry={setEntrySeq}
        onVerify={() => void runVerify()}
        onReset={() => void resetDrill()}
      />
      {result?.procedure ? (
        <>
          <PrintSheet
            procedure={result.procedure}
            steps={steps}
            sheet={result.query_id}
            operator={operator}
            question={lastQuery}
            dataset={health?.dataset}
            printedAt={printedAt}
          />
          {/* Keyed by sheet, so a new query starts the form empty with its own sheet id. */}
          <PaperEntry
            key={result.query_id}
            open={paperOpen}
            procedureId={result.procedure.procedure_id}
            steps={steps}
            sheet={result.query_id}
            operator={operator}
            onClose={() => setPaperOpen(false)}
            onSubmit={enterPaper}
            onOpenEntry={setEntrySeq}
          />
          {/* Mounted only while open, so each opening drafts afresh from the log. */}
          {casrepOpen ? (
            <CasrepModal
              open
              queryId={result.query_id}
              operator={operator}
              onClose={() => setCasrepOpen(false)}
              onSent={() => void loadAudit()}
              onOpenEntry={setEntrySeq}
            />
          ) : null}
        </>
      ) : null}
      <KnownDrawer
        open={knownOpen}
        list={known}
        error={knownError}
        refreshing={refreshing}
        selected={knownSelected}
        onSelect={setKnownSelected}
        onRefresh={() => void refreshKnown()}
        onClose={() => setKnownOpen(false)}
      />
      <EntryModal seq={entrySeq} row={audit.find((e) => e.seq === entrySeq)} onClose={() => setEntrySeq(null)} />
    </>
  );
}
