import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { callPython, callRust, microservicesHealth } from '../services/analysisClient';

const router = Router();

router.get('/health-check', authenticate, async (_req, res) => {
  const health = await microservicesHealth();
  res.json(health);
});

/* ────────────────────────────────────────────────────────────────
   Helpers: microservice-first, JS fallback
   ──────────────────────────────────────────────────────────────── */

type AnyTask = { id: number; status: string; deadline: Date | null; assignees: { userId: number }[]; projectId?: number | null; project?: { id: number; name: string } | null; weight?: number | null; estimatedMinutes?: number | null };

function isTaskOverdue(deadline: Date | string | null | undefined, status: string): boolean {
  if (status === 'DONE' || !deadline) return false;
  const d = new Date(deadline);
  const deadlineEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return deadlineEnd.getTime() < Date.now();
}

function toRustTask(t: AnyTask) {
  return { status: t.status, deadline: t.deadline ? t.deadline.toISOString() : null, assignee_ids: t.assignees.map((a) => a.userId) };
}

async function counts(tasks: AnyTask[]): Promise<{ total: number; todo: number; inProgress: number; pendingApproval: number; done: number; completionRate: number; overdue: number; computedBy?: string }> {
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
    overdue: tasks.filter((t) => isTaskOverdue(t.deadline, t.status)).length,
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
    const overdue = isTaskOverdue(t.deadline, t.status);
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
    const managed = await prisma.department.findFirst({ where: { managerId: user.id } });
    if (!managed) {
      return { scopeLabel: '—', departments: [], allProjects: [], allTasks: [], memberNames: new Map(), memberDept: new Map() };
    }
    scopeLabel = managed.name;
    where = { id: { in: [managed.id] } };
  }

  const departments = await prisma.department.findMany({
    where,
    include: {
      manager: { select: { firstName: true, lastName: true } },
      projects: {
        include: {
          tasks: {
            select: {
              id: true, title: true, description: true, status: true, deadline: true,
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
    const overdue = isTaskOverdue(t.deadline, t.status);
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
    })),
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
    overdue: tasks.filter((t) => isTaskOverdue(t.deadline, t.status)).length,
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

const ANALYTICS_MANAGER_ROLES = ['CEO', 'HR_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER'];

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

router.get('/department/:deptId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const deptId = parseInt(Array.isArray(req.params.deptId) ? req.params.deptId[0] : req.params.deptId, 10);
    const userRole = req.user!.role;

    if (!['DEPARTMENT_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'CEO', 'HR_MANAGER'].includes(userRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (userRole === 'DEPARTMENT_MANAGER') {
      const managed = await prisma.department.findFirst({ where: { managerId: req.user!.id } });
      if (!managed || managed.id !== deptId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const dept = await prisma.department.findUnique({ where: { id: deptId } });
    if (!dept) return res.status(404).json({ error: 'Department not found' });

    const projects = await prisma.project.findMany({
      where: { departmentId: deptId },
      include: { tasks: { select: { id: true, status: true, deadline: true, projectId: true, assignees: { select: { userId: true } } } } },
    });

    const allTasks: AnyTask[] = projects.flatMap((p) => p.tasks);
    const c = await counts(allTasks);
    
    // Group tasks by project for the Rust microservice
    const projectMap = new Map<number, { name: string; tasks: { status: string }[] }>();
    for (const proj of projects) {
      for (const task of proj.tasks) {
        const pid = task.projectId;
        if (pid === null || pid === undefined) continue;
        const existing = projectMap.get(pid);
        if (existing) {
          existing.tasks.push({ status: task.status });
        } else {
          projectMap.set(pid, {
            name: proj.name,
            tasks: [{ status: task.status }],
          });
        }
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
    let pBreakdown: any[] = [];
    if (rustProjectBreakdown?.projects) {
      pBreakdown = rustProjectBreakdown.projects.map((p: any) => ({
        projectId: p.projectId,
        projectName: p.projectName,
        total: p.total,
        done: p.done,
        completionRate: Math.round(p.completionRate),
      }));
    } else {
      // Fallback to JS
      pBreakdown = projects.map((p) => {
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

    const memberNames = new Map<number, string>();
    for (const proj of projects) {
      const members = await prisma.projectMember.findMany({ where: { projectId: proj.id }, include: { user: { select: { id: true, firstName: true, lastName: true } } } });
      for (const m of members) {
        if (!memberNames.has(m.userId)) {
          memberNames.set(m.userId, `${m.user.firstName} ${m.user.lastName}`);
        }
      }
    }

    const memberPerformance = await computeMemberPerformance(allTasks, memberNames);

    res.json({
      total: c.total,
      todo: c.todo,
      inProgress: c.inProgress,
      pendingApproval: c.pendingApproval,
      done: c.done,
      completionRate: c.completionRate,
      pendingApprovals: c.pendingApproval,
      projectBreakdown: pBreakdown,
      memberPerformance,
      computedBy: c.computedBy || 'js',
    });
  } catch (err) {
    console.error('analytics/department error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/technical', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userRole = req.user!.role;
    if (!ANALYTICS_MANAGER_ROLES.includes(userRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const scope = await resolveScope(req.user!);
    const [insights, health, projAgg, memberPerf] = await Promise.all([
      callPython('/analyze/insights', pythonPayload(scope)),
      callRust('/aggregate/health', healthPayload(scope)),
      callRust('/aggregate/projects', projectsPayload(scope)),
      computeMemberPerformance(scope.allTasks as AnyTask[], scope.memberNames),
    ]);

    const c = await counts(scope.allTasks as AnyTask[]);

    const pBreakdown = (projAgg?.projects || []).map((p: any) => ({
      projectId: p.projectId,
      projectName: p.projectName,
      total: p.total,
      done: p.done,
      completionRate: Math.round(p.completionRate),
    }));

    const deptBreakdown = scope.departments.map((dept) => ({
      deptId: dept.id,
      deptName: dept.name,
      total: dept.projects.flatMap((p) => p.tasks).length,
      projectCount: dept.projects.length,
    }));

    res.json({
      total: c.total,
      todo: c.todo,
      inProgress: c.inProgress,
      pendingApproval: c.pendingApproval,
      done: c.done,
      completionRate: c.completionRate,
      pendingApprovals: c.pendingApproval,
      deptBreakdown,
      projectBreakdown: pBreakdown,
      memberPerformance: memberPerf,
      counts: insights?.counts || fallbackCounts(scope.allTasks),
      insights: insights?.insights || { findings: [], risks: [], recommendations: [] },
      rankings: insights?.rankings || { departments: [], projects: [], members: [], averages: null },
      workloadHealth: health || { available: false },
      scopeLabel: scope.scopeLabel,
      computedBy: { py: Boolean(insights), rs: Boolean(health || projAgg), counts: c.computedBy || 'js' },
    });
  } catch (err) {
    console.error('analytics/technical error:', err);
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

router.get('/overview', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userRole = req.user!.role;
    if (!['CEO', 'HR_MANAGER'].includes(userRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const departments = await prisma.department.findMany({
      include: { projects: { include: { tasks: { select: { id: true, status: true, deadline: true, projectId: true, assignees: true } } } }, manager: { select: { firstName: true, lastName: true } } },
    });

    const allProjects = departments.flatMap((d) => d.projects);
    const allTasks: AnyTask[] = allProjects.flatMap((p) => p.tasks);
    const c = await counts(allTasks);
    
    // Group tasks by project for the Rust microservice
    const projectMap = new Map<number, { name: string; tasks: { status: string }[] }>();
    for (const proj of allProjects) {
      for (const task of proj.tasks) {
        const pid = task.projectId;
        if (pid === null || pid === undefined) continue;
        const existing = projectMap.get(pid);
        if (existing) {
          existing.tasks.push({ status: task.status });
        } else {
          projectMap.set(pid, {
            name: proj.name,
            tasks: [{ status: task.status }],
          });
        }
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
    let pBreakdown: any[] = [];
    if (rustProjectBreakdown?.projects) {
      pBreakdown = rustProjectBreakdown.projects.map((p: any) => ({
        projectId: p.projectId,
        projectName: p.projectName,
        total: p.total,
        done: p.done,
        completionRate: Math.round(p.completionRate),
      }));
    } else {
      // Fallback to JS
      pBreakdown = allProjects.map((p) => {
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

    // Try to use Python microservice for statistics and trends (like in advanced analysis)
    const [pyStats, pyTrends] = await Promise.all([
      callPython('/analyze/stats', {
        series: [
          { name: 'تسک هر دپارتمان', values: departments.map((d) => d.projects.flatMap((p) => p.tasks).length) },
          { name: 'نرخ تکمیل دپارتمان‌ها', values: departments.map((d) => {
            const dt = d.projects.flatMap((p) => p.tasks);
            const done = dt.filter((t) => t.status === 'DONE').length;
            return dt.length > 0 ? Math.round((done / dt.length) * 100) : 0;
          }) },
        ],
      }),
      callPython('/analyze/trends', {
        tasks: allTasks.map((t: any) => ({
          projectId: t.projectId,
          status: t.status,
          deadline: t.deadline ? t.deadline.toISOString() : null,
          estimatedHours: t.estimatedHours,
          createdAt: t.createdAt ? t.createdAt.toISOString() : null,
          updatedAt: t.updatedAt ? t.updatedAt.toISOString() : null,
        })),
        projects: allProjects.map((p) => ({ id: p.id, name: p.name })),
      }),
    ]);

    // Try to use Rust microservice for workload health
    const health = await callRust('/aggregate/health', {
      members: allProjects.flatMap((p) => p.tasks).reduce((acc: { id: number; total: number; done: number; overdue: number }[], t) => {
        const done = t.status === 'DONE';
        const overdue = isTaskOverdue(t.deadline, t.status);
        for (const a of t.assignees) {
          let m = acc.find((x) => x.id === a.userId);
          if (!m) {
            m = { id: a.userId, total: 0, done: 0, overdue: 0 };
            acc.push(m);
          }
          m.total++;
          if (done) m.done++;
          if (overdue) m.overdue++;
        }
        return acc;
      }, []),
    });

    const nameMap = new Map<number, string>();
    for (const proj of allProjects) {
      const members = await prisma.projectMember.findMany({ where: { projectId: proj.id }, include: { user: { select: { id: true, firstName: true, lastName: true } } } });
      for (const m of members) {
        if (!nameMap.has(m.userId)) nameMap.set(m.userId, `${m.user.firstName} ${m.user.lastName}`);
      }
    }
    const memberPerformance = await computeMemberPerformance(allTasks, nameMap);

    const deptBreakdown = departments.map((dept) => ({
      deptId: dept.id,
      deptName: dept.name,
      manager: dept.manager ? `${dept.manager.firstName} ${dept.manager.lastName}` : null,
      projectCount: dept.projects.length,
    }));

    res.json({
      total: c.total,
      todo: c.todo,
      inProgress: c.inProgress,
      pendingApproval: c.pendingApproval,
      done: c.done,
      completionRate: c.completionRate,
      pendingApprovals: c.pendingApproval,
      memberPerformance,
      deptBreakdown,
      projectBreakdown: pBreakdown,
      computedBy: c.computedBy || 'js',
    });
  } catch (err) {
    console.error('analytics/overview error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/text-analysis', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userRole = req.user!.role;
    const userId = req.user!.id;

    if (!['CEO', 'HR_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER'].includes(userRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let tasks;
    if (userRole === 'DEPARTMENT_MANAGER') {
      const managed = await prisma.department.findFirst({ where: { managerId: userId } });
      if (!managed) return res.json({ tasksCount: 0, topWords: [], categoryDistribution: [], reportSummary: [], descriptionQuality: { withDescription: 0, withoutDescription: 0, avgDescriptionLength: 0 } });
      const projects = await prisma.project.findMany({ where: { departmentId: managed.id }, select: { id: true } });
      const projectIds = projects.map((p) => p.id);
      tasks = await prisma.task.findMany({
        where: { projectId: { in: projectIds } },
        include: { project: { select: { name: true } }, reports: { include: { user: { select: { firstName: true, lastName: true } } } } },
      });
    } else {
      tasks = await prisma.task.findMany({
        include: { project: { select: { name: true } }, reports: { include: { user: { select: { firstName: true, lastName: true } } } } },
      });
    }

    // ── Try Python microservice ──
    const pyResult = await callPython('/analyze/text', {
      tasks: tasks.map((t) => ({
        title: t.title,
        description: t.description,
        reports: t.reports.map((r) => ({ content: r.content, user: { firstName: r.user.firstName, lastName: r.user.lastName } })),
      })),
    });
    if (pyResult && pyResult.topWords) {
      return res.json({ ...pyResult, computedBy: 'python' });
    }

    // ── JS fallback ──
    const stopWords = new Set([
      'و','به','از','در','با','که','را','این','آن','برای','یک','دو','تا','شده','نیز','شد','است','می','های','شود','شوند','کرد','کنید',
      'دهید','گیرد','کردن','گرفتن','باید','باشد','اما','اگر','یا','نه','هیچ','هم','خواهد','دادن','داد','دارد','دارند','کرده','باشند',
      'باشه','نخواهد','نمی','ممکن','نیست','شامل','جهت','منظور','قبل','بعد','حین','طی','طول','زمان','the','a','an','in','on','at','to',
      'for','of','and','or','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','can','could',
      'may','might','shall','should','it','its','this','that','these','those','i','you','we','they','he','she','my','your','our','their',
      'his','her','not','no','but','if','so','as','تسک','task','فقط','مقدار','لطفا','لطفاً','وجود','شما','نام','ادرس','آدرس','قرار',
    ]);

    const wordCounts: Record<string, number> = {};
    for (const task of tasks) {
      const text = `${task.title} ${task.description || ''}`.toLowerCase();
      const words = text.split(/[\s،,;:.!؟?\-_()\[\]{}"\'«»\n\r\t]+/).filter((w) => w.length > 1 && !stopWords.has(w));
      for (const word of words) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    }

    const topWords = Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([word, count]) => ({ word, count }));

    const categoryKeywords: Record<string, string[]> = {
      'باگ/اشکال': ['باگ','اشکال','مشکل','خطا','error','bug','خراب','عدم','نقص','اشتباه','نمایش','غلط'],
      'قابلیت جدید': ['افزودن','ساخت','ایجاد','اضافه','جدید','feature','add','create','new','طراحی','ساختن','نوشتن','صفحه','بخش'],
      'بهبود/اصلاح': ['اصلاح','بهبود','رفع','بهینه','بروزرسانی','update','تغییر','توسعه'],
      'مستندات': ['مستند','documentation','راهنما','آموزش','doc'],
      'طراحی/UI': ['طراحی','design','ui','ux','ظاهری','رنگ','فونت','چیدمان'],
      'تست/اعتبارسنجی': ['تست','test','آزمایش','اعتبارسنجی','validation'],
    };

    const categoryCounts: Record<string, number> = {};
    for (const cat of Object.keys(categoryKeywords)) categoryCounts[cat] = 0;
    categoryCounts['سایر'] = 0;

    for (const task of tasks) {
      const text = `${task.title} ${task.description || ''}`.toLowerCase();
      let matched = false;
      for (const [cat, keywords] of Object.entries(categoryKeywords)) {
        if (keywords.some((kw) => text.includes(kw))) {
          categoryCounts[cat]++;
          matched = true;
          break;
        }
      }
      if (!matched) categoryCounts['سایر']++;
    }

    const categoryDistribution = Object.entries(categoryCounts).map(([category, count]) => ({ category, count })).filter((c) => c.count > 0);

    const allReports = tasks.flatMap((t) => t.reports);
    const reportsByUser: Record<string, { count: number; totalLength: number }> = {};
    for (const report of allReports) {
      const name = `${report.user.firstName} ${report.user.lastName}`;
      if (!reportsByUser[name]) reportsByUser[name] = { count: 0, totalLength: 0 };
      reportsByUser[name].count++;
      reportsByUser[name].totalLength += (report.content || '').length;
    }
    const reportSummary = Object.entries(reportsByUser).map(([name, data]) => ({
      name,
      reportCount: data.count,
      avgLength: Math.round(data.totalLength / data.count),
    })).sort((a, b) => b.reportCount - a.reportCount);

    const withDescription = tasks.filter((t) => t.description && t.description.length > 10).length;
    const withoutDescription = tasks.length - withDescription;
    const descriptionLengths = tasks.filter((t) => t.description).map((t) => t.description!.length);
    const avgDescriptionLength = descriptionLengths.length > 0
      ? Math.round(descriptionLengths.reduce((a, b) => a + b, 0) / descriptionLengths.length)
      : 0;

    res.json({
      tasksCount: tasks.length,
      reportsCount: allReports.length,
      topWords,
      categoryDistribution,
      reportSummary,
      descriptionQuality: { withDescription, withoutDescription, avgDescriptionLength },
      computedBy: 'js',
    });
  } catch (err) {
    console.error('analytics/text-analysis error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ────────────────────────────────────────────────────────────────
   Advanced analysis (polyglot fan-out): Python stats/trends + Rust health
   ──────────────────────────────────────────────────────────────── */

router.get('/advanced', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userRole = req.user!.role;
    if (!['CEO', 'HR_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER'].includes(userRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const departments = await prisma.department.findMany({
      include: { projects: { include: { tasks: { select: { id: true, status: true, deadline: true, estimatedHours: true, weight: true, estimatedMinutes: true, createdAt: true, updatedAt: true, assignees: true } } } } },
    });

    const allProjects = departments.flatMap((d) => d.projects);
    const allTasks: AnyTask[] = allProjects.flatMap((p) => p.tasks);

    // Rust: workload health + member perf
    const memberNames = new Map<number, string>();
    for (const proj of allProjects) {
      const members = await prisma.projectMember.findMany({ where: { projectId: proj.id }, include: { user: { select: { id: true, firstName: true, lastName: true } } } });
      for (const m of members) {
        if (!memberNames.has(m.userId)) memberNames.set(m.userId, `${m.user.firstName} ${m.user.lastName}`);
      }
    }
    const [memberPerf, health, pyStats, pyTrends] = await Promise.all([
      computeMemberPerformance(allTasks, memberNames),
      callRust('/aggregate/health', {
        members: allProjects.flatMap((p) => p.tasks).reduce((acc: { id: number; total: number; done: number; overdue: number }[], t: any) => {
          const done = t.status === 'DONE';
          const overdue = isTaskOverdue(t.deadline, t.status);
          const weight = t.weight || t.estimatedMinutes || 120;
          for (const a of t.assignees) {
            let m = acc.find((x) => x.id === a.userId);
            if (!m) {
              m = { id: a.userId, total: 0, done: 0, overdue: 0 };
              acc.push(m);
            }
            m.total += weight;
            if (done) m.done += weight;
            if (overdue) m.overdue += weight;
          }
          return acc;
        }, []),
      }),
      callPython('/analyze/stats', {
        series: [
          { name: 'تسک هر دپارتمان', values: departments.map((d) => d.projects.flatMap((p) => p.tasks).length) },
          { name: 'نرخ تکمیل دپارتمان‌ها', values: departments.map((d) => {
            const dt = d.projects.flatMap((p) => p.tasks);
            const done = dt.filter((t) => t.status === 'DONE').length;
            return dt.length > 0 ? Math.round((done / dt.length) * 100) : 0;
          }) },
        ],
      }),
      callPython('/analyze/trends', {
        tasks: allTasks.map((t: any) => ({
          projectId: t.projectId,
          status: t.status,
          deadline: t.deadline ? t.deadline.toISOString() : null,
          estimatedHours: t.estimatedHours,
          createdAt: t.createdAt ? t.createdAt.toISOString() : null,
          updatedAt: t.updatedAt ? t.updatedAt.toISOString() : null,
        })),
        projects: allProjects.map((p) => ({ id: p.id, name: p.name })),
      }),
    ]);

    res.json({
      memberPerformance: memberPerf,
      workloadHealth: health || { available: false },
      statistics: pyStats || { available: false },
      trends: pyTrends || { available: false },
      services: {
        py: Boolean(pyStats || pyTrends),
        rs: Boolean(health),
      },
    });
  } catch (err) {
    console.error('analytics/advanced error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/gantt', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, userId } = req.query;

    const where: any = {};
    if (projectId) {
      where.projectId = parseInt(projectId as string);
    }
    if (userId) {
      where.assignees = {
        some: { userId: parseInt(userId as string) },
      };
    }

    const tasks = await prisma.task.findMany({
      where,
      select: {
        id: true,
        title: true,
        status: true,
        startDate: true,
        deadline: true,
        weight: true,
        estimatedMinutes: true,
        createdAt: true,
        project: { select: { id: true, name: true } },
        assignees: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
      orderBy: [
        { startDate: 'asc' },
        { id: 'asc' }
      ],
    });

    // Fetch users for daily load aggregation
    const users = await prisma.user.findMany({
      select: { id: true, firstName: true, lastName: true },
    });

    const payload = {
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        start_date: t.startDate ? t.startDate.toISOString() : null,
        deadline: t.deadline ? t.deadline.toISOString() : null,
        created_at: t.createdAt.toISOString(),
        weight: t.weight,
        estimated_minutes: t.estimatedMinutes,
        assignee_ids: t.assignees.map((a) => a.userId),
      })),
      users: users.map((u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`,
      })),
    };

    const rustResult = await callRust('/aggregate/gantt', payload);

    if (rustResult) {
      const clashingIds = new Set<number>(rustResult.clashes.flatMap((c: any) => c.taskIds));
      
      const mappedTasks = tasks.map((t) => ({
        ...t,
        hasClash: clashingIds.has(t.id),
      }));

      res.json({
        tasks: mappedTasks,
        clashes: rustResult.clashes,
      });
    } else {
      res.json({
        tasks: tasks.map((t) => ({ ...t, hasClash: false })),
        clashes: [],
      });
    }
  } catch (err) {
    console.error('analytics/gantt error:', err);
    res.status(500).json({ error: 'Failed to fetch Gantt data' });
  }
});

router.get('/scrum', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.query;
    const projectFilter: any = {};
    if (projectId) {
      projectFilter.projectId = parseInt(projectId as string);
    }

    const [allTasks, users] = await Promise.all([
      prisma.task.findMany({
        where: projectFilter,
        select: {
          id: true,
          status: true,
          createdAt: true,
          startDate: true,
          approvedAt: true,
          updatedAt: true,
          weight: true,
          estimatedMinutes: true,
          assignees: { select: { userId: true } },
        },
      }),
      prisma.user.findMany({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      }),
    ]);

    const payload = {
      tasks: allTasks.map((t) => ({
        id: t.id,
        status: t.status,
        created_at: t.createdAt.toISOString(),
        start_date: t.startDate ? t.startDate.toISOString() : null,
        approved_at: t.approvedAt ? t.approvedAt.toISOString() : null,
        updated_at: t.updatedAt ? t.updatedAt.toISOString() : null,
        weight: t.weight ?? null,
        estimated_minutes: t.estimatedMinutes ?? null,
        assignee_ids: t.assignees.map((a) => a.userId),
      })),
      users: users.map((u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`,
        role: u.role,
      })),
    };

    const rustResult = await callRust('/aggregate/scrum', payload);
    
    if (rustResult) {
      res.json(rustResult);
    } else {
      res.json({
        capacity: [],
        velocity: [],
        metrics: { avgLeadTimeDays: 0, avgCycleTimeDays: 0, completedCount: 0, pendingApprovalCount: 0, activeCount: 0 },
        bottlenecks: [],
        burndown: [],
      });
    }
  } catch (err) {
    console.error('analytics/scrum error:', err);
    res.status(500).json({ error: 'Failed to process Scrum analytics' });
  }
});

export default router;
