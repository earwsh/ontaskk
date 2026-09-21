'use client';

import Card from '@/components/ui/Card';

interface ProgressCardProps {
  label: string;
  value: number | string;
  suffix?: string;
  subtitle?: string;
  /** Semantic tone drives the accent — charts no longer pass raw hex. */
  tone?: 'brand' | 'ok' | 'warn' | 'bad' | 'violet' | 'info' | 'neutral';
  /** Optional glyph shown beside the figure. */
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
}

const toneClass: Record<string, string> = {
  brand: 'bg-brand-soft text-brand-on-soft',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  violet: 'bg-violet-soft text-violet',
  info: 'bg-info-soft text-info',
  neutral: 'bg-sunken text-fg-secondary',
};

export default function ProgressCard({
  label, value, suffix = '', subtitle, tone = 'neutral', trend, icon,
}: ProgressCardProps) {
  return (
    <Card padding="sm">
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-2">
          {icon && <span className="text-fg-muted">{icon}</span>}
          <span className="tnum text-3xl font-extrabold text-fg">{value}{suffix}</span>
        </span>
        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${toneClass[tone]}`}>
          {trend && trend !== 'neutral' && (
            <svg className={`h-3 w-3 ${trend === 'down' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          )}
          {label}
        </span>
      </div>
      {subtitle && <p className="mt-3 text-[11px] text-fg-muted">{subtitle}</p>}
    </Card>
  );
}
