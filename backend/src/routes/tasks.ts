import { Router, Response, NextFunction } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { notifyTaskAssignees, notifyPendingApproval, notifyTaskApproved, notifyReportAdded, notifyPendingQc, notifyQcRejected, notifyQcPassed } from '../lib/notifications';
import { processRecurringTasks, materialiseOccurrences, NOT_TEMPLATE } from '../services/recurringTasks';
import { applyEditToFollowing, deleteOccurrences } from '../services/seriesEdit';
import path from 'path';
import fs from 'fs';
import { uploadsDir, storedFileExists, removeStoredFile } from '../lib/uploads';
import { rejectionsForTask, rejectionsForTasks, rejectionsByReviewer, qcDecisionsByReviewer, recordApproval } from '../services/rejectionHistory';

const router = Router();

/**
 * Write one history row per assignee for a task sent back for rework.
 *
 * Per assignee rather than per task, so counting how often someone was
 * rejected is a plain group-by instead of a join through the assignee list as
 * it stands today — which changes.
 */
async function recordRejection(
  taskId: number,
  assigneeIds: number[],
  stage: 'QC' | 'APPROVAL',
  byId: number,
  reason?: string | null,
  categories?: unknown,
  reworkMinutes?: number | null
): Promise<void> {
  if (assigneeIds.length === 0) return;
  await prisma.taskRejection.createMany({
    data: assigneeIds.map((userId) => ({
      taskId,
      userId,
      byId,
      stage,
      reason: reason || null,
      categories: normaliseCategories(categories) ?? [],
      reworkMinutes: validReworkMinutes(reworkMinutes) ? Number(reworkMinutes) : null,
    })),
  });
}

/**
 * What a list needs, which is much less than a task has.
 *
 * `GET /tasks` returned every column and every nested row of 4,132 tasks —
 * 31 MB on live data, requested by eleven different pages. Two fields were
 * almost all of it: task descriptions (12 MB) and full subtask rows with two
 * nested user objects each (13.3 MB, for 31,797 subtasks).
 *
 * Neither is ever rendered from a list. Every list use of `subtasks` counts
 * them — `length` and `filter(isDone)` — so the field keeps its name and
 * shape and only sheds what nobody reads. `description` is dropped entirely;
 * it arrives with the task itself when someone opens it, which is the only
 * place it is shown.
 */
const taskListSelect = {
  id: true, title: true, status: true,
  startDate: true, deadline: true, submittedForReviewAt: true,
  estimatedHours: true, estimatedMinutes: true, weight: true,
  approvedById: true, approvedAt: true, approverId: true,
  qcById: true, qcAt: true, qcNote: true, qcPassed: true,
  projectId: true, createdById: true,
  isRecurring: true, recurrencePattern: true, recurrenceDays: true,
  recurrenceEnd: true, recurringParentId: true, lastGeneratedDate: true,
  createdAt: true, updatedAt: true,
  project: {
    select: {
      id: true, name: true, departmentId: true, qcId: true,
      department: { select: { id: true, name: true } },
    },
  },
  assignees: {
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } } },
  },
  approver: { select: { id: true, firstName: true, lastName: true } },
  qcBy: { select: { id: true, firstName: true, lastName: true } },
  // Counted, never read: id and isDone are all any list does with these.
  subtasks: {
    orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
    select: { id: true, isDone: true },
  },
  createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
  approvedBy: { select: { id: true, firstName: true, lastName: true } },
  recurringParent: { select: { id: true, title: true } },
  _count: { select: { reports: true, recurringInstances: true } },
};

const taskInclude = {
  project: {
    select: {
      id: true,
      name: true,
      departmentId: true,
      qcId: true,
      department: { select: { id: true, name: true } },
    },
  },
  assignees: {
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } } },
  },
  approver: { select: { id: true, firstName: true, lastName: true } },
  qcBy: { select: { id: true, firstName: true, lastName: true } },
  subtasks: {
    // position carries the order the task owner arranged; id only breaks ties
    // between rows that have never been reordered and so share a position.
    orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
    include: {
      assignee: { select: { id: true, firstName: true, lastName: true } },
      completedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
  approvedBy: { select: { id: true, firstName: true, lastName: true } },
  recurringParent: { select: { id: true, title: true } },
  _count: { select: { reports: true, recurringInstances: true } },
};

function canManageTask(userRole: string) {
  return ['TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER', 'CEO', 'INTERNAL_MANAGER'].includes(userRole);
}

async function isAssignee(taskId: number, userId: number): Promise<boolean> {
  const a = await prisma.taskAssignee.findUnique({
    where: { taskId_userId: { taskId, userId } },
  });
  return !!a;
}

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    let where: any = {};

    if (user.role === 'EMPLOYEE') {
      const assignedTaskIds = await prisma.taskAssignee.findMany({
        where: { userId: user.id },
        select: { taskId: true },
      });
      // A reviewer must also see the tasks of the projects they QC, even
      // though those tasks are not assigned to them.
      where = {
        OR: [
          { id: { in: assignedTaskIds.map((a) => a.taskId) } },
          { project: { qcId: user.id } },
        ],
      };
    } else if (user.role === 'DEPARTMENT_MANAGER') {
      const projectIds = await managedProjectIds(user.id);
      // Same reason as in GET /projects: the reviewer sits outside the
      // project by design, so their QC queue lives outside their department.
      where = {
        OR: [
          { projectId: { in: projectIds } },
          { project: { qcId: user.id } },
        ],
      };
    }

    const tasks = await prisma.task.findMany({
      // Recurring templates hold the schedule and are never completed by
      // anyone; listing them as tasks is what produced permanent overdue rows.
      where: { AND: [where, NOT_TEMPLATE] },
      select: taskListSelect,
      orderBy: { createdAt: 'desc' },
    });

    // Attach the history only where someone is about to make a decision. The
    // full list runs to thousands of rows; the review queues are a few dozen,
    // and that is exactly where knowing "I already sent this back, for this"
    // changes what the reviewer does.
    const inReview = tasks.filter((t) => t.status === 'PENDING_QC' || t.status === 'PENDING_APPROVAL');
    const history = await rejectionsForTasks(inReview.map((t) => t.id));

    res.json(tasks.map((t) => (history.has(t.id) ? { ...t, rejections: history.get(t.id) } : t)));
  } catch (err) {
    console.error('get tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

/**
 * How full a given day already is for the people a task is about to land on.
 *
 * Weight is minutes and a working day is 480 of them, so "who is free on
 * Thursday" is answerable — it just was not asked anywhere. On live data one
 * person is carrying 2,130 minutes due on a single day, which is four and a
 * half working days of work with one deadline.
 *
 * Every status counts, not just the open ones: a task finished that morning
 * still used the hours, so leaving it out would show an empty day.
 *
 * Declared before `/:id` so "day-load" is not read as a task id.
 */
router.get('/day-load', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const date = String(req.query.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'تاریخ باید به شکل YYYY-MM-DD باشد.' });
    }
    const userIds = String(req.query.userIds || '')
      .split(',')
      .map((x) => parseInt(x))
      .filter((n) => !Number.isNaN(n));
    if (!userIds.length) return res.json({ date, people: [] });

    // Excluded so editing a task does not count its own minutes twice.
    const excludeId = parseInt(String(req.query.excludeTaskId || ''));

    const rows = await prisma.$queryRawUnsafe<
      { userId: number; tasks: bigint; minutes: bigint }[]
    >(
      `SELECT a."userId" AS "userId",
              count(DISTINCT t."id") AS tasks,
              COALESCE(SUM(COALESCE(t."estimatedHours",0) * 60
                         + COALESCE(t."estimatedMinutes",0)), 0) AS minutes
         FROM "TaskAssignee" a
         JOIN "Task" t ON t."id" = a."taskId"
        WHERE a."userId" = ANY($1::int[])
          AND t."deadline" IS NOT NULL
          AND NOT (t."isRecurring" = true AND t."recurringParentId" IS NULL)
          AND ((t."deadline" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran')::date = $2::date
          ${Number.isNaN(excludeId) ? '' : 'AND t."id" <> $3'}
        GROUP BY 1`,
      ...(Number.isNaN(excludeId) ? [userIds, date] : [userIds, date, excludeId])
    );

    const byUser = new Map(rows.map((r) => [r.userId, r]));
    res.json({
      date,
      minutesPerDay: WORKING_MINUTES_PER_DAY,
      people: userIds.map((id) => ({
        id,
        minutes: Number(byUser.get(id)?.minutes ?? 0),
        tasks: Number(byUser.get(id)?.tasks ?? 0),
      })),
    });
  } catch (err) {
    console.error('day load error:', err);
    res.status(500).json({ error: 'خطا در محاسبه بار آن روز' });
  }
});

