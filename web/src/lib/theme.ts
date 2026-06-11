import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

function readInitial(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function useTheme(): {
  theme: Theme;
  setTheme: (next: Theme) => void;
  toggle: () => void;
} {
  const [theme, setThemeState] = useState<Theme>(readInitial);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage might be blocked — silently fall back to in-memory */
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  // Sync if the system preference changes and the user hasn't explicitly chosen
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      if (localStorage.getItem(STORAGE_KEY)) return;
      setTheme(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [setTheme]);

  return { theme, setTheme, toggle };
}

/** Resolve CSS custom properties off `<html>` into concrete color strings, re-reading
 *  whenever the theme class flips. Canvas / SVG need concrete colors — CSS vars don't
 *  traverse them. (The disk-usage page keeps its own local copy for Recharts.) */
export function useThemeColors<T extends readonly string[]>(
  vars: T,
): Record<T[number], string> {
  const [snapshot, setSnapshot] = useState(() => readVars(vars));
  useEffect(() => {
    const observer = new MutationObserver(() => setSnapshot(readVars(vars)));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, [vars]);
  return snapshot;
}

function readVars<T extends readonly string[]>(vars: T): Record<T[number], string> {
  const cs = getComputedStyle(document.documentElement);
  const out = {} as Record<T[number], string>;
  for (const v of vars) {
    (out as Record<string, string>)[v] = cs.getPropertyValue(v).trim() || '#888';
  }
  return out;
}
