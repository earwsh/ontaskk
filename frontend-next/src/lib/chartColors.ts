'use client';

import { useMemo } from 'react';
import { useTheme } from '@/context/ThemeContext';

/**
 * Recharts needs concrete colour strings, not `var(--x)` — gradients and
 * canvas fills do not resolve custom properties reliably. So the tokens are
 * read from the document once per theme change and handed over as values.
 */
function read(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export interface ChartColors {
  brand: string;
  ok: string;
  warn: string;
  bad: string;
  info: string;
  violet: string;
  coral: string;
  grid: string;
  axis: string;
  text: string;
  surface: string;
  /** Categorical ramp for pies and multi-series charts. */
  series: string[];
}

export function useChartColors(): ChartColors {
  const { theme } = useTheme();

  return useMemo(() => {
    const brand = read('--brand', '#FF5A33');
    const ok = read('--ok', '#16A96A');
    const warn = read('--warn', '#C77A0F');
    const bad = read('--bad', '#E0483A');
    const info = read('--info', '#3B82C4');
    const violet = read('--accent-violet', '#7C6BF0');
    const coral = read('--accent-coral', '#FF5A33');

    return {
      brand, ok, warn, bad, info, violet, coral,
      grid: read('--line', 'rgba(0,0,0,0.08)'),
      axis: read('--fg-muted', '#8A8E98'),
      text: read('--fg', '#101216'),
      surface: read('--card', '#FFFFFF'),
      series: [brand, info, ok, violet, warn, bad, coral, read('--fg-muted', '#8A8E98')],
    };
    // `theme` is the invalidation key: the tokens change with it.
  }, [theme]);
}
