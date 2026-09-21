'use client';

import { ReactNode } from 'react';

export type BadgeTone = 'brand' | 'ok' | 'warn' | 'bad' | 'info' | 'violet' | 'coral' | 'neutral';

const toneMap: Record<BadgeTone, string> = {
  brand: 'bg-brand-soft text-brand-on-soft',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-info',
  violet: 'bg-violet-soft text-violet',
  coral: 'bg-coral-soft text-coral',
  neutral: 'bg-sunken text-fg-secondary',
};

/** Soft-filled pill, as used for statuses throughout the reference. */
export default function Badge({
  children, tone = 'neutral', className = '',
}: { children: ReactNode; tone?: BadgeTone; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${toneMap[tone]} ${className}`}>
      {children}
    </span>
  );
}
