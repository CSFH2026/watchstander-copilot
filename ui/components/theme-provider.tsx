'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

type ThemeState = {
  theme: Theme;
  toggleTheme: () => void;
  redLight: boolean;
  toggleRedLight: () => void;
};

const ThemeContext = createContext<ThemeState | null>(null);

/**
 * Tracks the light/dark theme and the red-light night mode in one place, kept in sync
 * with the `.dark` and `.redlight` classes on `<html>` and localStorage. Red light wins
 * over both themes, because a darkened space needs the night palette whatever the
 * theme. The no-flash script in the root layout applies both classes before paint.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [redLight, setRedLight] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    let saved: Theme = root.classList.contains('dark') ? 'dark' : 'light';
    let red = root.classList.contains('redlight');
    try {
      saved = (localStorage.getItem('theme') as Theme | null) || saved;
      red = localStorage.getItem('redlight') === '1' || red;
    } catch {
      // Storage can be blocked; the classes already on <html> are the fallback.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from localStorage/DOM on mount (portfolio ThemeProvider pattern)
    setTheme(saved);
    setRedLight(red);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('redlight', redLight);
    try {
      localStorage.setItem('theme', theme);
      localStorage.setItem('redlight', redLight ? '1' : '0');
    } catch {
      // Not persisting is fine; the toggle still works for this page view.
    }
  }, [theme, redLight, mounted]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
        redLight,
        toggleRedLight: () => setRedLight((on) => !on),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