/**
 * The reviewer's own queue.
 *
 * The page used to fetch every task and narrow it in the browser with
 * `status === 'PENDING_QC' && project.qcId === me` — 4,142 rows to display a
 * few dozen. The same two conditions are applied here, in the query.
 *
 * A dedicated route rather than a `?status=` filter on the list: the second
 * condition is "projects I review", which is not a property of the task, and
 * widening the shared list endpoint to express it would put every other
 * caller's scoping one mistake away from changing too.
 *
 * Declared before `/:id` so "qc-queue" is not parsed as a task id.
 */
router.get('/qc-queue', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const tasks = await prisma.task.findMany({
      where: {
        status: 'PENDING_QC',
        project: { qcId: req.user!.id },
        ...NOT_TEMPLATE,
      },
      select: taskListSelect,
      orderBy: { createdAt: 'desc' },
    });

    // The reviewer needs to see what they asked for last time, on this screen.
    const history = await rejectionsForTasks(tasks.map((t) => t.id));
    res.json(tasks.map((t) => (history.has(t.id) ? { ...t, rejections: history.get(t.id) } : t)));
  } catch (err) {
    console.error('qc queue error:', err);
    res.status(500).json({ error: 'خطا در دریافت صف کنترل کیفیت' });
  }
});

/**
 * What the signed-in reviewer has sent back.
 *
 * Declared before `/:id` so "rejections" is not parsed as a task id.
 */
/**
 * The reviewer's own decisions — what they passed and what they sent back —
 * in one list so the page can show either side or both without two requests.
 */
router.get('/qc-decisions/by-me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '60')) || 60));
    res.json(await qcDecisionsByReviewer(req.user!.id, limit));
  } catch (err) {
    console.error('reviewer decision history error:', err);
    res.status(500).json({ error: 'خطا در دریافت تاریخچه بررسی‌ها' });
  }
});

router.get('/rejections/by-me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '60')) || 60));
    res.json(await rejectionsByReviewer(req.user!.id, limit));
  } catch (err) {
    console.error('reviewer rejection history error:', err);
    res.status(500).json({ error: 'خطا در دریافت تاریخچه' });
  }
});

