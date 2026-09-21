import prisma from '../lib/prisma';

/**
 * Every count the delivery view needs, computed by Postgres.
 *
 * This replaces the previous shape, where 500 tasks were serialised to JSON and
 * shipped over HTTP to another service so it could run a for-loop and increment
 * counters. Postgres already holds the rows and has the indexes; a GROUP BY is
 * strictly faster than a network hop around one.
 *
 * The services downstream get *derived statistics* to work on, not raw rows.
 */

/** A task counts as delivered when it was approved. */
const COMPLETED_AT = `COALESCE(t."approvedAt", t."updatedAt")`;

/**
 * Recurring templates are schedules, not work. Counting them inflates every
 * total and — because nobody ever completes a template — permanently inflates
 * the overdue count too.
 */
const NOT_TEMPLATE = `NOT (t."isRecurring" = true AND t."recurringParentId" IS NULL)`;

/**
 * Work that is actually available to do now.
 *
 * Recurring schedules are materialised months ahead, so a project can hold
 * hundreds of tasks dated for next season. Those are committed future work,
 * not backlog: counting them as remaining made the forecast read "99 weeks of
 * work left" for a project that is simply booked through the autumn.
 */
const AVAILABLE = `(t."startDate" IS NULL OR t."startDate" <= (now() AT TIME ZONE 'Asia/Tehran'))`;

/**
 * Work still on the team's plate. A task in review is finished as far as the
 * assignees are concerned — counting it as remaining work makes the forecast
 * plan for effort nobody has to spend, and drags the project's risk label down.
 */
const REMAINING = `t.status NOT IN ('DONE', 'PENDING_QC', 'PENDING_APPROVAL')`;

/**
 * Overdue, mirroring backend/src/lib/deadline.ts: while a task waits on a
 * reviewer the clock is frozen at the handover, so review delay is never
 * charged to the assignee. A task handed over late stays late.
 */
const OVERDUE = `(
  CASE
    WHEN t.status = 'DONE' THEN false
    WHEN t.status IN ('PENDING_QC', 'PENDING_APPROVAL')
      THEN t."submittedForReviewAt" IS NOT NULL
           AND t.deadline::date < (t."submittedForReviewAt" AT TIME ZONE 'Asia/Tehran')::date
    ELSE t.deadline::date < (now() AT TIME ZONE 'Asia/Tehran')::date
  END
)`;

/** Days a task has been sitting in a review queue. */
const REVIEW_WAIT_DAYS = `(
  (now() AT TIME ZONE 'Asia/Tehran')::date - (t."submittedForReviewAt" AT TIME ZONE 'Asia/Tehran')::date
)`;

export interface ProjectFact {
  projectId: number;
  name: string;
  departmentId: number;
  departmentName: string | null;
  total: number;
  done: number;
  open: number;
  /** Non-DONE but dated in the future — booked, not pending. */
  scheduled: number;
  overdue: number;
  pendingApproval: number;
  pendingQc: number;
  /** Handed over and waiting on someone else — the reviewer's delay, not the team's. */
  awaitingReview: number;
  /** Days the longest-waiting task has been sitting in a review queue. */
  longestReviewWaitDays: number;
  /** Projects carry no deadline of their own; this is the latest task deadline. */
  derivedDeadline: string | null;
  firstActivity: string | null;
  lastActivity: string | null;
  memberCount: number;
}

export async function projectFacts(): Promise<ProjectFact[]> {
  return prisma.$queryRawUnsafe<ProjectFact[]>(`
    SELECT
      p.id                                    AS "projectId",
      p.name                                  AS "name",
      p."departmentId"                        AS "departmentId",
      d.name                                  AS "departmentName",
      COUNT(t.id)::int                        AS "total",
      COUNT(t.id) FILTER (WHERE t.status = 'DONE')::int          AS "done",
      COUNT(t.id) FILTER (WHERE ${REMAINING} AND ${AVAILABLE})::int AS "open",
      COUNT(t.id) FILTER (WHERE ${REMAINING} AND NOT ${AVAILABLE})::int AS "scheduled",
      COUNT(t.id) FILTER (WHERE ${OVERDUE})::int                  AS "overdue",
      COUNT(t.id) FILTER (WHERE t.status = 'PENDING_APPROVAL')::int AS "pendingApproval",
      COUNT(t.id) FILTER (WHERE t.status = 'PENDING_QC')::int       AS "pendingQc",
      COUNT(t.id) FILTER (
        WHERE t.status IN ('PENDING_QC', 'PENDING_APPROVAL') AND t."submittedForReviewAt" IS NOT NULL
      )::int                                                     AS "awaitingReview",
      COALESCE(MAX(${REVIEW_WAIT_DAYS}) FILTER (
        WHERE t.status IN ('PENDING_QC', 'PENDING_APPROVAL')
      ), 0)::int                                                 AS "longestReviewWaitDays",
      MAX(t.deadline) FILTER (WHERE ${REMAINING} AND ${AVAILABLE})::text AS "derivedDeadline",
      MIN(t."createdAt")::text                                    AS "firstActivity",
      MAX(${COMPLETED_AT}) FILTER (WHERE t.status = 'DONE')::text AS "lastActivity",
      (SELECT COUNT(*) FROM "ProjectMember" pm WHERE pm."projectId" = p.id)::int AS "memberCount"
    FROM "Project" p
    LEFT JOIN "Department" d ON d.id = p."departmentId"
    LEFT JOIN "Task" t ON t."projectId" = p.id AND ${NOT_TEMPLATE}
    GROUP BY p.id, p.name, p."departmentId", d.name
    ORDER BY p.id
  `);
}

