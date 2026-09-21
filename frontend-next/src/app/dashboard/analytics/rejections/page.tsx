'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import { useChartColors } from '@/lib/chartColors';
import { jalaliDateTime } from '@/lib/date';
import { describeRequestError } from '@/lib/requestError';
import { useToast } from '@/components/Toast';
import api from '@/lib/api';
import CategoryIcon from '@/components/CategoryIcon';

type Tally = { key: string | number; label: string; count: number };
type Event = {
  taskId: number; title: string; status: string | null;
  project: { id: number; name: string } | null;
  employee: { id: number; name: string };
  reviewer: { id: number; name: string } | null;
  stage: 'QC' | 'APPROVAL';
  categories: string[]; categoryLabels: string[];
  reworkMinutes: number | null;
  reason: string | null; at: string;
};
type Payload = {
  events: Event[]; byEmployee: Tally[]; byProject: Tally[];
  byCategory: Tally[]; byDay: { day: string; count: number }[];
};

const RANGES = [{ days: 30, label: '۱ ماه' }, { days: 90, label: '۳ ماه' }, { days: 365, label: '۱ سال' }];

/** A reason of "." or "/" was the field being answered, not filled in. */
const isEmptyReason = (r: string | null) => !r || r.replace(/[^\p{L}\p{N}]/gu, '').length < 5;

function CountTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-tile bg-card px-3.5 py-2.5 text-xs shadow-float">
      <div className="text-sm font-medium text-fg">{p.label}</div>
      <div className="tnum mt-1 text-fg-secondary">{p.count} رد</div>
    </div>
  );
}

