'use client';

import { useEffect, useState } from 'react';
import { describeError, api, type KnownCasualty, type KnownDetail, type KnownList } from '../lib/api';
import { Dialog } from './dialog';

const STEPS = ['Originator', 'DIVO', 'DH', 'CHENG', 'XO', 'CO', 'Released'];

/** "3 min ago", from the cache's as-of time. */
export function age(asOf: string | null): string {
  if (!asOf) return 'never';
  const s = Math.max(0, Math.round((Date.now() - new Date(asOf).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

function when(ts: string | null): string {
  if (!ts) return '';
  const d = new Date(ts.includes('T') ? ts : `${ts.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** The data's age in one line, and why it may be out of date. */
export function Freshness({ list }: { list: Pick<KnownList, 'as_of' | 'stale' | 'error' | 'read'> }) {
  if (!list.read && !list.as_of) return <p className="muted known-fresh">No CASREP Board read key is set on this laptop. See docs/CASREP.md.</p>;
  return (
    <p className={list.stale ? 'known-fresh is-stale' : 'muted known-fresh'} role={list.stale ? 'status' : undefined}>
      {list.as_of ? `Board data as of ${when(list.as_of)} (${age(list.as_of)})` : 'No board data yet'}
      {list.stale ? `. Stale${list.error ? `: ${list.error}` : ''}.` : '.'}
    </p>
  );
}

/**
 * Context for the watch, never a stop sign: a CASREP is a readiness report, not a live casualty response,
 * so the banner always sends the Sailor through the immediate actions first.
 */
export function KnownBanner({ casualties, stale, onOpen }: { casualties: KnownCasualty[]; stale: boolean; onOpen: (id: string) => void }) {
  if (!casualties.length) return null;
  return (
    <section className="known-banner" aria-label="Known casualties">
      {casualties.slice(0, 3).map((c) => (
        <p key={c.id}>
          <strong>Known casualty:</strong> CASREP {c.serial} is open on {c.equipment} (CAT {c.category}, {c.step_phrase}). Do the immediate
          actions, then check whether this matches it.{' '}
          <button type="button" className="link-btn" onClick={() => onOpen(c.id)}>
            Open {c.serial}
          </button>
          {stale ? <span className="muted"> Board data may be out of date.</span> : null}
        </p>
      ))}
      {casualties.length > 3 ? <p className="muted">{casualties.length - 3} more in Known casualties.</p> : null}
    </section>
  );
}

function Row({ c, onOpen }: { c: KnownCasualty; onOpen: (id: string) => void }) {
  return (
    <li className={`known-row cat-${c.category}`}>
      <button type="button" className="known-row-btn" onClick={() => onOpen(c.id)}>
        <span className="known-line">
          <span className="known-serial">{c.serial}</span>
          <span className={`known-cat cat-${c.category}`}>CAT {c.category}</span>
          <span>{c.report_type}</span>
          <span className="known-step">{c.closed_by ?? STEPS[Math.min(c.step, STEPS.length - 1)]}</span>
        </span>
        <span className="known-equipment">{c.equipment}</span>
        <span className="muted known-meta">
          ETR {c.etr ?? 'none'} · {c.parts.length ? `${c.parts.length} part${c.parts.length === 1 ? '' : 's'}` : 'no parts'} · updated {when(c.last_update)}
        </span>
      </button>
    </li>
  );
}

interface Props {
  open: boolean;
  list: KnownList | null;
  error: string | null;
  refreshing: boolean;
  /** Opens straight to one CASREP, as the banner's link does. */
  selected: string | null;
  onSelect: (id: string | null) => void;
  onRefresh: () => void;
  onClose: () => void;
}

/** This ship's CASREPs from the board, read only, with each one's detail and history. */
export function KnownDrawer({ open, list, error, refreshing, selected, onSelect, onRefresh, onClose }: Props) {
  const [detail, setDetail] = useState<KnownDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected) return;
    let live = true;
    api
      .knownDetail(selected)
      .then((d) => live && (setDetail(d), setDetailError(null)))
      .catch((err) => live && (setDetail(null), setDetailError(describeError(err))));
    return () => {
      live = false;
    };
  }, [selected]);

  const openOnes = list?.casreps.filter((c) => c.status === 'open') ?? [];
  const closed = list?.casreps.filter((c) => c.status !== 'open') ?? [];
  const shown = selected && detail?.casrep.id === selected ? detail : null;

  return (
    <Dialog open={open} onClose={onClose} labelledBy="known-title" className="drawer known-drawer">
      <div className="dialog-head">
        <h2 id="known-title">{shown ? `CASREP ${shown.casrep.serial}` : 'Known casualties'}</h2>
        <span className="muted">Read only</span>
        <button type="button" className="dialog-close" onClick={onClose} aria-label="Close">
          Close
        </button>
      </div>

      {list ? <Freshness list={list} /> : null}
      {error ? (
        <p className="error-banner known-error" role="alert">
          {error}
        </p>
      ) : null}

      {selected ? (
        <div className="known-detail">
          <div className="known-actions">
            <button type="button" onClick={() => onSelect(null)}>
              All CASREPs
            </button>
            {shown ? (
              <a className="button-link" href={shown.casrep.link} target="casrep-board">
                Open on the CASREP Board
              </a>
            ) : null}
          </div>
          {detailError ? <p className="error-banner known-error">{detailError}</p> : null}
          {shown ? (
            <>
              <dl className="entry-facts known-facts">
                <div>
                  <dt>Equipment</dt>
                  <dd>{shown.casrep.equipment}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{shown.casrep.closed_by ? `Closed by ${shown.casrep.closed_by}` : `Open, ${shown.casrep.step_phrase}`}</dd>
                </div>
                <div>
                  <dt>Category and type</dt>
                  <dd>
                    CAT {shown.casrep.category}, {shown.casrep.report_type} (version {shown.casrep.version_no})
                  </dd>
                </div>
                <div>
                  <dt>DTG and ETR</dt>
                  <dd>
                    {shown.casrep.dtg}, ETR {shown.casrep.etr ?? 'none'}
                  </dd>
                </div>
                <div className="entry-wide">
                  <dt>Parts</dt>
                  <dd>
                    {shown.casrep.parts.length
                      ? shown.casrep.parts.map((p) => `${p.qty} x ${p.nomenclature} (NSN ${p.nsn})`).join('; ')
                      : 'None on order'}
                  </dd>
                </div>
              </dl>
              <span className="label known-label">Description</span>
              <pre className="casrep-text known-text">{shown.versions[shown.versions.length - 1]?.description}</pre>
              <span className="label known-label">History</span>
              <ol className="known-history">
                {shown.versions.map((v) => (
                  <li key={`v${v.version_no}`}>
                    <strong>
                      v{v.version_no} {v.report_type}
                    </strong>{' '}
                    {v.change_summary} <span className="muted">by {v.actor_name} ({v.actor_role}), {when(v.created_at)}</span>
                  </li>
                ))}
                {shown.events.map((e) => (
                  <li key={`e${e.id}`}>
                    {e.action} at {e.step_name}
                    {e.comment ? `: ${e.comment}` : ''}{' '}
                    <span className="muted">
                      by {e.actor_name} ({e.actor_role}), {when(e.created_at)}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : !detailError ? (
            <p className="muted known-fresh">Loading</p>
          ) : null}
        </div>
      ) : (
        <>
          <div className="known-actions">
            <button type="button" onClick={onRefresh} disabled={refreshing}>
              {refreshing ? 'Refreshing' : 'Refresh from board'}
            </button>
            {list?.board.site ? (
              <a className="button-link" href={list.board.site} target="casrep-board">
                CASREP Dashboard
              </a>
            ) : null}
          </div>
          <span className="label known-label">Open ({openOnes.length})</span>
          {openOnes.length ? (
            <ol className="known-list">
              {openOnes.map((c) => (
                <Row key={c.id} c={c} onOpen={onSelect} />
              ))}
            </ol>
          ) : (
            <p className="muted known-fresh">No open CASREPs for this ship.</p>
          )}
          {closed.length ? (
            <>
              <span className="label known-label">Recently closed ({closed.length})</span>
              <ol className="known-list">
                {closed.map((c) => (
                  <Row key={c.id} c={c} onOpen={onSelect} />
                ))}
              </ol>
            </>
          ) : null}
        </>
      )}
    </Dialog>
  );
}
