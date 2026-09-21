'use client';

import { useEffect, useState } from 'react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import api from '@/lib/api';

/**
 * One person's monthly numbers, the same ones the employee analytics tab
 * shows their managers. Nobody should be measured by a figure they cannot
 * see themselves, so this is deliberately the same source.
 */
interface MonthStats {
  done: number;
  rejected: number;
  plannedMinutes: number;
  turnaroundDays: number | null;
  topProject: { id: number; name: string; done: number } | null;
}

function hours(minutes: number): string {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} دقیقه`;
  return m ? `${h} ساعت و ${m} دقیقه` : `${h} ساعت`;
}

export default function PerformanceSummary({ userId, title }: { userId: number; title: string }) {
  const [data, setData] = useState<{ months: { key: string; label: string }[]; employee: { months: Record<string, MonthStats> } | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get(`/users/${userId}/performance`)
      .then(({ data: d }) => setData(d))
      .catch((err) => { if (err?.response?.status === 403) setDenied(true); })
      .finally(() => setLoading(false));
  }, [userId]);

  if (denied) return null;
  if (loading) return <Skeleton className="h-56 w-full rounded-card" />;

  const months = data?.months ?? [];
  const current = months[months.length - 1];
  const stats = current && data?.employee ? data.employee.months[current.key] : null;
  const series = data?.employee ? months.map((m) => data.employee!.months[m.key]?.done ?? 0) : [];
  const max = Math.max(...series, 1);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {current && <Badge tone="neutral">{current.label}</Badge>}
      </div>

      {!stats || (stats.done === 0 && stats.rejected === 0) ? (
        <p className="py-8 text-center text-xs text-fg-muted">در این ماه کاری ثبت نشده است</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-tile bg-sunken px-3 py-2.5">
              <p className="text-[11px] text-fg-muted">تحویل‌شده</p>
              <p className="tnum mt-0.5 text-xl font-bold text-fg">{stats.done}</p>
            </div>
            <div className="rounded-tile bg-sunken px-3 py-2.5">
              <p className="text-[11px] text-fg-muted">برگشت</p>
              <p className={`tnum mt-0.5 text-xl font-bold ${stats.rejected ? 'text-bad' : 'text-fg'}`}>{stats.rejected}</p>
            </div>
          </div>

          <div className="mt-3 space-y-1.5 text-[11px] text-fg-secondary">
            {stats.topProject && (
              <p>بیشترین کار: <span className="text-fg">{stats.topProject.name}</span> ({stats.topProject.done} تسک)</p>
            )}
            <p>زمان برآوردشده: <span className="text-fg">{hours(stats.plannedMinutes)}</span></p>
            {stats.turnaroundDays !== null && (
              <p>میانگین طول کار: <span className="text-fg">{stats.turnaroundDays} روز</span></p>
            )}
          </div>
        </>
      )}

      {series.some((v) => v > 0) && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 text-[10px] text-fg-muted">شش ماه گذشته</p>
          <div className="flex h-10 items-end gap-1.5">
            {series.map((v, i) => (
              <div key={months[i]!.key} className="flex flex-1 flex-col items-center gap-1">
                <span
                  title={`${months[i]!.label}: ${v}`}
                  className={`w-full rounded-sm ${i === series.length - 1 ? 'bg-brand' : 'bg-brand/40'}`}
                  style={{ height: `${Math.max(2, (v / max) * 32)}px` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1.5">
            {months.map((m) => (
              <span key={m.key} className="flex-1 truncate text-center text-[9px] text-fg-muted">{m.label.split(' ')[0]}</span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
