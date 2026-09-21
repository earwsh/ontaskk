import prisma from '../lib/prisma';
import { notifyTaskAssignees } from '../lib/notifications';
import {
  occurrenceDates, endOfDay, occurrenceDeadline, fallsOn,
  DEFAULT_HORIZON_DAYS, type RecurrenceSpec,
} from './recurrence';

/**
 * Recurring tasks are materialised as real dated tasks the moment the schedule
 * is set, not one day at a time.
 *
 * The previous engine created only today's copy, on a 15-minute timer. Two
 * things followed from that, and both showed up as phantom lateness:
 *
 *  - the parent row stayed in every task list as an ordinary task carrying the
 *    original deadline. Nobody ever completes a template, so it aged into
 *    permanent overdue and dragged the project's numbers with it;
 *  - upcoming repeats did not exist yet, so no one could see or plan them, and
 *    any day the generator did not run produced nothing at all.
 *
 * Now the parent is a template: it holds the rule, carries no deadline, and is
 * hidden from task lists. The occurrences are the work.
 */

/** Templates hold the schedule; they are not work items. */
export const TEMPLATE_FILTER = { isRecurring: true, recurringParentId: null } as const;

/**
 * Drop-in `where` for any query that lists or counts tasks as work.
 * Use this rather than re-spelling the condition: every place that forgets it
 * shows a schedule as a task and, since nobody completes a schedule, reports
 * it as permanently overdue.
 */
export const NOT_TEMPLATE = { NOT: TEMPLATE_FILTER } as const;

/**
 * Create any missing occurrences for one template, up to the horizon.
 *
 * Idempotent: existing occurrences are matched by day, so calling it twice —
 * or calling it after the user edits the schedule — never duplicates a day.
 */
export async function materialiseOccurrences(
  templateId: number,
  opts: { horizonDays?: number; notify?: boolean; from?: Date } = {}
): Promise<number> {
  const template = await prisma.task.findUnique({
    where: { id: templateId },
    include: { assignees: true, subtasks: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
  });
  if (!template || !template.isRecurring || template.recurringParentId !== null) return 0;

  const spec: RecurrenceSpec = {
    recurrencePattern: template.recurrencePattern,
    recurrenceDays: template.recurrenceDays,
    recurrenceEnd: template.recurrenceEnd,
    startDate: template.startDate,
    createdAt: template.createdAt,
  };

  // `from` lets an edit rebuild only the days after the occurrence being
  // edited, instead of re-filling the gap between today and that occurrence.
  const dates = occurrenceDates(spec, { from: opts.from, horizonDays: opts.horizonDays ?? DEFAULT_HORIZON_DAYS });
  if (dates.length === 0) return 0;

  // One query for what already exists, rather than one per candidate day.
  const existing = await prisma.task.findMany({
    where: {
      recurringParentId: template.id,
      startDate: { gte: dates[0], lte: endOfDay(dates[dates.length - 1]) },
    },
    select: { startDate: true },
  });
  const taken = new Set(
    existing
      .map((e) => e.startDate)
      .filter((d): d is Date => d !== null)
      .map((d) => d.toDateString())
  );

  const missing = dates.filter((d) => !taken.has(d.toDateString()));
  if (missing.length === 0) return 0;

  const created: number[] = [];
  for (const date of missing) {
    const task = await prisma.task.create({
      data: {
        title: template.title,
        description: template.description,
        projectId: template.projectId,
        createdById: template.createdById,
        approverId: template.approverId,
        status: 'TODO',
        startDate: date,
        // Each occurrence is due on its own day — that is the whole point of
        // picking those days.
        deadline: occurrenceDeadline(date),
        estimatedHours: template.estimatedHours,
        estimatedMinutes: template.estimatedMinutes,
        weight: template.weight,
        recurringParentId: template.id,
        isRecurring: false,
        assignees: { create: template.assignees.map((a) => ({ userId: a.userId })) },
        subtasks: template.subtasks.length
          ? { create: template.subtasks.map((s) => ({ title: s.title, position: s.position })) }
          : undefined,
      },
    });
    created.push(task.id);
  }

  await prisma.task.update({
    where: { id: template.id },
    data: { lastGeneratedDate: new Date() },
  });

  // One notification for the schedule, not one per generated day: a monthly
  // repeat would otherwise fire thirty notifications at once.
  if (opts.notify && template.assignees.length > 0 && created.length > 0) {
    const assigneeIds = template.assignees.map((a) => a.userId);
    notifyTaskAssignees(
      created[0]!,
      `${template.title} (${created.length} نوبت تکرار)`,
      assigneeIds
    ).catch(console.error);
  }

  return created.length;
}

/**
 * Top up every template so the next `horizonDays` are always materialised.
 * With an end date the schedule simply finishes; open-ended ones keep rolling.
 */
export async function processRecurringTasks(): Promise<number> {
  try {
    const templates = await prisma.task.findMany({
      where: TEMPLATE_FILTER,
      select: { id: true },
    });

    let total = 0;
    for (const t of templates) {
      total += await materialiseOccurrences(t.id, { notify: false });
    }
    if (total > 0) {
      console.log(`[RecurringTasks] ${total} occurrence(s) topped up across ${templates.length} template(s)`);
    }
    return total;
  } catch (err) {
    console.error('[RecurringTasks] Error topping up occurrences:', err);
    return 0;
  }
}

/** Kept for callers that only ask "does this rule cover this day". */
export function isTaskDueOnDate(task: RecurrenceSpec, date: Date = new Date()): boolean {
  if (task.recurrenceEnd) {
    const end = new Date(task.recurrenceEnd);
    end.setHours(23, 59, 59, 999);
    if (date.getTime() > end.getTime()) return false;
  }
  if (task.startDate) {
    const start = new Date(task.startDate);
    start.setHours(0, 0, 0, 0);
    if (date.getTime() < start.getTime()) return false;
  }
  return fallsOn(task, date);
}

let schedulerInterval: NodeJS.Timeout | null = null;

export function initRecurringTasksScheduler() {
  if (schedulerInterval) clearInterval(schedulerInterval);

  processRecurringTasks().catch(console.error);

  // Hourly is plenty now that the work is topping up a horizon rather than
  // racing to create "today" before someone notices it is missing.
  schedulerInterval = setInterval(() => {
    processRecurringTasks().catch(console.error);
  }, 60 * 60 * 1000);

  console.log('[RecurringTasks] Scheduler initialized (hourly horizon top-up)');
}
