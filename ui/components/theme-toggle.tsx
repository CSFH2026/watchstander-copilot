'use client';

import { useTheme } from './theme-provider';

export function ThemeToggle() {
  const { theme, toggleTheme, redLight } = useTheme();
  return (
    <button type="button" className="hdr-btn" onClick={toggleTheme} aria-label="Toggle light or dark theme" disabled={redLight} title={redLight ? 'Turn off red light to change the theme' : undefined}>
      {theme === 'dark' ? 'Light' : 'Dark'}
    </button>
  );
}

export function RedLightToggle() {
  const { redLight, toggleRedLight } = useTheme();
  return (
    <button type="button" className={`hdr-btn redlight-btn${redLight ? ' on' : ''}`} onClick={toggleRedLight} aria-pressed={redLight}>
      <span className="redlight-dot" aria-hidden="true" />
      Red light
    </button>
  );
}
