import prisma from '../lib/prisma';
import { REJECTION_CATEGORIES } from '../lib/rejectionCategories';
import { WORKING_MINUTES_PER_DAY, workingDays, utilisation } from '../lib/capacity';
import { toGregorian, toJalaali } from '../lib/jalaali';
import { JALALI_MONTHS } from './employeeStats';

/** A day in the series, including the ones nobody finished anything on. */
export interface DailyRatePoint {
  day: string;
  done: number;
  minutes: number;
  /** Friday, which is the weekend here and would drag every average down. */
  weekend: boolean;
}

const DAY = 86_400_000;

/**
 * The calendar day in Tehran, which is the working day everywhere else in this
 * app (deadlines, delivery facts, the monthly employee stats all use it).
 *
 * toISOString would have answered in UTC, and Tehran is UTC+3:30 — so local
 * midnight formats as the previous date and every day's work would be filed
 * one day early.
 */
const TEHRAN_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
});
const TEHRAN_WEEKDAY = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', weekday: 'short' });

function isoDay(d: Date): string {
  return TEHRAN_DAY.format(d);
}

/** Friday is the weekend here; an average that divides by it understates a working day. */
function isWeekend(d: Date): boolean {
  return TEHRAN_WEEKDAY.format(d) === 'Fri';
}

/**
 * Completion rate per day.
 *
 * A day with nothing finished has no rows at all, so the series is built from
 * the calendar and filled from the query — otherwise the chart would skip
 * those days and every gap would read as a busy one.
 *
 * Fridays are marked rather than dropped: the chart should show them, but an
 * average that divides by them understates what a working day produces.
 */
export async function dailyRate(days: number, userIds?: number[]) {
  const since = new Date(Date.now() - (days - 1) * DAY);
  since.setHours(0, 0, 0, 0);

  const rows = await prisma.$queryRawUnsafe<{ day: Date; done: bigint; minutes: bigint }[]>(
    `SELECT date_trunc('day', (COALESCE(t."approvedAt", t."updatedAt") AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran') AS day,
            count(DISTINCT t."id")                                     AS done,
            COALESCE(SUM(COALESCE(t."estimatedHours",0) * 60
                       + COALESCE(t."estimatedMinutes",0)), 0)         AS minutes
       FROM "Task" t
       ${userIds?.length ? 'JOIN "TaskAssignee" a ON a."taskId" = t."id"' : ''}
      WHERE t."status" = 'DONE'
        AND NOT (t."isRecurring" = true AND t."recurringParentId" IS NULL)
        AND COALESCE(t."approvedAt", t."updatedAt") >= $1
        ${userIds?.length ? 'AND a."userId" = ANY($2::int[])' : ''}
      GROUP BY 1`,
    ...(userIds?.length ? [since, userIds] : [since])
  );

  // date_trunc already returned a Tehran-local wall time; formatting it again
  // through the Tehran formatter would shift it a second time.
  const byDay = new Map(rows.map((r) => [new Date(r.day).toISOString().slice(0, 10), r]));
  const series: DailyRatePoint[] = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(since.getTime() + i * DAY);
    const key = isoDay(d);
    const hit = byDay.get(key);
    series.push({
      day: key,
      done: hit ? Number(hit.done) : 0,
      minutes: hit ? Number(hit.minutes) : 0,
      weekend: isWeekend(d),
    });
  }

  const working = series.filter((p) => !p.weekend);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const totalMinutes = sum(series.map((p) => p.minutes));

  // Per person, so the org-wide average does not hide someone at 30% next to
  // someone at 160%.
  const [delivered, rework, reviews] = await Promise.all([
    deliveredPerPerson(since, userIds),
    reworkPerPerson(since, userIds),
    // Same rows and the same per-review credit the scorecard uses, so
    // "useful hours" means one thing on both pages.
    reviewRows(isoDay(since), shiftDay(isoDay(new Date()), 1)),
  ]);

  const reviewBy = new Map<number, { count: number; minutes: number }>();
  for (const r of reviews) {
    if (userIds?.length && !userIds.includes(r.byId)) continue;
    const cur = reviewBy.get(r.byId) ?? { count: 0, minutes: 0 };
    cur.count += 1;
    cur.minutes += reviewMinutesFor(r.stage, r.taskMinutes);
    reviewBy.set(r.byId, cur);
  }

  // Someone who only reviewed this period has no delivered row, but their
  // time still belongs on the list.
  const reviewOnlyIds = [...reviewBy.keys()].filter((id) => !delivered.some((d) => d.id === id));
  const reviewOnlyUsers = reviewOnlyIds.length
    ? await prisma.user.findMany({ where: { id: { in: reviewOnlyIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const people = [
    ...delivered,
    ...reviewOnlyUsers.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), done: 0, minutes: 0 })),
  ];

  return {
    series,
    capacity: {
      minutesPerDay: WORKING_MINUTES_PER_DAY,
      workingDays: working.length,
      // What the whole span was worth in one person's days.
      personDays: workingDays(totalMinutes),
    },
    people: people
      .map((p) => {
        const reworkMinutes = rework.get(p.id) ?? 0;
        const reviewMinutes = reviewBy.get(p.id)?.minutes ?? 0;
        // Useful work: what was delivered, less the time spent delivering
        // some of it a second time, plus the time spent reviewing others'.
        // The rework part is floored at zero — a window can contain rework
        // for tasks finished before it opened.
        const netMinutes = Math.max(0, p.minutes - reworkMinutes) + reviewMinutes;
        return {
          ...p,
          reworkMinutes,
          reviews: reviewBy.get(p.id)?.count ?? 0,
          reviewMinutes,
          netMinutes,
          perWorkingDay: working.length ? Math.round(p.minutes / working.length) : 0,
          utilisation: utilisation(p.minutes, working.length),
          netUtilisation: utilisation(netMinutes, working.length),
        };
      })
      .sort((a, b) => b.minutes - a.minutes),
    totals: {
      done: sum(series.map((p) => p.done)),
      minutes: totalMinutes,
      workingDays: working.length,
      // The headline number: what a working day actually produces.
      donePerWorkingDay: working.length ? Math.round((sum(working.map((p) => p.done)) / working.length) * 10) / 10 : 0,
      minutesPerWorkingDay: working.length ? Math.round(sum(working.map((p) => p.minutes)) / working.length) : 0,
    },
  };
}

