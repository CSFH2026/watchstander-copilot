/** 24-hour local time, as a watch log writes it. Falls back to the raw stamp if it does not parse. */
export function clock(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

/** Date and time, for the entry view where the day matters. */
export function stamp(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return `${d.toLocaleDateString([], { year: 'numeric', month: 'short', day: '2-digit' })} ${clock(ts)}`;
}

/** "allowed", "blocked", or the event name, for rows and badges. */
export function outcome(e: { event: string; allowed?: boolean | null; summary: string }): string {
  if (e.event === 'action') return e.allowed === false || /blocked/i.test(e.summary) ? 'blocked' : 'allowed';
  if (e.event === 'outcome_correction') return 'correction';
  return e.event;
}