router.get('/my', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const assignedTaskIds = await prisma.taskAssignee.findMany({
      where: { userId },
      select: { taskId: true },
    });
    const tasks = await prisma.task.findMany({
      where: {
        id: { in: assignedTaskIds.map((a) => a.taskId) },
        ...NOT_TEMPLATE,
      },
      select: taskListSelect,
      orderBy: { createdAt: 'desc' },
    });
    res.json(tasks);
  } catch (err) {
    console.error('get my tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const user = req.user!;

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        ...taskInclude,
        recurringInstances: {
          select: {
            id: true,
            title: true,
            status: true,
            startDate: true,
            deadline: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 30,
        },
        reports: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'asc' },
        },
        attachments: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (user.role === 'EMPLOYEE') {
      const assigned = await isAssignee(id, user.id);
      // The project's QC reviewer must be able to open tasks they review,
      // including after a rejection, even though they are not an assignee.
      const isProjectQc = task.project?.qcId === user.id;
      if (!assigned && !isProjectQc) return res.status(403).json({ error: 'Access denied' });
    }

    // Every time this task was sent back, not just the latest decision: the
    // task's own qc fields are wiped on resubmission, so by the second review
    // the reviewer had nothing left to remind them what they had asked for.
    const rejections = await rejectionsForTask(id);

    res.json({ ...task, rejections });
  } catch (err) {
    console.error('get task error:', err);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

router.post('/process-recurring', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!canManageTask(user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const count = await processRecurringTasks();
    res.json({ success: true, count });
  } catch (err) {
    console.error('process recurring error:', err);
    res.status(500).json({ error: 'Failed to process recurring tasks' });
  }
});

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const {
      title,
      description,
      projectId,
      assigneeIds,
      approverId,
      startDate,
      deadline,
      estimatedHours,
      estimatedMinutes,
      subtasks,
      status,
      isRecurring,
      recurrencePattern,
      recurrenceDays,
      recurrenceEnd,
    } = req.body;

    const normalizedRecurringInput = Boolean(isRecurring);

    // One cause per message, naming what is actually wrong. A rejected save
    // sends the person back to a form they believed was complete, and
    // "Failed to create task" leaves them guessing which field to change.
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'عنوان تسک را وارد کنید.' });
    }
    if (!projectId) {
      return res.status(400).json({ error: 'پروژه تسک را انتخاب کنید.' });
    }
    if (!assigneeIds?.length) {
      return res.status(400).json({ error: 'حداقل یک انجام‌دهنده برای تسک انتخاب کنید.' });
    }
    if (normalizedRecurringInput && recurrencePattern === 'WEEKLY' && !recurrenceDays?.length) {
      return res.status(400).json({ error: 'برای تکرار هفتگی، حداقل یک روز هفته را انتخاب کنید.' });
    }

    if (!canManageTask(user.role)) {
      return res.status(403).json({ error: 'نقش شما اجازه ساخت تسک ندارد.' });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { department: { select: { name: true } } },
    });
    if (!project) {
      return res.status(404).json({ error: 'پروژه انتخاب‌شده پیدا نشد؛ ممکن است حذف شده باشد. صفحه را تازه کنید.' });
    }

    if (user.role === 'DEPARTMENT_MANAGER') {
      if (!(await managesDepartment(user.id, project.departmentId))) {
        return res.status(403).json({
          error: `شما مدیر دپارتمان «${project.department?.name ?? '—'}» نیستید و نمی‌توانید در پروژه «${project.name}» تسک بسازید.`,
        });
      }
    }

    // One query instead of one per assignee, and the answer names the people
    // who are missing rather than printing their numeric ids at the user.
    const foundAssignees = await prisma.user.findMany({
      where: { id: { in: assigneeIds } },
      select: { id: true },
    });
    if (foundAssignees.length !== assigneeIds.length) {
      const found = new Set(foundAssignees.map((u) => u.id));
      const missing = assigneeIds.filter((id: number) => !found.has(id));
      return res.status(404).json({
        error: `${missing.length} نفر از انجام‌دهنده‌های انتخاب‌شده دیگر در سیستم نیستند. صفحه را تازه کنید و دوباره انتخاب کنید.`,
      });
    }

    if (approverId) {
      const approver = await prisma.user.findUnique({ where: { id: parseInt(approverId as any) } });
      if (!approver) {
        return res.status(404).json({ error: 'تاییدکننده انتخاب‌شده پیدا نشد. صفحه را تازه کنید و دوباره انتخاب کنید.' });
      }
    }

    const normalizedRecurring = normalizedRecurringInput;
    const normalizedRecurrenceDays =
      normalizedRecurring && recurrenceDays
        ? Array.isArray(recurrenceDays)
          ? JSON.stringify(recurrenceDays)
          : typeof recurrenceDays === 'string'
          ? recurrenceDays
          : JSON.stringify(recurrenceDays)
        : null;

    const task = await prisma.task.create({
      data: {
        title,
        description,
        projectId,
        createdById: user.id,
        approverId: approverId ? parseInt(approverId as any) : user.id,
        status: status || 'TODO',
        startDate: startDate ? new Date(startDate) : undefined,
        // A recurring parent is a template, not work: each generated
        // occurrence carries its own deadline. Leaving the template's own
        // deadline set meant a row nobody ever completes sat in every list
        // ageing into permanent overdue.
        deadline: normalizedRecurring ? null : deadline ? new Date(deadline) : undefined,
        estimatedHours: estimatedHours || undefined,
        estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes as any) : undefined,
        weight: weightFromEstimate(estimatedHours, estimatedMinutes) ?? undefined,
        isRecurring: normalizedRecurring,
        recurrencePattern: normalizedRecurring ? recurrencePattern || 'DAILY' : null,
        recurrenceDays: normalizedRecurrenceDays,
        recurrenceEnd: normalizedRecurring && recurrenceEnd ? new Date(recurrenceEnd) : null,
        assignees: {
          create: assigneeIds.map((aid: number) => ({ userId: aid })),
        },
        subtasks: subtasks?.length
          ? {
              create: subtasks.map((st: { title: string; assigneeId?: number }, i: number) => ({
                title: st.title,
                assigneeId: validSubtaskAssignee(st.assigneeId, assigneeIds),
                position: i,
              })),
            }
          : undefined,
      },
      include: taskInclude,
    });

    if (normalizedRecurring) {
      // Awaited, not fired and forgotten: the user asked for those days and
      // expects to see them the moment they hit save.
      const count = await materialiseOccurrences(task.id, { notify: true });
      const full = await prisma.task.findUnique({ where: { id: task.id }, include: taskInclude });
      return res.status(201).json({ ...full, generatedOccurrences: count });
    }

    notifyTaskAssignees(task.id, task.title, assigneeIds).catch(console.error);
    res.status(201).json(task);
  } catch (err: any) {
    console.error('create task error:', err);
    // Prisma's codes name the failure precisely; passing them through as
    // "خطا در ایجاد تسک" threw away the one detail worth telling the user.
    if (err?.code === 'P2003') {
      return res.status(400).json({ error: 'یکی از موارد انتخاب‌شده (پروژه، انجام‌دهنده یا تاییدکننده) دیگر وجود ندارد. صفحه را تازه کنید.' });
    }
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'این تسک قبلاً ثبت شده است.' });
    }
    if (err?.code === 'P2025') {
      return res.status(404).json({ error: 'یکی از موارد مرتبط با تسک پیدا نشد. صفحه را تازه کنید و دوباره تلاش کنید.' });
    }
    if (err?.code === 'P1001' || err?.code === 'P1002') {
      return res.status(503).json({ error: 'ارتباط با پایگاه داده برقرار نشد و تسک ثبت نشد. چند لحظه بعد دوباره تلاش کنید.' });
    }
    if (err instanceof RangeError || err?.message?.includes('Invalid time value')) {
      return res.status(400).json({ error: 'تاریخ شروع یا مهلت تسک معتبر نیست.' });
    }
    res.status(500).json({ error: 'ثبت تسک در سرور ناموفق بود. اگر تکرار شد به پشتیبانی اطلاع دهید.' });
  }
});

/**
 * Which of the chosen people actually belong to each chosen project.
 *
 * Membership differs per project — in this organisation most projects carry
 * about nine members of whom only two are employees — so a person picked for
 * a batch is often a member of some projects and not others. The form needs
 * to show that before anything is created rather than after.
 */
/**
 * Build one task from a request body. Shared by the single-task route and the
 * multi-project batch, so the two can never drift apart on defaults, recurrence
 * handling or subtask ownership.
 */
async function createSingleTask(body: any, user: { id: number }) {
  const {
    title, description, projectId, assigneeIds, approverId, startDate, deadline,
    estimatedHours, estimatedMinutes, subtasks, status,
    isRecurring, recurrencePattern, recurrenceDays, recurrenceEnd,
  } = body;

  const normalizedRecurring = Boolean(isRecurring);
  const normalizedRecurrenceDays =
    normalizedRecurring && recurrenceDays
      ? Array.isArray(recurrenceDays)
        ? JSON.stringify(recurrenceDays)
        : typeof recurrenceDays === 'string'
        ? recurrenceDays
        : JSON.stringify(recurrenceDays)
      : null;

  const task = await prisma.task.create({
    data: {
      title,
      description,
      projectId,
      createdById: user.id,
      approverId: approverId ? parseInt(approverId as any) : user.id,
      status: status || 'TODO',
      startDate: startDate ? new Date(startDate) : undefined,
      // A recurring parent is a template, not work: each generated occurrence
      // carries its own deadline.
      deadline: normalizedRecurring ? null : deadline ? new Date(deadline) : undefined,
      estimatedHours: estimatedHours || undefined,
      estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes as any) : undefined,
      weight: weightFromEstimate(estimatedHours, estimatedMinutes) ?? undefined,
      isRecurring: normalizedRecurring,
      recurrencePattern: normalizedRecurring ? recurrencePattern || 'DAILY' : null,
      recurrenceDays: normalizedRecurrenceDays,
      recurrenceEnd: normalizedRecurring && recurrenceEnd ? new Date(recurrenceEnd) : null,
      assignees: { create: assigneeIds.map((aid: number) => ({ userId: aid })) },
      subtasks: subtasks?.length
        ? {
            create: subtasks.map((st: { title: string; assigneeId?: number }) => ({
              title: st.title,
              assigneeId: validSubtaskAssignee(st.assigneeId, assigneeIds),
            })),
          }
        : undefined,
    },
    include: taskInclude,
  });

  if (normalizedRecurring) {
    await materialiseOccurrences(task.id, { notify: true });
  } else {
    notifyTaskAssignees(task.id, task.title, assigneeIds).catch(console.error);
  }
  return task;
}

