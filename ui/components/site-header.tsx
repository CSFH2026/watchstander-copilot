'use client';

import type { Health } from '../lib/api';
import { RedLightToggle, ThemeToggle } from './theme-toggle';

interface Props {
  health: Health | null;
  healthError: boolean;
  operator: string;
  operators: string[];
  onOperator: (id: string) => void;
}

/** Product name, link status, who is on watch, and the display toggles. */
export function SiteHeader({ health, healthError, operator, operators, onOperator }: Props) {
  let badge = <span className="badge badge-neutral">Checking</span>;
  if (healthError) badge = <span className="badge badge-critical">No backend</span>;
  else if (health) {
    badge = health.offline ? (
      <span className="badge badge-ok" title={`${health.procedures} procedures, ${health.steps} steps, model ${health.model}`}>
        <span className="badge-dot" aria-hidden="true" />
        Offline
      </span>
    ) : (
      <span className="badge badge-warn" title="The backend reports a network connection">
        Online
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
