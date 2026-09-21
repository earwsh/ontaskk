import prisma from '../lib/prisma';
import { materialiseOccurrences } from './recurringTasks';

/**
 * Deletes occurrences and everything hanging off them.
 *
 * Shared by "stop the series" and by a schedule change, which removes the
 * not-yet-started days of the old pattern before generating the new ones.
 */
export async function deleteOccurrences(ids: number[]): Promise<void> {
  if (!ids.length) return;
  await prisma.notification.deleteMany({ where: { taskId: { in: ids } } });
  await prisma.taskReport.deleteMany({ where: { taskId: { in: ids } } });
  await prisma.taskAssignee.deleteMany({ where: { taskId: { in: ids } } });
  await prisma.taskSubtask.deleteMany({ where: { taskId: { in: ids } } });
  await prisma.taskAttachment.deleteMany({ where: { taskId: { in: ids } } });
  await prisma.task.deleteMany({ where: { id: { in: ids } } });
}

export type SeriesSubtask = { title: string; assigneeId: number | null };

export interface SeriesEdit {
  /** Assignees to put on every following occurrence; undefined leaves them. */
  assigneeIds?: number[];
  /** Replacement step list; undefined leaves subtasks alone. */
  subtasks?: SeriesSubtask[];
  /** New schedule; undefined leaves the rule as it is. */
  recurrence?: {
    recurrencePattern: string;
    recurrenceDays: string | null;
    recurrenceEnd: Date | null;
  };
}

const dayStart = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

/**
 * Carries an edit from one occurrence onto every occurrence after it.
 *
 * This replaces the old route through the template: open a task nobody could
 * find in any list, edit it, save, then press "apply to N upcoming". That
 * route also never carried assignees (the button sent an empty body) or
 * subtasks (they were loaded and then ignored), so a changed owner or checklist
 * simply did not arrive on the later days.
 *
 * The edited occurrence has already been saved by the caller; its row is the
 * source of truth for the scalar fields.
 *
 * Done occurrences are the record of work that happened and are never
 * touched. An occurrence with any ticked subtask keeps its subtasks — someone
 * has started that checklist and replacing it would erase their progress —
 * but every other change still lands on it.
 */
export async function applyEditToFollowing(anchorId: number, edit: SeriesEdit) {
  const anchor = await prisma.task.findUnique({ where: { id: anchorId } });
  if (!anchor) return null;

  const templateId = anchor.recurringParentId ?? (anchor.isRecurring ? anchor.id : null);
  if (!templateId) return null;
  const editingTemplate = anchor.id === templateId;

  const template = await prisma.task.findUnique({ where: { id: templateId } });
  if (!template) return null;

  // "Following" starts at the edited occurrence's own day; from the template
  // it means everything still ahead.
  const from = editingTemplate ? dayStart(new Date()) : dayStart(anchor.startDate ?? new Date());

  const scalars = {
    title: anchor.title,
    description: anchor.description,
    estimatedHours: anchor.estimatedHours,
    estimatedMinutes: anchor.estimatedMinutes,
    weight: anchor.weight,
    approverId: anchor.approverId,
  };

  // --- the template, so days generated later inherit the change too ---
  const scheduleChanged =
    !!edit.recurrence &&
    (edit.recurrence.recurrencePattern !== template.recurrencePattern ||
      (edit.recurrence.recurrenceDays ?? null) !== (template.recurrenceDays ?? null) ||
      (edit.recurrence.recurrenceEnd?.toDateString() ?? null) !== (template.recurrenceEnd?.toDateString() ?? null));

  await prisma.task.update({
    where: { id: templateId },
    data: {
      ...scalars,
      ...(edit.recurrence
        ? {
            isRecurring: true,
            recurrencePattern: edit.recurrence.recurrencePattern,
            recurrenceDays: edit.recurrence.recurrenceDays,
            recurrenceEnd: edit.recurrence.recurrenceEnd,
          }
        : {}),
    },
  });

  if (edit.assigneeIds && !editingTemplate) {
    await prisma.taskAssignee.deleteMany({ where: { taskId: templateId } });
    await prisma.taskAssignee.createMany({
      data: edit.assigneeIds.map((userId) => ({ taskId: templateId, userId })),
      skipDuplicates: true,
    });
  }
  if (edit.subtasks && !editingTemplate) {
    await prisma.taskSubtask.deleteMany({ where: { taskId: templateId } });
    if (edit.subtasks.length) {
      await prisma.taskSubtask.createMany({
        data: edit.subtasks.map((st, position) => ({ taskId: templateId, title: st.title, assigneeId: st.assigneeId, position })),
      });
    }
  }

  const followingWhere = {
    recurringParentId: templateId,
    status: { not: 'DONE' as const },
    id: { not: anchor.id },
    startDate: { gte: from },
  };

  // --- a new schedule: drop the old pattern's untouched days, build the new ---
  let regenerated = 0;
  let removed = 0;
  if (scheduleChanged) {
    const untouched = await prisma.task.findMany({
      where: {
        ...followingWhere,
        status: 'TODO',
        subtasks: { none: { isDone: true } },
        reports: { none: {} },
        attachments: { none: {} },
      },
      select: { id: true },
    });
    removed = untouched.length;
    await deleteOccurrences(untouched.map((t) => t.id));

    // The day after the edited occurrence, so the days between today and it
    // are left exactly as they were.
    const next = new Date(from);
    if (!editingTemplate) next.setDate(next.getDate() + 1);
    regenerated = await materialiseOccurrences(templateId, { from: next });
  }

  // --- everything that remains after the anchor ---
  const targets = await prisma.task.findMany({
    where: followingWhere,
    select: { id: true, subtasks: { select: { isDone: true } } },
  });
  const ids = targets.map((t) => t.id);

  if (ids.length) {
    await prisma.task.updateMany({ where: { id: { in: ids } }, data: scalars });
  }

  if (edit.assigneeIds) {
    for (const id of ids) {
      await prisma.taskAssignee.deleteMany({ where: { taskId: id } });
      await prisma.taskAssignee.createMany({
        data: edit.assigneeIds.map((userId) => ({ taskId: id, userId })),
        skipDuplicates: true,
      });
    }
  }

  let subtasksKept = 0;
  if (edit.subtasks) {
    for (const t of targets) {
      if (t.subtasks.some((s) => s.isDone)) {
        subtasksKept += 1;
        continue;
      }
      await prisma.taskSubtask.deleteMany({ where: { taskId: t.id } });
      if (edit.subtasks.length) {
        await prisma.taskSubtask.createMany({
          data: edit.subtasks.map((st, position) => ({ taskId: t.id, title: st.title, assigneeId: st.assigneeId, position })),
        });
      }
    }
  }

  return { updated: ids.length, regenerated, removed, subtasksKept };
}