router.post('/membership-check', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!canManageTask(user.role)) return res.status(403).json({ error: 'Access denied' });

    const projectIds: number[] = (req.body.projectIds || []).map((n: any) => parseInt(n)).filter(Boolean);
    const userIds: number[] = (req.body.userIds || []).map((n: any) => parseInt(n)).filter(Boolean);
    if (!projectIds.length) return res.json({ projects: [] });

    const [projects, memberships] = await Promise.all([
      prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, name: true },
      }),
      prisma.projectMember.findMany({
        where: { projectId: { in: projectIds } },
        select: { projectId: true, userId: true },
      }),
    ]);

    const byProject = new Map<number, Set<number>>();
    for (const m of memberships) {
      if (!byProject.has(m.projectId)) byProject.set(m.projectId, new Set());
      byProject.get(m.projectId)!.add(m.userId);
    }

    res.json({
      projects: projects.map((p) => {
        const members = byProject.get(p.id) ?? new Set<number>();
        return {
          projectId: p.id,
          name: p.name,
          included: userIds.filter((u) => members.has(u)),
          missing: userIds.filter((u) => !members.has(u)),
        };
      }),
    });
  } catch (err) {
    console.error('membership-check error:', err);
    res.status(500).json({ error: 'Failed to check membership' });
  }
});

/**
 * Create the same task in several projects at once.
 *
 * Deliberately one independent task per project rather than a single task
 * spanning them: every part of the system — QC reviewer, department scoping,
 * per-project completion — assumes a task belongs to exactly one project, and
 * a shared task would be counted several times or not at all.
 */
router.post('/batch', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!canManageTask(user.role)) return res.status(403).json({ error: 'Access denied' });

    const { projectIds, assigneeIds, title } = req.body as {
      projectIds: number[]; assigneeIds: number[]; title: string;
    };
    if (!title || !projectIds?.length || !assigneeIds?.length) {
      return res.status(400).json({ error: 'عنوان، پروژه‌ها و مسئولان الزامی است' });
    }

    const memberships = await prisma.projectMember.findMany({
      where: { projectId: { in: projectIds } },
      select: { projectId: true, userId: true },
    });
    const membersOf = (pid: number) =>
      memberships.filter((m) => m.projectId === pid).map((m) => m.userId);

    // Refuse the whole batch rather than quietly creating a task nobody owns.
    const empty = projectIds.filter(
      (pid) => assigneeIds.filter((a) => membersOf(pid).includes(a)).length === 0
    );
    if (empty.length) {
      const names = await prisma.project.findMany({
        where: { id: { in: empty } }, select: { name: true },
      });
      return res.status(400).json({
        error: `این پروژه‌ها هیچ مسئولی نمی‌گیرند: ${names.map((n) => n.name).join('، ')}`,
      });
    }

    const created: { projectId: number; taskId: number }[] = [];
    for (const projectId of projectIds) {
      const forThis = assigneeIds.filter((a) => membersOf(projectId).includes(a));
      const body = { ...req.body, projectId, assigneeIds: forThis };
      const task = await createSingleTask(body, user);
      created.push({ projectId, taskId: task.id });
    }

    res.status(201).json({ created, count: created.length });
  } catch (err: any) {
    console.error('batch create error:', err);
    res.status(500).json({ error: err.message || 'خطا در ساخت گروهی تسک' });
  }
});

