import { getPersianDateInfo, getPersianWeekday } from '../lib/jalaali';

/**
 * Which calendar days a recurring task falls on.
 *
 * The single definition of the recurrence rule, kept pure so it can be tested
 * and reasoned about without touching the database.
 */

export interface RecurrenceSpec {
  recurrencePattern?: string | null;
  recurrenceDays?: string | null;
  recurrenceEnd?: Date | null;
  startDate?: Date | null;
  createdAt?: Date;
}

/**
 * How far ahead occurrences are created when the user sets no end date.
 * Without a bound, "repeat daily forever" would try to write an unbounded
 * number of rows; the scheduler tops this window up as time passes.
 */
export const DEFAULT_HORIZON_DAYS = 120;

/** Hard ceiling, so a malformed or very long range cannot flood the table. */
export const MAX_OCCURRENCES = 400;

/**
 * Calendar days are pinned to UTC midnight, matching how every other task
 * deadline is already stored and how the overdue rule reads them. Building
 * them in the server's local timezone made the stored day depend on where the
 * process happened to run — the same fragility that put a task due today into
 * the overdue column.
 */
const dayStart = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

function parseDays(raw?: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(Number).filter((n) => !Number.isNaN(n)) : [];
  } catch {
    return [];
  }
}

/** Does this recurrence fall on the given day? */
export function fallsOn(spec: RecurrenceSpec, date: Date): boolean {
  const persian = getPersianDateInfo(date);

  switch (spec.recurrencePattern) {
    case 'DAILY':
      return true;

    case 'WEEKLY': {
      const days = parseDays(spec.recurrenceDays);
      if (days.length === 0) {
        // No weekday chosen: repeat on the same weekday the task starts on.
        const base = spec.startDate ?? spec.createdAt ?? date;
        return persian.weekday === getPersianWeekday(new Date(base));
      }
      return days.includes(persian.weekday);
    }

    case 'MONTHLY_DAYS':
      return parseDays(spec.recurrenceDays).includes(persian.jd);

    case 'ODD_DAYS':
      return persian.isOddDay;

    case 'EVEN_DAYS':
      return persian.isEvenDay;

    default:
      return false;
  }
}

/**
 * Every day the task recurs on, within the window.
 *
 * Occurrences are produced for the whole schedule up front rather than one day
 * at a time. Generating lazily meant a repeat that had not been reached yet
 * simply did not exist, so nobody could see or plan the upcoming work — and
 * any day the generator did not run produced nothing at all.
 */
export function occurrenceDates(
  spec: RecurrenceSpec,
  opts: { from?: Date; horizonDays?: number; max?: number } = {}
): Date[] {
  const horizon = opts.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const max = opts.max ?? MAX_OCCURRENCES;

  // Start from the task's own start date when it is in the future, so a
  // schedule that begins next month does not back-fill today.
  const requested = dayStart(opts.from ?? new Date());
  const specStart = spec.startDate ? dayStart(spec.startDate) : null;
  const cursor = specStart && specStart > requested ? new Date(specStart) : new Date(requested);

  const horizonEnd = dayStart(new Date(requested.getTime() + horizon * 86400000));
  const end = spec.recurrenceEnd
    ? new Date(Math.min(dayStart(spec.recurrenceEnd).getTime(), horizonEnd.getTime()))
    : horizonEnd;

  const out: Date[] = [];
  while (cursor <= end && out.length < max) {
    if (fallsOn(spec, cursor)) out.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * The deadline an occurrence carries: its own day, stored the same way the
 * rest of the table stores deadlines (UTC midnight of that date).
 */
export function occurrenceDeadline(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Last instant of the day, for range queries. */
export function endOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}
