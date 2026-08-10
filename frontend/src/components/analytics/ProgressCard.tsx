'use client';

import { ReactNode } from 'react';

interface ProgressCardProps {
  label: string;
  value: number | string;
  suffix?: string;
  color?: string;
  icon?: ReactNode;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  maxValue?: number;
}

export default function ProgressCard({
  label,
  value,
  suffix = '',
  color = '#6366F1',
  icon,
  subtitle,
  trend = 'neutral',
  maxValue = 100,
}: ProgressCardProps) {
  const trendColor = trend === 'up' ? '#22C55E' : trend === 'down' ? '#EF4444' : '#94A3B8';
  const pct = typeof value === 'number' ? Math.min((value / maxValue) * 100, 100) : 0;

  return (
    <div
      className="group relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-[rgba(99,102,241,0.08)]"
      style={{
        background: 'linear-gradient(135deg, rgba(22,27,38,0.6) 0%, rgba(30,37,52,0.6) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background: `radial-gradient(600px circle at 50% 0%, ${color}08, transparent 70%)`,
        }}
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-text-muted text-xs font-medium">
            {icon}
            <span>{label}</span>
          </div>
          {trend !== 'neutral' && (
            <div className="flex items-center gap-0.5 text-xs font-medium" style={{ color: trendColor }}>
              {trend === 'up' ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              )}
              <span>{trend === 'up' ? 'رشد' : 'کاهش'}</span>
            </div>
          )}
        </div>
        <div className="text-3xl font-bold text-white mb-1 tracking-tight">
          {value}{suffix}
        </div>
        {subtitle && <div className="text-xs text-text-muted">{subtitle}</div>}
      </div>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}, ${color}cc)`,
            boxShadow: `0 0 8px ${color}40`,
          }}
        />
      </div>
    </div>
  );
}
