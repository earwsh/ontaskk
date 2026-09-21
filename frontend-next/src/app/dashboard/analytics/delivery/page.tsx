'use client';

import { useEffect, useState, useMemo } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import Card from '@/components/ui/Card';
import Badge, { BadgeTone } from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import api from '@/lib/api';
import Link from 'next/link';
import { PROJECT_STATUS as STATUS, PROJECT_STATUS_ORDER as ORDER, type ProjectStatus as Status } from '@/lib/projectStatus';

/** A compact sparkline of weekly completions. */
function Spark({ data }: { data: number[] }) {
  if (!data.length) return <span className="text-[10px] text-fg-muted">—</span>;
  const max = Math.max(...data, 1);
  return (
    <span className="inline-flex h-6 items-end gap-[2px]" aria-hidden>
      {data.map((v, i) => (
        <span key={i} className="w-[5px] rounded-sm bg-brand/70" style={{ height: `${Math.max(2, (v / max) * 24)}px` }} />
      ))}
    </span>
  );
}

export default function DeliveryPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Status | 'all'>('all');

  useEffect(() => {
    api.get('/analytics/delivery')
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const projects = useMemo(() => {
    const all = data?.projects ?? [];
    return filter === 'all' ? all : all.filter((p: any) => p.status === filter);
  }, [data, filter]);

  const v = data?.org?.velocity;
  const c = data?.org?.cycleTime;
  const conf = data?.confidence;

  return (
    <ProtectedRoute allowedRoles={['CEO', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'INTERNAL_MANAGER', 'DEPARTMENT_MANAGER']}>
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 rounded-card" />
          <Skeleton className="h-64 rounded-card" />
        </div>
      ) : !data ? (
        <Card className="py-16 text-center">
          <p className="text-sm font-semibold text-fg">تحلیل در دسترس نیست</p>
        </Card>
      ) : (
        <>
          {/* Confidence first: a forecast without its uncertainty invites more
              trust than the data supports. */}
          {data.degraded && (
            <Card className="mb-3" tint="bad" padding="sm">
              <p className="text-xs leading-relaxed text-fg-secondary">
                <b className="text-fg">هشدار: </b>
                {data.degraded.simulation && 'سرویس پیش‌بینی در دسترس نیست. '}
                {data.degraded.statistics && 'سرویس آمار در دسترس نیست. '}
                اعداد زیر ناقص‌اند و وضعیت پروژه‌ها قابل محاسبه نیست.
              </p>
            </Card>
          )}

          {conf && conf.level !== 'high' && (
            <Card className="mb-3" tint={conf.level === 'none' ? 'bad' : 'warn'} padding="sm">
              <p className="text-xs leading-relaxed text-fg-secondary">
                <b className="text-fg">دقت پیش‌بینی: </b>{conf.note}. اعداد زیر با همین محدودیت خوانده شوند.
              </p>
            </Card>
          )}

          <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card padding="sm">
              <p className="text-[11px] text-fg-muted">سرعت تحویل</p>
              <p className="tnum mt-1 text-2xl font-extrabold text-fg">
                {v?.mean ?? '—'} <span className="text-xs font-medium text-fg-muted">تسک/هفته</span>
              </p>
              <p className="mt-2 text-[11px] text-fg-muted">
                {v?.direction === 'up' ? '↑ رو به رشد' : v?.direction === 'down' ? '↓ رو به کاهش' : '→ ثابت'}
                {v?.volatility != null && ` · نوسان ${v.volatility}`}
              </p>
            </Card>
            <Card padding="sm">
              <p className="text-[11px] text-fg-muted">زمان چرخه</p>
              <p className="tnum mt-1 text-2xl font-extrabold text-fg">
                {c?.p50 ?? '—'} <span className="text-xs font-medium text-fg-muted">روز (میانه)</span>
              </p>
              <p className="tnum mt-2 text-[11px] text-fg-muted">
                ۹۰٪ تسک‌ها زیر {c?.p90 ?? '—'} روز
              </p>
            </Card>
            <Card padding="sm">
              <p className="text-[11px] text-fg-muted">کار باز</p>
              <p className="tnum mt-1 text-2xl font-extrabold text-fg">{data.org.open}</p>
              <p className="tnum mt-2 text-[11px] text-fg-muted">
                {data.org.overdue} دیرکرد · {data.org.awaitingReview} معطل بررسی
                {data.org.longestReviewWaitDays > 0 && <> (قدیمی‌ترین {data.org.longestReviewWaitDays} روز)</>}
              </p>
              {data.org.scheduled > 0 && (
                <p className="tnum mt-1 text-[11px] text-fg-muted">
                  + {data.org.scheduled} تسک برنامه‌ریزی‌شده برای روزهای آینده
                </p>
              )}
            </Card>
            <Card padding="sm">
              <p className="text-[11px] text-fg-muted">تعادل بار کاری</p>
              <p className="tnum mt-1 text-2xl font-extrabold text-fg">
                {data.workload?.gini != null ? data.workload.gini : '—'}
              </p>
              <p className="mt-2 text-[11px] text-fg-muted">
                {data.workload?.gini == null ? 'داده کافی نیست'
                  : data.workload.gini < 0.3 ? 'توزیع متعادل'
                  : data.workload.gini < 0.45 ? 'کمی نامتعادل' : 'متمرکز روی چند نفر'}
              </p>
            </Card>
          </div>

          {/* Status filter doubles as the distribution summary. */}
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
                filter === 'all' ? 'bg-pill text-pill-fg' : 'bg-sunken text-fg-secondary hover:text-fg'}`}
            >
              همه <span className="tnum opacity-60">{data.projects.length}</span>
            </button>
            {ORDER.filter((s) => data.counts[s]).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                title={STATUS[s].hint}
                className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
                  filter === s ? 'bg-pill text-pill-fg' : 'bg-sunken text-fg-secondary hover:text-fg'}`}
              >
                {STATUS[s].label} <span className="tnum opacity-60">{data.counts[s]}</span>
              </button>
            ))}
          </div>

          <Card padding="none" className="mb-3 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-right">
                <thead>
                  <tr className="border-b border-line text-[11px] text-fg-muted">
                    <th className="px-4 py-3 font-medium">پروژه</th>
                    <th className="px-3 py-3 font-medium">وضعیت</th>
                    <th className="px-3 py-3 font-medium">تأخیر</th>
                    <th className="px-3 py-3 font-medium">باز</th>
                    <th className="px-3 py-3 font-medium">سرعت</th>
                    <th className="px-3 py-3 font-medium">روند</th>
                    <th className="px-4 py-3 font-medium">تشخیص</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p: any) => (
                    <tr key={p.projectId} className="border-b border-line/60 last:border-0 hover:bg-hover">
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/projects/${p.projectId}`} className="text-xs font-medium text-fg hover:text-brand-ink">
                          {p.name}
                        </Link>
                        <p className="mt-0.5 text-[10px] text-fg-muted">{p.department || '—'}</p>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={STATUS[p.status as Status]?.tone ?? 'neutral'}>
                          {p.statusLabel}
                        </Badge>
                      </td>
                      <td className="tnum px-3 py-3 text-xs text-fg">
                        {p.forecast?.slipWeeks ? `${p.forecast.slipWeeks} هفته` : '—'}
                      </td>
                      <td className="tnum px-3 py-3 text-xs text-fg-secondary">
                        {p.open}
                        {p.overdue > 0 && <span className="text-bad"> ({p.overdue})</span>}
                        {p.scheduled > 0 && (
                          <span className="text-fg-muted" title="برنامه‌ریزی‌شده برای روزهای آینده"> +{p.scheduled}</span>
                        )}
                      </td>
                      <td className="tnum px-3 py-3 text-xs text-fg-secondary">
                        {p.velocity?.mean ?? '—'}
                      </td>
                      <td className="px-3 py-3"><Spark data={p.weekly || []} /></td>
                      <td className="px-4 py-3 text-[11px] leading-relaxed text-fg-secondary">{p.headline}</td>
                    </tr>
                  ))}
                  {projects.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-xs text-fg-muted">پروژه‌ای در این وضعیت نیست</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {data.workload?.members?.length > 0 && (
            <Card className="mb-3">
              <h3 className="mb-1 text-sm font-semibold text-fg">بار کاری افراد</h3>
              <p className="mb-4 text-[11px] text-fg-muted">
                ستون «انحراف» فاصله از میانگین تیم است؛ بالای ۱ یعنی به‌طور معنادار پرکارتر از بقیه
              </p>
              <div className="space-y-2">
                {data.workload.members.slice(0, 10).map((m: any) => (
                  <div key={m.userId} className="flex items-center gap-3">
                    <span className="w-36 shrink-0 truncate text-xs text-fg">{m.name}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-sunken">
                      <div
                        className={`h-full rounded-full ${m.z >= 1 ? 'bg-bad' : m.z <= -1 ? 'bg-info' : 'bg-ok'}`}
                        style={{ width: `${Math.min(100, m.share * 3)}%` }}
                      />
                    </div>
                    <span className="tnum w-14 shrink-0 text-left text-[11px] text-fg-secondary">{m.open} باز</span>
                    <span className="tnum w-16 shrink-0 text-left text-[11px] text-fg-muted">{m.completed4w} تحویل</span>
                    <span className={`tnum w-12 shrink-0 text-left text-[11px] ${m.z >= 1 ? 'text-bad' : 'text-fg-muted'}`}>
                      {m.z > 0 ? '+' : ''}{m.z}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <p className="pb-6 text-center text-[10px] text-fg-muted">
            شمارش‌ها: {data.computedBy?.facts} · آمار: {data.computedBy?.statistics} · شبیه‌سازی: {data.computedBy?.simulation}
            {data.simulation && ` (${data.simulation.iterations.toLocaleString('fa-IR')} شبیه‌سازی در ${data.simulation.elapsedMs} میلی‌ثانیه)`}
          </p>
        </>
      )}
    </ProtectedRoute>
  );
}
