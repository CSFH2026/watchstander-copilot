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
