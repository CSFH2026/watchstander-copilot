'use client';

import { useEffect, useState } from 'react';
import { api, type Health } from '../lib/api';

const MOCK = 'PREVIEW WITH SAMPLE DATA. No backend: answers are canned and nothing is signed. The real copilot runs offline on a laptop.';
const OFFLINE = 'TRAINING USE ONLY. Public unclassified and synthetic doctrine. Not for operational use.';
const CLOUD =
  'CLOUD TEST BUILD. Training use only. Models run on Cloudflare Workers AI, so this build is not offline. The demo runs offline on a laptop.';
const ONLINE = 'TRAINING USE ONLY. This backend sends questions to a cloud model, so it is not offline. Not for operational use.';

function text(health: Health | null): string {
  const base = !health || health.offline ? OFFLINE : health.target === 'cloudflare' ? CLOUD : ONLINE;
  const d = health?.dataset;
  // Stand-in data must never read as doctrine, so its name and license lead the banner.
  return d?.kind === 'stand-in' ? `STAND-IN DATA: ${d.title} (${d.license.split('. ')[0]}), not Navy doctrine. ${base}` : base;
}

/** The top banner. It says where the answers come from, read from the backend's own health report. */
export function ModeBanner() {
  const [health, setHealth] = useState<Health | null>(null);
  const mock = process.env.NEXT_PUBLIC_MOCK === '1';

  useEffect(() => {
    if (mock) return;
    api.health().then(setHealth, () => setHealth(null));
  }, [mock]);

  return (
    <div className="banner" role="note">
      {mock ? MOCK : text(health)}
    </div>
  );
}
