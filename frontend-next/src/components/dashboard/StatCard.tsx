'use client';

import Link from 'next/link';
import Card from '@/components/ui/Card';
import Skeleton from '@/components/ui/Skeleton';

interface StatCardProps {
  label: string;
  value: number | string;
  /** Secondary line that gives the number meaning — a share, a comparison, a breakdown. */
  hint?: string;
  icon: string;
  href?: string;
  loading?: boolean;
}

/**
 * Neutral by design: colour on this dashboard is reserved for status, so a
 * plain count never competes with a real warning for attention.
 */
export default function StatCard({ label, value, hint, icon, href, loading = false }: StatCardProps) {
  const body = (
    <>
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-fg-muted">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
        <span>{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-7 w-12" />
      ) : (
        <div className="tnum text-2xl font-bold text-fg">{value}</div>
      )}
      <div className="mt-1 text-xs text-fg-muted">{loading ? <Skeleton className="h-3 w-24" /> : hint}</div>
    </>
  );

  if (!href) {
    return <Card padding="sm">{body}</Card>;
  }

  return (
    <Link href={href} className="block">
      <Card padding="sm" interactive className="h-full">{body}</Card>
    </Link>
  );
}