router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const user = req.user!;
    const {
      title,
      description,
      assigneeIds,
      approverId,
      status,
      startDate,
      deadline,
      estimatedHours,
      estimatedMinutes,
      isRecurring,
      recurrencePattern,
      recurrenceDays,
      recurrenceEnd,
      subtasks,
      scope,
    } = req.body;

    const task = await prisma.task.findUnique({
      where: { id },
      include: { project: { select: { departmentId: true } } },
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (user.role === 'DEPARTMENT_MANAGER') {
      if (!(await managesDepartment(user.id, task.project.departmentId))) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (!canManageTask(user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const data: any = {};
    if (title) data.title = title;
    if (description !== undefined) data.description = description;
    if (status) data.status = status;
    if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;
    if (deadline !== undefined) data.deadline = deadline ? new Date(deadline) : null;
    if (estimatedHours !== undefined) data.estimatedHours = estimatedHours;
    if (estimatedMinutes !== undefined) data.estimatedMinutes = estimatedMinutes ? parseInt(estimatedMinutes as any) : null;
    // Weight follows the estimate, so it is recalculated whenever either
    // half of the estimate is part of this update — never taken from the body.
    if (estimatedHours !== undefined || estimatedMinutes !== undefined) {
      data.weight = weightFromEstimate(
        estimatedHours !== undefined ? estimatedHours : task.estimatedHours,
        estimatedMinutes !== undefined ? estimatedMinutes : task.estimatedMinutes
      );
    }
    if (approverId !== undefined) data.approverId = approverId ? parseInt(approverId as any) : null;

    // The schedule lives on the series, not on one of its days. Writing it
    // onto an occurrence would quietly turn that day into a second template.
    if (isRecurring !== undefined && task.recurringParentId === null) {
      data.isRecurring = Boolean(isRecurring);
      data.recurrencePattern = data.isRecurring ? recurrencePattern || 'DAILY' : null;
      data.recurrenceDays =
        data.isRecurring && recurrenceDays
          ? Array.isArray(recurrenceDays)
            ? JSON.stringify(recurrenceDays)
            : typeof recurrenceDays === 'string'
            ? recurrenceDays
            : JSON.stringify(recurrenceDays)
          : null;
      data.recurrenceEnd = data.isRecurring && recurrenceEnd ? new Date(recurrenceEnd) : null;
    }

    /**
     * Subtasks arrive as the complete desired list, reconciled by id.
     *
     * Rows are matched rather than wiped and recreated: deleting them would
     * throw away which steps are already ticked, who ticked them and when,
     * and a rename in the edit form would silently reopen finished work.
     */
    if (Array.isArray(subtasks)) {
      const taskAssignees = await prisma.taskAssignee.findMany({
        where: { taskId: id },
        select: { userId: true },
      });
      // Assignees may be changing in this same request; honour the new list.
      const allowed = Array.isArray(assigneeIds) && assigneeIds.length
        ? assigneeIds.map((a: any) => parseInt(a))
        : taskAssignees.map((a) => a.userId);

      const existing = await prisma.taskSubtask.findMany({
        where: { taskId: id },
        select: { id: true },
      });
      const keptIds = subtasks
        .map((st: any) => parseInt(st.id))
        .filter((n: number) => !Number.isNaN(n));

      const removed = existing.filter((e) => !keptIds.includes(e.id)).map((e) => e.id);
      if (removed.length) {
        await prisma.taskSubtask.deleteMany({ where: { id: { in: removed } } });
      }

      // The array arrives in the order the form shows, so its index is the
      // new position — reordering needs no separate endpoint.
      let position = 0;
      for (const st of subtasks) {
        const title = String(st.title ?? '').trim();
        if (!title) continue;
        const owner = validSubtaskAssignee(st.assigneeId, allowed);
        const stId = parseInt(st.id);
        if (!Number.isNaN(stId) && existing.some((e) => e.id === stId)) {
          await prisma.taskSubtask.update({
            where: { id: stId },
            data: { title, assigneeId: owner, position },
          });
        } else {
          await prisma.taskSubtask.create({
            data: { taskId: id, title, assigneeId: owner, position },
          });
        }
        position += 1;
      }
    }

    if (assigneeIds) {
      await prisma.taskAssignee.deleteMany({ where: { taskId: id } });
      for (const aid of assigneeIds) {
        await prisma.taskAssignee.create({ data: { taskId: id, userId: aid } });
      }
      notifyTaskAssignees(id, task.title, assigneeIds).catch(console.error);
    }

    const updated = await prisma.task.update({
      where: { id },
      data,
      include: taskInclude,
    });

    let series = null;
    const inSeries = task.recurringParentId !== null || task.isRecurring;
    if (scope === 'following' && inSeries) {
      const finalAssignees: number[] = Array.isArray(assigneeIds) && assigneeIds.length
        ? assigneeIds.map((a: any) => parseInt(a))
        : updated.assignees.map((a) => a.userId);
      const normalizedDays = recurrenceDays
        ? Array.isArray(recurrenceDays) ? JSON.stringify(recurrenceDays)
          : typeof recurrenceDays === 'string' ? recurrenceDays : JSON.stringify(recurrenceDays)
        : null;

      series = await applyEditToFollowing(id, {
        assigneeIds: Array.isArray(assigneeIds) ? finalAssignees : undefined,
        subtasks: Array.isArray(subtasks)
          ? subtasks
              .map((st: any) => ({ title: String(st.title ?? '').trim(), assigneeId: validSubtaskAssignee(st.assigneeId, finalAssignees) }))
              .filter((st: { title: string }) => st.title)
          : undefined,
        // Only a real schedule is applied; switching recurrence off is what
        // "stop the series" is for, and it says what it deletes first.
        recurrence: isRecurring && recurrencePattern
          ? {
              recurrencePattern,
              recurrenceDays: normalizedDays,
              recurrenceEnd: recurrenceEnd ? new Date(recurrenceEnd) : null,
            }
          : undefined,
      });
    } else if (data.isRecurring) {
      processRecurringTasks().catch(console.error);
    }

    res.json(series ? { ...updated, series } : updated);
  } catch (err) {
    console.error('update task error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});


/**
 * Where a task goes once every assignee has ticked it off.
 *
 * Two paths reach this point — the assignee checkbox and an employee pressing
 * "submit for approval" — and they must agree, or QC becomes bypassable.
 */
/**
 * A subtask may only name someone who is already an assignee of the task.
 * Otherwise the step would be locked to a person who cannot open the task,
 * and nobody could ever tick it.
 */
function validSubtaskAssignee(assigneeId: unknown, taskAssigneeIds: number[]): number | null {
  const id = typeof assigneeId === 'number' ? assigneeId : parseInt(assigneeId as string);
  if (!id || Number.isNaN(id)) return null;
  return taskAssigneeIds.includes(id) ? id : null;
}

async function resolveCompletionTarget(projectId: number, assigneeIds: number[]) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { qcId: true },
  });
  const qcId = project?.qcId ?? null;
  const qcIsAssignee = qcId !== null && assigneeIds.includes(qcId);
  if (qcId !== null && !qcIsAssignee) {
    return { status: 'PENDING_QC' as const, qcId, skipNote: null };
  }
  return {
    status: 'PENDING_APPROVAL' as const,
    qcId: null,
    skipNote: qcIsAssignee
      ? 'کنترل کیفیت رد شد: مسئول کنترل کیفیت خود از انجام‌دهندگان این تسک است'
      : null,
  };
}

router.patch('/:id/assignee-complete', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const user = req.user!;
    const { isCompleted } = req.body;

    if (typeof isCompleted !== 'boolean') {
      return res.status(400).json({ error: 'isCompleted boolean is required' });
    }

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        ...taskInclude,
      },
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const assigned = task.assignees.some((a) => a.userId === user.id);
    if (!assigned && !canManageTask(user.role)) {
      return res.status(403).json({ error: 'You can only complete your own assigned tasks' });
    }

    // Check subtasks if marking complete
    if (isCompleted) {
      const hasUnfinishedSubtask = task.subtasks.some((s) => !s.isDone);
      if (hasUnfinishedSubtask) {
        return res.status(400).json({ error: 'ابتدا تمام موارد زیرلیست را تکمیل کنید' });
      }
    }

    // Update the assignee record
    await prisma.taskAssignee.update({
      where: { taskId_userId: { taskId: id, userId: user.id } },
      data: {
        isCompleted,
        completedAt: isCompleted ? new Date() : null,
      },
    });

    // Fetch updated assignees
    const assignees = await prisma.taskAssignee.findMany({
      where: { taskId: id },
    });

    const allAssigneesCompleted = assignees.length > 0 && assignees.every((a) => a.isCompleted);

    let nextStatus = task.status;
    if (allAssigneesCompleted && (task.status === 'TODO' || task.status === 'IN_PROGRESS')) {
      const target = await resolveCompletionTarget(task.projectId, assignees.map((a) => a.userId));
      const qcId = target.qcId;

      if (target.status === 'PENDING_QC') {
        nextStatus = 'PENDING_QC';
        await prisma.task.update({
          where: { id },
          // The handover moment: from here the wait belongs to the reviewer.
          data: { status: 'PENDING_QC', qcPassed: null, qcNote: null, qcAt: null, qcById: null, submittedForReviewAt: new Date() },
        });
        notifyPendingQc(id, task.title, qcId!).catch(console.error);
      } else {
        nextStatus = 'PENDING_APPROVAL';
        await prisma.task.update({
          where: { id },
          data: {
            status: 'PENDING_APPROVAL',
            submittedForReviewAt: new Date(),
            // Record why QC was skipped so the task history stays honest.
            qcNote: target.skipNote,
          },
        });
        notifyPendingApproval(id, task.title, task.projectId).catch(console.error);
      }
    } else if (!allAssigneesCompleted && (task.status === 'PENDING_APPROVAL' || task.status === 'PENDING_QC')) {
      // Someone unticked: pull it back out of any review queue, and let the
      // deadline clock run again — the work is unfinished after all.
      nextStatus = 'IN_PROGRESS';
      await prisma.task.update({
        where: { id },
        data: { status: 'IN_PROGRESS', submittedForReviewAt: null },
      });
    }

    const updatedTask = await prisma.task.findUnique({
      where: { id },
      include: taskInclude,
    });

    res.json(updatedTask);
  } catch (err) {
    console.error('assignee-complete error:', err);
    res.status(500).json({ error: 'Failed to update assignee status' });
  }
});

/**
 * Quality gate. Only the reviewer named on the project may act, and only while
 * the task is actually waiting on QC.
 */
