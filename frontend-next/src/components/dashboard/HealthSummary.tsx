'use client';

import Link from 'next/link';
import Card from '@/components/ui/Card';
import HealthRing from './HealthRing';
import Skeleton from '@/components/ui/Skeleton';

interface Figure {
  label: string;
  value: string;
  color?: string;
}

interface HealthSummaryProps {
  score: number;
  color: string;
  label: string;
  /** One-line read of the current state, from the analytics service. */
  narrative?: string;
  figures: Figure[];
  loading?: boolean;
}

export default function HealthSummary({ score, color, label, narrative, figures, loading = false }: HealthSummaryProps) {
  if (loading) {
    return (
      <Card className="h-full">
        <div className="flex items-center gap-5">
          <Skeleton className="h-[124px] w-[124px] shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-center gap-5">
        <div className="shrink-0">
          <HealthRing score={score} color={color} label={label} size={124} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-fg">سلامت سازمان</h3>
          <div className="mt-2 text-xs leading-relaxed text-fg-secondary">
            {narrative || 'هنوز داده‌ای برای تحلیل وجود ندارد.'}
          </div>
        </div>
      </div>

      {figures.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border-subtle pt-4">
          {figures.map((f) => (
            <div key={f.label} className="rounded-tile bg-surface-sunken px-2.5 py-2.5 text-center">
              <div className="tnum text-base font-bold" style={{ color: f.color || '#FFFFFF' }}>{f.value}</div>
              <div className="mt-1 text-[10px] leading-tight text-fg-muted">{f.label}</div>
            </div>
          ))}
        </div>
      )}

      <Link
        href="/dashboard/analytics"
        className="mt-4 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-brand-ink transition-colors hover:text-brand-hover"
      >
        مشاهده تحلیل کامل
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </Link>
    </Card>
  );
}
