import prisma from '../lib/prisma';

/**
 * Rejection history, grouped back into the events a person actually performed.
 *
 * The table stores one row per assignee, because the question it was built for
 * was "how many times was this person sent back" and that makes it a plain
 * group-by. Read the other way — "what happened to this task" — those rows are
 * one event split across several lines, so they are folded back together here.
 *
 * Grouping on (taskId, byId, createdAt) is safe: every row of one rejection is
 * written by a single `createMany`, and Postgres gives every row in one
 * statement the same transaction timestamp.
 */

export interface RejectionEvent {
  taskId: number;
  stage: 'QC' | 'APPROVAL';
  reason: string | null;
  at: string;
  by: { id: number; name: string } | null;
  /** Who it was sent back to. */
  assignees: { id: number; name: string }[];
}

type Row = {
  taskId: number;
  stage: 'QC' | 'APPROVAL';
  reason: string | null;
  createdAt: Date;
  byId: number | null;
  by: { id: number; firstName: string; lastName: string } | null;
  user: { id: number; firstName: string; lastName: string };
};

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

function group(rows: Row[]): RejectionEvent[] {
  const events = new Map<string, RejectionEvent>();
  for (const r of rows) {
    const key = `${r.taskId}|${r.byId ?? 'null'}|${r.createdAt.toISOString()}`;
    let event = events.get(key);
    if (!event) {
      event = {
        taskId: r.taskId,
        stage: r.stage,
        reason: r.reason,
        at: r.createdAt.toISOString(),
        by: r.by ? { id: r.by.id, name: fullName(r.by) } : null,
        assignees: [],
      };
      events.set(key, event);
    }
    event.assignees.push({ id: r.user.id, name: fullName(r.user) });
  }
  // Oldest first: read as a story of what went wrong, in order.
  return [...events.values()].sort((a, b) => a.at.localeCompare(b.at));
}

const include = {
  by: { select: { id: true, firstName: true, lastName: true } },
  user: { select: { id: true, firstName: true, lastName: true } },
} as const;

/** Everything that ever sent one task back. */
export async function rejectionsForTask(taskId: number): Promise<RejectionEvent[]> {
  const rows = await prisma.taskRejection.findMany({
    where: { taskId },
    include,
    orderBy: { createdAt: 'asc' },
  });
  return group(rows as Row[]);
}

/** Task ids to their history, for a list view — one query, not N. */
export async function rejectionsForTasks(taskIds: number[]): Promise<Map<number, RejectionEvent[]>> {
  const byTask = new Map<number, RejectionEvent[]>();
  if (taskIds.length === 0) return byTask;
  const rows = await prisma.taskRejection.findMany({
    where: { taskId: { in: taskIds } },
    include,
    orderBy: { createdAt: 'asc' },
  });
  for (const event of group(rows as Row[])) {
    if (!byTask.has(event.taskId)) byTask.set(event.taskId, []);
    byTask.get(event.taskId)!.push(event);
  }
  return byTask;
}

/** What one reviewer has sent back, newest first, with enough context to act. */
export async function rejectionsByReviewer(byId: number, limit = 100) {
  const rows = await prisma.taskRejection.findMany({
    where: { byId },
    include: {
      ...include,
      task: {
        select: {
          id: true, title: true, status: true, deadline: true,
          project: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit * 4, // rows, not events — several assignees fold into one event
  });

  const events = group(rows as unknown as Row[]).reverse();
  const taskById = new Map(rows.map((r: any) => [r.taskId, r.task]));
  return events.slice(0, limit).map((e) => ({ ...e, task: taskById.get(e.taskId) ?? null }));
}

/** One decision a reviewer made: a rejection they wrote, or a task they passed. */
export interface QcDecision {
  outcome: 'passed' | 'rejected';
  /** Which gate the decision was made at. */
  stage: 'QC' | 'APPROVAL';
  taskId: number;
  at: string;
  note: string | null;
  /** Who it was sent back to. Empty for an approval, which is not aimed at anyone. */
  assignees: { id: number; name: string }[];
  task: { id: number; title: string; status: string; project: { id: number; name: string } | null } | null;
}

/**
 * Everything one reviewer has decided, newest first.
 *
 * Both halves are append-only rows now, so a task approved, sent back, and
 * approved again shows all three decisions rather than only the last one.
 * Rows carried over by the backfill are limited to what the task fields still
 * remembered at that point — one approval per task at most.
 */
export async function qcDecisionsByReviewer(byId: number, limit = 100): Promise<QcDecision[]> {
  const [rejections, approvals] = await Promise.all([
    rejectionsByReviewer(byId, limit),
    prisma.taskApproval.findMany({
      where: { byId },
      select: {
        taskId: true, createdAt: true, note: true, stage: true,
        task: {
          select: {
            id: true, title: true, status: true,
            project: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
  ]);

  const decisions: QcDecision[] = [
    ...rejections.map((e) => ({
      outcome: 'rejected' as const,
      stage: e.stage,
      taskId: e.taskId,
      at: e.at,
      note: e.reason,
      assignees: e.assignees,
      task: e.task as QcDecision['task'],
    })),
    ...approvals.map((a) => ({
      outcome: 'passed' as const,
      stage: a.stage,
      taskId: a.taskId,
      at: a.createdAt.toISOString(),
      note: a.note,
      assignees: [],
      task: a.task,
    })),
  ];

  // Each outcome is capped at `limit` on its own rather than the merged list
  // being trimmed: one reviewer here has 100 approvals against 19 rejections,
  // so a single newest-60 cut would drop older rejections entirely and the
  // page's "rejected: N" count would quietly understate them.
  return decisions.sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Record an approval so it survives the next decision on the same task.
 *
 * The task's own qc and approvedBy fields are the current state and get
 * overwritten; this row is the history. Written on the same path as
 * recordRejection so both halves of a review are kept the same way.
 */
export async function recordApproval(
  taskId: number,
  stage: 'QC' | 'APPROVAL',
  byId: number | null,
  note: string | null
): Promise<void> {
  await prisma.taskApproval.create({
    data: { taskId, stage, byId, note: note?.trim() || null },
  });
}
