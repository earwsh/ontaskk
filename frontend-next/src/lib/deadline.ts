/**
 * The single definition of "دیرکرد" (overdue) for the UI. Mirrors
 * backend/src/lib/deadline.ts — the two must agree or a card and the
 * analytics behind it will show different numbers for the same tasks.
 *
 * Rule: overdue only once the deadline day has fully passed. A task due
 * today is never overdue.
 *
 * A task waiting on a reviewer is measured against the moment it was handed
 * over, not against today. Once the work is submitted the assignee can do
 * nothing about the clock, so the wait belongs to the reviewer — but a task
 * that was already late when it was submitted stays late.
 *
 * The deadline's day is read in UTC because deadlines are stored pinned to
 * UTC midnight (some legacy rows sit at 23:59:59.999 of the same date, and
 * reading those in local time pushed them to the next day for a Tehran
 * viewer). "Today" is read in Tehran, the calendar the users work in, so the
 * answer does not depend on the viewer's device timezone.
 */
export const APP_TIMEZONE = 'Asia/Tehran';

/** Statuses where the work is done and someone else is holding the task. */
export const REVIEW_STATUSES = ['PENDING_QC', 'PENDING_APPROVAL'];

export function isAwaitingReview(status?: string | null): boolean {
  return !!status && REVIEW_STATUSES.includes(status);
}

function dayIndexInZone(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return Math.floor(Date.UTC(get('year'), get('month') - 1, get('day')) / 86400000);
}

function asDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Days until the deadline; negative means overdue, 0 means due today. */
export function daysTo(deadline: string | null): number | null {
  const d = asDate(deadline);
  if (!d) return null;
  return dayIndexInZone(d, 'UTC') - dayIndexInZone(new Date(), APP_TIMEZONE);
}

/** The shape every overdue check needs. Anything task-like satisfies it. */
export interface DeadlineTask {
  deadline?: string | null;
  status?: string | null;
  submittedForReviewAt?: string | null;
}

/**
 * Whether a task counts as دیرکرد.
 *
 * Takes the task rather than loose arguments because the previous signature
 * invited callers to write `(daysTo(t.deadline) ?? 1) < 0` inline instead —
 * which is how twenty copies of the raw rule got scattered across the pages,
 * every one of them ignoring status.
 */
export function isOverdue(task: DeadlineTask | null | undefined): boolean {
  if (!task || task.status === 'DONE') return false;
  const due = asDate(task.deadline);
  if (!due) return false;

  if (isAwaitingReview(task.status)) {
    const handover = asDate(task.submittedForReviewAt);
    if (!handover) return false;
    return dayIndexInZone(due, 'UTC') < dayIndexInZone(handover, APP_TIMEZONE);
  }

  return dayIndexInZone(due, 'UTC') < dayIndexInZone(new Date(), APP_TIMEZONE);
}

/** Whole days a task has been sitting in a review queue, or null. */
export function daysAwaitingReview(task: DeadlineTask | null | undefined): number | null {
  if (!task || !isAwaitingReview(task.status)) return null;
  const handover = asDate(task.submittedForReviewAt);
  if (!handover) return null;
  return dayIndexInZone(new Date(), APP_TIMEZONE) - dayIndexInZone(handover, APP_TIMEZONE);
}
