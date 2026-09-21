'use client';

import Link from 'next/link';
import Card, { Tint } from '@/components/ui/Card';
import Skeleton from '@/components/ui/Skeleton';

export type Tone = 'bad' | 'warn' | 'ok' | 'info' | 'neutral';

export interface StatTileProps {
  label: string;
  value: number | string;
  hint?: string;
  tone?: Tone;
  href?: string;
  loading?: boolean;
  /**
   * Position in the row. A status tone always wins — a red "overdue" tile must
   * stay red — but neutral tiles rotate through the accent family so a row of
   * counters does not read as four grey boxes.
   */
  index?: number;
  className?: string;
  squircle?: boolean;
}

const neutralCycle: Tint[] = ['brand', 'info', 'violet', 'coral'];

const toneTint: Partial<Record<Tone, Tint>> = {
  bad: 'bad', warn: 'warn', ok: 'ok', info: 'info',
};

const toneClass: Record<Tone, string> = {
  bad: 'bg-bad-soft text-bad',
  warn: 'bg-warn-soft text-warn',
  ok: 'bg-ok-soft text-ok',
  info: 'bg-info-soft text-info',
  neutral: 'bg-sunken text-fg-secondary',
};

/** The KPI tile shared by every dashboard: big figure, tone chip, one hint. */
export default function StatTile({ label, value, hint, tone = 'neutral', href, loading, index = 0, className = '', squircle = false }: StatTileProps) {
  const tint: Tint = toneTint[tone] ?? neutralCycle[index % neutralCycle.length];
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        {loading ? <Skeleton className="h-8 w-12" /> : <span className="tnum text-3xl font-extrabold text-fg">{value}</span>}
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${toneClass[tone]}`}>{label}</span>
      </div>
      {hint && <p className="mt-3 text-[11px] text-fg-muted">{hint}</p>}
    </>
  );

  if (!href) return <Card padding="sm" tint={tint} squircle={squircle} className={className}>{body}</Card>;
  return (
    <Link href={href} className="block h-full">
      <Card padding="sm" interactive tint={tint} squircle={squircle} className={`h-full ${className}`}>{body}</Card>
    </Link>
  );
}