router.patch('/:id/qc', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const user = req.user!;
    const { passed, note, categories, reworkMinutes } = req.body as {
      passed?: boolean;
      note?: string;
      categories?: string[];
      reworkMinutes?: number;
    };

    if (typeof passed !== 'boolean') {
      return res.status(400).json({ error: 'passed boolean is required' });
    }
    if (!passed) {
      // "Required" alone produced "." sixteen times in the first twenty-one
      // rejections, so this asks for something the assignee can act on.
      if (!meaningfulReason(note)) {
        return res.status(400).json({ error: REASON_TOO_SHORT });
      }
      // The categories are the part that can be counted; free text cannot.
      // More than one is allowed: a task can be wrong in two ways at once.
      if (!normaliseCategories(categories)) {
        return res.status(400).json({
          error: `حداقل یک دسته دلیل رد را انتخاب کنید: ${REJECTION_CATEGORIES.map((c) => c.label).join('، ')}.`,
        });
      }
      // Without it the month's "useful work" cannot be worked out, so it is
      // asked for at the one moment the answer is known.
      if (!validReworkMinutes(reworkMinutes)) {
        return res.status(400).json({ error: REWORK_INVALID });
      }
    }

    const task = await prisma.task.findUnique({
      where: { id },
      include: { ...taskInclude, project: { select: { id: true, name: true, departmentId: true, qcId: true } } },
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (task.status !== 'PENDING_QC') {
      return res.status(400).json({ error: 'این تسک در مرحله کنترل کیفیت نیست' });
    }
    if (task.project.qcId !== user.id) {
      return res.status(403).json({ error: 'فقط مسئول کنترل کیفیت این پروژه می‌تواند بررسی کند' });
    }

    const assigneeIds = task.assignees.map((a) => a.userId);

    if (passed) {
      await prisma.task.update({
        where: { id },
        data: {
          status: 'PENDING_APPROVAL',
          qcPassed: true,
          qcById: user.id,
          qcAt: new Date(),
          qcNote: note?.trim() || null,
        },
      });
      // Kept in history: the qc* fields above are overwritten the next time
      // this task goes through review, exactly as rejections were.
      await recordApproval(id, 'QC', user.id, note?.trim() || null);
      notifyQcPassed(id, task.title, assigneeIds).catch(console.error);
      notifyPendingApproval(id, task.title, task.projectId).catch(console.error);
    } else {
      // Send it back for rework: clear the completion ticks so the assignees
      // have to re-confirm once they have actually fixed it.
      await prisma.taskAssignee.updateMany({
        where: { taskId: id },
        data: { isCompleted: false, completedAt: null },
      });
      await prisma.task.update({
        where: { id },
        data: {
          status: 'IN_PROGRESS',
          // The work is theirs again, so the deadline clock runs again.
          submittedForReviewAt: null,
          qcPassed: false,
          qcById: user.id,
          qcAt: new Date(),
          qcNote: note!.trim(),
        },
      });
      // Keep the rejection in history: the fields above are overwritten the
      // next time this task goes through QC.
      await recordRejection(id, assigneeIds, 'QC', user.id, note!.trim(), categories, reworkMinutes);
      notifyQcRejected(id, task.title, assigneeIds, note!.trim()).catch(console.error);
    }

    const updated = await prisma.task.findUnique({ where: { id }, include: taskInclude });
    res.json(updated);
  } catch (err) {
    console.error('qc review error:', err);
    res.status(500).json({ error: 'Failed to record QC decision' });
  }
});

