'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, ComposedChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import Card from '@/components/ui/Card';
import Skeleton from '@/components/ui/Skeleton';
import { useChartColors } from '@/lib/chartColors';
import { gregorianToShamsi } from '@/lib/date';
import { describeRequestError } from '@/lib/requestError';
import { useToast } from '@/components/Toast';
import api from '@/lib/api';

type Point = { day: string; done: number; minutes: number; weekend: boolean };
type Person = {
  id: number; name: string; done: number; minutes: number;
  reworkMinutes: number; reviews: number; reviewMinutes: number; netMinutes: number;
  perWorkingDay: number; utilisation: number; netUtilisation: number;
};
type Payload = {
  series: Point[];
  capacity: { minutesPerDay: number; workingDays: number; personDays: number };
  people: Person[];
  totals: {
    done: number; minutes: number; workingDays: number;
    donePerWorkingDay: number; minutesPerWorkingDay: number;
  };
};

const RANGES = [
  { days: 14, label: '۲ هفته' },
  { days: 30, label: '۱ ماه' },
  { days: 90, label: '۳ ماه' },
];

const hours = (m: number) => Math.round((m / 60) * 10) / 10;

function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as Point;
  return (
    <div className="rounded-tile bg-card px-3.5 py-2.5 text-xs shadow-float">
      <div className="mb-1 text-sm font-medium text-fg">
        {label}{p.weekend && <span className="mr-1.5 text-[10px] text-fg-muted">جمعه</span>}
      </div>
      <div className="tnum text-fg-secondary">{p.done} تسک</div>
      <div className="tnum text-fg-muted">{hours(p.minutes)} ساعت برآوردشده</div>
    </div>
  );
}

export default function DailyRatePage() {
  const { showToast } = useToast();
  const c = useChartColors();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    setData(null);
    api.get(`/analytics/daily-rate?days=${days}`)
      .then(({ data }) => setData(data))
      .catch((err) => { showToast(describeRequestError(err, 'دریافت نرخ روزانه'), 'error'); setData(null); });
  }, [days, showToast]);

  const chart = useMemo(
    () => (data?.series ?? []).map((p) => ({ ...p, label: gregorianToShamsi(p.day), hours: hours(p.minutes) })),
    [data]
  );

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
        <div className="space-y-3"><Skeleton className="h-24 rounded-card" /><Skeleton className="h-80 rounded-card" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'تسک در هر روز کاری', value: data.totals.donePerWorkingDay, hint: 'جمعه‌ها حساب نشده‌اند' },
              { label: 'ساعت در هر روز کاری', value: hours(data.totals.minutesPerWorkingDay), hint: 'بر اساس برآورد تسک‌ها' },
              { label: 'کل تسک‌های تمام‌شده', value: data.totals.done, hint: `در ${days} روز` },
              {
                label: 'معادل نفر-روز',
                value: data.capacity.personDays,
                hint: `هر روز کاری ${data.capacity.minutesPerDay} دقیقه`,
              },
            ].map((k) => (
              <Card key={k.label} padding="sm">
                <p className="text-[11px] text-fg-secondary">{k.label}</p>
                <p className="tnum mt-1 text-2xl font-bold text-fg">{k.value}</p>
                <p className="mt-1 text-[10px] text-fg-muted">{k.hint}</p>
              </Card>
            ))}
          </div>

          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-fg">بهره‌وری هر نفر</h2>
              <span className="text-[11px] text-fg-muted">
                ظرفیت هر نفر: {data.capacity.workingDays} روز کاری × {data.capacity.minutesPerDay} دقیقه
              </span>
            </div>
            {data.people.length === 0 ? (
              <p className="py-8 text-center text-xs text-fg-muted">در این بازه کسی تسکی تمام نکرده است</p>
            ) : (
              <div className="space-y-2.5">
                {data.people.map((p) => (
                  <div key={p.id}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate text-fg">{p.name}</span>
                      <span className="tnum shrink-0 text-fg-muted">
                        {hours(p.netMinutes)} ساعت مفید
                        {p.reworkMinutes > 0 && (
                          <span className="text-bad"> (−{hours(p.reworkMinutes)} اصلاح)</span>
                        )}
                        {p.reviewMinutes > 0 && (
                          <span className="text-ok"> (+{hours(p.reviewMinutes)} بررسی)</span>
                        )}
                        {' · '}{p.done} تسک ·{' '}
                        {/* Useful time over capacity: the same figure the bar draws.
                            Delivered-only utilisation read 5% for a reviewer whose
                            bar showed 22%. */}
                        <span className={p.netUtilisation > 100 ? 'font-semibold text-bad' : 'text-fg-secondary'}>
                          {p.netUtilisation}%
                        </span>
                      </span>
                    </div>
                    {/* One bar, two parts: the useful share solid, the rework
                        on top of it in red, so the cost sits inside the same
                        length rather than in a second chart. */}
                    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-sunken">
                      <div
                        className={`h-full ${p.netUtilisation > 100 ? 'bg-bad' : 'bg-brand'}`}
                        style={{ width: `${Math.min(100, p.netUtilisation)}%` }}
                      />
                      {/* Rework drawn beside the useful share, faded: time that
                          was spent but does not count, sized on the same capacity. */}
                      {p.reworkMinutes > 0 && (
                        <div
                          className="h-full bg-bad opacity-45"
                          style={{
                            width: `${Math.max(0, Math.min(
                              100 - Math.min(100, p.netUtilisation),
                              Math.round((p.reworkMinutes / Math.max(1, data.capacity.workingDays * data.capacity.minutesPerDay)) * 100)
                            ))}%`,
                          }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-[11px] text-fg-muted">
              «ساعت مفید» یعنی زمان تسک‌های تمام‌شده، منهای زمانی که صرف اصلاح کارهای برگشتی شده، به‌علاوهٔ زمان بررسی کار
              دیگران (هر بررسی کیفیت ۱۵٪ و هر تأیید نهایی ۵٪ برآورد تسک) — همان فرمول کارنامهٔ ماهانه.
              درصد، کل زمان تحویل‌شده تقسیم بر ظرفیت همان فرد در این بازه است؛ بالای ۱۰۰٪ یا اضافه‌کاری
              است یا برآوردها با واقعیت نمی‌خواند.
            </p>
          </Card>

          <Card>
            <h2 className="mb-4 text-sm font-semibold text-fg">تسک تمام‌شده در هر روز</h2>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chart} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: c.axis }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: c.axis }} tickLine={false} axisLine={false} />
                <Tooltip content={<Tip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {/* Fridays are drawn faded rather than hidden: the gap is part
                    of the picture, but it must not read as an idle workday. */}
                <Bar dataKey="done" name="تسک" radius={[4, 4, 0, 0]}>
                  {chart.map((p, i) => (
                    <Cell key={i} fill={p.weekend ? c.grid : c.brand} />
                  ))}
                </Bar>
                <Line type="monotone" dataKey="hours" name="ساعت برآوردشده" stroke={c.violet} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="mt-3 text-[11px] text-fg-muted">
              ستون کم‌رنگ یعنی جمعه. میانگین‌های بالا جمعه‌ها را حساب نمی‌کنند، وگرنه نرخ روز کاری کمتر از واقعیت نشان داده می‌شود.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
