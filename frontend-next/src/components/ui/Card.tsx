'use client';

import { ReactNode } from 'react';

type Variant = 'card' | 'panel' | 'plain';

/** Soft colour wash for cards that should feel lively rather than neutral. */
export type Tint = 'brand' | 'ok' | 'warn' | 'bad' | 'info' | 'violet' | 'coral';

const tintVar: Record<Tint, string> = {
  brand: '--brand-soft',
  ok: '--ok-soft',
  warn: '--warn-soft',
  bad: '--bad-soft',
  info: '--info-soft',
  violet: '--accent-violet-soft',
  coral: '--accent-coral-soft',
};

interface CardProps {
  children: ReactNode;
  /**
   * `card`  — a raised surface, the default building block.
   * `panel` — a tinted container used to group several cards together.
   * `plain` — no surface, just the geometry (for custom backgrounds).
   */
  variant?: Variant;
  interactive?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /**
   * Washes the card with a soft colour. The `*-soft` tokens are pastels in the
   * light theme and low-alpha overlays in the dark one, so the same value
   * reads as cheerful on white and stays restrained on navy.
   */
  tint?: Tint;
  className?: string;
  squircle?: boolean;
}

const paddingMap = { none: '', sm: 'p-4', md: 'p-5', lg: 'p-7' };

const variantMap: Record<Variant, string> = {
  card: 'rounded-card bg-card shadow-card',
  panel: 'rounded-panel bg-panel',
  plain: 'rounded-card',
};

/**
 * The single source of truth for surfaces. v2 gets its depth from soft
 * shadows rather than hairline borders, so nothing here draws a 1px wire.
 */
export default function Card({
  children,
  variant = 'card',
  interactive = false,
  padding = 'md',
  tint,
  className = '',
  squircle = false,
}: CardProps) {
  const washed = tint
    ? {
        // Diluted so the wash never competes with text. The same tokens fill
        // badges at full strength, where a stronger tint is wanted.
        backgroundImage: `linear-gradient(152deg, color-mix(in srgb, var(${tintVar[tint]}) var(--tint-strength), transparent) 0%, transparent 70%)`,
      }
    : undefined;

  return (
    <div
      style={washed}
      className={[
        variantMap[variant],
        squircle ? 'squircle-card' : '',
        paddingMap[padding],
        interactive ? 'transition-all duration-200 hover:shadow-float' : '',
        interactive && !tint ? 'hover:bg-card-hover' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}
