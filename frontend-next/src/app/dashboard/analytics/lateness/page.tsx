'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import { useChartColors } from '@/lib/chartColors';
import { gregorianToShamsi } from '@/lib/date';
import { describeRequestError } from '@/lib/requestError';
import { useToast } from '@/components/Toast';
import api from '@/lib/api';

type Person = {
  id: number; name: string;
  measured: number; late: number; lateRate: number | null;
  lateDays: number; avgLateDays: number; maxLateDays: number;
  openOverdue: number; unmeasured: number; daysBehind: number;
};
type LateItem = {
  taskId: number; title: string; project: { id: number; name: string };
  employee: { id: number; name: string }; due: string; finishedOn: string;
  daysLate: number; stillOpen: boolean; status: string;
};
type Payload = {
  days: number; unmeasured: number;
  totals: { measured: number; late: number; lateDays: number; openOverdue: number };
  people: Person[]; lateItems: LateItem[];
};

const RANGES = [{ days: 30, label: '۱ ماه' }, { days: 90, label: '۳ ماه' }, { days: 180, label: '۶ ماه' }];
/**
 * No "summed days late" sort: added across tasks it grew by one day per open
 * task per day, so it mostly ranked people by how many tasks they had open.
 */
type SortKey = 'late' | 'lateRate' | 'avgLateDays' | 'daysBehind';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'late', label: 'تعداد تأخیر' },
  { key: 'lateRate', label: 'نرخ تأخیر' },
  { key: 'avgLateDays', label: 'میانگین تأخیر' },
  { key: 'daysBehind', label: 'روزهای عقب‌بودن' },
];

function Tip({ active, payload, sort }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as Person;
  return (
    <div className="rounded-tile bg-card px-3.5 py-2.5 text-xs shadow-float">
      <div className="text-sm font-medium text-fg">{p.name}</div>
      <div className="tnum mt-1 text-fg-secondary">{p.late} تأخیر از {p.measured} تسک ({p.lateRate ?? 0}%)</div>
      <div className="tnum text-fg-muted">میانگین {p.avgLateDays} روز · بیشترین {p.maxLateDays} روز</div>
      {p.daysBehind > 0 && <div className="tnum text-fg-muted">{p.daysBehind} روز عقب</div>}
    </div>
  );
}