/**
 * What each person finished in the span.
 *
 * A task with several assignees counts in full for each of them: the question
 * is what that person's days went to, and splitting an estimate between two
 * people would invent a division nobody recorded.
 */
async function deliveredPerPerson(since: Date, userIds?: number[]) {
  const rows = await prisma.$queryRawUnsafe<
    { userId: number; firstName: string; lastName: string; done: bigint; minutes: bigint }[]
  >(
    `SELECT u."id" AS "userId", u."firstName", u."lastName",
            count(DISTINCT t."id")                                  AS done,
            COALESCE(SUM(COALESCE(t."estimatedHours",0) * 60
                       + COALESCE(t."estimatedMinutes",0)), 0)      AS minutes
       FROM "TaskAssignee" a
       JOIN "Task" t ON t."id" = a."taskId"
       JOIN "User" u ON u."id" = a."userId"
      WHERE t."status" = 'DONE'
        AND NOT (t."isRecurring" = true AND t."recurringParentId" IS NULL)
        AND COALESCE(t."approvedAt", t."updatedAt") >= $1
        ${userIds?.length ? 'AND a."userId" = ANY($2::int[])' : ''}
      GROUP BY 1, 2, 3`,
    ...(userIds?.length ? [since, userIds] : [since])
  );
  return rows.map((r) => ({
    id: r.userId,
    name: `${r.firstName} ${r.lastName}`.trim(),
    done: Number(r.done),
    minutes: Number(r.minutes),
  }));
}

/**
 * Who was sent work back, on what, and — where it was recorded — why.
 *
 * One rejection writes a row per assignee, so counting rows answers "how often
 * was this person sent back", which is the question here. The task list is
 * folded by event so the same task is not printed once per colleague.
 */
