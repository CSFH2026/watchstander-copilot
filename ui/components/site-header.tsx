'use client';

import type { Health } from '../lib/api';
import { BoardIcon, WatchIcon } from './icons';
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

type Backend = 'checking' | 'mock' | 'down' | 'offline' | 'cloud' | 'online';

function backend(health: Health | null, healthError: boolean): Backend {
  if (process.env.NEXT_PUBLIC_MOCK === '1') return 'mock';
  if (healthError) return 'down';
  if (!health) return 'checking';
  return health.offline ? 'offline' : health.target === 'cloudflare' ? 'cloud' : 'online';
}

/**
 * The product switch on the left, then who is on watch, then the display toggles on the far right,
 * in the same places as the CASREP Board's header. The top banner already says offline or cloud,
 * so the header shows a status chip only when the backend is down.
 */
export function SiteHeader({ health, healthError, operator, operators, onOperator, knownCount, onKnown }: Props) {
  const state = backend(health, healthError);
  const detail = health ? `${health.procedures} procedures, ${health.steps} steps. Models: ${modelList(health)}` : undefined;

  return (
    <header className="header" data-backend={state}>
      <div className="header-main">
        <nav className="app-switch" aria-label="Apps">
          <span aria-current="page" title={detail}>
            <WatchIcon />
            Watchstander
          </span>
          {health?.casrep?.site ? (
            <a href={boardLink(health.casrep.site)} target="casrep-board" title="Opens the CASREP Board in its own tab">
              <BoardIcon />
              CASREP Board
            </a>
          ) : null}
        </nav>
        {state === 'down' ? <span className="badge badge-critical">No backend</span> : null}
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
      </div>
      <div className="header-display">
        <ThemeToggle />
        <RedLightToggle />
      </div>
    </header>
  );
}