export default function RejectionAnalyticsPage() {
  const { showToast } = useToast();
  const c = useChartColors();
  const [days, setDays] = useState(90);
  const [data, setData] = useState<Payload | null>(null);
  const [employee, setEmployee] = useState<number | null>(null);

  useEffect(() => {
    setData(null);
    api.get(`/analytics/rejections?days=${days}`)
      .then(({ data }) => setData(data))
      .catch((err) => { showToast(describeRequestError(err, 'دریافت تحلیل ردها'), 'error'); setData(null); });
  }, [days, showToast]);

  const events = useMemo(
    () => (data?.events ?? []).filter((e) => employee === null || e.employee.id === employee),
    [data, employee]
  );

  const palette = [c.bad, c.warn, c.violet, c.coral, c.info, c.brand, c.ok];
  const unset = data?.byCategory.find((x) => x.key === 'UNSET')?.count ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2 pb-1">
        <div className="flex gap-1 rounded-full bg-card p-1 shadow-flat">
          {RANGES.map((r) => (
            <button key={r.days} onClick={() => setDays(r.days)}
              className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                days === r.days ? 'bg-pill text-pill-fg' : 'text-fg-secondary hover:text-fg'
              }`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="space-y-3"><Skeleton className="h-64 rounded-card" /><Skeleton className="h-96 rounded-card" /></div>
      ) : data.events.length === 0 ? (
        <Card className="py-16 text-center"><p className="text-sm text-fg-muted">در این بازه ردی ثبت نشده است</p></Card>
      ) : (
        <>
          {unset > 0 && (
            <Card padding="sm" tint="warn">
              <p className="text-xs leading-relaxed text-fg">
                <span className="tnum font-semibold">{unset}</span> رد بدون دستهٔ ثبت‌شده است — همه مربوط به قبل از
                افزوده‌شدن دسته‌بندی. نمودار «دلیل» فقط از ردهای بعد از این تغییر پر می‌شود.
              </p>
            </Card>
          )}

          <div className="grid gap-3 lg:grid-cols-12">
            <Card className="lg:col-span-5">
              <h2 className="mb-4 text-sm font-semibold text-fg">به تفکیک کارمند</h2>
              <div dir="ltr">
              <ResponsiveContainer width="100%" height={Math.max(160, data.byEmployee.length * 44)}>
                <BarChart data={data.byEmployee} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={c.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: c.axis }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11, fill: c.axis }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CountTip />} cursor={{ fill: c.grid, opacity: 0.3 }} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {data.byEmployee.map((e, i) => (
                      <Cell key={i} fill={employee === null || employee === e.key ? c.bad : c.grid}
                        cursor="pointer" onClick={() => setEmployee(employee === e.key ? null : (e.key as number))} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              </div>
              <p className="mt-2 text-[10px] text-fg-muted">روی یک میله بزنید تا فهرست پایین فقط همان نفر را نشان دهد.</p>
            </Card>

            <Card className="lg:col-span-4">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-fg">دلیل رد</h2>
                {/* One rejection can name two faults, so the bars add up to
                    more than the number of rejections. Said plainly rather
                    than left for someone to notice and mistrust. */}
                <p className="mt-0.5 text-[10px] text-fg-muted">یک رد می‌تواند چند دسته داشته باشد، پس جمع این اعداد از تعداد ردها بیشتر می‌شود.</p>
              </div>
              {/* Bars, not a pie: recharts draws no path for a lone
                  full-circle sector, and today every rejection falls in one
                  category. Bars also stay readable at seven. */}
              <div dir="ltr">
              <ResponsiveContainer width="100%" height={Math.max(140, data.byCategory.length * 40)}>
                <BarChart data={data.byCategory} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={c.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: c.axis }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" width={96} tick={{ fontSize: 11, fill: c.axis }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CountTip />} cursor={{ fill: c.grid, opacity: 0.3 }} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {data.byCategory.map((x, i) => (
                      <Cell key={i} fill={x.key === 'UNSET' ? c.grid : palette[i % palette.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              </div>
            </Card>

            <Card className="lg:col-span-3">
              <h2 className="mb-4 text-sm font-semibold text-fg">به تفکیک پروژه</h2>
              <div className="max-h-[280px] space-y-1.5 overflow-auto">
                {data.byProject.map((p) => (
                  <div key={p.key} className="flex items-center gap-2 text-[11px]">
                    <span className="flex-1 truncate text-fg-secondary" title={p.label}>{p.label}</span>
                    <span className="tnum font-medium text-fg">{p.count}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-fg">
                تسک‌های رد شده
                {employee !== null && (
                  <button onClick={() => setEmployee(null)}
                    className="mr-2 cursor-pointer rounded-full bg-sunken px-2.5 py-1 text-[10px] font-normal text-fg-secondary transition-colors hover:text-fg">
                    حذف فیلتر
                  </button>
                )}
              </h2>
              <span className="tnum text-[11px] text-fg-muted">{events.length} مورد</span>
            </div>
            <div className="space-y-2">
              {events.map((e, i) => (
                <div key={`${e.taskId}-${e.at}-${i}`} className="rounded-tile bg-sunken px-3.5 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/dashboard/tasks/${e.taskId}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium text-fg transition-colors hover:text-brand-ink">
                      {e.title}
                    </Link>
                    {e.project && <Badge tone="neutral">{e.project.name}</Badge>}
                    {e.categories.length === 0 ? (
                      <Badge tone="neutral">دسته ثبت‌نشده</Badge>
                    ) : (
                      e.categories.map((c, ci) => (
                        <Badge key={c} tone="bad">
                          <span className="flex items-center gap-1">
                            <CategoryIcon category={c} />
                            {e.categoryLabels[ci] ?? c}
                          </span>
                        </Badge>
                      ))
                    )}
                    <span className="tnum text-[10px] text-fg-muted">{jalaliDateTime(e.at)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-fg-muted">
                    <span>انجام‌دهنده: {e.employee.name}</span>
                    {e.reviewer && <span>بررسی: {e.reviewer.name}</span>}
                    {e.reworkMinutes != null && <span>زمان اصلاح: {e.reworkMinutes} دقیقه</span>}
                    {e.stage === 'APPROVAL' && <span>مرحله تایید نهایی</span>}
                  </div>
                  {!isEmptyReason(e.reason) && (
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-fg-secondary">{e.reason}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