export async function rejectionAnalytics(days: number) {
  const since = new Date(Date.now() - days * DAY);

  const rows = await prisma.taskRejection.findMany({
    where: { createdAt: { gte: since } },
    select: {
      taskId: true, createdAt: true, reason: true, categories: true, stage: true, reworkMinutes: true,
      user: { select: { id: true, firstName: true, lastName: true } },
      by: { select: { id: true, firstName: true, lastName: true } },
      task: {
        select: {
          id: true, title: true, status: true,
          project: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const name = (u: { firstName: string; lastName: string } | null) =>
    u ? `${u.firstName} ${u.lastName}`.trim() : 'نامشخص';

  const tally = <K extends string | number>(pick: (r: (typeof rows)[number]) => { key: K; label: string } | null) => {
    const m = new Map<K, { key: K; label: string; count: number }>();
    for (const r of rows) {
      const k = pick(r);
      if (!k) continue;
      const cur = m.get(k.key);
      if (cur) cur.count += 1;
      else m.set(k.key, { key: k.key, label: k.label, count: 1 });
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  };

  const categoryLabel = new Map(REJECTION_CATEGORIES.map((c) => [c.key as string, c.label]));

  return {
    events: rows.map((r) => ({
      taskId: r.taskId,
      title: r.task?.title ?? `تسک ${r.taskId}`,
      project: r.task?.project ?? null,
      status: r.task?.status ?? null,
      employee: { id: r.user.id, name: name(r.user) },
      reviewer: r.by ? { id: r.by.id, name: name(r.by) } : null,
      stage: r.stage,
      categories: r.categories,
      categoryLabels: r.categories.map((c) => categoryLabel.get(c) ?? c),
      reworkMinutes: r.reworkMinutes,
      reason: r.reason,
      at: r.createdAt.toISOString(),
    })),
    byEmployee: tally((r) => ({ key: r.user.id, label: name(r.user) })),
    byProject: tally((r) => (r.task?.project ? { key: r.task.project.id, label: r.task.project.name } : null)),
    // A rejection naming two faults counts once under each, so these add up
    // to more than the number of rejections. The page says so rather than
    // hiding it — the question is "how often is artwork the problem", not
    // "how do rejections divide up".
    byCategory: (() => {
      const m = new Map<string, { key: string; label: string; count: number }>();
      for (const r of rows) {
        const keys = r.categories.length ? r.categories : ['UNSET'];
        for (const k of keys) {
          const cur = m.get(k);
          if (cur) cur.count += 1;
          else m.set(k, { key: k, label: k === 'UNSET' ? 'ثبت‌نشده' : categoryLabel.get(k) ?? k, count: 1 });
        }
      }
      return [...m.values()].sort((a, b) => b.count - a.count);
    })(),
    // Daily counts so the page can draw a trend without a second request.
    byDay: (() => {
      const m = new Map<string, number>();
      for (const r of rows) {
        const k = isoDay(r.createdAt);
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return [...m.entries()].map(([day, count]) => ({ day, count })).sort((a, b) => a.day.localeCompare(b.day));
    })(),
  };
}

/**
 * Minutes each person spent redoing work, from the reviewer's estimate.
 *
 * One rejection writes a row per assignee and each row carries the full
 * estimate, matching how the delivered side counts a shared task in full for
 * everyone on it.
 */
async function reworkPerPerson(since: Date, userIds?: number[]) {
  const rows = await prisma.taskRejection.groupBy({
    by: ['userId'],
    where: {
      createdAt: { gte: since },
      reworkMinutes: { not: null },
      ...(userIds?.length ? { userId: { in: userIds } } : {}),
    },
    _sum: { reworkMinutes: true },
  });
  return new Map(rows.map((r) => [r.userId, r._sum.reworkMinutes ?? 0]));
}

export interface CapacityCell {
  day: string;
  minutes: number;
  tasks: number;
}

export interface CapacityRow {
  id: number;
  name: string;
  days: CapacityCell[];
  /** Days in the window where the deadlines already exceed a working day. */
  overDays: number;
  totalMinutes: number;
}

/**
 * Every person's committed minutes, day by day, across a window.
 *
 * The same arithmetic the new-task form shows for one date, laid out for the
 * whole team so the crowding is visible before somebody stumbles into it:
 * one person on live data carries 2,130 minutes against a single deadline,
 * and nothing anywhere said so until a task was being written for that day.
 *
 * Anchored on the deadline because that is the day the work is due; 99% of
 * tasks here start and finish on the same date.
 */
export async function capacityByDay(days: number, startOffset = 0) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setTime(start.getTime() + startOffset * DAY);

  const end = new Date(start.getTime() + days * DAY);

  const rows = await prisma.$queryRawUnsafe<
    { userId: number; firstName: string; lastName: string; day: Date; minutes: bigint; tasks: bigint }[]
  >(
    `SELECT a."userId" AS "userId", u."firstName", u."lastName",
            date_trunc('day', (t."deadline" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran') AS day,
            COALESCE(SUM(COALESCE(t."estimatedHours",0) * 60
                       + COALESCE(t."estimatedMinutes",0)), 0) AS minutes,
            count(DISTINCT t."id") AS tasks
       FROM "TaskAssignee" a
       JOIN "Task" t ON t."id" = a."taskId"
       JOIN "User" u ON u."id" = a."userId"
      WHERE t."deadline" IS NOT NULL
        AND NOT (t."isRecurring" = true AND t."recurringParentId" IS NULL)
        AND ((t."deadline" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran') >= $1
        AND ((t."deadline" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran') < $2
      GROUP BY 1, 2, 3, 4`,
    start,
    end
  );

  const dayKeys: string[] = [];
  for (let i = 0; i < days; i += 1) {
    dayKeys.push(isoDay(new Date(start.getTime() + i * DAY)));
  }

  const byUser = new Map<number, CapacityRow>();
  for (const r of rows) {
    // date_trunc already answered in Tehran wall time.
    const key = new Date(r.day).toISOString().slice(0, 10);
    let row = byUser.get(r.userId);
    if (!row) {
      row = {
        id: r.userId,
        name: `${r.firstName} ${r.lastName}`.trim(),
        days: dayKeys.map((day) => ({ day, minutes: 0, tasks: 0 })),
        overDays: 0,
        totalMinutes: 0,
      };
      byUser.set(r.userId, row);
    }
    const cell = row.days.find((d) => d.day === key);
    if (!cell) continue;
    cell.minutes = Number(r.minutes);
    cell.tasks = Number(r.tasks);
  }

  for (const row of byUser.values()) {
    row.totalMinutes = row.days.reduce((a, d) => a + d.minutes, 0);
    row.overDays = row.days.filter((d) => d.minutes > WORKING_MINUTES_PER_DAY).length;
  }

  return {
    minutesPerDay: WORKING_MINUTES_PER_DAY,
    days: dayKeys.map((day) => ({
      day,
      weekend: isWeekend(new Date(`${day}T12:00:00Z`)),
    })),
    // Busiest first: the rows that need a decision come to the top.
    people: [...byUser.values()].sort((a, b) => b.overDays - a.overDays || b.totalMinutes - a.totalMinutes),
  };
}

/**
 * Who delivers late, how often, and by how many days.
 *
 * The clock rule is the one in lib/deadline.ts, not a new one: a task is late
 * when the day it was handed over — or today, if it is still being worked on —
 * falls after its deadline day. Time waiting in a review queue is never
 * charged to the assignee.
 *
 * A finished task whose handover was never recorded is *unmeasured*, not on
 * time and not late. The column only exists from late August; before that the
 * only date is the approval, which includes however long a reviewer took. On
 * live data substituting it would have marked 365 extra tasks late, all of it
 * reviewer delay written against employees.
 *
 * Tasks are windowed by deadline: "the work that was due in the last N days".
 */
type LateRow = {
  userId: number; firstName: string; lastName: string;
  taskId: number; title: string; status: string;
  projectId: number; projectName: string;
  due: Date; finishedOn: Date | null;
};

/** Calendar date `n` days away from an ISO date, as an ISO date. */
function shiftDay(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

/**
 * Tasks due in [startDay, endDay) whose deadline day has already passed.
 *
 * Timestamps are stored as UTC wall time without a zone, so reading one as a
 * Tehran date takes both conversions (UTC → zone-aware → Tehran). A single
 * `AT TIME ZONE 'Asia/Tehran'` treats the stored value as Tehran time already,
 * which files a handover made after midnight Tehran onto the previous day.
 */
async function latenessRows(startDay: string, endDay: string): Promise<LateRow[]> {
  return prisma.$queryRawUnsafe<LateRow[]>(
    `WITH today AS (SELECT (now() AT TIME ZONE 'Asia/Tehran')::date AS d)
     SELECT a."userId" AS "userId", u."firstName", u."lastName",
            t.id AS "taskId", t.title, t.status::text AS status,
            p.id AS "projectId", p.name AS "projectName",
            t.deadline::date AS due,
            CASE
              WHEN t.status IN ('DONE', 'PENDING_QC', 'PENDING_APPROVAL')
                THEN ((t."submittedForReviewAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran')::date
              ELSE today.d
            END AS "finishedOn"
       FROM "TaskAssignee" a
       JOIN "Task" t    ON t.id = a."taskId"
       JOIN "User" u    ON u.id = a."userId"
       JOIN "Project" p ON p.id = t."projectId"
       CROSS JOIN today
      WHERE t.deadline IS NOT NULL
        AND NOT (t."isRecurring" = true AND t."recurringParentId" IS NULL)
        AND t.deadline::date >= $1::date
        AND t.deadline::date < LEAST($2::date, today.d)`,
    startDay,
    endDay
  );
}

type LatePerson = {
  id: number; name: string;
  measured: number; late: number; lateDays: number; maxLateDays: number;
  openOverdue: number; unmeasured: number;
  /** Calendar days since the oldest still-open late task fell due. */
  daysBehind: number;
};

/**
 * The lateness rule applied to rows, in one place, so the lateness page and
 * the monthly scorecard can never disagree about who was late.
 */
function aggregateLateness(rows: LateRow[]) {
  const dayDiff = (a: Date, b: Date) => Math.round((new Date(a).getTime() - new Date(b).getTime()) / DAY);
  const people = new Map<number, LatePerson>();
  const lateItems: {
    taskId: number; title: string; project: { id: number; name: string };
    employee: { id: number; name: string }; due: string; finishedOn: string;
    daysLate: number; stillOpen: boolean; status: string;
  }[] = [];
  let unmeasured = 0;

  // Occurrences of a recurring series are ordinary tasks: repeating is only a
  // shortcut for creating them. They are late on exactly the same terms, and
  // never before their own deadline day has passed.
  for (const r of rows) {
    const name = `${r.firstName} ${r.lastName}`.trim();
    let p = people.get(r.userId);
    if (!p) {
      p = { id: r.userId, name, measured: 0, late: 0, lateDays: 0, maxLateDays: 0, openOverdue: 0, unmeasured: 0, daysBehind: 0 };
      people.set(r.userId, p);
    }
    if (!r.finishedOn) { p.unmeasured += 1; unmeasured += 1; continue; }

    p.measured += 1;
    const d = dayDiff(r.finishedOn, r.due);
    if (d <= 0) continue;

    const stillOpen = !['DONE', 'PENDING_QC', 'PENDING_APPROVAL'].includes(r.status);
    p.late += 1;
    p.lateDays += d;
    p.maxLateDays = Math.max(p.maxLateDays, d);
    if (stillOpen) {
      p.openOverdue += 1;
      /**
       * Summed task-days ("500 days late" inside a 30-day window) mostly
       * counted how many tasks were open at once: six overdue tasks add six
       * days to the total every day. How far behind a person actually is, in
       * calendar days, is how long ago their oldest open late task fell due.
       */
      p.daysBehind = Math.max(p.daysBehind, d);
    }
    lateItems.push({
      taskId: r.taskId, title: r.title,
      project: { id: r.projectId, name: r.projectName },
      employee: { id: r.userId, name },
      due: new Date(r.due).toISOString().slice(0, 10),
      finishedOn: new Date(r.finishedOn).toISOString().slice(0, 10),
      daysLate: d, stillOpen, status: r.status,
    });
  }
  return { people, lateItems, unmeasured };
}

export async function latenessAnalytics(days: number) {
  const today = isoDay(new Date());
  const { people, lateItems, unmeasured } = aggregateLateness(
    await latenessRows(shiftDay(today, -days), today)
  );

  const list = [...people.values()]
    .filter((p) => p.measured > 0 || p.unmeasured > 0)
    .map((p) => ({
      ...p,
      lateRate: p.measured ? Math.round((p.late / p.measured) * 100) : null,
      avgLateDays: p.late ? Math.round((p.lateDays / p.late) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.late - a.late || b.avgLateDays - a.avgLateDays);

  return {
    days,
    unmeasured,
    totals: {
      measured: list.reduce((s, p) => s + p.measured, 0),
      late: list.reduce((s, p) => s + p.late, 0),
      lateDays: list.reduce((s, p) => s + p.lateDays, 0),
      openOverdue: list.reduce((s, p) => s + p.openOverdue, 0),
    },
    people: list,
    // Worst first: the longest delays are the ones worth a conversation.
    lateItems: lateItems.sort((a, b) => b.daysLate - a.daysLate),
  };
}

/* ------------------------------------------------------------------ */
/*  Monthly scorecard                                                  */
/* ------------------------------------------------------------------ */

/**
 * How the scorecard is weighted. Quality carries no weight yet: every
 * rejection on record came from one reviewer over a few days, and rework
 * minutes only started being recorded this month. Scoring people on that
 * would reward whoever was never reviewed.
 */
export const SCORECARD_WEIGHTS = { volume: 50, punctuality: 50, quality: 0 } as const;

/**
 * Below this many measured tasks a punctuality rate is noise: with three tasks
 * one late delivery is a third of the score.
 */
export const SCORECARD_MIN_SAMPLE = 15;

export class ScorecardInputError extends Error {}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function currentJalaliMonthKey(): string {
  const [gy, gm, gd] = isoDay(new Date()).split('-').map(Number);
  const j = toJalaali(gy!, gm!, gd!);
  return `${j.jy}-${pad2(j.jm)}`;
}

/**
 * A scorecard for one Jalali month, computed on request from what is on
 * record — so a month can be regenerated later and reflect corrections, such
 * as tasks that were finished but only closed afterwards.
 *
 * Two parts, equally weighted:
 *  - volume: useful minutes (estimated minutes of tasks handed over in the
 *    month, less the rework minutes charged back) over capacity (480 minutes per
 *    working day elapsed, Fridays excluded), capped at 100;
 *  - punctuality: 100 minus the lateness rate for tasks due in the month, by
 *    the same rule as the lateness page.
 *
 * Nothing here touches pay. It is the evidence, not the decision.
 */
/**
 * Minutes a review is worth, as a share of the task's estimate.
 *
 * Reviewing was invisible: in the first three weeks of Shahrivar one approver
 * signed off 264 tasks and one QC reviewer checked 187, and the scorecard
 * credited neither with a minute of it. Asking reviewers to type a time for
 * every check is the friction that once produced "." as a rejection reason,
 * so the time is derived instead. A share rather than a flat figure, because
 * checking a five-slide story is not the same job as checking a one-minute
 * reel; the floor and ceiling keep tiny and huge estimates sensible.
 *
 * A rejection is a review too, and a task reviewed twice was looked at twice.
 */
export const REVIEW_TIME = {
  QC: { share: 0.15, min: 5, max: 30 },
  APPROVAL: { share: 0.05, min: 2, max: 15 },
} as const;

export function reviewMinutesFor(stage: 'QC' | 'APPROVAL', taskMinutes: number): number {
  const r = REVIEW_TIME[stage];
  return Math.min(r.max, Math.max(r.min, Math.round(taskMinutes * r.share)));
}

type MonthRange = {
  monthKey: string; label: string; start: string; end: string;
  partial: boolean; workingDays: number; capacityMinutes: number;
};

function resolveMonth(monthKey: string): MonthRange {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) throw new ScorecardInputError('ماه باید به شکل ۱۴۰۵-۰۶ باشد.');
  const jy = Number(m[1]);
  const jm = Number(m[2]);
  if (jm < 1 || jm > 12) throw new ScorecardInputError('شماره ماه باید بین ۱ و ۱۲ باشد.');

  const toIso = (g: { gy: number; gm: number; gd: number }) => `${g.gy}-${pad2(g.gm)}-${pad2(g.gd)}`;
  const start = toIso(toGregorian(jy, jm, 1));
  const end = toIso(jm === 12 ? toGregorian(jy + 1, 1, 1) : toGregorian(jy, jm + 1, 1));
  const today = isoDay(new Date());
  const tomorrow = shiftDay(today, 1);
  if (start > today) throw new ScorecardInputError('برای ماهی که هنوز شروع نشده کارنامه ساخته نمی‌شود.');

  // A month still under way is judged on the days that have happened.
  const partial = end > tomorrow;
  const capacityEnd = partial ? tomorrow : end;
  let workingDays = 0;
  for (let d = start; d < capacityEnd; d = shiftDay(d, 1)) {
    if (new Date(`${d}T12:00:00Z`).getUTCDay() !== 5) workingDays += 1;
  }
  return {
    monthKey, label: `${JALALI_MONTHS[jm - 1]} ${jy}`, start, end, partial,
    workingDays, capacityMinutes: workingDays * WORKING_MINUTES_PER_DAY,
  };
}

const TEHRAN_DAY_OF = (col: string) => `((${col} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran')::date`;
const HANDOVER = `COALESCE(t."submittedForReviewAt", t."approvedAt", t."updatedAt")`;
const TASK_MINUTES = `(COALESCE(t."estimatedHours",0) * 60 + COALESCE(t."estimatedMinutes",0))`;

type ReviewRow = {
  byId: number; taskId: number; title: string; projectName: string;
  stage: 'QC' | 'APPROVAL'; outcome: 'passed' | 'rejected'; at: Date; taskMinutes: number;
};

/** Every review decision in the range, one row per decision. */
async function reviewRows(start: string, end: string, byId?: number): Promise<ReviewRow[]> {
  const rows = await prisma.$queryRawUnsafe<(Omit<ReviewRow, 'taskMinutes'> & { taskMinutes: bigint | number })[]>(
    `SELECT d."byId" AS "byId", d."taskId" AS "taskId", t.title, p.name AS "projectName",
            d.stage, d.outcome, d.at, ${TASK_MINUTES} AS "taskMinutes"
       FROM (
         SELECT a."byId", a."taskId", a.stage::text AS stage, 'passed' AS outcome, a."createdAt" AS at
           FROM "TaskApproval" a WHERE a."byId" IS NOT NULL
         UNION ALL
         -- One rejection is written once per assignee; it was one review.
         SELECT DISTINCT r."byId", r."taskId", r.stage::text, 'rejected', r."createdAt"
           FROM "TaskRejection" r WHERE r."byId" IS NOT NULL
       ) d
       JOIN "Task" t ON t.id = d."taskId"
       JOIN "Project" p ON p.id = t."projectId"
      WHERE ${TEHRAN_DAY_OF('d.at')} >= $1::date
        AND ${TEHRAN_DAY_OF('d.at')} < $2::date
        ${byId ? 'AND d."byId" = $3' : ''}
      ORDER BY d.at DESC`,
    ...(byId ? [start, end, byId] : [start, end])
  );
  return rows.map((r) => ({ ...r, taskMinutes: Number(r.taskMinutes) }));
}

/**
 * A scorecard for one Jalali month, computed on request from what is on
 * record — so a month can be regenerated later and reflect corrections, such
 * as tasks that were finished but only closed afterwards.
 *
 * Two parts, equally weighted:
 *  - volume: useful minutes over capacity (480 per working day elapsed,
 *    Fridays excluded), capped at 100. Useful minutes are the estimates of
 *    tasks handed over in the month, less rework charged back, plus the time
 *    credited for reviews the person carried out;
 *  - punctuality: 100 minus the lateness rate for tasks due in the month, by
 *    the same rule as the lateness page.
 *
 * Nothing here touches pay. It is the evidence, not the decision.
 */
export async function monthlyScorecard(monthKey: string) {
  const range = resolveMonth(monthKey);
  const { start, end, capacityMinutes } = range;

  const [delivered, rework, lateRows, reviews] = await Promise.all([
    /**
     * Delivered means handed over, not approved. Counting only approvals
     * charged the approval queue to the employee: on live data 119 tasks
     * handed over in Shahrivar were still waiting, and one person whose 45
     * handed-over tasks all sat in final approval scored zero for volume.
     * The handover is the same moment the lateness clock stops at. Rows from
     * before that column existed fall back to the approval date.
     */
    prisma.$queryRawUnsafe<{ userId: number; tasks: bigint; minutes: bigint; awaiting: bigint }[]>(
      `SELECT a."userId" AS "userId",
              count(DISTINCT t.id) AS tasks,
              count(DISTINCT t.id) FILTER (WHERE t.status <> 'DONE') AS awaiting,
              COALESCE(SUM(${TASK_MINUTES}), 0) AS minutes
         FROM "TaskAssignee" a
         JOIN "Task" t ON t.id = a."taskId"
        WHERE t.status IN ('DONE', 'PENDING_QC', 'PENDING_APPROVAL')
          AND NOT (t."isRecurring" = true AND t."recurringParentId" IS NULL)
          AND ${TEHRAN_DAY_OF(HANDOVER)} >= $1::date
          AND ${TEHRAN_DAY_OF(HANDOVER)} < $2::date
        GROUP BY 1`,
      start, end
    ),
    prisma.$queryRawUnsafe<{ userId: number; rejections: bigint; minutes: bigint }[]>(
      `SELECT r."userId" AS "userId", count(*) AS rejections, COALESCE(SUM(r."reworkMinutes"), 0) AS minutes
         FROM "TaskRejection" r
        WHERE ${TEHRAN_DAY_OF('r."createdAt"')} >= $1::date
          AND ${TEHRAN_DAY_OF('r."createdAt"')} < $2::date
        GROUP BY 1`,
      start, end
    ),
    latenessRows(start, end),
    reviewRows(start, end),
  ]);

  const late = aggregateLateness(lateRows).people;
  const deliveredBy = new Map(delivered.map((r) => [r.userId, r]));
  const reworkBy = new Map(rework.map((r) => [r.userId, r]));
  const reviewBy = new Map<number, { count: number; minutes: number }>();
  for (const r of reviews) {
    const cur = reviewBy.get(r.byId) ?? { count: 0, minutes: 0 };
    cur.count += 1;
    cur.minutes += reviewMinutesFor(r.stage, r.taskMinutes);
    reviewBy.set(r.byId, cur);
  }
  const ids = [...new Set([...deliveredBy.keys(), ...reworkBy.keys(), ...late.keys(), ...reviewBy.keys()])];

  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true, displayName: true },
  });
  const nameOf = new Map(users.map((u) => [u.id, u.displayName?.trim() || `${u.firstName} ${u.lastName}`.trim()]));

  const people = ids.map((id) => {
    const deliveredMinutes = Number(deliveredBy.get(id)?.minutes ?? 0);
    const reworkMinutes = Number(reworkBy.get(id)?.minutes ?? 0);
    const reviewMinutes = reviewBy.get(id)?.minutes ?? 0;
    const usefulMinutes = Math.max(0, deliveredMinutes - reworkMinutes) + reviewMinutes;
    const l = late.get(id);
    const measured = l?.measured ?? 0;
    const lateCount = l?.late ?? 0;
    const lateRate = measured ? Math.round((lateCount / measured) * 100) : null;

    const volumeScore = capacityMinutes > 0 ? Math.min(100, Math.round((usefulMinutes / capacityMinutes) * 100)) : null;
    const enoughSample = measured >= SCORECARD_MIN_SAMPLE;
    const punctualityScore = enoughSample && lateRate !== null ? 100 - lateRate : null;
    const totalScore = volumeScore !== null && punctualityScore !== null
      ? Math.round((volumeScore * SCORECARD_WEIGHTS.volume + punctualityScore * SCORECARD_WEIGHTS.punctuality) / 100)
      : null;

    let note: string | null = null;
    if (capacityMinutes === 0) note = 'در این بازه روز کاری وجود ندارد.';
    else if (!enoughSample) note = `فقط ${measured} تسک سنجیده‌شده؛ برای امتیاز وقت‌شناسی حداقل ${SCORECARD_MIN_SAMPLE} لازم است.`;

    return {
      id,
      name: nameOf.get(id) ?? `کاربر ${id}`,
      doneTasks: Number(deliveredBy.get(id)?.tasks ?? 0),
      /** Of those, still waiting on a reviewer — counted, but worth knowing. */
      awaitingReview: Number(deliveredBy.get(id)?.awaiting ?? 0),
      deliveredMinutes,
      reworkMinutes,
      reviews: reviewBy.get(id)?.count ?? 0,
      reviewMinutes,
      usefulMinutes,
      volumeScore,
      measured,
      late: lateCount,
      lateRate,
      unmeasured: l?.unmeasured ?? 0,
      punctualityScore,
      rejections: Number(reworkBy.get(id)?.rejections ?? 0),
      totalScore,
      note,
    };
  });

  people.sort((a, b) =>
    (b.totalScore ?? -1) - (a.totalScore ?? -1) || b.usefulMinutes - a.usefulMinutes);

  return {
    month: { key: range.monthKey, label: range.label, start, end, partial: range.partial },
    workingDays: range.workingDays,
    minutesPerDay: WORKING_MINUTES_PER_DAY,
    capacityMinutes,
    method: { weights: SCORECARD_WEIGHTS, minSample: SCORECARD_MIN_SAMPLE, reviewTime: REVIEW_TIME },
    generatedAt: new Date().toISOString(),
    people,
  };
}

/**
 * One person's month in full: the same summary row as the team scorecard,
 * plus every item behind each number so a figure can be checked line by line.
 */
export async function personScorecard(monthKey: string, userId: number) {
  const card = await monthlyScorecard(monthKey);
  const { start, end } = card.month;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, firstName: true, lastName: true, displayName: true },
  });
  if (!user) throw new ScorecardInputError('این کاربر پیدا نشد.');
  const name = user.displayName?.trim() || `${user.firstName} ${user.lastName}`.trim();

  const [delivered, rejections, lateRows, reviews] = await Promise.all([
    prisma.$queryRawUnsafe<{ id: number; title: string; projectName: string; status: string; minutes: bigint; handedOn: Date }[]>(
      `SELECT DISTINCT t.id, t.title, p.name AS "projectName", t.status::text AS status,
              ${TASK_MINUTES} AS minutes, ${TEHRAN_DAY_OF(HANDOVER)} AS "handedOn"
         FROM "TaskAssignee" a
         JOIN "Task" t ON t.id = a."taskId"
         JOIN "Project" p ON p.id = t."projectId"
        WHERE a."userId" = $3
          AND t.status IN ('DONE', 'PENDING_QC', 'PENDING_APPROVAL')
          AND NOT (t."isRecurring" = true AND t."recurringParentId" IS NULL)
          AND ${TEHRAN_DAY_OF(HANDOVER)} >= $1::date
          AND ${TEHRAN_DAY_OF(HANDOVER)} < $2::date
        ORDER BY "handedOn" DESC, t.id DESC`,
      start, end, userId
    ),
    prisma.taskRejection.findMany({
      where: {
        userId,
        createdAt: {
          gte: new Date(Date.parse(`${start}T00:00:00Z`) - 3.5 * 3600_000),
          lt: new Date(Date.parse(`${end}T00:00:00Z`) - 3.5 * 3600_000),
        },
      },
      select: {
        taskId: true, createdAt: true, reason: true, categories: true, reworkMinutes: true, stage: true,
        by: { select: { firstName: true, lastName: true } },
        task: { select: { title: true, project: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    latenessRows(start, end),
    reviewRows(start, end, userId),
  ]);

  const lateItems = aggregateLateness(lateRows.filter((r) => r.userId === userId)).lateItems
    .sort((a, b) => b.daysLate - a.daysLate);

  const summary = card.people.find((p) => p.id === userId) ?? null;

  return {
    month: card.month,
    workingDays: card.workingDays,
    capacityMinutes: card.capacityMinutes,
    method: card.method,
    generatedAt: card.generatedAt,
    person: { id: userId, name },
    summary,
    delivered: delivered.map((d) => ({
      taskId: d.id, title: d.title, project: d.projectName, status: d.status,
      minutes: Number(d.minutes), handedOn: new Date(d.handedOn).toISOString().slice(0, 10),
    })),
    lateItems,
    rejections: rejections.map((r) => ({
      taskId: r.taskId, title: r.task.title, project: r.task.project.name,
      at: r.createdAt.toISOString(), stage: r.stage, reason: r.reason,
      categories: r.categories, reworkMinutes: r.reworkMinutes,
      by: r.by ? `${r.by.firstName} ${r.by.lastName}`.trim() : null,
    })),
    reviews: reviews.map((r) => ({
      taskId: r.taskId, title: r.title, project: r.projectName, stage: r.stage, outcome: r.outcome,
      at: new Date(r.at).toISOString(), taskMinutes: r.taskMinutes,
      creditedMinutes: reviewMinutesFor(r.stage, r.taskMinutes),
    })),
  };
}
