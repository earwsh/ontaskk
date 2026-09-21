'use client';

import { useEffect, useMemo, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import api from '@/lib/api';
import { roleLabel } from '@/lib/roles';

interface MonthStats {
  done: number;
  rejected: number;
  plannedMinutes: number;
  turnaroundDays: number | null;
  topProject: { id: number; name: string; done: number } | null;
}

interface Employee {
  id: number;
  name: string;
  role: string;
  months: Record<string, MonthStats>;
}

interface Payload {
  months: { key: string; label: string }[];
  employees: Employee[];
  scope: 'department' | 'organisation';
}

const EMPTY: MonthStats = { done: 0, rejected: 0, plannedMinutes: 0, turnaroundDays: null, topProject: null };

/** Minutes as a reading a manager can act on, not a raw number. */
function hours(minutes: number): string {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} دقیقه`;
  return m ? `${h} ساعت و ${m} دقیقه` : `${h} ساعت`;
}

/** How often work came back, as a share of everything that was reviewed. */
function reworkRate(m: MonthStats): number | null {
  const reviewed = m.done + m.rejected;
  return reviewed > 0 ? Math.round((m.rejected / reviewed) * 100) : null;
}

type SortKey = 'done' | 'rejected' | 'minutes';

export default function EmployeeAnalyticsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [month, setMonth] = useState('');
  const [sort, setSort] = useState<SortKey>('done');

  useEffect(() => {
    api
      .get('/analytics/employees?months=6')
      .then(({ data: d }: { data: Payload }) => {
        setData(d);
        setMonth(d.months[d.months.length - 1]?.key || '');
      })
      .catch(() => setError('خطا در دریافت تحلیل کارمندان'))
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    if (!data || !month) return [];
    return data.employees
      .map((e) => ({ ...e, m: e.months[month] || EMPTY }))
      .filter((e) => e.m.done > 0 || e.m.rejected > 0)
      .sort((a, b) => {
        if (sort === 'rejected') return b.m.rejected - a.m.rejected || b.m.done - a.m.done;
        if (sort === 'minutes') return b.m.plannedMinutes - a.m.plannedMinutes;
        return b.m.done - a.m.done || a.m.rejected - b.m.rejected;
      });
  }, [data, month, sort]);

  const totals = useMemo(() => {
    const done = rows.reduce((s, r) => s + r.m.done, 0);
    const rejected = rows.reduce((s, r) => s + r.m.rejected, 0);
    const minutes = rows.reduce((s, r) => s + r.m.plannedMinutes, 0);
    return { done, rejected, minutes, people: rows.length };
  }, [rows]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 py-10 text-fg-muted">
          <p className="text-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="cursor-pointer rounded-xl bg-brand-soft px-4 py-2 text-xs font-medium text-brand-on-soft"
          >
            تلاش مجدد
          </button>
        </div>
      </Card>
    );
  }

  return (
    <ProtectedRoute allowedRoles={['CEO', 'INTERNAL_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER']}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-fg">ارزیابی ماهانه کارمندان</p>
            <p className="mt-0.5 text-xs text-fg-muted">
              {data?.scope === 'department' ? 'کارکنان دپارتمان‌های شما' : 'کل سازمان'} · ماه شمسی
            </p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-full bg-card p-1 shadow-flat">
            {data?.months.map((m) => (
              <button
                key={m.key}
                onClick={() => setMonth(m.key)}
                className={`cursor-pointer whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  month === m.key ? 'bg-pill text-pill-fg' : 'text-fg-secondary hover:text-fg'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card tint="brand">
            <p className="text-xs text-fg-muted">کارمند فعال</p>
            <p className="mt-1 text-2xl font-bold text-fg">{totals.people}</p>
          </Card>
          <Card tint="ok">
            <p className="text-xs text-fg-muted">تسک تحویل‌شده</p>
            <p className="mt-1 text-2xl font-bold text-fg">{totals.done}</p>
          </Card>
          <Card tint="bad">
            <p className="text-xs text-fg-muted">دفعات برگشت</p>
            <p className="mt-1 text-2xl font-bold text-fg">{totals.rejected}</p>
          </Card>
          <Card tint="info">
            <p className="text-xs text-fg-muted">زمان برآوردشده</p>
            <p className="mt-1 text-lg font-bold text-fg">{hours(totals.minutes)}</p>
          </Card>
        </div>

        <Card>
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-fg-muted">در این ماه کاری ثبت نشده است</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-fg-muted">
                    <th className="px-3 py-2 font-medium">کارمند</th>
                    <th className="px-3 py-2 font-medium">
                      <button onClick={() => setSort('done')} className={`cursor-pointer ${sort === 'done' ? 'text-fg' : ''}`}>
                        تحویل‌شده
                      </button>
                    </th>
                    <th className="px-3 py-2 font-medium">
                      <button onClick={() => setSort('rejected')} className={`cursor-pointer ${sort === 'rejected' ? 'text-fg' : ''}`}>
                        برگشت
                      </button>
                    </th>
                    <th className="px-3 py-2 font-medium">نرخ برگشت</th>
                    <th className="px-3 py-2 font-medium">بیشترین پروژه</th>
                    <th className="px-3 py-2 font-medium">
                      <button onClick={() => setSort('minutes')} className={`cursor-pointer ${sort === 'minutes' ? 'text-fg' : ''}`}>
                        زمان برآوردشده
                      </button>
                    </th>
                    <th className="px-3 py-2 font-medium">میانگین طول کار</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const rate = reworkRate(r.m);
                    return (
                      <tr key={r.id} className="border-b border-line/60 last:border-0 hover:bg-card-hover">
                        <td className="px-3 py-2.5">
                          <span className="font-medium text-fg">{r.name}</span>
                          <span className="mr-2 text-[11px] text-fg-muted">{roleLabel(r.role)}</span>
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-fg">{r.m.done}</td>
                        <td className="px-3 py-2.5">
                          {r.m.rejected > 0 ? <Badge tone="bad">{r.m.rejected}</Badge> : <span className="text-fg-muted">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {rate === null ? (
                            <span className="text-fg-muted">—</span>
                          ) : (
                            <Badge tone={rate === 0 ? 'ok' : rate < 25 ? 'warn' : 'bad'}>{rate}%</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-fg-secondary">
                          {r.m.topProject ? (
                            <>
                              <span className="truncate">{r.m.topProject.name}</span>
                              <span className="mr-1 text-[11px] text-fg-muted">({r.m.topProject.done})</span>
                            </>
                          ) : (
                            <span className="text-fg-muted">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-fg-secondary">{hours(r.m.plannedMinutes)}</td>
                        <td className="px-3 py-2.5 text-fg-secondary">
                          {r.m.turnaroundDays === null ? '—' : `${r.m.turnaroundDays} روز`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {rows.length > 0 && (
          <Card variant="panel">
            <p className="text-xs font-medium text-fg-secondary">روند شش ماه گذشته</p>
            <div className="mt-3 space-y-2">
              {rows.slice(0, 10).map((r) => {
                const series = data!.months.map((m) => r.months[m.key]?.done || 0);
                const max = Math.max(...series, 1);
                return (
                  <div key={r.id} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 truncate text-xs text-fg-secondary">{r.name}</span>
                    <span className="flex h-6 flex-1 items-end gap-1">
                      {series.map((v, i) => (
                        <span
                          key={i}
                          title={`${data!.months[i]!.label}: ${v}`}
                          className={`flex-1 rounded-sm ${data!.months[i]!.key === month ? 'bg-brand' : 'bg-brand/40'}`}
                          style={{ height: `${Math.max(2, (v / max) * 24)}px` }}
                        />
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <p className="px-1 text-[11px] leading-5 text-fg-muted">
          «زمان برآوردشده» جمع زمانی است که هنگام ساخت تسک تخمین زده شده، نه زمان واقعی کار — سامانه ساعت کارکرد ثبت نمی‌کند.
          «برگشت» یعنی تسک از کنترل کیفیت یا تایید نهایی برای اصلاح برگشته است.
        </p>
      </div>
    </ProtectedRoute>
  );
}
