import { toGregorian, toJalaali } from 'jalaali-js';

/**
 * Dates in this app come in two shapes, and they must not be formatted the
 * same way.
 *
 *  1. **Calendar dates** — deadlines, birth dates, start dates. Stored pinned
 *     to UTC midnight, so the correct day is the one you read in UTC. This is
 *     the same rule `lib/deadline.ts` uses, and the two have to agree.
 *
 *  2. **Instants** — approvedAt, qcAt, createdAt, message times. A real moment
 *     in time, which must be shown in the reader's calendar and clock.
 *
 * Formatting an instant as if it were a calendar date is what made a task
 * approved at 16:15 Tehran display as 12:45: the raw ISO string was split on
 * "T" and its UTC clock shown untouched, three and a half hours behind. Past
 * 20:30 Tehran the same bug moves the *date* back a day too.
 */
export const APP_TIMEZONE = 'Asia/Tehran';

export function shamsiToGregorian(str: string): string {
  const parts = str.split('/').map(Number);
  if (parts.length !== 3) return str;
  const [jy, jm, jd] = parts;
  const g = toGregorian(jy, jm, jd);
  const year = g.gy;
  const month = String(g.gm).padStart(2, '0');
  const day = String(g.gd).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * A calendar date (shape 1) as Jalali. Reads the day in UTC on purpose —
 * do not use this for a timestamp; use {@link jalaliDate} for that.
 */
export function gregorianToShamsi(dateStr: string): string {
  if (!dateStr) return '';
  const cleanDateStr = dateStr.split('T')[0];
  const parts = cleanDateStr.split('-').map(Number);
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    const j = toJalaali(parts[0], parts[1], parts[2]);
    return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
  }
  const d = new Date(dateStr);
  const j = toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
}

/** Wall-clock parts of an instant in Tehran, whatever the viewer's device says. */
function tehranParts(value: string | Date): { y: number; m: number; d: number; hh: string; mm: string } | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  // Some engines render midnight as hour 24 with hour12:false.
  const hour = get('hour') === '24' ? '00' : get('hour');
  return { y: Number(get('year')), m: Number(get('month')), d: Number(get('day')), hh: hour, mm: get('minute') };
}

/** An instant (shape 2) as a Jalali date, in Tehran. */
export function jalaliDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const p = tehranParts(value);
  if (!p) return '—';
  const j = toJalaali(p.y, p.m, p.d);
  return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
}

/** An instant as `1405/06/16 16:15`, in Tehran. */
export function jalaliDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const p = tehranParts(value);
  if (!p) return '—';
  return `${jalaliDate(value)} ${p.hh}:${p.mm}`;
}

/** Just the clock, in Tehran — for chat bubbles and other dense lists. */
export function clockTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  const p = tehranParts(value);
  return p ? `${p.hh}:${p.mm}` : '';
}

export function todayShamsi(): string {
  return jalaliDate(new Date());
}
