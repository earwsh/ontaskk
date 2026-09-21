import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { callPython, callRust, microservicesHealth } from '../services/analysisClient';
import { isTaskOverdue, isAwaitingReview } from '../lib/deadline';
import { buildDeliveryView } from '../services/deliveryView';
import { NOT_TEMPLATE } from '../services/recurringTasks';
import { managedDepartmentIds } from '../lib/departments';
import { employeeMonthlyStats } from '../services/employeeStats';
import { dailyRate, rejectionAnalytics, capacityByDay, latenessAnalytics, monthlyScorecard, personScorecard, currentJalaliMonthKey, ScorecardInputError } from '../services/rateAnalytics';
import { WORKING_MINUTES_PER_DAY, workingDays } from '../lib/capacity';

const router = Router();

router.get('/health-check', authenticate, async (_req, res) => {
  const health = await microservicesHealth();
  res.json(health);
});

/* ────────────────────────────────────────────────────────────────
   Helpers: microservice-first, JS fallback
   ──────────────────────────────────────────────────────────────── */

type AnyTask = { id: number; status: string; deadline: Date | null; submittedForReviewAt?: Date | null; assignees: { userId: number }[]; projectId?: number | null; project?: { id: number; name: string } | null; weight?: number | null; estimatedMinutes?: number | null };



function toRustTask(t: AnyTask) {
  return {
    status: t.status,
    deadline: t.deadline ? t.deadline.toISOString() : null,
    // Rust decides the project's risk label from its own overdue count, so it
    // needs the handover moment or it re-introduces the rule we just fixed.
    submitted_for_review_at: t.submittedForReviewAt ? t.submittedForReviewAt.toISOString() : null,
    assignee_ids: t.assignees.map((a) => a.userId),
  };
}

async function counts(tasks: AnyTask[]): Promise<{ total: number; todo: number; inProgress: number; pendingApproval: number; done: number; completionRate: number; overdue: number; awaitingReview: number; computedBy?: string }> {
  const r = await callRust('/aggregate/tasks', { tasks: tasks.map(toRustTask) });
  const sc = r?.statusCounts || {};
  const total = r?.total ?? tasks.length;
  const done = sc.DONE ?? tasks.filter((t) => t.status === 'DONE').length;
  const fallback = {
    total,
    todo: tasks.filter((t) => t.status === 'TODO').length,
    inProgress: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
    pendingApproval: tasks.filter((t) => t.status === 'PENDING_APPROVAL').length,
    done,
    completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
    overdue: tasks.filter((t) => isTaskOverdue(t.deadline, t.status, t.submittedForReviewAt)).length,
    // Work handed over and waiting on a reviewer: not lateness, but not
    // finished either — and it used to be counted as the assignee's delay.
    awaitingReview: tasks.filter((t) => isAwaitingReview(t.status)).length,
  };
  if (!r) return fallback;
  return {
    total: r.total ?? fallback.total,
    todo: sc.TODO ?? fallback.todo,
    inProgress: sc.IN_PROGRESS ?? fallback.inProgress,
    pendingApproval: sc.PENDING_APPROVAL ?? fallback.pendingApproval,
    done,
    completionRate: r.completionRate !== undefined ? Math.round(r.completionRate) : fallback.completionRate,
    overdue: r.overdue ?? fallback.overdue,
    awaitingReview: fallback.awaitingReview,
    computedBy: r.computedBy,
  };
}

async function projectBreakdown(projects: { id: number; name: string; tasks: AnyTask[] }[]) {
  const r = await callRust('/aggregate/projects', {
    projects: projects.map((p) => ({ id: p.id, name: p.name, tasks: p.tasks.map((t) => ({ status: t.status })) })),
  });
  if (r?.projects) {
    return r.projects.map((p: any) => ({
      projectId: p.projectId,
      projectName: p.projectName,
      total: p.total,
      done: p.done,
      completionRate: Math.round(p.completionRate),
    }));
  }
  return projects.map((p) => {
    const pDone = p.tasks.filter((t) => t.status === 'DONE').length;
    return {
      projectId: p.id,
      projectName: p.name,
      total: p.tasks.length,
      done: pDone,
      completionRate: p.tasks.length > 0 ? Math.round((pDone / p.tasks.length) * 100) : 0,
    };
  });
}

