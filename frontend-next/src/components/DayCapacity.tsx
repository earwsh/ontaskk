'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { gregorianToShamsi } from '@/lib/date';

type Load = { id: number; minutes: number; tasks: number };

type DayCapacityProps = {
  /** The day the work lands on — the task's deadline, as YYYY-MM-DD. */
  date: string;
  assigneeIds: number[];
  /** Names to show, keyed by user id. */
  nameOf: (id: number) => string;
  /** Minutes this task will add, so the warning fires before it is saved. */
  addingMinutes: number;
  /** When editing, the task whose own minutes must not be counted twice. */
  excludeTaskId?: number;
};

const hhmm = (m: number) => {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} دقیقه`;
  return r ? `${h} ساعت و ${r} دقیقه` : `${h} ساعت`;
};

/**
 * What each assignee already owes on the day this task is due.
 *
 * Weight is minutes and a working day is 480, so the arithmetic was always
 * available — nobody was ever shown it. On live data one person is carrying
 * 2,130 minutes against a single deadline, four and a half working days of
 * work, which only becomes visible once somebody adds it up.
 */
export default function DayCapacity({
  date, assigneeIds, nameOf, addingMinutes, excludeTaskId,
}: DayCapacityProps) {
  const [loads, setLoads] = useState<Load[] | null>(null);
  const [perDay, setPerDay] = useState(480);

  useEffect(() => {
    if (!date || assigneeIds.length === 0) { setLoads(null); return; }
    let cancelled = false;
    const params = new URLSearchParams({ date, userIds: assigneeIds.join(',') });
    if (excludeTaskId) params.set('excludeTaskId', String(excludeTaskId));
    api.get(`/tasks/day-load?${params}`)
      .then(({ data }) => {
        if (cancelled) return;
        setLoads(data.people);
        if (data.minutesPerDay) setPerDay(data.minutesPerDay);
      })
      .catch(() => { if (!cancelled) setLoads(null); });
    return () => { cancelled = true; };
  }, [date, assigneeIds, excludeTaskId]);

  if (!date || assigneeIds.length === 0 || !loads) return null;

  const over = loads.filter((l) => l.minutes + addingMinutes > perDay);

  return (
    <div className="mt-3 rounded-tile bg-sunken px-3.5 py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-fg-secondary">
          بار کاری {gregorianToShamsi(date)}
        </p>
        <p className="text-[10px] text-fg-muted">ظرفیت هر نفر {hhmm(perDay)}</p>
      </div>

      <div className="space-y-2">
        {loads.map((l) => {
          const total = l.minutes + addingMinutes;
          const pct = Math.round((total / perDay) * 100);
          const isOver = total > perDay;
          return (
            <div key={l.id}>
              <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate text-fg">{nameOf(l.id)}</span>
                <span className="tnum shrink-0 text-fg-muted">
                  {hhmm(total)}
                  {addingMinutes > 0 && <span className="text-fg-muted"> (با این تسک)</span>}
                  {' · '}
                  <span className={isOver ? 'font-semibold text-bad' : 'text-fg-secondary'}>{pct}%</span>
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-card">
                <div
                  className={`h-full rounded-full ${isOver ? 'bg-bad' : 'bg-brand'}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {over.length > 0 && (
        <p className="mt-2.5 text-[11px] font-medium leading-relaxed text-bad">
          {over.length === 1
            ? `${nameOf(over[0]!.id)} با این تسک از ظرفیت آن روز رد می‌شود.`
            : `${over.length} نفر با این تسک از ظرفیت آن روز رد می‌شوند.`}
          {' '}می‌توانید سررسید را جابه‌جا کنید یا تسک را به کس دیگری بدهید.
        </p>
      )}
    </div>
  );
}
