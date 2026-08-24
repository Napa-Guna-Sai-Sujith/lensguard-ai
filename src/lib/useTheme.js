import { useCallback, useEffect, useState } from 'react';

const KEY = 'lensguard.theme';

/** Read stored theme, else system preference. Mirrors the inline boot script
 *  in index.html so there is never a flash of the wrong theme. */
export function initialTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* localStorage unavailable (private mode) — fall through to system pref */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch { /* ignore */ }
  }, [theme]);

  // Follow the OS if the user has never made an explicit choice.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = (e) => {
      let hasChoice = false;
      try { hasChoice = !!localStorage.getItem(KEY); } catch { /* ignore */ }
      if (!hasChoice) setTheme(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  return { theme, setTheme, toggle };
}