export default function LatenessPage() {
  const { showToast } = useToast();
  const c = useChartColors();
  const [days, setDays] = useState(30);
  const [sort, setSort] = useState<SortKey>('late');
  const [data, setData] = useState<Payload | null>(null);
  const [person, setPerson] = useState<number | null>(null);

  useEffect(() => {
    setData(null); setPerson(null);
    api.get(`/analytics/lateness?days=${days}`)
      .then(({ data }) => setData(data))
      .catch((err) => { showToast(describeRequestError(err, 'دریافت نرخ تأخیر'), 'error'); setData(null); });
  }, [days, showToast]);

  const people = useMemo(() => {
    const list = (data?.people ?? []).filter((p) => p.measured > 0);
    return [...list].sort((a, b) => ((b[sort] ?? 0) as number) - ((a[sort] ?? 0) as number) || b.late - a.late);
  }, [data, sort]);

  const items = useMemo(
    () => (data?.lateItems ?? []).filter((i) => person === null || i.employee.id === person),
    [data, person]
  );

  const chartKey = sort === 'lateRate' ? 'lateRate' : sort;
  const chartLabel = SORTS.find((s) => s.key === sort)!.label;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2 pb-1">
        <div className="flex gap-1 rounded-full bg-card p-1 shadow-flat">
          {RANGES.map((r) => (
            <button key={r.days} onClick={() => setDays(r.days)}
              className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                days === r.days ? 'bg-pill text-pill-fg' : 'text-fg-secondary hover:text-fg'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="space-y-3"><Skeleton className="h-24 rounded-card" /><Skeleton className="h-80 rounded-card" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'تسک‌های سنجیده‌شده', value: data.totals.measured, hint: `سررسید در ${days} روز گذشته` },
              {
                label: 'تأخیر',
                value: data.totals.late,
                hint: data.totals.measured ? `${Math.round((data.totals.late / data.totals.measured) * 100)}٪ از سنجیده‌ها` : '—',
              },
              {
                label: 'میانگین تأخیر',
                value: data.totals.late ? Math.round((data.totals.lateDays / data.totals.late) * 10) / 10 : 0,
                hint: 'روز، برای هر تسکِ دیر',
              },
              { label: 'هنوز باز و دیرکرد', value: data.totals.openOverdue, hint: 'روز تأخیرشان هنوز زیاد می‌شود' },
            ].map((k) => (
              <Card key={k.label} padding="sm">
                <p className="text-[11px] text-fg-secondary">{k.label}</p>
                <p className="tnum mt-1 text-2xl font-bold text-fg">{k.value}</p>
                <p className="mt-1 text-[10px] text-fg-muted">{k.hint}</p>
              </Card>
            ))}
          </div>

          {data.unmeasured > 0 && (
            <Card padding="sm" tint="warn">
              <p className="text-xs leading-relaxed text-fg">
                <span className="tnum font-semibold">{data.unmeasured}</span> تسک انجام‌شده سنجیده نشده‌اند، چون زمان
                تحویلشان ثبت نشده است (این زمان از ۴ شهریور ثبت می‌شود). تاریخ تأیید را جای آن نگذاشتیم: آن تاریخ مدت انتظار
                در صف بررسی را هم شامل می‌شود و تأخیرِ بررسی‌کننده را به حساب کارمند می‌نوشت.
              </p>
            </Card>
          )}

          {people.length === 0 ? (
            <Card className="py-16 text-center"><p className="text-sm text-fg-muted">در این بازه تسکی با سررسید گذشته نیست</p></Card>
          ) : (
            <>
              <Card>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-fg">به تفکیک نفر</h2>
                  <div className="flex gap-1">
                    {SORTS.map((s) => (
                      <button key={s.key} onClick={() => setSort(s.key)}
                        className={`cursor-pointer rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                          sort === s.key ? 'bg-pill text-pill-fg' : 'bg-sunken text-fg-secondary hover:text-fg'}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* LTR container: recharts anchors axis text itself, and the
                    page's RTL direction otherwise lays names over the bars. */}
                <div dir="ltr">
                  <ResponsiveContainer width="100%" height={Math.max(160, people.length * 36)}>
                    <BarChart data={people} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={c.grid} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: c.axis }} tickLine={false} axisLine={false} allowDecimals={false}
                        unit={sort === 'lateRate' ? '%' : ''} />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: c.axis }} tickLine={false} axisLine={false} />
                      <Tooltip content={<Tip />} cursor={{ fill: c.grid, opacity: 0.3 }} />
                      <Bar dataKey={chartKey} name={chartLabel} radius={[0, 4, 4, 0]}>
                        {people.map((p) => (
                          <Cell key={p.id} fill={person === null || person === p.id ? c.bad : c.grid}
                            cursor="pointer" onClick={() => setPerson(person === p.id ? null : p.id)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-fg-muted">
                        <th className="px-2 py-2 text-right font-medium">نفر</th>
                        <th className="px-2 py-2 text-center font-medium">سنجیده</th>
                        <th className="px-2 py-2 text-center font-medium">تأخیر</th>
                        <th className="px-2 py-2 text-center font-medium">نرخ</th>
                        <th className="px-2 py-2 text-center font-medium">میانگین تأخیر</th>
                        <th className="px-2 py-2 text-center font-medium">روزهای عقب‌بودن</th>
                        <th className="px-2 py-2 text-center font-medium">بیشترین</th>
                        <th className="px-2 py-2 text-center font-medium">باز و دیرکرد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {people.map((p) => (
                        <tr key={p.id} onClick={() => setPerson(person === p.id ? null : p.id)}
                          className={`cursor-pointer border-t border-line transition-colors hover:bg-hover ${person === p.id ? 'bg-hover' : ''}`}>
                          <td className="px-2 py-2 text-fg">{p.name}</td>
                          <td className="tnum px-2 py-2 text-center text-fg-secondary">{p.measured}</td>
                          <td className="tnum px-2 py-2 text-center text-fg">{p.late}</td>
                          <td className="tnum px-2 py-2 text-center">
                            <Badge tone={!p.lateRate ? 'ok' : p.lateRate < 20 ? 'warn' : 'bad'}>{p.lateRate ?? 0}%</Badge>
                          </td>
                          <td className="tnum px-2 py-2 text-center font-semibold text-fg">{p.avgLateDays}</td>
                          <td className="tnum px-2 py-2 text-center text-fg-secondary">{p.daysBehind || '—'}</td>
                          <td className="tnum px-2 py-2 text-center text-fg-secondary">{p.maxLateDays}</td>
                          <td className="tnum px-2 py-2 text-center text-fg-secondary">{p.openOverdue || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[10px] text-fg-muted">
                  روی یک نفر بزنید تا فهرست پایین فقط تسک‌های دیر همان نفر را نشان دهد. تأخیر یعنی تحویل بعد از روز سررسید؛
                  زمانِ انتظار در صف بررسی به حساب کارمند نوشته نمی‌شود. «روزهای عقب‌بودن» یعنی قدیمی‌ترین تسکِ دیری که
                  هنوز باز است چند روز پیش سررسیدش گذشته.
                </p>
              </Card>

              <Card>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-fg">
                    تسک‌های دیر
                    {person !== null && (
                      <button onClick={() => setPerson(null)}
                        className="mr-2 cursor-pointer rounded-full bg-sunken px-2.5 py-1 text-[10px] font-normal text-fg-secondary transition-colors hover:text-fg">
                        حذف فیلتر
                      </button>
                    )}
                  </h2>
                  <span className="tnum text-[11px] text-fg-muted">{items.length} مورد</span>
                </div>
                {items.length === 0 ? (
                  <p className="py-8 text-center text-xs text-fg-muted">تأخیری ثبت نشده است</p>
                ) : (
                  <div className="max-h-[520px] space-y-1.5 overflow-auto">
                    {items.map((i, idx) => (
                      <div key={`${i.taskId}-${i.employee.id}-${idx}`} className="flex flex-wrap items-center gap-2 rounded-tile bg-sunken px-3.5 py-2.5">
                        <span className="tnum w-14 shrink-0 text-center text-sm font-bold text-bad">{i.daysLate} روز</span>
                        <Link href={`/dashboard/tasks/${i.taskId}`}
                          className="min-w-0 flex-1 truncate text-xs font-medium text-fg transition-colors hover:text-brand-ink">
                          {i.title}
                        </Link>
                        <Badge tone="neutral">{i.project.name}</Badge>
                        {i.stillOpen && <Badge tone="bad">هنوز باز</Badge>}
                        <span className="text-[10px] text-fg-muted">{i.employee.name}</span>
                        <span className="tnum text-[10px] text-fg-muted">
                          سررسید {gregorianToShamsi(i.due)} · {i.stillOpen ? 'تا امروز' : `تحویل ${gregorianToShamsi(i.finishedOn)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