async function computeMemberPerformance(tasks: AnyTask[], names: Map<number, string>, withOverdue = true) {
  const r = await callRust('/aggregate/members', { tasks: tasks.map(toRustTask) });
  if (r?.members) {
    return r.members.map((m: any) => ({
      userId: m.userId,
      name: names.get(m.userId) || `کاربر ${m.userId}`,
      total: m.total,
      done: m.done,
      completionRate: Math.round(m.completionRate),
      ...(withOverdue ? { overdue: m.overdue } : {}),
    }));
  }
  const map = new Map<number, { name: string; total: number; done: number; overdue: number }>();
  for (const [uid, name] of names) map.set(uid, { name, total: 0, done: 0, overdue: 0 });
  for (const t of tasks) {
    const done = t.status === 'DONE';
    const overdue = isTaskOverdue(t.deadline, t.status, t.submittedForReviewAt);
    for (const a of t.assignees) {
      const entry = map.get(a.userId);
      if (!entry) continue;
      entry.total++;
      if (done) entry.done++;
      if (overdue) entry.overdue++;
    }
  }
  return Array.from(map.entries())
    .map(([userId, s]) => ({
      userId,
      name: s.name,
      total: s.total,
      done: s.done,
      completionRate: s.total > 0 ? Math.round((s.done / s.total) * 100) : 0,
      ...(withOverdue ? { overdue: s.overdue } : {}),
    }))
    .filter((u) => u.total > 0)
    .sort((a, b) => b.completionRate - a.completionRate);
}

/* ────────────────────────────────────────────────────────────────
   Scope helpers: DEPARTMENT_MANAGER → own dept, else org-wide
   ──────────────────────────────────────────────────────────────── */

type ScopedTask = AnyTask & {
  title?: string | null;
  description?: string | null;
  estimatedHours?: number | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  approvedAt?: Date | null;
};

type ScopedProject = { id: number; name: string; departmentId: number; tasks: ScopedTask[] };
type ScopedDepartment = { id: number; name: string; managerName: string | null; projects: ScopedProject[] };

type Scope = {
  scopeLabel: string;
  departments: ScopedDepartment[];
  allProjects: ScopedProject[];
  allTasks: ScopedTask[];
  memberNames: Map<number, string>;
  memberDept: Map<number, string>;
};

