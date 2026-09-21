import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { managedDepartmentIds } from '../lib/departments';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query params required (ISO date)' });
    }

    const startDate = new Date(start as string);
    const endDate = new Date(end as string);
    const user = req.user!;
    let projectFilter: { departmentId?: number | { in: number[] } } = {};

    if (user.role === 'DEPARTMENT_MANAGER') {
      const deptIds = await managedDepartmentIds(user.id);
      if (deptIds.length === 0) return res.status(403).json({ error: 'No managed department' });
      projectFilter = { departmentId: { in: deptIds } };
    } else if (user.role === 'EMPLOYEE') {
      const deptMembership = await prisma.userDepartment.findFirst({
        where: { userId: user.id },
        include: { department: { select: { id: true } } },
      });
      if (deptMembership) projectFilter = { departmentId: deptMembership.department.id };
    }

    const projects = await prisma.project.findMany({ where: projectFilter, select: { id: true } });
    const projectIds = projects.map((p) => p.id);

    if (projectIds.length === 0) {
      return res.json({ tasks: [], summary: { total: 0, todo: 0, inProgress: 0, pendingApproval: 0, done: 0 }, projectBreakdown: [], memberBreakdown: [], dailyTasks: {} });
    }

    const tasks = await prisma.task.findMany({
      where: { projectId: { in: projectIds }, deadline: { gte: startDate, lte: endDate } },
      include: {
        project: { select: { id: true, name: true } },
        assignees: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { deadline: 'asc' },
    });

    const total = tasks.length;
    const todo = tasks.filter((t) => t.status === 'TODO').length;
    const inProgress = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
    const pendingApproval = tasks.filter((t) => t.status === 'PENDING_APPROVAL').length;
    const done = tasks.filter((t) => t.status === 'DONE').length;

    const projectMap = new Map<number, { name: string; total: number; done: number }>();
    for (const t of tasks) {
      if (!projectMap.has(t.projectId)) {
        projectMap.set(t.projectId, { name: t.project.name, total: 0, done: 0 });
      }
      const p = projectMap.get(t.projectId)!;
      p.total++;
      if (t.status === 'DONE') p.done++;
    }
    const projectBreakdown = Array.from(projectMap.entries()).map(([projectId, d]) => ({
      projectId, projectName: d.name, total: d.total, done: d.done,
      completionRate: d.total > 0 ? Math.round((d.done / d.total) * 100) : 0,
    }));

    const memberMap = new Map<number, { firstName: string; lastName: string; total: number; done: number }>();
    for (const t of tasks) {
      for (const a of t.assignees) {
        if (!memberMap.has(a.user.id)) {
          memberMap.set(a.user.id, { firstName: a.user.firstName, lastName: a.user.lastName, total: 0, done: 0 });
        }
        const m = memberMap.get(a.user.id)!;
        m.total++;
        if (t.status === 'DONE') m.done++;
      }
    }
    const memberBreakdown = Array.from(memberMap.entries()).map(([userId, d]) => ({
      userId, name: `${d.firstName} ${d.lastName}`, total: d.total, done: d.done,
      completionRate: d.total > 0 ? Math.round((d.done / d.total) * 100) : 0,
    }));

    const dailyTasks: Record<string, any[]> = {};
    for (const t of tasks) {
      if (!t.deadline) continue;
      const day = t.deadline.getDate().toString();
      if (!dailyTasks[day]) dailyTasks[day] = [];
      dailyTasks[day].push({
        id: t.id,
        title: t.title,
        status: t.status,
        projectName: t.project.name,
        assigneeName: t.assignees.length > 0 ? `${t.assignees[0].user.firstName} ${t.assignees[0].user.lastName}` : null,
        assigneeId: t.assignees.length > 0 ? t.assignees[0].user.id : null,
      });
    }

    res.json({ tasks, summary: { total, todo, inProgress, pendingApproval, done }, projectBreakdown, memberBreakdown, dailyTasks });
  } catch (err) {
    console.error('calendar error:', err);
    res.status(500).json({ error: 'Failed to fetch calendar data' });
  }
});

export default router;
