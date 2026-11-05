/**
 * Small inline icons. Step state must read by shape as well as colour, because the
 * red-light palette collapses every colour to one hue.
 */
const base = { width: 22, height: 22, viewBox: '0 0 24 24', 'aria-hidden': true as const, focusable: false as const };

export function CheckIcon() {
  return (
    <svg {...base}>
      <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function NextIcon() {
  return (
    <svg {...base}>
      <path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg {...base}>
      <rect x="5" y="10.5" width="14" height="10" rx="2" fill="currentColor" />
      <path d="M8 10.5V8a4 4 0 018 0v2.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  );
}

export function WarnIcon() {
  return (
    <svg {...base}>
      <path d="M12 3L2 20.5h20z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M12 9.5v5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="12" cy="17.4" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function BlockIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <path d="M5.8 5.8l12.4 12.4" stroke="currentColor" strokeWidth="2.6" />
    </svg>
  );
}

export function SunIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
      <path
        d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg {...base}>
      <path d="M20 14.6A8.2 8.2 0 019.4 4a8.2 8.2 0 1010.6 10.6z" fill="currentColor" />
    </svg>
  );
}

const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

/** Binoculars: the watch. The same drawing is in the CASREP Board's app switch. */
export function WatchIcon() {
  return (
    <svg {...base} width={18} height={18}>
      <circle cx="6.5" cy="16" r="3.5" {...line} />
      <circle cx="17.5" cy="16" r="3.5" {...line} />
      <path d="M3 16l2-8.5A2 2 0 017 6h1a2 2 0 012 2v4.5M21 16l-2-8.5A2 2 0 0017 6h-1a2 2 0 00-2 2v4.5M10 12.5h4" {...line} />
    </svg>
  );
}

/** A clipboard: the CASREP Board. */
export function BoardIcon() {
  return (
    <svg {...base} width={18} height={18}>
      <rect x="5" y="4.5" width="14" height="17" rx="2" {...line} />
      <rect x="9" y="2.5" width="6" height="4" rx="1" {...line} />
      <path d="M8.5 11h7M8.5 14.5h7M8.5 18h4" {...line} />
    </svg>
  );
}
