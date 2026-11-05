'use client';

import { useEffect, useState } from 'react';
import { api, type Health } from '../lib/api';

/** A short bold tag, then one sentence-case line, so the strip fits one line on a laptop and two on a phone. */
type Line = { tag: string; text: string };

const MOCK: Line = { tag: 'Sample data preview', text: 'No backend. Answers are canned and nothing is signed.' };
const OFFLINE: Line = { tag: 'Training only', text: 'Public, unclassified, and synthetic doctrine. Not for operational use.' };
const CLOUD: Line = { tag: 'Cloud test build', text: 'Training only. Not offline and not for operational use.' };
const ONLINE: Line = { tag: 'Training only', text: 'Uses a cloud model, so not offline. Not for operational use.' };

function line(health: Health | null): Line {
  const offline = !health || health.offline;
  const base = offline ? OFFLINE : health.target === 'cloudflare' ? CLOUD : ONLINE;
  const d = health?.dataset;
  if (d?.kind !== 'stand-in') return base;
  // Stand-in data must never read as doctrine, so its name and license lead the banner.
  const lic = d.license.split('. ')[0];
  return { tag: 'Stand-in data', text: `${d.title} (${lic}), not Navy doctrine. ${offline ? '' : 'Not offline. '}Training only.` };
}

/** The top banner. It says where the answers come from, read from the backend's own health report. */
export function ModeBanner() {
  const [health, setHealth] = useState<Health | null>(null);
  const mock = process.env.NEXT_PUBLIC_MOCK === '1';

  useEffect(() => {
    if (mock) return;
    api.health().then(setHealth, () => setHealth(null));
  }, [mock]);

  const l = mock ? MOCK : line(health);
  return (
    <div className="banner" role="note">
      <strong className="banner-tag">{l.tag}</strong> {l.text}
    </div>
  );
}
