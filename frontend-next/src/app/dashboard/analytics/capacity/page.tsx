'use client';

import { useEffect, useMemo, useState } from 'react';
import Card from '@/components/ui/Card';
import Skeleton from '@/components/ui/Skeleton';
import { gregorianToShamsi } from '@/lib/date';
import { describeRequestError } from '@/lib/requestError';
import { useToast } from '@/components/Toast';
import api from '@/lib/api';

type Cell = { day: string; minutes: number; tasks: number };
type Row = { id: number; name: string; days: Cell[]; overDays: number; totalMinutes: number };
type Payload = {
  minutesPerDay: number;
  days: { day: string; weekend: boolean }[];
  people: Row[];
};

const RANGES = [
  { days: 7, offset: 0, label: '۷ روز آینده' },
  { days: 14, offset: 0, label: '۱۴ روز آینده' },
  { days: 30, offset: 0, label: '۳۰ روز آینده' },
  { days: 14, offset: -7, label: 'هفته گذشته و پیش رو' },
];

const hhmm = (m: number) => {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r}د`;
  return r ? `${h}:${String(r).padStart(2, '0')}` : `${h}س`;
};

/** Day-of-week letter, so a column is readable without reading the date. */
const WEEKDAY = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'];
const weekdayOf = (iso: string) => WEEKDAY[new Date(`${iso}T12:00:00Z`).getUTCDay()];

export default function CapacityPage() {
  const { showToast } = useToast();
  const [rangeIdx, setRangeIdx] = useState(1);
  const [data, setData] = useState<Payload | null>(null);

  const range = RANGES[rangeIdx]!;

  useEffect(() => {
    setData(null);
    api.get(`/analytics/capacity?days=${range.days}&offset=${range.offset}`)
      .then(({ data }) => setData(data))
      .catch((err) => { showToast(describeRequestError(err, 'دریافت ظرفیت روزانه'), 'error'); setData(null); });
  }, [range.days, range.offset, showToast]);

  const totals = useMemo(() => {
    if (!data) return null;
    const over = data.people.reduce((s, p) => s + p.overDays, 0);
    const peopleOver = data.people.filter((p) => p.overDays > 0).length;
    return { over, peopleOver };
  }, [data]);

  /**
   * Colour by how full the day is. Grey means nothing is due, which is not the
   * same as "free" — it is simply a day with no deadline on it.
   */
  const tone = (minutes: number, perDay: number) => {
    if (minutes === 0) return 'bg-sunken';
    const pct = (minutes / perDay) * 100;
    if (pct > 100) return 'bg-bad text-white';
    if (pct >= 80) return 'bg-warn-soft text-warn';
    return 'bg-ok-soft text-ok';
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2 pb-1">
        <div className="flex flex-wrap gap-1 rounded-full bg-card p-1 shadow-flat">
          {RANGES.map((r, i) => (
            <button key={r.label} onClick={() => setRangeIdx(i)}
              className={`cursor-pointer whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                rangeIdx === i ? 'bg-pill text-pill-fg' : 'text-fg-secondary hover:text-fg'
              }`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <Skeleton className="h-96 rounded-card" />
      ) : data.people.length === 0 ? (
        <Card className="py-16 text-center">
          <p className="text-sm text-fg-muted">در این بازه تسکی با سررسید ثبت نشده است</p>
        </Card>
      ) : (
        <>
          {totals && totals.peopleOver > 0 && (
            <Card padding="sm" tint="bad">
              <p className="text-xs leading-relaxed text-fg">
                <span className="tnum font-semibold">{totals.peopleOver}</span> نفر روی{' '}
                <span className="tnum font-semibold">{totals.over}</span> روز بیشتر از ظرفیت
                ({data.minutesPerDay} دقیقه) کار دارند.
              </p>
            </Card>
          )}

          <Card padding="sm">
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-y-1 text-[11px]">
                <thead>
                  <tr>
                    <th className="sticky right-0 z-10 bg-card px-2 pb-2 text-right font-medium text-fg-secondary">
                      نفر
                    </th>
                    {data.days.map((d) => (
                      <th key={d.day} className="px-0.5 pb-2 text-center font-normal">
                        <div className={d.weekend ? 'text-fg-muted' : 'text-fg-secondary'}>{weekdayOf(d.day)}</div>
                        <div className="tnum text-[9px] text-fg-muted">{gregorianToShamsi(d.day).slice(5)}</div>
                      </th>
                    ))}
                    <th className="px-2 pb-2 text-center font-medium text-fg-secondary">جمع</th>
                  </tr>
                </thead>
                <tbody>
                  {data.people.map((p) => (
                    <tr key={p.id}>
                      <td className="sticky right-0 z-10 max-w-[9rem] truncate bg-card px-2 text-fg" title={p.name}>
                        {p.name}
                        {p.overDays > 0 && (
                          <span className="tnum mr-1.5 rounded-full bg-bad-soft px-1.5 text-[9px] font-medium text-bad">
                            {p.overDays}
                          </span>
                        )}
                      </td>
                      {p.days.map((c) => (
                        <td key={c.day} className="px-0.5">
                          <div
                            title={`${gregorianToShamsi(c.day)} — ${c.tasks} تسک، ${c.minutes} دقیقه`}
                            className={`tnum flex h-7 min-w-[2.1rem] items-center justify-center rounded-tile text-[10px] font-medium ${tone(c.minutes, data.minutesPerDay)}`}
                          >
                            {c.minutes ? hhmm(c.minutes) : ''}
                          </div>
                        </td>
                      ))}
                      <td className="tnum px-2 text-center font-medium text-fg-secondary">
                        {/* A row with deadlines but no estimates has nothing to add up. */}
                        {p.totalMinutes ? hhmm(p.totalMinutes) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-fg-muted">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded bg-sunken" /> بدون سررسید</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded bg-ok-soft" /> زیر ۸۰٪</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded bg-warn-soft" /> ۸۰ تا ۱۰۰٪</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded bg-bad" /> بیشتر از ظرفیت</span>
              <span>عدد داخل خانه، مجموع زمان تسک‌هایی است که آن روز سررسید دارند.</span>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
