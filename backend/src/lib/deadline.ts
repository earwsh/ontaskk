/**
 * The single definition of "دیرکرد" (overdue) for the whole backend.
 *
 * Before this existed there were eight copies of the rule and two of them
 * compared raw timestamps (`new Date(deadline) < new Date()`). Because a
 * deadline is stored at midnight, that made every task due *today* overdue
 * from one second past midnight — on live data it reported 51 overdue tasks
 * where only 25 had actually slipped.
 *
 * The rule: a task is overdue once its deadline day is strictly in the past,
 * i.e. a full calendar day has passed. A task due today is never overdue.
 *
 * Work waiting on a reviewer is measured against the moment it was handed
 * over, not against today. Once someone submits their work they can do
 * nothing more about the clock, so review time must not accumulate against
 * them — while a task that was *already* late when it was submitted stays
 * late, because that delay was real. On live data this was worth 57 tasks
 * across 13 projects: they were reported as employee lateness when they were
 * actually an approval queue nobody was looking at.
 *
 * Two different clocks are deliberately used:
 *  - the deadline's own day is read in UTC, because deadlines are stored as a
 *    calendar date pinned to UTC midnight (a few legacy rows sit at 23:59:59.999
 *    of the same date, and reading them in UTC keeps them on the right day);
 *  - "today" is read in Tehran, because that is the calendar the users live in.
 *    The server runs in UTC, so without this the two disagree for the 3.5 hours
 *    after Tehran midnight.
 */
export const APP_TIMEZONE = 'Asia/Tehran';

/** Statuses where the work is done and someone else holds the task. */
export const REVIEW_STATUSES = ['PENDING_QC', 'PENDING_APPROVAL'] as const;

export function isAwaitingReview(status: string): boolean {
  return (REVIEW_STATUSES as readonly string[]).includes(status);
}

/** Days since the epoch for a timestamp's calendar day in the given zone. */
function dayIndexInZone(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return Math.floor(Date.UTC(get('year'), get('month') - 1, get('day')) / 86400000);
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Whole days from today until the deadline. Negative means overdue,
 * 0 means due today, null means no deadline.
 */
export function daysUntilDeadline(deadline: Date | string | null | undefined): number | null {
  const d = asDate(deadline);
  if (!d) return null;
  return dayIndexInZone(d, 'UTC') - dayIndexInZone(new Date(), APP_TIMEZONE);
}

/**
 * A task is overdue only after its deadline day has fully passed.
 *
 * @param submittedForReviewAt When the task entered review. Only consulted
 *   for review statuses, where it freezes the clock. Absent on rows that
 *   predate the field, and there the task is simply not counted as overdue —
 *   guessing a handover date would invent lateness that may never have happened.
 */
export function isTaskOverdue(
  deadline: Date | string | null | undefined,
  status: string,
  submittedForReviewAt?: Date | string | null
): boolean {
  if (status === 'DONE' || !deadline) return false;
  const d = asDate(deadline);
  if (!d) return false;

  if (isAwaitingReview(status)) {
    const handover = asDate(submittedForReviewAt);
    if (!handover) return false;
    return dayIndexInZone(d, 'UTC') < dayIndexInZone(handover, APP_TIMEZONE);
  }

  return dayIndexInZone(d, 'UTC') < dayIndexInZone(new Date(), APP_TIMEZONE);
}

/**
 * Whole days a task has been sitting in review. Null when it is not in
 * review, or when the handover moment was never recorded.
 */
export function daysAwaitingReview(
  status: string,
  submittedForReviewAt: Date | string | null | undefined
): number | null {
  if (!isAwaitingReview(status)) return null;
  const handover = asDate(submittedForReviewAt);
  if (!handover) return null;
  return dayIndexInZone(new Date(), APP_TIMEZONE) - dayIndexInZone(handover, APP_TIMEZONE);
}
