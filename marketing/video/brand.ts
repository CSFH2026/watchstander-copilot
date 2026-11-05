/**
 * The copilot's dark theme tokens (ui/app/globals.css `.dark`), so the drawn scenes match the
 * captured screens. Every on-screen claim below comes from ui/app/showcase/page.tsx or the app
 * itself; check there before changing a number.
 */
export const C = {
  bg: '#0b1017',
  surface: '#131b25',
  surface2: '#18222e',
  text: '#e4eaf1',
  muted: '#9aa7b6',
  border: '#263241',
  borderStrong: '#3d4c5e',
  accent: '#6cb0ff',
  accentText: '#08111c',
  accentSoft: '#15283d',
  ok: '#4fd18b',
  okBg: '#0f2b1d',
  warn: '#f5b84a',
  warnBg: '#33240a',
  critical: '#ff6b5e',
  criticalBg: '#3a1411',
  bannerBg: '#2a1f0a',
  bannerText: '#f5c56b',
  // The TRACE mark (globals.css .tm-*).
  markBg: '#0b1f3a',
  seal: '#f5b83d',
} as const;

export const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** The app's real training banner text (components/mode-banner.tsx). */
export const TRAINING = { tag: 'Training only', text: 'Public, unclassified, and synthetic doctrine. Not for operational use.' };

/** The demo address: make demo serves the copilot here. */
export const APP_URL = '127.0.0.1:8000';
export const SHOWCASE_URL = 'watchstander-copilot-preview.pages.dev/showcase';

/** The CASREP Board's approval route (showcase flow-diagram.tsx ROUTE). */
export const ROUTE = ['Originator', 'DIVO', 'DH', 'CHENG', 'XO', 'CO', 'Released'];
