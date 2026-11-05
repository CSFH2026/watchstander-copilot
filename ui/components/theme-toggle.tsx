'use client';

import { MoonIcon, SunIcon } from './icons';
import { useTheme } from './theme-provider';

/** Shows the theme it switches to: a sun in dark mode, a moon in light mode. */
export function ThemeToggle() {
  const { theme, toggleTheme, redLight } = useTheme();
  const target = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="hdr-btn icon-btn"
      onClick={toggleTheme}
      aria-label={`Switch to ${target} theme`}
      disabled={redLight}
      title={redLight ? 'Turn off red light to change the theme' : `Switch to ${target} theme`}
    >
      {target === 'light' ? <SunIcon /> : <MoonIcon />}
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