async function resolveScope(user: { id: number; role: string }): Promise<Scope> {
  let where: { id?: { in: number[] } } = {};
  let scopeLabel = 'کل سازمان';

  if (user.role === 'DEPARTMENT_MANAGER') {
    const managed = await prisma.department.findMany({
      where: { managerId: user.id },
      select: { id: true, name: true },
    });
    if (managed.length === 0) {
      return { scopeLabel: '—', departments: [], allProjects: [], allTasks: [], memberNames: new Map(), memberDept: new Map() };
    }
    scopeLabel = managed.length === 1
      ? managed[0]!.name
      : `${managed.length} دپارتمان: ${managed.map((d) => d.name).join('، ')}`;
    where = { id: { in: managed.map((d) => d.id) } };
  }

  const departments = await prisma.department.findMany({
    where,
    include: {
      manager: { select: { firstName: true, lastName: true } },
      projects: {
        include: {
          tasks: {
            where: NOT_TEMPLATE,
            select: {
              id: true, title: true, description: true, status: true, deadline: true, submittedForReviewAt: true,
              estimatedHours: true, weight: true, estimatedMinutes: true, createdAt: true, updatedAt: true, approvedAt: true,
              projectId: true, assignees: { select: { userId: true } },
            },
          },
        },
      },
    },
  });

  const scopedDepts: ScopedDepartment[] = departments.map((d) => ({
    id: d.id,
    name: d.name,
    managerName: d.manager ? `${d.manager.firstName} ${d.manager.lastName}` : null,
    projects: d.projects.map((p) => ({
      id: p.id,
      name: p.name,
      departmentId: d.id,
      tasks: p.tasks as ScopedTask[],
    })),
  }));

  const allProjects = scopedDepts.flatMap((d) => d.projects);
  const allTasks = allProjects.flatMap((p) => p.tasks);

  const memberNames = new Map<number, string>();
  const memberDept = new Map<number, string>();
  for (const dept of scopedDepts) {
    const entries = await prisma.userDepartment.findMany({
      where: { departmentId: dept.id },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    for (const e of entries) {
      if (!memberNames.has(e.userId)) {
        memberNames.set(e.userId, `${e.user.firstName} ${e.user.lastName}`);
        memberDept.set(e.userId, dept.name);
      }
    }
  }

  const assigneeIds = Array.from(new Set(allTasks.flatMap((t) => t.assignees.map((a) => a.userId))));
  if (assigneeIds.length > 0) {
    const assigneeUsers = await prisma.user.findMany({
      where: { id: { in: assigneeIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    for (const u of assigneeUsers) {
      if (!memberNames.has(u.id)) memberNames.set(u.id, `${u.firstName} ${u.lastName}`);
    }
  }

  return { scopeLabel, departments: scopedDepts, allProjects, allTasks, memberNames, memberDept };
}

function pythonPayload(scope: Scope) {
  const deptNameMap = new Map(scope.departments.map((d) => [d.id, d.name]));
  return {
    tasks: scope.allTasks.map((t) => ({
      id: t.id,
      title: t.title ?? '',
      description: t.description ?? null,
      status: t.status,
      deadline: t.deadline ? t.deadline.toISOString() : null,
      estimatedHours: t.estimatedHours ?? null,
      weight: t.weight ?? null,
      estimatedMinutes: t.estimatedMinutes ?? null,
      createdAt: t.createdAt ? t.createdAt.toISOString() : null,
      updatedAt: t.updatedAt ? t.updatedAt.toISOString() : null,
      approvedAt: t.approvedAt ? t.approvedAt.toISOString() : null,
      projectId: t.projectId ?? null,
      assigneeIds: t.assignees.map((a) => a.userId),
    })),
    projects: scope.allProjects.map((p) => ({
      id: p.id,
      name: p.name,
      departmentId: p.departmentId,
      departmentName: deptNameMap.get(p.departmentId) || null,
    })),
    departments: scope.departments.map((d) => ({ id: d.id, name: d.name, managerName: d.managerName })),
    members: Array.from(scope.memberNames.entries()).map(([id, name]) => ({
      id,
      name,
      departmentName: scope.memberDept.get(id) || null,
    })),
  };
}

function healthPayload(scope: Scope) {
  const totals = new Map<number, { total: number; done: number; overdue: number }>();
  for (const [id] of scope.memberNames.entries()) {
    totals.set(id, { total: 0, done: 0, overdue: 0 });
  }
  for (const t of scope.allTasks) {
    const done = t.status === 'DONE';
    const overdue = isTaskOverdue(t.deadline, t.status, t.submittedForReviewAt);
    // Weight is minutes now, kept in step with the estimate on every write.
    // The fallback is for the handful of tasks nobody estimated, where the
    // alternative is counting them as no work at all.
    const weight = t.weight || t.estimatedMinutes || 120;
    for (const a of t.assignees) {
      const entry = totals.get(a.userId) || { total: 0, done: 0, overdue: 0 };
      entry.total += weight;
      if (done) entry.done += weight;
      if (overdue) entry.overdue += weight;
      totals.set(a.userId, entry);
    }
  }
  return {
    members: Array.from(totals.entries()).map(([id, s]) => ({
      id,
      name: scope.memberNames.get(id) || `کاربر ${id}`,
      departmentName: scope.memberDept.get(id) || null,
      total: s.total,
      done: s.done,
      overdue: s.overdue,
      // The same weight said in the unit a manager plans in. Minutes are the
      // stored truth; days are what tells you whether a queue is survivable.
      totalDays: workingDays(s.total),
      openDays: workingDays(s.total - s.done),
      overdueDays: workingDays(s.overdue),
    })),
    minutesPerWorkingDay: WORKING_MINUTES_PER_DAY,
  };
}

function projectsPayload(scope: Scope) {
  return {
    projects: scope.allProjects.map((p) => ({
      id: p.id,
      name: p.name,
      tasks: p.tasks.map((t) => ({ status: t.status, deadline: t.deadline ? t.deadline.toISOString() : null })),
    })),
  };
}

function fallbackCounts(tasks: ScopedTask[]) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'DONE').length;
  return {
    total,
    done,
    overdue: tasks.filter((t) => isTaskOverdue(t.deadline, t.status, t.submittedForReviewAt)).length,
    pending: tasks.filter((t) => t.status === 'PENDING_APPROVAL').length,
    completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
  };
}

function computeHealthScore(counts: { completionRate: number; overdue: number; total: number; pending: number }, health: { giniCoefficient?: number } | null) {
  const total = counts.total || 0;
  const overduePct = total ? (counts.overdue / total) * 100 : 0;
  const pendingPct = total ? (counts.pending / total) * 100 : 0;
  const gini = health?.giniCoefficient ?? 0;
  const score = Math.round(
    (counts.completionRate || 0) * 0.4
    + Math.max(0, 100 - overduePct * 2) * 0.3
    + Math.max(0, 100 - pendingPct * 3) * 0.15
    + Math.max(0, 100 - gini * 150) * 0.15
  );
  return Math.max(0, Math.min(100, score));
}

const ANALYTICS_MANAGER_ROLES = ['CEO', 'INTERNAL_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER'];

/* ────────────────────────────────────────────────────────────────
   Routes
   ──────────────────────────────────────────────────────────────── */

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== 'EMPLOYEE') {
      return res.status(403).json({ error: 'Access denied' });
    }
    const userId = req.user!.id;
    const assignedTasks = await prisma.task.findMany({
      where: { assignees: { some: { userId } } },
      include: { project: { select: { id: true, name: true } }, assignees: { select: { userId: true } } },
    }) as AnyTask[];

    const c = await counts(assignedTasks);

    // Group tasks by project for the Rust microservice
    const projectMap = new Map<number, { name: string; tasks: { status: string }[] }>();
    for (const task of assignedTasks) {
      const pid = task.projectId;
      if (pid === null || pid === undefined) continue;
      const existing = projectMap.get(pid);
      if (existing) {
        existing.tasks.push({ status: task.status });
      } else {
        projectMap.set(pid, {
          name: task.project?.name || 'Unknown',
          tasks: [{ status: task.status }],
        });
      }
    }
    const projectsForRust = Array.from(projectMap.entries()).map(([projectId, data]) => ({
      id: projectId,
      name: data.name,
      tasks: data.tasks,
    }));

    // Try to use the Rust microservice for project breakdown
    const rustProjectBreakdown = await callRust('/aggregate/projects', {
      projects: projectsForRust,
    });
    let projectBreakdown: any[] = [];
    if (rustProjectBreakdown?.projects) {
      projectBreakdown = rustProjectBreakdown.projects.map((p: any) => ({
        projectId: p.projectId,
        projectName: p.projectName,
        total: p.total,
        done: p.done,
        completionRate: Math.round(p.completionRate),
      }));
    } else {
      // Fallback to JS
      projectBreakdown = Array.from(projectMap.entries()).map(([projectId, data]) => ({
        projectId,
        projectName: data.name,
        total: data.tasks.length,
        done: data.tasks.filter(t => t.status === 'DONE').length,
        completionRate: data.tasks.length > 0 ? Math.round((data.tasks.filter(t => t.status === 'DONE').length / data.tasks.length) * 100) : 0,
      }));
    }

    res.json({
      total: c.total,
      todo: c.todo,
      inProgress: c.inProgress,
      pendingApproval: c.pendingApproval,
      done: c.done,
      completionRate: c.completionRate,
      projectBreakdown,
      computedBy: c.computedBy || 'js',
    });
  } catch (err) {
    console.error('analytics/me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ────────────────────────────────────────────────────────────────
   Unified reports (reports tab): Python insights + Rust health/projects
   ──────────────────────────────────────────────────────────────── */

router.get('/reports', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userRole = req.user!.role;
    if (!ANALYTICS_MANAGER_ROLES.includes(userRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const scope = await resolveScope(req.user!);
    const [insights, health, projAgg] = await Promise.all([
      callPython('/analyze/insights', pythonPayload(scope)),
      callRust('/aggregate/health', healthPayload(scope)),
      callRust('/aggregate/projects', projectsPayload(scope)),
    ]);

    res.json({
      counts: insights?.counts || fallbackCounts(scope.allTasks),
      rankings: insights?.rankings || { departments: [], projects: [], members: [], averages: null },
      insights: insights?.insights || { findings: [], risks: [], recommendations: [] },
      prediction: insights?.prediction || null,
      workloadHealth: health || { available: false },
      projectAggregate: projAgg || { projects: [], meanCompletionRate: 0, available: false },
      scopeLabel: scope.scopeLabel,
      computedBy: { py: Boolean(insights), rs: Boolean(health || projAgg) },
    });
  } catch (err) {
    console.error('analytics/reports error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ────────────────────────────────────────────────────────────────
   Smart analysis (smart tab): health score + snapshot, no LLM
   ──────────────────────────────────────────────────────────────── */

router.get('/smart', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userRole = req.user!.role;
    if (!ANALYTICS_MANAGER_ROLES.includes(userRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const scope = await resolveScope(req.user!);
    const [insights, health, projAgg] = await Promise.all([
      callPython('/analyze/insights', pythonPayload(scope)),
      callRust('/aggregate/health', healthPayload(scope)),
      callRust('/aggregate/projects', projectsPayload(scope)),
    ]);

    const counts = insights?.counts || fallbackCounts(scope.allTasks);
    const healthScore = computeHealthScore(counts, health || null);
    const level = healthScore >= 70 ? 'good' : healthScore >= 40 ? 'warning' : 'critical';

    const snapshot = {
      text: `در محدوده «${scope.scopeLabel}» ${counts.total} تسک وجود دارد؛ ${counts.done} تکمیل شده (${counts.completionRate}٪)، ${counts.overdue} دیرکرد و ${counts.pending} در انتظار تایید.`,
      completionRate: counts.completionRate,
      overdue: counts.overdue,
      pending: counts.pending,
    };

    const projectStatuses = (insights?.rankings?.projects || []).map((p: any) => ({
      projectId: p.projectId,
      name: p.name,
      status: p.status,
      score: p.healthScore,
      keyIssue: p.keyIssue,
      reason: p.reason,
      completionRate: p.completionRate,
    }));

    const teamStatus = {
      memberCount: health?.memberCount ?? 0,
      overloaded: health?.overloaded?.length ?? 0,
      underloaded: health?.underloaded?.length ?? 0,
      giniCoefficient: health?.giniCoefficient ?? 0,
    };

    const warnings = (insights?.insights?.risks || []).map((r: any) => r.text);
    const recommendations = (insights?.insights?.recommendations || []).map((r: any) => r.text);
    const findings = (insights?.insights?.findings || []).map((f: any) => ({ severity: f.severity, text: f.text }));

    res.json({
      healthScore,
      level,
      snapshot,
      projectStatuses,
      teamStatus,
      warnings,
      recommendations,
      findings,
      prediction: insights?.prediction || null,
      workloadNarrative: health?.narrative || null,
      scopeLabel: scope.scopeLabel,
      computedBy: { py: Boolean(insights), rs: Boolean(health || projAgg) },
    });
  } catch (err) {
    console.error('analytics/smart error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ────────────────────────────────────────────────────────────────
   Advanced analysis (polyglot fan-out): Python stats/trends + Rust health




/* ──────────────────────────────────────────────────────────────────────────
   Delivery command view — the rebuilt analytics.

   Facts from Postgres, statistics from Python, forecasting from Rust. The
   risk label comes out of the simulation, so it reflects "will this land on
   time" rather than a threshold someone picked.
   ────────────────────────────────────────────────────────────────────────── */
router.get('/delivery', authenticate, authorize('CEO', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'INTERNAL_MANAGER', 'DEPARTMENT_MANAGER'), async (_req: AuthRequest, res: Response) => {
  try {
    res.json(await buildDeliveryView());
  } catch (err: any) {
    console.error('analytics/delivery error:', err);
    res.status(500).json({ error: 'خطا در محاسبه تحلیل تحویل' });
  }
});

/* ──────────────────────────────────────────────────────────────────────────
   Employee review — one row per person per Jalali month.

   Delivered tasks, times sent back, busiest project and planned time. The
   month is Jalali because that is the calendar the reviews run on.
   ────────────────────────────────────────────────────────────────────────── */
router.get(
  '/employees',
  authenticate,
  authorize('CEO', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'INTERNAL_MANAGER', 'DEPARTMENT_MANAGER'),
  async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user!;
      const monthCount = Math.min(12, Math.max(1, parseInt(String(req.query.months || '6')) || 6));

      // The scope comes from the token, never from the query string: a
      // department manager reviews their own people and no one else's.
      let userIds: number[];
      if (user.role === 'DEPARTMENT_MANAGER') {
        const deptIds = await managedDepartmentIds(user.id);
        const members = await prisma.userDepartment.findMany({
          where: { departmentId: { in: deptIds } },
          select: { userId: true },
        });
        userIds = [...new Set(members.map((m) => m.userId))];
      } else {
        const all = await prisma.user.findMany({ where: { role: { not: 'CUSTOMER' } }, select: { id: true } });
        userIds = all.map((u) => u.id);
      }

      const data = await employeeMonthlyStats(userIds, monthCount);
      // Someone with nothing at all in the window is noise in a review table.
      const employees = data.employees.filter((e) =>
        Object.values(e.months).some((m) => m.done > 0 || m.rejected > 0)
      );
      res.json({
        months: data.months,
        employees,
        scope: user.role === 'DEPARTMENT_MANAGER' ? 'department' : 'organisation',
      });
    } catch (err) {
      console.error('analytics/employees error:', err);
      res.status(500).json({ error: 'خطا در محاسبه تحلیل کارمندان' });
    }
  }
);

/* ──────────────────────────────────────────────────────────────────────────
   Project risk, for anyone who shows a project.

   The same label the delivery tab uses, so a project reads the same on its
   card, on a dashboard and in the analytics. Before this there were four
   independent definitions of «بحرانی» — two thresholds in TypeScript, one in
   Rust and one in Python — and on live data they disagreed about 15 of 45
   projects, including three the card called «سالم» while the forecast put
   them at risk.

   Names are deliberately not returned: the caller already has the projects it
   is allowed to see, and joins on id.
   ────────────────────────────────────────────────────────────────────────── */
/**
 * Completion rate per day, with Fridays marked so averages can skip them.
 */
router.get(
  '/daily-rate',
  authenticate,
  authorize('CEO', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'INTERNAL_MANAGER', 'DEPARTMENT_MANAGER'),
  async (req: AuthRequest, res: Response) => {
    try {
      const days = Math.min(180, Math.max(7, parseInt(String(req.query.days || '30')) || 30));
      const userIds = String(req.query.userIds || '')
        .split(',')
        .map((x) => parseInt(x))
        .filter((n) => !Number.isNaN(n));
      res.json(await dailyRate(days, userIds));
    } catch (err) {
      console.error('daily rate error:', err);
      res.status(500).json({ error: 'خطا در محاسبه نرخ روزانه' });
    }
  }
);

/**
 * A month's scorecard, generated on request. Limited to the two roles that
 * decide on it; department managers see the underlying pages, not this.
 */
/** One person's scorecard for a month, with the items behind every number. */
router.get(
  '/scorecard/:userId',
  authenticate,
  authorize('CEO', 'TECHNICAL_MANAGER'),
  async (req: AuthRequest, res: Response) => {
    try {
      const month = String(req.query.month || currentJalaliMonthKey());
      const userId = parseInt(req.params.userId as string);
      if (Number.isNaN(userId)) return res.status(400).json({ error: 'شناسه کاربر معتبر نیست.' });
      res.json(await personScorecard(month, userId));
    } catch (err) {
      if (err instanceof ScorecardInputError) return res.status(400).json({ error: err.message });
      console.error('person scorecard error:', err);
      res.status(500).json({ error: 'خطا در تولید کارنامه' });
    }
  }
);

router.get(
  '/scorecard',
  authenticate,
  authorize('CEO', 'TECHNICAL_MANAGER'),
  async (req: AuthRequest, res: Response) => {
    try {
      const month = String(req.query.month || currentJalaliMonthKey());
      res.json(await monthlyScorecard(month));
    } catch (err) {
      if (err instanceof ScorecardInputError) return res.status(400).json({ error: err.message });
      console.error('scorecard error:', err);
      res.status(500).json({ error: 'خطا در تولید کارنامه' });
    }
  }
);

/**
 * How often, and by how many days, each person delivers after the deadline.
 */
router.get(
  '/lateness',
  authenticate,
  authorize('CEO', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'INTERNAL_MANAGER', 'DEPARTMENT_MANAGER'),
  async (req: AuthRequest, res: Response) => {
    try {
      const days = Math.min(365, Math.max(7, parseInt(String(req.query.days || '30')) || 30));
      res.json(await latenessAnalytics(days));
    } catch (err) {
      console.error('lateness error:', err);
      res.status(500).json({ error: 'خطا در محاسبه نرخ تأخیر' });
    }
  }
);

/**
 * Each person's committed minutes per day, for planning ahead.
 */
router.get(
  '/capacity',
  authenticate,
  authorize('CEO', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'INTERNAL_MANAGER', 'DEPARTMENT_MANAGER'),
  async (req: AuthRequest, res: Response) => {
    try {
      const days = Math.min(60, Math.max(7, parseInt(String(req.query.days || '14')) || 14));
      // Negative looks back, so a manager can see the days just gone as well.
      const offset = Math.min(30, Math.max(-60, parseInt(String(req.query.offset || '0')) || 0));
      res.json(await capacityByDay(days, offset));
    } catch (err) {
      console.error('capacity error:', err);
      res.status(500).json({ error: 'خطا در محاسبه ظرفیت روزانه' });
    }
  }
);

/**
 * Rejections broken down by person, project and recorded category.
 */
router.get(
  '/rejections',
  authenticate,
  authorize('CEO', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'INTERNAL_MANAGER', 'DEPARTMENT_MANAGER'),
  async (req: AuthRequest, res: Response) => {
    try {
      const days = Math.min(365, Math.max(7, parseInt(String(req.query.days || '90')) || 90));
      res.json(await rejectionAnalytics(days));
    } catch (err) {
      console.error('rejection analytics error:', err);
      res.status(500).json({ error: 'خطا در تحلیل ردها' });
    }
  }
);

router.get('/project-status', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const view = await buildDeliveryView();
    res.json({
      generatedAt: view.generatedAt,
      degraded: view.degraded,
      projects: view.projects.map((p: any) => ({
        projectId: p.projectId,
        status: p.status,
        statusLabel: p.statusLabel,
        headline: p.headline,
        total: p.total,
        done: p.done,
        open: p.open,
        scheduled: p.scheduled,
        overdue: p.overdue,
        awaitingReview: p.awaitingReview,
        // Completion measured against work that is actually due. Dividing by
        // every materialised future occurrence is what pinned the recurring
        // projects at 9–17% and made them permanently «بحرانی».
        completionRate: p.done + p.open + p.awaitingReview > 0
          ? Math.round((p.done / (p.done + p.open + p.awaitingReview)) * 100)
          : null,
      })),
    });
  } catch (err) {
    console.error('analytics/project-status error:', err);
    res.status(500).json({ error: 'خطا در محاسبه وضعیت پروژه‌ها' });
  }
});

export default router;