router.patch('/:id/status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const user = req.user!;
    const { status } = req.body;

    if (!status) return res.status(400).json({ error: 'Status is required' });

    const validStatuses = ['TODO', 'IN_PROGRESS', 'PENDING_APPROVAL', 'DONE'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const task = await prisma.task.findUnique({
      where: { id },
      include: { subtasks: true, assignees: true },
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    // Validate that all subtasks are completed before moving to PENDING_APPROVAL or DONE
    if (status === 'PENDING_APPROVAL' || status === 'DONE') {
      const hasUnfinishedSubtask = task.subtasks.some((s) => !s.isDone);
      if (hasUnfinishedSubtask) {
        return res.status(400).json({ error: 'ابتدا تمام موارد زیرلیست را تکمیل کنید' });
      }
    }

    // Authorization logic
    let isAuthorized = false;

    // 1. The designated approver may close the task — but only once it has
    //    actually reached approval. Without the status check this shortcut let
    //    an approver jump straight from TODO (or from PENDING_QC, skipping the
    //    quality gate entirely) to DONE.
    if (status === 'DONE' && task.approverId === user.id && task.status === 'PENDING_APPROVAL') {
      isAuthorized = true;
    }

    // 2. Standard role-based check if not already authorized
    if (!isAuthorized) {
      if (user.role === 'EMPLOYEE') {
        const assigned = await isAssignee(id, user.id);
        if (!assigned) return res.status(403).json({ error: 'You can only change your own tasks' });
        if (task.status !== 'TODO' && task.status !== 'IN_PROGRESS') {
          return res.status(403).json({ error: 'You can only submit a task that is TODO or IN_PROGRESS' });
        }
        if (status !== 'PENDING_APPROVAL') {
          return res.status(403).json({ error: 'Employees can only submit tasks for approval' });
        }

        // Check if there are other assignees who haven't completed
        await prisma.taskAssignee.update({
          where: { taskId_userId: { taskId: id, userId: user.id } },
          data: { isCompleted: true, completedAt: new Date() },
        });

        const allAssignees = await prisma.taskAssignee.findMany({ where: { taskId: id } });
        const allDone = allAssignees.every((a) => a.isCompleted);
        if (!allDone) {
          // Keep in IN_PROGRESS until all have checked
          await prisma.task.update({
            where: { id },
            data: { status: 'IN_PROGRESS' },
          });
          const updated = await prisma.task.findUnique({
            where: { id },
            include: taskInclude,
          });
          return res.json({
            ...updated,
            message: 'تسک توسط شما تیک خورد. منتظر تکمیل سایر انجام‌دهندگان است.',
          });
        }

        // Everyone is done. Send it to QC when the project has a reviewer,
        // rather than letting this path jump straight to approval.
        const target = await resolveCompletionTarget(
          task.projectId,
          allAssignees.map((a) => a.userId)
        );
        if (target.status === 'PENDING_QC') {
          await prisma.task.update({
            where: { id },
            data: { status: 'PENDING_QC', qcPassed: null, qcNote: null, qcAt: null, qcById: null, submittedForReviewAt: new Date() },
          });
          notifyPendingQc(id, task.title, target.qcId!).catch(console.error);
          const updated = await prisma.task.findUnique({ where: { id }, include: taskInclude });
          return res.json({ ...updated, message: 'تسک برای کنترل کیفیت ارسال شد.' });
        }
        if (target.skipNote) {
          await prisma.task.update({ where: { id }, data: { qcNote: target.skipNote } });
        }
        isAuthorized = true;
      } else if (user.role === 'DEPARTMENT_MANAGER') {
        // The task must sit in one of the departments this person runs.
        const project = await prisma.project.findUnique({ where: { id: task.projectId } });
        if (!project || !(await managesDepartment(user.id, project.departmentId))) {
          return res.status(403).json({ error: 'Access denied' });
        }

        if (task.status !== 'PENDING_APPROVAL' && status === 'DONE') {
          return res.status(403).json({ error: 'Task must be in PENDING_APPROVAL before approving' });
        }
        isAuthorized = true;
      } else if (canManageTask(user.role)) {
        if (task.status !== 'PENDING_APPROVAL' && status === 'DONE') {
          return res.status(403).json({ error: 'Task must be in PENDING_APPROVAL before approving' });
        }
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Coming back out of a review gate is a rejection, whoever did it.
    const sentBack =
      (task.status === 'PENDING_QC' || task.status === 'PENDING_APPROVAL') &&
      (status === 'TODO' || status === 'IN_PROGRESS');
    if (sentBack) {
      const current = await prisma.taskAssignee.findMany({ where: { taskId: id }, select: { userId: true } });
      await recordRejection(
        id,
        current.map((a) => a.userId),
        task.status === 'PENDING_QC' ? 'QC' : 'APPROVAL',
        user.id,
        req.body?.note?.trim() || null
      );
    }

    const data: any = { status };
    if (status === 'DONE') {
      data.approvedById = user.id;
      data.approvedAt = new Date();
      await recordApproval(id, 'APPROVAL', user.id, req.body?.note?.trim() || null);
      // Mark all assignees as completed
      await prisma.taskAssignee.updateMany({
        where: { taskId: id },
        data: { isCompleted: true, completedAt: new Date() },
      });
    } else if (status === 'TODO') {
      data.approvedById = null;
      data.approvedAt = null;
      data.submittedForReviewAt = null;
      // Reset all assignees
      await prisma.taskAssignee.updateMany({
        where: { taskId: id },
        data: { isCompleted: false, completedAt: null },
      });
    } else if (status === 'PENDING_APPROVAL') {
      data.approvedById = null;
      data.approvedAt = null;
      // Coming from QC the handover already happened; only stamp it when the
      // task jumps straight into review, or the clock would restart.
      if (!task.submittedForReviewAt) data.submittedForReviewAt = new Date();
      // Mark all assignees completed if moving directly to PENDING_APPROVAL
      await prisma.taskAssignee.updateMany({
        where: { taskId: id },
        data: { isCompleted: true, completedAt: new Date() },
      });
    }
    // Whatever gate it came back from, the work is the assignee's again.
    if (sentBack) data.submittedForReviewAt = null;

    const updated = await prisma.task.update({
      where: { id },
      data,
      include: taskInclude,
    });

    if (status === 'PENDING_APPROVAL') {
      notifyPendingApproval(id, task.title, task.projectId).catch(console.error);
    } else if (status === 'DONE' && task.status === 'PENDING_APPROVAL') {
      notifyTaskApproved(id, task.title, task.createdById).catch(console.error);
    }

    res.json(updated);
  } catch (err) {
    console.error('update task status error:', err);
    res.status(500).json({ error: 'Failed to update task status' });
  }
});

router.post('/:id/reports', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const user = req.user!;
    const { content } = req.body;

    if (!content) return res.status(400).json({ error: 'Content is required' });

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (user.role === 'EMPLOYEE') {
      const assigned = await isAssignee(id, user.id);
      if (!assigned) return res.status(403).json({ error: 'You can only report on your own tasks' });
    }

    const report = await prisma.taskReport.create({
      data: { content, taskId: id, userId: user.id },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    notifyReportAdded(id, task.title, task.projectId, `${user.firstName} ${user.lastName}`).catch(console.error);

    res.status(201).json(report);
  } catch (err) {
    console.error('create report error:', err);
    res.status(500).json({ error: 'Failed to create report' });
  }
});

router.get('/:id/reports', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const user = req.user!;

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (user.role === 'EMPLOYEE') {
      const assigned = await isAssignee(id, user.id);
      if (!assigned) return res.status(403).json({ error: 'Access denied' });
    }

    const reports = await prisma.taskReport.findMany({
      where: { taskId: id },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

router.patch('/:id/subtasks/:subtaskId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const subtaskId = parseInt(req.params.subtaskId as string);
    const { isDone } = req.body;

    if (typeof isDone !== 'boolean') return res.status(400).json({ error: 'isDone is required' });

    const user = req.user!;
    const task = await prisma.task.findUnique({
      where: { id },
      include: { assignees: { select: { userId: true } } },
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const subtask = await prisma.taskSubtask.findUnique({ where: { id: subtaskId } });
    if (!subtask || subtask.taskId !== id) return res.status(404).json({ error: 'Subtask not found' });

    // This endpoint previously accepted any authenticated caller, so anyone
    // could tick any step of any task — including tasks in projects they had
    // nothing to do with. Now that a step can name its owner, the rule is
    // enforced here rather than only suggested in the interface.
    const isTaskAssignee = task.assignees.some((a) => a.userId === user.id);
    const isManager = canManageTask(user.role);

    if (!isManager) {
      if (subtask.assigneeId != null) {
        // A named step belongs to that person.
        if (subtask.assigneeId !== user.id) {
          return res.status(403).json({ error: 'این زیرتسک به شخص دیگری سپرده شده است' });
        }
      } else if (!isTaskAssignee) {
        // An unnamed step is open to anyone working on the task.
        return res.status(403).json({ error: 'شما از مسئولان این تسک نیستید' });
      }
    }

    const updated = await prisma.taskSubtask.update({
      where: { id: subtaskId },
      data: {
        isDone,
        completedAt: isDone ? new Date() : null,
        completedById: isDone ? user.id : null,
      },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
        completedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    res.json(updated);
  } catch (err) {
    console.error('update subtask error:', err);
    res.status(500).json({ error: 'Failed to update subtask' });
  }
});

router.post('/:id/subtasks', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const user = req.user!;
    const { title } = req.body;

    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (!canManageTask(user.role)) return res.status(403).json({ error: 'Access denied' });

    const taskAssignees = await prisma.taskAssignee.findMany({
      where: { taskId: id },
      select: { userId: true },
    });
    const ownerId = validSubtaskAssignee(req.body.assigneeId, taskAssignees.map((a) => a.userId));

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    // A step added on its own belongs at the end of the list, not merged into
    // the middle by whatever position happens to be free.
    const last = await prisma.taskSubtask.findFirst({
      where: { taskId: id },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    const subtask = await prisma.taskSubtask.create({
      data: { title, taskId: id, assigneeId: ownerId, position: (last?.position ?? -1) + 1 },
      include: { assignee: { select: { id: true, firstName: true, lastName: true } } },
    });
    res.status(201).json(subtask);
  } catch (err) {
    console.error('create subtask error:', err);
    res.status(500).json({ error: 'Failed to create subtask' });
  }
});

/**
 * Series management for a recurring task.
 *
 * Every operation here draws the same line: an occurrence that is done, or
 * whose day has passed, is history. Rewriting it would falsify the record of
 * work actually delivered, and deleting it would tear a hole in the delivery
 * statistics without any work having disappeared. Only untouched future
 * occurrences are ever changed.
 */

/** Occurrences that may still be edited or cancelled. */
function futureOccurrenceWhere(templateId: number) {
  return {
    recurringParentId: templateId,
    status: { not: 'DONE' as const },
    OR: [
      { startDate: null },
      { startDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    ],
  };
}

/** What a series looks like right now, so the UI can state the consequences. */
router.get('/:id/series', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const task = await prisma.task.findUnique({
      where: { id },
      select: { id: true, isRecurring: true, recurringParentId: true },
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    // Works whether the user opened the template or one of its occurrences.
    const templateId = task.recurringParentId ?? (task.isRecurring ? task.id : null);
    if (!templateId) return res.json({ isSeries: false });

    const template = await prisma.task.findUnique({
      where: { id: templateId },
      select: {
        id: true, title: true, recurrencePattern: true,
        recurrenceDays: true, recurrenceEnd: true, isRecurring: true,
      },
    });
    if (!template) return res.json({ isSeries: false });

    const [total, upcoming, done] = await Promise.all([
      prisma.task.count({ where: { recurringParentId: templateId } }),
      prisma.task.count({ where: futureOccurrenceWhere(templateId) }),
      prisma.task.count({ where: { recurringParentId: templateId, status: 'DONE' } }),
    ]);

    res.json({
      isSeries: true,
      templateId,
      template,
      viewingTemplate: task.id === templateId,
      counts: { total, upcoming, done, past: total - upcoming - done },
    });
  } catch (err) {
    console.error('series info error:', err);
    res.status(500).json({ error: 'Failed to load series' });
  }
});

/**
 * Stop a series: remove the untouched future occurrences and close the
 * schedule so the scheduler does not simply recreate them on its next pass.
 */
router.delete('/:id/series', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const user = req.user!;
    if (!canManageTask(user.role)) return res.status(403).json({ error: 'Access denied' });

    const task = await prisma.task.findUnique({
      where: { id },
      select: { id: true, isRecurring: true, recurringParentId: true },
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const templateId = task.recurringParentId ?? (task.isRecurring ? task.id : null);
    if (!templateId) return res.status(400).json({ error: 'این تسک بخشی از یک سری تکرار نیست' });

    const targets = await prisma.task.findMany({
      where: futureOccurrenceWhere(templateId),
      select: { id: true },
    });
    const ids = targets.map((t) => t.id);

    await deleteOccurrences(ids);

    // Without this the hourly top-up would rebuild everything just deleted.
    await prisma.task.update({
      where: { id: templateId },
      data: { isRecurring: false, recurrenceEnd: new Date() },
    });

    res.json({ cancelled: ids.length });
  } catch (err) {
    console.error('series cancel error:', err);
    res.status(500).json({ error: 'Failed to cancel series' });
  }
});

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const user = req.user!;

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (!canManageTask(user.role) && task.createdById !== user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.notification.deleteMany({ where: { taskId: id } });
    
    // Delete files from disk first
    const attachments = await prisma.taskAttachment.findMany({ where: { taskId: id } });
    for (const att of attachments) {
      removeStoredFile(att.fileUrl);
    }
    await prisma.taskAttachment.deleteMany({ where: { taskId: id } });

    await prisma.taskReport.deleteMany({ where: { taskId: id } });
    await prisma.taskAssignee.deleteMany({ where: { taskId: id } });
    await prisma.taskSubtask.deleteMany({ where: { taskId: id } });
    await prisma.task.delete({ where: { id } });
    res.json({ message: 'Task deleted successfully' });
  } catch (err) {
    console.error('delete task error:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

/**
 * Hand a subtask to someone, or release it back to the whole team.
 *
 * Separate from the tick endpoint on purpose: deciding who owns a step is a
 * management action, while ticking it is the work itself, and they need
 * different permissions.
 */
router.patch('/:id/subtasks/:subtaskId/assignee', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const subtaskId = parseInt(req.params.subtaskId as string);
    const user = req.user!;

    if (!canManageTask(user.role)) return res.status(403).json({ error: 'Access denied' });

    const subtask = await prisma.taskSubtask.findUnique({ where: { id: subtaskId } });
    if (!subtask || subtask.taskId !== id) return res.status(404).json({ error: 'Subtask not found' });

    const taskAssignees = await prisma.taskAssignee.findMany({
      where: { taskId: id },
      select: { userId: true },
    });
    const ids = taskAssignees.map((a) => a.userId);

    // null clears the owner, which returns the step to any task assignee.
    const raw = req.body.assigneeId;
    let ownerId: number | null = null;
    if (raw !== null && raw !== undefined && raw !== '') {
      ownerId = validSubtaskAssignee(raw, ids);
      if (ownerId === null) {
        return res.status(400).json({ error: 'این شخص از مسئولان این تسک نیست' });
      }
    }

    const updated = await prisma.taskSubtask.update({
      where: { id: subtaskId },
      data: { assigneeId: ownerId },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
        completedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    res.json(updated);
  } catch (err) {
    console.error('set subtask assignee error:', err);
    res.status(500).json({ error: 'Failed to set subtask assignee' });
  }
});

router.delete('/:id/subtasks/:subtaskId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const subtaskId = parseInt(req.params.subtaskId as string);
    const user = req.user!;
    if (!canManageTask(user.role)) return res.status(403).json({ error: 'Access denied' });

    const subtask = await prisma.taskSubtask.findUnique({ where: { id: subtaskId } });
    if (!subtask || subtask.taskId !== id) return res.status(404).json({ error: 'Subtask not found' });

    await prisma.taskSubtask.delete({ where: { id: subtaskId } });
    res.json({ message: 'Subtask deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete subtask' });
  }
});

import multer from 'multer';
import { decodeUploadName } from '../lib/uploadName';
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_LABEL } from '../lib/uploadLimits';
import { weightFromEstimate } from '../lib/taskWeight';
import { WORKING_MINUTES_PER_DAY } from '../lib/capacity';
import { REJECTION_CATEGORIES, normaliseCategories, meaningfulReason, REASON_TOO_SHORT, validReworkMinutes, REWORK_INVALID } from '../lib/rejectionCategories';
import { managedDepartmentIds, managedProjectIds, managesDepartment } from '../lib/departments';


const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'file-' + uniqueSuffix + ext);
  },
});

// Without an explicit ceiling multer accepts any size, which on a 23 GB disk
// is one careless upload away from filling it.
const upload = multer({ storage, limits: { fileSize: MAX_ATTACHMENT_BYTES } });

/**
 * Multer rejects an oversized file by throwing, which without this lands in
 * the generic 500 handler and tells the user nothing about why.
 */
function handleAttachmentUpload(req: AuthRequest, res: Response, next: NextFunction) {
  upload.single('file')(req as any, res as any, (err: any) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `حجم فایل بیشتر از ${MAX_ATTACHMENT_LABEL} است.` });
    }
    if (err) {
      console.error('attachment upload error:', err);
      return res.status(400).json({ error: 'دریافت فایل ناموفق بود. دوباره تلاش کنید.' });
    }
    next();
  });
}

