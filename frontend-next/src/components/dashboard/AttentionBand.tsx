'use client';

import Link from 'next/link';
import Skeleton from '@/components/ui/Skeleton';

export type Tone = 'danger' | 'warning' | 'neutral' | 'success';

export interface AttentionItem {
  label: string;
  value: number | string;
  /** What the reader should do about it, in a few words. */
  hint: string;
  tone: Tone;
  icon: string;
  href?: string;
}

const toneStyle: Record<Tone, { border: string; bg: string; text: string; dot: string }> = {
  danger:  { border: 'border-danger/25',  bg: 'bg-bad/[0.07]',  text: 'text-bad',     dot: 'bg-bad' },
  warning: { border: 'border-warning/25', bg: 'bg-warn/[0.07]', text: 'text-warn',    dot: 'bg-warn' },
  success: { border: 'border-success/25', bg: 'bg-ok/[0.07]', text: 'text-ok',    dot: 'bg-ok' },
  neutral: { border: 'border-border-subtle', bg: 'bg-surface-raised', text: 'text-fg-secondary', dot: 'bg-text-muted' },
};

function Tile({ item }: { item: AttentionItem }) {
  const s = toneStyle[item.tone];
  const inner = (
    <div className={`flex h-full items-center gap-3.5 rounded-card border ${s.border} ${s.bg} px-4 py-3.5 transition-colors duration-200 ${item.href ? 'hover:border-border-strong' : ''}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-tile ${s.bg} ${s.text}`}>
        <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`tnum text-xl font-bold ${item.tone === 'neutral' ? 'text-fg' : s.text}`}>{item.value}</span>
          <span className="truncate text-sm font-medium text-fg">{item.label}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-fg-muted">{item.hint}</p>
      </div>
      {item.href && (
        <svg className="h-4 w-4 shrink-0 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      )}
    </div>
  );

  return item.href ? <Link href={item.href} className="block h-full">{inner}</Link> : inner;
}

export default function AttentionBand({ items, loading = false }: { items: AttentionItem[]; loading?: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[70px] rounded-card" />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => <Tile key={item.label} item={item} />)}
    </div>
  );
}
