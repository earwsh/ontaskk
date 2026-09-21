import prisma from '../lib/prisma';
import { toJalaali, toGregorian } from '../lib/jalaali';

/**
 * Monthly per-employee performance, bucketed by Jalali month.
 *
 * The months are Jalali because that is the calendar the organisation runs on:
 * a "monthly review" that straddles two Persian months is not the review the
 * managers asked for. Bucketing happens in JS rather than SQL so the calendar
 * conversion has one implementation, the one the rest of the app uses.
 */

export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

export interface MonthKey {
  key: string;   // '1404-06'
  label: string; // 'شهریور ۱۴۰۴'
}

function monthKeyOf(d: Date): string {
  // Deadlines and timestamps are compared in Tehran time, the same zone the
  // rest of the app treats as "the working day".
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const j = toJalaali(get('year'), get('month'), get('day'));
  return `${j.jy}-${String(j.jm).padStart(2, '0')}`;
}

/** The last `count` Jalali months, oldest first, ending with the current one. */
export function recentMonths(count: number): MonthKey[] {
  const now = monthKeyOf(new Date()).split('-').map(Number) as [number, number];
  const out: MonthKey[] = [];
  let [jy, jm] = now;
  for (let i = 0; i < count; i++) {
    out.unshift({ key: `${jy}-${String(jm).padStart(2, '0')}`, label: `${JALALI_MONTHS[jm - 1]} ${jy}` });
    jm -= 1;
    if (jm === 0) { jm = 12; jy -= 1; }
  }
  return out;
}

/** UTC instant at the start of a Jalali month, minus Tehran's offset. */
function monthStart(key: string): Date {
  const [jy, jm] = key.split('-').map(Number);
  const g = toGregorian(jy, jm, 1);
  // Tehran is UTC+3:30 year-round since 1402.
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd, 0, 0, 0) - 3.5 * 3600 * 1000);
}

export interface EmployeeMonth {
  done: number;
  rejected: number;
  plannedMinutes: number;
  turnaroundDays: number | null;
  topProject: { id: number; name: string; done: number } | null;
}

export interface EmployeeRow {
  id: number;
  name: string;
  role: string;
  months: Record<string, EmployeeMonth>;
}

const EMPTY = (): EmployeeMonth => ({ done: 0, rejected: 0, plannedMinutes: 0, turnaroundDays: null, topProject: null });

/**
 * @param userIds Employees in scope. A department manager sees only their own
 *   people, so the caller resolves the scope; this function never widens it.
 */
export async function employeeMonthlyStats(userIds: number[], monthCount: number) {
  const months = recentMonths(monthCount);
  const since = monthStart(months[0]!.key);

  if (userIds.length === 0) return { months, employees: [] as EmployeeRow[] };

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, firstName: true, lastName: true, displayName: true, role: true },
    orderBy: { firstName: 'asc' },
  });

  type DoneRow = { userId: number; projectId: number; projectName: string; doneAt: Date; minutes: number | null; startedAt: Date };
  const doneRows = await prisma.$queryRawUnsafe<DoneRow[]>(
    `SELECT a."userId"                                              AS "userId",
            p."id"                                                  AS "projectId",
            p."name"                                                AS "projectName",
            COALESCE(t."approvedAt", a."completedAt", t."updatedAt") AS "doneAt",
            (COALESCE(t."estimatedHours", 0) * 60 + COALESCE(t."estimatedMinutes", 0))::int AS "minutes",
            COALESCE(t."startDate", t."createdAt")                   AS "startedAt"
       FROM "TaskAssignee" a
       JOIN "Task" t     ON t."id" = a."taskId"
       JOIN "Project" p  ON p."id" = t."projectId"
      WHERE a."userId" = ANY($1::int[])
        AND t."status" = 'DONE'
        AND NOT (t."isRecurring" = true AND t."recurringParentId" IS NULL)
        AND COALESCE(t."approvedAt", a."completedAt", t."updatedAt") >= $2`,
    userIds,
    since
  );

  type RejRow = { userId: number; createdAt: Date };
  const rejRows = await prisma.$queryRawUnsafe<RejRow[]>(
    `SELECT r."userId" AS "userId", r."createdAt" AS "createdAt"
       FROM "TaskRejection" r
      WHERE r."userId" = ANY($1::int[]) AND r."createdAt" >= $2`,
    userIds,
    since
  );

  const known = new Set(months.map((m) => m.key));
  const byUser = new Map<number, EmployeeRow>();
  for (const u of users) {
    byUser.set(u.id, {
      id: u.id,
      name: u.displayName?.trim() || `${u.firstName} ${u.lastName}`.trim(),
      role: u.role,
      months: Object.fromEntries(months.map((m) => [m.key, EMPTY()])),
    });
  }

  // Turnaround is averaged, and the per-project tallies picked over, only
  // after every row is placed — a running "best project" would depend on row order.
  const projectTally = new Map<string, Map<number, { name: string; done: number }>>();
  const turnaround = new Map<string, number[]>();

  for (const r of doneRows) {
    const key = monthKeyOf(new Date(r.doneAt));
    if (!known.has(key)) continue;
    const row = byUser.get(r.userId);
    if (!row) continue;
    const m = row.months[key]!;
    m.done += 1;
    m.plannedMinutes += r.minutes || 0;

    const cell = `${r.userId}:${key}`;
    const days = (new Date(r.doneAt).getTime() - new Date(r.startedAt).getTime()) / 86400000;
    if (days >= 0) {
      if (!turnaround.has(cell)) turnaround.set(cell, []);
      turnaround.get(cell)!.push(days);
    }
    if (!projectTally.has(cell)) projectTally.set(cell, new Map());
    const pt = projectTally.get(cell)!;
    const prev = pt.get(r.projectId);
    pt.set(r.projectId, { name: r.projectName, done: (prev?.done || 0) + 1 });
  }

  for (const r of rejRows) {
    const key = monthKeyOf(new Date(r.createdAt));
    if (!known.has(key)) continue;
    const row = byUser.get(r.userId);
    if (row) row.months[key]!.rejected += 1;
  }

  for (const row of byUser.values()) {
    for (const m of months) {
      const cell = `${row.id}:${m.key}`;
      const cellMonth = row.months[m.key]!;
      const times = turnaround.get(cell);
      if (times?.length) {
        cellMonth.turnaroundDays = Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10;
      }
      const pt = projectTally.get(cell);
      if (pt) {
        // Ties break on project id so the same month always reports the same
        // project rather than whichever row happened to arrive first.
        const best = [...pt.entries()].sort((a, b) => b[1].done - a[1].done || a[0] - b[0])[0]!;
        cellMonth.topProject = { id: best[0], name: best[1].name, done: best[1].done };
      }
    }
  }

  return { months, employees: [...byUser.values()] };
}
