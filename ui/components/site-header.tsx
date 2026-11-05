'use client';

import type { Health } from '../lib/api';
import { RedLightToggle, ThemeToggle } from './theme-toggle';

interface Props {
  health: Health | null;
  healthError: boolean;
  operator: string;
  operators: string[];
  onOperator: (id: string) => void;
  /** Open CASREPs in the local cache; null hides the button, as on a backend without the CASREP routes. */
  knownCount: number | null;
  onKnown: () => void;
}

// Older backends send no models field, so the tooltip falls back to the single model name.
function modelList(health: Health): string {
  if (!health.models) return health.model;
  return Object.entries(health.models)
    .map(([slot, value]) => `${slot} ${value}`)
    .join(', ');
}

/**
 * The CASREP Board's dashboard with this copilot's address, so the board can link back here. A named
 * window, so repeat clicks reuse one board tab and the watch screen keeps its place.
 */
function boardLink(site: string): string {
  return `${site}/?copilot=${encodeURIComponent(window.location.origin)}`;
}

/** Product name, link status, the CASREP Board, who is on watch, and the display toggles. */
export function SiteHeader({ health, healthError, operator, operators, onOperator, knownCount, onKnown }: Props) {
  let badge = <span className="badge badge-neutral">Checking</span>;
  if (process.env.NEXT_PUBLIC_MOCK === '1') badge = <span className="badge badge-warn">Sample data</span>;
  else if (healthError) badge = <span className="badge badge-critical">No backend</span>;
  else if (health) {
    badge = health.offline ? (
      <span className="badge badge-ok" title={`${health.procedures} procedures, ${health.steps} steps. Models: ${modelList(health)}`}>
        <span className="badge-dot" aria-hidden="true" />
        Offline
      </span>
    ) : (
      <span className="badge badge-warn" title={`Not offline. Models: ${modelList(health)}`}>
        {health.target === 'cloudflare' ? 'Cloud test' : 'Online'}
      </span>
    );
  }

  return (
    <header className="header">
      <div className="brand-wrap">
        <span className="brand">Watchstander Copilot</span>
        {badge}
      </div>
      <div className="header-actions">
        {health?.casrep?.site ? (
          // The two apps as one switch, so the tie-in reads the same in both headers.
          <nav className="app-switch" aria-label="Apps">
            <span aria-current="page">Copilot</span>
            <a href={boardLink(health.casrep.site)} target="casrep-board">
              CASREP Board <span aria-hidden="true">&#8599;</span>
            </a>
          </nav>
        ) : null}
        {knownCount !== null ? (
          <button type="button" className="hdr-btn" onClick={onKnown}>
            Known casualties <span className="known-count">{knownCount}</span>
          </button>
        ) : null}
        <label className="operator">
          <span>Operator</span>
          <select value={operator} onChange={(e) => onOperator(e.target.value)}>
            {operators.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <ThemeToggle />
        <RedLightToggle />
      </div>
    </header>
  );
}