router.post('/:id/attachments', authenticate, handleAttachmentUpload, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const user = req.user!;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) {
      if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(404).json({ error: 'Task not found' });
    }

    const assigned = await isAssignee(id, user.id);
    const isCreator = task.createdById === user.id;
    const isApprover = task.approverId === user.id;
    const isManager = canManageTask(user.role);

    if (!assigned && !isCreator && !isApprover && !isManager) {
      if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(403).json({ error: 'Access denied' });
    }

    const fileUrl = `/uploads/${file.filename}`;
    const attachment = await prisma.taskAttachment.create({
      data: {
        filename: decodeUploadName(file.originalname),
        fileUrl,
        mimeType: file.mimetype,
        taskId: id,
        userId: user.id,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    res.status(201).json(attachment);
  } catch (err) {
    console.error('upload attachment error:', err);
    res.status(500).json({ error: 'Failed to upload attachment' });
  }
});

router.delete('/:id/attachments/:attachmentId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const attachmentId = parseInt(req.params.attachmentId as string);
    const user = req.user!;

    const attachment = await prisma.taskAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.taskId !== id) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    if (attachment.userId !== user.id && !canManageTask(user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Must go through the shared helper: uploads no longer live under the
    // process working directory, so resolving from cwd would silently miss
    // the file and leave it orphaned on disk.
    removeStoredFile(attachment.fileUrl);

    await prisma.taskAttachment.delete({ where: { id: attachmentId } });

    res.json({ message: 'Attachment deleted successfully' });
  } catch (err) {
    console.error('delete attachment error:', err);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

export default router;