export interface WeekPoint { projectId: number | null; week: string; completed: number }

/**
 * Completions per ISO week. The current, still-running week is excluded: a week
 * that is two days old always looks like a throughput collapse, and feeding
 * that into a trend line manufactures a downturn that is not real.
 */
export async function weeklyThroughput(weeks = 16): Promise<WeekPoint[]> {
  return prisma.$queryRawUnsafe<WeekPoint[]>(`
    SELECT
      t."projectId"                                      AS "projectId",
      date_trunc('week', ${COMPLETED_AT})::date::text     AS "week",
      COUNT(*)::int                                       AS "completed"
    FROM "Task" t
    WHERE t.status = 'DONE' AND ${NOT_TEMPLATE}
      AND ${COMPLETED_AT} >= now() - interval '${weeks} weeks'
      AND date_trunc('week', ${COMPLETED_AT}) < date_trunc('week', now())
    GROUP BY 1, 2
    ORDER BY 2
  `);
}

export interface CycleSample { projectId: number | null; days: number }

/** Age from creation to approval, in days — the input to cycle-time percentiles. */
export async function cycleSamples(limit = 2000): Promise<CycleSample[]> {
  return prisma.$queryRawUnsafe<CycleSample[]>(`
    SELECT t."projectId" AS "projectId",
           EXTRACT(EPOCH FROM (t."approvedAt" - t."createdAt")) / 86400.0 AS "days"
    FROM "Task" t
    WHERE t.status = 'DONE' AND t."approvedAt" IS NOT NULL
      AND t."approvedAt" >= t."createdAt"
    ORDER BY t."approvedAt" DESC
    LIMIT ${limit}
  `);
}

export interface MemberFact {
  userId: number;
  name: string;
  role: string;
  open: number;
  /** Non-DONE but dated in the future — booked, not pending. */
  scheduled: number;
  overdue: number;
  completed4w: number;
  projects: number;
}

export async function memberFacts(): Promise<MemberFact[]> {
  return prisma.$queryRawUnsafe<MemberFact[]>(`
    SELECT
      u.id                                   AS "userId",
      (u."firstName" || ' ' || u."lastName") AS "name",
      u.role::text                           AS "role",
      COUNT(t.id) FILTER (WHERE ${REMAINING} AND ${AVAILABLE})::int AS "open",
      COUNT(t.id) FILTER (WHERE ${OVERDUE})::int         AS "overdue",
      COUNT(t.id) FILTER (
        WHERE t.status = 'DONE' AND ${COMPLETED_AT} >= now() - interval '4 weeks'
      )::int                                             AS "completed4w",
      COUNT(DISTINCT t."projectId")::int                 AS "projects"
    FROM "User" u
    JOIN "TaskAssignee" ta ON ta."userId" = u.id
    JOIN "Task" t ON t.id = ta."taskId"
    WHERE u.role <> 'CUSTOMER' AND ${NOT_TEMPLATE}
    GROUP BY u.id, u."firstName", u."lastName", u.role
    ORDER BY 5 DESC
  `);
}

/** How much history exists, which is what any forecast's confidence rests on. */
export async function historyDepth(): Promise<{ weeks: number; firstCompletion: string | null }> {
  const rows = await prisma.$queryRawUnsafe<{ weeks: number; first: string | null }[]>(`
    SELECT
      COUNT(DISTINCT date_trunc('week', ${COMPLETED_AT}))::int AS "weeks",
      MIN(${COMPLETED_AT})::text                                AS "first"
    FROM "Task" t
    WHERE t.status = 'DONE'
      AND date_trunc('week', ${COMPLETED_AT}) < date_trunc('week', now())
  `);
  return { weeks: rows[0]?.weeks ?? 0, firstCompletion: rows[0]?.first ?? null };
}
