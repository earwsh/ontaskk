import prisma from '../lib/prisma';
import { getPersianDateInfo, getPersianWeekday } from '../lib/jalaali';
import { notifyTaskAssignees } from '../lib/notifications';

export function isTaskDueOnDate(
  task: {
    startDate?: Date | null;
    createdAt: Date;
    recurrencePattern?: string | null;
    recurrenceDays?: string | null;
    recurrenceEnd?: Date | null;
  },
  date: Date = new Date()
): boolean {
  // If recurrence has an end date and we're past it
  if (task.recurrenceEnd) {
    const end = new Date(task.recurrenceEnd);
    end.setHours(23, 59, 59, 999);
    if (date.getTime() > end.getTime()) return false;
  }

  // If task has a start date and we're before it
  if (task.startDate) {
    const start = new Date(task.startDate);
    start.setHours(0, 0, 0, 0);
    if (date.getTime() < start.getTime()) return false;
  }

  const persian = getPersianDateInfo(date);
  const pattern = task.recurrencePattern;

  switch (pattern) {
    case 'DAILY':
      return true;

    case 'WEEKLY': {
      let days: number[] = [];
      try {
        if (task.recurrenceDays) {
          const parsed = JSON.parse(task.recurrenceDays);
          if (Array.isArray(parsed)) days = parsed.map(Number);
        }
      } catch {
        // fallback
      }
      if (days.length === 0) {
        // Default to the same weekday as creation or startDate
        const baseDate = task.startDate ? new Date(task.startDate) : new Date(task.createdAt);
        const baseWeekday = getPersianWeekday(baseDate);
        return persian.weekday === baseWeekday;
      }
      return days.includes(persian.weekday);
    }

    case 'MONTHLY_DAYS': {
      let days: number[] = [];
      try {
        if (task.recurrenceDays) {
          const parsed = JSON.parse(task.recurrenceDays);
          if (Array.isArray(parsed)) days = parsed.map(Number);
        }
      } catch {
        // fallback
      }
      return days.includes(persian.jd);
    }

    case 'ODD_DAYS':
      return persian.isOddDay;

    case 'EVEN_DAYS':
      return persian.isEvenDay;

    default:
      return false;
  }
}

export async function processRecurringTasks(targetDate: Date = new Date()) {
  try {
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const recurringParents = await prisma.task.findMany({
      where: {
        isRecurring: true,
        recurringParentId: null,
      },
      include: {
        assignees: true,
        subtasks: true,
      },
    });

    const generatedTasks = [];

    for (const parent of recurringParents) {
      if (!isTaskDueOnDate(parent, targetDate)) {
        continue;
      }

      // Check if already generated for today
      const existingInstance = await prisma.task.findFirst({
        where: {
          recurringParentId: parent.id,
          startDate: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      });

      if (existingInstance) {
        continue;
      }

      // Also check lastGeneratedDate to avoid duplicates if startDate differs
      if (parent.lastGeneratedDate) {
        const lastGen = new Date(parent.lastGeneratedDate);
        if (
          lastGen.getFullYear() === targetDate.getFullYear() &&
          lastGen.getMonth() === targetDate.getMonth() &&
          lastGen.getDate() === targetDate.getDate()
        ) {
          continue;
        }
      }

      // Compute instance deadline based on parent's span if available
      let instanceDeadline: Date | undefined = undefined;
      if (parent.startDate && parent.deadline) {
        const diffMs = parent.deadline.getTime() - parent.startDate.getTime();
        instanceDeadline = new Date(startOfDay.getTime() + Math.max(diffMs, 24 * 60 * 60 * 1000 - 1));
      } else {
        instanceDeadline = new Date(endOfDay);
      }

      const instanceStartDate = new Date(startOfDay);

      const newTask = await prisma.task.create({
        data: {
          title: parent.title,
          description: parent.description,
          projectId: parent.projectId,
          createdById: parent.createdById,
          approverId: parent.approverId,
          status: 'TODO',
          startDate: instanceStartDate,
          deadline: instanceDeadline,
          estimatedHours: parent.estimatedHours,
          estimatedMinutes: parent.estimatedMinutes,
          weight: parent.weight,
          recurringParentId: parent.id,
          isRecurring: false,
          assignees: {
            create: parent.assignees.map((a) => ({ userId: a.userId })),
          },
          subtasks: parent.subtasks.length
            ? {
                create: parent.subtasks.map((s) => ({
                  title: s.title,
                })),
              }
            : undefined,
        },
      });

      await prisma.task.update({
        where: { id: parent.id },
        data: { lastGeneratedDate: targetDate },
      });

      if (parent.assignees.length > 0) {
        const assigneeIds = parent.assignees.map((a) => a.userId);
        notifyTaskAssignees(newTask.id, `[تکرار روز] ${newTask.title}`, assigneeIds).catch(console.error);
      }

      generatedTasks.push(newTask);
    }

    if (generatedTasks.length > 0) {
      console.log(`[RecurringTasks] Generated ${generatedTasks.length} task instances for ${targetDate.toISOString()}`);
    }

    return generatedTasks;
  } catch (err) {
    console.error('[RecurringTasks] Error processing recurring tasks:', err);
    return [];
  }
}

let schedulerInterval: NodeJS.Timeout | null = null;

export function initRecurringTasksScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  // Run on startup
  processRecurringTasks().catch(console.error);

  // Run every 15 minutes to catch day transitions or newly due tasks
  schedulerInterval = setInterval(() => {
    processRecurringTasks().catch(console.error);
  }, 15 * 60 * 1000);

  console.log('[RecurringTasks] Scheduler initialized (running every 15 minutes)');
}
