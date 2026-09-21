'use client';

import { useCallback, useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

/** Runs before first paint (see layout.tsx) so the page never flashes the wrong theme. */
export const themeInitScript = `
(function(){try{
  var t = localStorage.getItem('theme');
  if (t !== 'light' && t !== 'dark') { t = 'light'; }
  document.documentElement.setAttribute('data-theme', t);
}catch(e){document.documentElement.setAttribute('data-theme','light');}})();
`;

// The theme lives on <html data-theme>, written before React boots. That makes
// it external state, so it is read through a store rather than mirrored into
// component state inside an effect.
const listeners = new Set<() => void>();

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const getSnapshot = (): Theme =>
  document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

const getServerSnapshot = (): Theme => 'light';

function setTheme(next: Theme) {
  const root = document.documentElement;
  root.classList.add('theme-animating');
  root.setAttribute('data-theme', next);
  try {
    localStorage.setItem('theme', next);
  } catch {}
  window.setTimeout(() => root.classList.remove('theme-animating'), 260);
  listeners.forEach((fn) => fn());
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const toggle = useCallback(() => {
    setTheme(getSnapshot() === 'light' ? 'dark' : 'light');
  }, []);
  return { theme, toggle };
}

/** Kept as a no-op wrapper so the root layout reads the same either way. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
