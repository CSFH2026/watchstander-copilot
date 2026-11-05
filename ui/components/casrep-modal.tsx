'use client';

import { useEffect, useState } from 'react';
import { BackendError, api, describeError, type Casrep, type CasrepChoices, type CasrepDraft, type CasrepSendResult } from '../lib/api';
import { Dialog } from './dialog';

interface Props {
  open: boolean;
  queryId: string;
  operator: string;
  onClose: () => void;
  /** Called after a send, so the page can redraw the log with the new signed entry. */
  onSent: () => void;
  onOpenEntry: (seq: number) => void;
}

const MISSION_AREAS = ['MOB', 'AAW', 'ASW', 'SUW', 'STW', 'AMW', 'MIW', 'C2W', 'CCC', 'INT', 'LOG', 'NCO', 'FSO'];
const ASSISTANCE: [Casrep['assistance'], string][] = [
  ['none', 'None'],
  ['tech_assist', 'Technical assistance'],
  ['parts', 'Parts'],
  ['both', 'Parts and technical assistance'],
];

/** The server's own words for a refusal, without the status and path the other panels show. */
function reason(err: unknown): string {
  return err instanceof BackendError && err.detail && err.status !== 404 ? err.detail : describeError(err);
}

/**
 * The CASREP this run would send, drafted on the laptop from the signed audit log. The Sailor sets what the
 * copilot cannot know, then sends it to the CASREP Board, or closes the panel and nothing leaves the laptop.
 * The page mounts it only while it is open, so each opening drafts afresh.
 */
export function CasrepModal({ open, queryId, operator, onClose, onSent, onOpenEntry }: Props) {
  const [draft, setDraft] = useState<CasrepDraft | null>(null);
  const [choices, setChoices] = useState<CasrepChoices | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<CasrepSendResult | null>(null);

  useEffect(() => {
    let live = true;
    api
      .casrepDraft(queryId)
      .then((d) => {
        if (!live) return;
        setDraft(d);
        const c = d.casrep;
        setChoices({ category: c.category, mission_areas: c.mission_areas, assistance: c.assistance, equipment: c.equipment, poc_name: c.poc_name });
      })
      .catch((err) => live && setError(reason(err)));
    return () => {
      live = false;
    };
  }, [queryId]);

  const edit = (patch: Partial<CasrepChoices>) => setChoices((c) => (c ? { ...c, ...patch } : c));
  const toggleArea = (area: string) =>
    edit({ mission_areas: choices?.mission_areas.includes(area) ? choices.mission_areas.filter((a) => a !== area) : [...(choices?.mission_areas ?? []), area] });

  async function send() {
    if (!choices) return;
    setSending(true);
    setError(null);
    try {
      setSent(await api.casrepSend(operator, queryId, choices));
      onSent();
    } catch (err) {
      setError(reason(err));
    } finally {
      setSending(false);
    }
  }

  function download() {
    if (!draft || !choices) return;
    const blob = new Blob([JSON.stringify({ ...draft.casrep, ...choices }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `casrep-${queryId}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const prior = sent ? { serial: sent.serial, link: sent.link, audit_seq: sent.audit.seq } : (draft?.sent ?? null);
  const board = draft?.board;
  const c = draft?.casrep;
  const canSend = !!board?.ready && !!choices?.mission_areas.length && !!choices.equipment?.trim() && !!choices.poc_name?.trim() && !sending;

  return (
    <Dialog open={open} onClose={onClose} labelledBy="casrep-title" className="modal casrep-modal">
      <div className="dialog-head">
        <h2 id="casrep-title">Draft CASREP</h2>
        <span className="muted">from run {queryId}</span>
        <button type="button" className="dialog-close" onClick={onClose} aria-label="Close">
          Close
        </button>
      </div>

      {error ? (
        <p className="error-banner casrep-error" role="alert">
          {error}
        </p>
      ) : null}
      {!draft && !error ? <p className="muted casrep-body">Drafting from the audit log</p> : null}

      {prior ? (
        <div className="casrep-body">
          <p className="check check-ok" role="status">
            {sent ? 'Sent. ' : 'This run was already sent. '}CASREP {prior.serial} is on the board at the Originator step.
          </p>
          <p>
            <a href={prior.link} target="casrep-board">
              Open {prior.serial} on the CASREP Board
            </a>{' '}
            <button type="button" className="link-btn" onClick={() => onOpenEntry(prior.audit_seq)}>
              audit #{prior.audit_seq}
            </button>
          </p>
          <p className="muted">On the board the Originator submits it up the chain, or saves a CASCAN to dismiss it.</p>
        </div>
      ) : null}

      {c && choices && !prior ? (
        <form
          className="casrep-body"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <dl className="entry-facts casrep-facts">
            <div>
              <dt>Serial</dt>
              <dd>{c.serial}</dd>
            </div>
            <div>
              <dt>Report</dt>
              <dd>{c.report_type}</dd>
            </div>
            <div>
              <dt>Unit</dt>
              <dd>
                {c.unit} ({c.uic})
              </dd>
            </div>
            <div>
              <dt>DTG</dt>
              <dd>{c.dtg}</dd>
            </div>
          </dl>

          <div className="casrep-fields">
            <label>
              <span className="label">Category</span>
              <select value={choices.category} disabled={sending} onChange={(e) => edit({ category: Number(e.target.value) as Casrep['category'] })}>
                <option value={2}>CAT 2</option>
                <option value={3}>CAT 3</option>
                <option value={4}>CAT 4</option>
              </select>
            </label>
            <label>
              <span className="label">Assistance</span>
              <select value={choices.assistance} disabled={sending} onChange={(e) => edit({ assistance: e.target.value as Casrep['assistance'] })}>
                {ASSISTANCE.map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
            <label className="casrep-wide">
              <span className="label">Equipment</span>
              <input value={choices.equipment} maxLength={120} disabled={sending} onChange={(e) => edit({ equipment: e.target.value })} />
            </label>
            <label>
              <span className="label">Point of contact</span>
              <input value={choices.poc_name} maxLength={80} disabled={sending} onChange={(e) => edit({ poc_name: e.target.value })} />
            </label>
            <fieldset className="casrep-wide casrep-areas">
              <legend className="label">Mission areas</legend>
              {MISSION_AREAS.map((area) => (
                <label key={area}>
                  <input type="checkbox" checked={choices.mission_areas.includes(area)} disabled={sending} onChange={() => toggleArea(area)} />
                  {area}
                </label>
              ))}
            </fieldset>
          </div>

          <span className="label">Description</span>
          <pre className="casrep-text">{c.description}</pre>
          <span className="label">Remarks</span>
          <pre className="casrep-text">{c.remarks}</pre>
          <p className="muted">Parts, EIC, and ETR are added later in an UPDATE on the board.</p>

          <div className="paper-actions casrep-actions">
            <span className="muted casrep-board">
              {board?.ready ? `Sends to ${board.url} as ${operator}.` : 'The board key is not set on this laptop, so this draft can only be saved. See docs/CASREP.md.'}
            </span>
            <button type="button" onClick={download} disabled={sending}>
              Save JSON
            </button>
            <button type="submit" className="primary" disabled={!canSend}>
              {sending ? 'Sending' : 'Send to CASREP Board'}
            </button>
          </div>
        </form>
      ) : null}
    </Dialog>
  );
}
