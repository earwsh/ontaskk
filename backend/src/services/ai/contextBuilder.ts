import { PrismaClient } from '../../generated/client';
import { isTaskOverdue } from '../../lib/deadline';

interface ScopeFilter {
  userId: number;
  userRole: string;
  projectId?: number;
  departmentId?: number;
}

async function getTaskFilter(prisma: PrismaClient, scope: ScopeFilter) {
  const { userId, userRole, projectId, departmentId } = scope;

  if (projectId) return { projectId };

  if (departmentId) return { project: { departmentId } };

  if (['CEO', 'INTERNAL_MANAGER'].includes(userRole)) return {};
  if (userRole === 'TECHNICAL_MANAGER' || userRole === 'STRATEGY_MANAGER') return {};

  if (userRole === 'DEPARTMENT_MANAGER') {
    const dept = await prisma.department.findFirst({ where: { managerId: userId } });
    if (!dept) return { id: -1 };
    const projects = await prisma.project.findMany({ where: { departmentId: dept.id }, select: { id: true } });
    return { projectId: { in: projects.map((p) => p.id) } };
  }

  return { id: -1 };
}

function toShamsi(date: Date): string {
  try {
    return date.toLocaleDateString('fa-IR');
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export async function buildHealthContext(prisma: PrismaClient, scope: ScopeFilter): Promise<string> {
  const filter = await getTaskFilter(prisma, scope);
  const tasks = await prisma.task.findMany({
    where: filter,
    include: { project: { select: { name: true } }, assignees: true },
  });

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'DONE').length;
  const inProgress = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
  const todo = tasks.filter((t) => t.status === 'TODO').length;
  const pending = tasks.filter((t) => t.status === 'PENDING_APPROVAL').length;
  const overdue = tasks.filter((t) => isTaskOverdue(t.deadline, t.status)).length;
  const blocked = tasks.filter((t) => t.status === 'TODO' && isTaskOverdue(t.deadline, t.status)).length;

  const assigneeCounts: Record<number, number> = {};
  for (const t of tasks) {
    for (const a of t.assignees) {
      assigneeCounts[a.userId] = (assigneeCounts[a.userId] || 0) + 1;
    }
  }
  const maxLoad = Math.max(...Object.values(assigneeCounts), 0);
  const avgLoad = Object.values(assigneeCounts).reduce((a, b) => a + b, 0) / Math.max(Object.keys(assigneeCounts).length, 1);

  const deadlines = tasks.filter((t) => t.deadline).map((t) => new Date(t.deadline!));
  const nearestDeadline = deadlines.length > 0 ? toShamsi(new Date(Math.min(...deadlines.map((d) => d.getTime())))) : 'ندارد';

  return `آمار تسک‌ها:
- کل: ${total}
- انجام شده: ${done} (${total > 0 ? Math.round(done / total * 100) : 0}%)
- در حال انجام: ${inProgress}
- انجام نشده: ${todo}
- منتظر تأیید: ${pending}
- دیرکرد: ${overdue}
- مسدود: ${blocked}

نزدیک‌ترین ددلاین: ${nearestDeadline}
میانگین بار کاری هر عضو: ${avgLoad.toFixed(1)} تسک
بیشترین بار کاری: ${maxLoad} تسک`;
}

export async function buildPredictiveContext(prisma: PrismaClient, scope: ScopeFilter): Promise<string> {
  const filter = await getTaskFilter(prisma, scope);
  const tasks = await prisma.task.findMany({
    where: filter,
    include: { project: { select: { name: true } }, assignees: { include: { user: { select: { firstName: true, lastName: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  let context = `تسک‌ها (${tasks.length} مورد اخیر):\n`;
  for (const t of tasks) {
    const assignees = t.assignees.map((a) => `${a.user.firstName} ${a.user.lastName}`).join(', ') || 'نامشخص';
    const deadline = t.deadline ? `ددلاین: ${toShamsi(t.deadline)}` : 'بدون ددلاین';
    const daysLeft = t.deadline ? Math.ceil((new Date(t.deadline).getTime() - Date.now()) / 86400000) : null;
    context += `- "${t.title}" [${t.status}] ${deadline}${daysLeft !== null ? ` (${daysLeft} روز باقی)` : ''} | مجری: ${assignees}\n`;
  }

  const projectFilter = filter.projectId ? { id: filter.projectId } : filter.projectId ? { id: filter.projectId } : {};
  const projects = await prisma.project.findMany({
    where: Object.keys(projectFilter).length ? projectFilter : undefined,
    select: { name: true, _count: { select: { tasks: true } } },
  });

  context += `\nپروژه‌ها:\n`;
  for (const p of projects) {
    context += `- "${p.name}" | ${p._count.tasks} تسک\n`;
  }

  return context;
}

export async function buildWorkloadContext(prisma: PrismaClient, scope: ScopeFilter): Promise<string> {
  const { userId, userRole, departmentId } = scope;

  let users;
  if (departmentId) {
    const memberEntries = await prisma.userDepartment.findMany({
      where: { departmentId },
      include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
    });
    const memberUsers = memberEntries.map((e: any) => e.user);
    const memberIds = memberUsers.map((u: any) => u.id);
    const orgWideUsers = await prisma.user.findMany({
      where: { role: { in: ['CEO', 'TECHNICAL_MANAGER', 'INTERNAL_MANAGER', 'STRATEGY_MANAGER'] }, id: { notIn: memberIds } },
      select: { id: true, firstName: true, lastName: true, role: true },
    });
    users = [...memberUsers, ...orgWideUsers];
  } else if (['CEO', 'INTERNAL_MANAGER', 'TECHNICAL_MANAGER'].includes(userRole)) {
    users = await prisma.user.findMany({ select: { id: true, firstName: true, lastName: true, role: true, departmentMemberships: { include: { department: { select: { name: true } } } } } });
  } else if (userRole === 'DEPARTMENT_MANAGER') {
    const dept = await prisma.department.findFirst({ where: { managerId: userId } });
    if (!dept) return 'دپارتمانی یافت نشد.';
    const memberEntries = await prisma.userDepartment.findMany({
      where: { departmentId: dept.id },
      include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
    });
    const memberUsers = memberEntries.map((e: any) => e.user);
    const memberIds = memberUsers.map((u: any) => u.id);
    const orgWideUsers = await prisma.user.findMany({
      where: { role: { in: ['CEO', 'TECHNICAL_MANAGER', 'INTERNAL_MANAGER', 'STRATEGY_MANAGER'] }, id: { notIn: memberIds } },
      select: { id: true, firstName: true, lastName: true, role: true },
    });
    users = [...memberUsers, ...orgWideUsers];
  } else {
    return 'دسترسی ندارید.';
  }

  let context = `اعضای تیم (${users.length} نفر):\n`;
  for (const u of users) {
    const taskCount = await prisma.taskAssignee.count({ where: { userId: u.id } });
    const completedCount = await prisma.taskAssignee.count({
      where: { userId: u.id, task: { status: 'DONE' } },
    });
    const deptName = (u as any).departmentMemberships?.[0]?.department?.name || '';
    context += `- ${u.firstName} ${u.lastName} (${u.role})${deptName ? ` [${deptName}]` : ''} | ${taskCount} تسک | ${completedCount} تکمیل شده\n`;
  }

  return context;
}

export async function buildDailyContext(prisma: PrismaClient, scope: ScopeFilter): Promise<string> {
  const filter = await getTaskFilter(prisma, scope);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  const tasks = await prisma.task.findMany({
    where: filter,
    include: { project: { select: { name: true } } },
  });

  const completed = tasks.filter((t) => t.status === 'DONE' && t.updatedAt >= today).length;
  const created = tasks.filter((t) => t.createdAt >= today).length;
  const overdue = tasks.filter((t) => isTaskOverdue(t.deadline, t.status)).length;
  const blocked = tasks.filter((t) => t.status === 'TODO' && isTaskOverdue(t.deadline, t.status)).length;

  const recent = tasks.slice(0, 20).map((t) => `- "${t.title}" [${t.status}] (${t.project?.name || 'بدون پروژه'})${t.deadline ? ` ددلاین: ${toShamsi(t.deadline)}` : ''}`).join('\n');

  return `تاریخ: ${toShamsi(today)}
تسک‌های تکمیل شده امروز: ${completed}
تسک‌های ایجاد شده امروز: ${created}
تسک‌های دیرکرد: ${overdue}
تسک‌های مسدود: ${blocked}

تسک‌ها (۲۰ مورد آخر):
${recent || 'تسکی وجود ندارد'}`;
}

export async function buildWeeklyContext(prisma: PrismaClient, scope: ScopeFilter): Promise<string> {
  const filter = await getTaskFilter(prisma, scope);
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const tasks = await prisma.task.findMany({
    where: filter,
    include: { project: { select: { name: true } }, assignees: { include: { user: { select: { firstName: true, lastName: true } } } } },
  });

  const weekTasks = tasks.filter((t) => t.updatedAt >= weekStart && t.updatedAt <= weekEnd);
  const completed = weekTasks.filter((t) => t.status === 'DONE').length;
  const newTasks = tasks.filter((t) => t.createdAt >= weekStart && t.createdAt <= weekEnd).length;
  const overdue = tasks.filter((t) => isTaskOverdue(t.deadline, t.status)).length;
  const completionRate = tasks.length > 0 ? Math.round(tasks.filter((t) => t.status === 'DONE').length / tasks.length * 100) : 0;

  const performerCount: Record<string, number> = {};
  for (const t of tasks) {
    if (t.status === 'DONE') {
      for (const a of t.assignees) {
        const name = `${a.user.firstName} ${a.user.lastName}`;
        performerCount[name] = (performerCount[name] || 0) + 1;
      }
    }
  }

  const topPerformers = Object.entries(performerCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => `${name}: ${count} تسک`);

  return `هفته: ${toShamsi(weekStart)} تا ${toShamsi(weekEnd)}
تسک‌های تکمیل شده: ${completed}
تسک‌های جدید: ${newTasks}
دیرکرد کل: ${overdue}
میزان پیشرفت کل: ${completionRate}%

عملکرد اعضا (۵ نفر برتر):
${topPerformers.join('\n') || 'داده‌ای موجود نیست'}

تسک‌ها (۳۰ مورد آخر):
${tasks.slice(0, 30).map((t) => `- "${t.title}" [${t.status}] ${t.project?.name || ''}`).join('\n') || 'تسکی وجود ندارد'}`;
}

export async function buildSearchContext(prisma: PrismaClient, userId: number, userRole: string): Promise<string> {
  let tasks: any[];
  let projects: any[];
  let users: any[];
  let departments: any[];

  if (['CEO', 'INTERNAL_MANAGER'].includes(userRole)) {
    tasks = await prisma.task.findMany({ include: { project: { select: { name: true } }, assignees: { include: { user: { select: { firstName: true, lastName: true } } } } }, take: 200 });
    projects = await prisma.project.findMany({ take: 50 });
    users = await prisma.user.findMany({ select: { id: true, firstName: true, lastName: true, role: true, email: true }, take: 50 });
    departments = await prisma.department.findMany({ take: 20 });
  } else if (userRole === 'DEPARTMENT_MANAGER') {
    const dept = await prisma.department.findFirst({ where: { managerId: userId } });
    if (!dept) return 'شما مدیر هیچ دپارتمانی نیستید.';
    const pIds = (await prisma.project.findMany({ where: { departmentId: dept.id }, select: { id: true } })).map((p) => p.id);
    tasks = await prisma.task.findMany({ where: { projectId: { in: pIds } }, include: { project: { select: { name: true } }, assignees: { include: { user: { select: { firstName: true, lastName: true } } } } }, take: 200 });
    projects = await prisma.project.findMany({ where: { departmentId: dept.id }, take: 50 });
    users = await prisma.user.findMany({
      where: {
        OR: [
          { departmentMemberships: { some: { departmentId: dept.id } } },
          { role: { in: ['CEO', 'TECHNICAL_MANAGER', 'INTERNAL_MANAGER', 'STRATEGY_MANAGER'] } },
        ],
      },
      select: { id: true, firstName: true, lastName: true, role: true, email: true }, take: 50,
    });
    departments = [{ name: dept.name }];
  } else {
    tasks = await prisma.task.findMany({ where: { assignees: { some: { userId } } }, include: { project: { select: { name: true } } }, take: 100 });
    projects = await prisma.project.findMany({ where: { members: { some: { userId } } }, take: 20 });
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, firstName: true, lastName: true, role: true, email: true } });
    users = u ? [u] : [];
    departments = [];
  }

  let ctx = `=== تسک‌ها (${tasks.length} مورد) ===\n`;
  for (const t of tasks.slice(0, 50)) {
    const assignees = t.assignees?.map((a: any) => `${a.user.firstName} ${a.user.lastName}`).join(', ') || '';
    ctx += `- "${t.title}" [${t.status}] ${t.project?.name || ''} ${assignees ? `| ${assignees}` : ''}${t.deadline ? ` | ددلاین: ${toShamsi(t.deadline)}` : ''}\n`;
  }

  ctx += `\n=== پروژه‌ها (${projects.length} مورد) ===\n`;
  for (const p of projects) {
    ctx += `- "${p.name}"${p.description ? `: ${p.description.slice(0, 100)}` : ''}\n`;
  }

  ctx += `\n=== کاربران (${users.length} مورد) ===\n`;
  for (const u of users) {
    ctx += `- ${u.firstName} ${u.lastName} (${u.role})${(u as any).email ? ` | ${(u as any).email}` : ''}\n`;
  }

  if (departments.length) {
    ctx += `\n=== دپارتمان‌ها ===\n`;
    for (const d of departments) {
      ctx += `- ${d.name}\n`;
    }
  }

  return ctx;
}

export async function buildExecutiveContext(prisma: PrismaClient, scope: ScopeFilter): Promise<string> {
  const { userId, userRole } = scope;

  const departments = await prisma.department.findMany({
    include: { _count: { select: { members: true, projects: true } }, manager: { select: { firstName: true, lastName: true } } },
  });

  const projects = await prisma.project.findMany({
    include: { _count: { select: { tasks: true } }, department: { select: { name: true } } },
  });

  const users = await prisma.user.findMany({ select: { id: true, firstName: true, lastName: true, role: true } });
  const totalUsers = users.length;

  const tasks = await prisma.task.findMany({
    include: { project: { select: { name: true } }, assignees: { include: { user: { select: { firstName: true, lastName: true } } } } },
  });

  const doneTasks = tasks.filter((t) => t.status === 'DONE').length;
  const overdueTasks = tasks.filter((t) => isTaskOverdue(t.deadline, t.status)).length;

  const assigneeLoad: Record<string, number> = {};
  for (const t of tasks) {
    for (const a of t.assignees) {
      const name = `${a.user.firstName} ${a.user.lastName}`;
      assigneeLoad[name] = (assigneeLoad[name] || 0) + 1;
    }
  }
  const overloaded = Object.entries(assigneeLoad).filter(([, count]) => count > 10).length;

  const criticalTasks = tasks
    .filter((t) => isTaskOverdue(t.deadline, t.status))
    .slice(0, 10)
    .map((t) => `- "${t.title}" (پروژه: ${t.project?.name || 'بدون پروژه'}) ددلاین گذشته: ${t.deadline ? toShamsi(t.deadline) : ''}`);

  let ctx = `=== آمار کل سازمان ===
کاربران: ${totalUsers}
پروژه‌ها: ${projects.length}
تسک‌ها: ${tasks.length} (تکمیل شده: ${doneTasks}, دیرکرد: ${overdueTasks})
میزان پیشرفت کل: ${tasks.length > 0 ? Math.round(doneTasks / tasks.length * 100) : 0}%
اعضای بیش‌فعال: ${overloaded} نفر

=== پروژه‌ها ===
${projects.map((p) => `- "${p.name}" [${p.department?.name || 'بدون دپارتمان'}] ${p._count.tasks} تسک`).join('\n') || 'پروژه‌ای وجود ندارد'}

=== دپارتمان‌ها ===
${departments.map((d) => `- ${d.name}: ${(d as any)._count?.members || 0} کاربر، ${(d as any)._count?.projects || 0} پروژه، مدیر: ${(d as any).manager ? `${(d as any).manager.firstName} ${(d as any).manager.lastName}` : 'ندارد'}`).join('\n') || 'دپارتمانی وجود ندارد'}

=== تسک‌های بحرانی (دیرکرد) ===
${criticalTasks.join('\n') || 'تسک بحرانی وجود ندارد'}`;

  return ctx;
}

export async function buildTaskGeneratorContext(prisma: PrismaClient, scope: ScopeFilter): Promise<string> {
  const departments = await prisma.department.findMany({
    include: { manager: { select: { firstName: true, lastName: true } }, _count: { select: { members: true } } },
  });

  const projects = await prisma.project.findMany({ take: 20, select: { id: true, name: true, department: { select: { name: true } } } });

  const users = await prisma.user.findMany({ select: { id: true, firstName: true, lastName: true, role: true } });

  let ctx = '=== دپارتمان‌ها ===\n';
  for (const d of departments) {
    ctx += `- ${d.name} (مدیر: ${(d as any).manager ? `${(d as any).manager.firstName} ${(d as any).manager.lastName}` : 'ندارد'}, ${(d as any)._count?.members || 0} کاربر)\n`;
  }

  ctx += '\n=== پروژه‌ها ===\n';
  for (const p of projects) {
    ctx += `- "${p.name}" [${p.department?.name || ''}]\n`;
  }

  ctx += '\n=== کاربران ===\n';
  for (const u of users) {
    ctx += `- ${u.firstName} ${u.lastName} (${u.role})\n`;
  }

  return ctx;
}

export async function buildMeetingNotesContext(prisma: PrismaClient, scope: ScopeFilter): Promise<string> {
  const users = await prisma.user.findMany({ select: { id: true, firstName: true, lastName: true, role: true, departmentMemberships: { include: { department: { select: { name: true } } } } }, take: 30 });
  const projects = await prisma.project.findMany({ select: { id: true, name: true }, take: 20 });

  let ctx = '=== کاربران فعال ===\n';
  for (const u of users) {
    const deptName = u.departmentMemberships?.[0]?.department?.name || '';
    ctx += `- ${u.firstName} ${u.lastName} (${u.role})${deptName ? ` [${deptName}]` : ''}\n`;
  }

  ctx += '\n=== پروژه‌ها ===\n';
  for (const p of projects) {
    ctx += `- "${p.name}"\n`;
  }

  return ctx;
}

function buildTaskContextFromTasks(tasks: any[]): string {
  if (tasks.length === 0) return 'هیچ تسکی وجود ندارد.';

  const statusCount: Record<string, number> = {};
  let overdue = 0;
  const lines: string[] = [];

  for (const t of tasks) {
    statusCount[t.status] = (statusCount[t.status] || 0) + 1;
    if (isTaskOverdue(t.deadline, t.status)) {
      overdue++;
    }
    lines.push(
      `- "${t.title}" [${t.status}] (پروژه: ${t.project?.name || 'بدون پروژه'})${t.deadline ? ` مهلت: ${new Date(t.deadline).toLocaleDateString('fa-IR')}` : ''}`
    );
  }

  const statusStr = Object.entries(statusCount)
    .map(([s, c]) => `${s}: ${c}`)
    .join(', ');

  return `تعداد کل تسک‌ها: ${tasks.length}
وضعیت‌ها: ${statusStr}
تسک‌های دیرکرد: ${overdue}

لیست تسک‌ها:
${lines.join('\n')}`;
}

export async function buildQAContext(prisma: PrismaClient, scope: ScopeFilter): Promise<string> {
  const filter = await getTaskFilter(prisma, scope);
  const tasks = await prisma.task.findMany({
    where: filter,
    include: { project: { select: { name: true } } },
  });
  return buildTaskContextFromTasks(tasks);
}

export async function buildSummaryContext(prisma: PrismaClient, scope: ScopeFilter): Promise<{ context: string; scopeLabel: string }> {
  const { userId, userRole } = scope;
  let tasks: any[];
  let scopeLabel = '';

  if (['CEO', 'INTERNAL_MANAGER'].includes(userRole)) {
    tasks = await prisma.task.findMany({ include: { project: { select: { name: true } } } });
    scopeLabel = 'کل سازمان';
  } else if (userRole === 'TECHNICAL_MANAGER' || userRole === 'STRATEGY_MANAGER') {
    tasks = await prisma.task.findMany({ include: { project: { select: { name: true, department: { select: { name: true } } } } } });
    scopeLabel = 'کل سازمان';
  } else if (userRole === 'DEPARTMENT_MANAGER') {
    const dept = await prisma.department.findFirst({ where: { managerId: userId } });
    if (!dept) return { context: 'شما مدیر هیچ دپارتمانی نیستید.', scopeLabel: '' };
    const projectIds = (await prisma.project.findMany({ where: { departmentId: dept.id }, select: { id: true } })).map((p) => p.id);
    tasks = await prisma.task.findMany({ where: { projectId: { in: projectIds } }, include: { project: { select: { name: true } } } });
    scopeLabel = `دپارتمان ${dept.name}`;
  } else {
    return { context: 'دسترسی ندارید.', scopeLabel: '' };
  }

  const context = buildTaskContextFromTasks(tasks);
  return { context: `محدوده: ${scopeLabel}\n\n${context}`, scopeLabel };
}

export async function buildRecommendationsContext(prisma: PrismaClient, scope: ScopeFilter): Promise<string> {
  const { userId, userRole } = scope;
  let tasks: any[];

  if (['CEO', 'INTERNAL_MANAGER'].includes(userRole)) {
    tasks = await prisma.task.findMany({
      include: { project: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  } else if (userRole === 'TECHNICAL_MANAGER' || userRole === 'STRATEGY_MANAGER') {
    tasks = await prisma.task.findMany({
      include: { project: { select: { name: true, department: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  } else if (userRole === 'DEPARTMENT_MANAGER') {
    const dept = await prisma.department.findFirst({ where: { managerId: userId } });
    if (!dept) return 'شما مدیر هیچ دپارتمانی نیستید.';
    const projectIds = (await prisma.project.findMany({ where: { departmentId: dept.id }, select: { id: true } })).map((p) => p.id);
    tasks = await prisma.task.findMany({
      where: { projectId: { in: projectIds } },
      include: { project: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  } else {
    return 'دسترسی ندارید.';
  }

  return buildTaskContextFromTasks(tasks);
}

export async function buildDashboardContext(prisma: PrismaClient, scope: ScopeFilter): Promise<{ context: string; stats: any }> {
  const { userId, userRole } = scope;

  let tasks: any[];
  let projects: any[];
  let departments: any[];
  let users: any[];
  let reports: any[];
  let scopeLabel = '';

  if (['CEO', 'INTERNAL_MANAGER'].includes(userRole)) {
    tasks = await prisma.task.findMany({
      include: { project: { select: { name: true, department: { select: { name: true } } } }, assignees: { include: { user: { select: { firstName: true, lastName: true } } } } }
    });
    projects = await prisma.project.findMany({ include: { department: { select: { name: true } }, _count: { select: { tasks: true } } } });
    departments = await prisma.department.findMany({ include: { _count: { select: { members: true, projects: true } }, manager: { select: { firstName: true, lastName: true } } } });
    users = await prisma.user.findMany({ select: { id: true, firstName: true, lastName: true, role: true, departmentMemberships: { include: { department: { select: { name: true } } } } } });
    reports = await prisma.taskReport.findMany({ include: { task: { select: { title: true } }, user: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' }, take: 50 });
    scopeLabel = 'کل سازمان';
  } else if (userRole === 'TECHNICAL_MANAGER' || userRole === 'STRATEGY_MANAGER') {
    tasks = await prisma.task.findMany({
      include: { project: { select: { name: true, department: { select: { name: true } } } }, assignees: { include: { user: { select: { firstName: true, lastName: true } } } } }
    });
    projects = await prisma.project.findMany({ include: { department: { select: { name: true } }, _count: { select: { tasks: true } } } });
    departments = await prisma.department.findMany({ include: { _count: { select: { members: true, projects: true } }, manager: { select: { firstName: true, lastName: true } } } });
    users = await prisma.user.findMany({ select: { id: true, firstName: true, lastName: true, role: true, departmentMemberships: { include: { department: { select: { name: true } } } } } });
    reports = await prisma.taskReport.findMany({ include: { task: { select: { title: true } }, user: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' }, take: 50 });
    scopeLabel = 'کل سازمان (نمای فنی)';
  } else if (userRole === 'DEPARTMENT_MANAGER') {
    const managed = await prisma.department.findFirst({ where: { managerId: userId } });
    if (!managed) return { context: 'شما مدیر هیچ دپارتمانی نیستید.', stats: {} };
    const projectIds = (await prisma.project.findMany({ where: { departmentId: managed.id }, select: { id: true } })).map(p => p.id);
    tasks = await prisma.task.findMany({ where: { projectId: { in: projectIds } }, include: { project: { select: { name: true } }, assignees: { include: { user: { select: { firstName: true, lastName: true } } } } } });
    projects = await prisma.project.findMany({ where: { departmentId: managed.id }, include: { _count: { select: { tasks: true } } } });
    departments = [managed];
    const memberEntries = await prisma.userDepartment.findMany({
      where: { departmentId: managed.id },
      include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
    });
    const memberUsers = memberEntries.map((e: any) => e.user);
    const memberIds = memberUsers.map((u: any) => u.id);
    const orgWideUsers = await prisma.user.findMany({
      where: { role: { in: ['CEO', 'TECHNICAL_MANAGER', 'INTERNAL_MANAGER', 'STRATEGY_MANAGER'] }, id: { notIn: memberIds } },
      select: { id: true, firstName: true, lastName: true, role: true },
    });
    users = [...memberUsers, ...orgWideUsers];
    reports = await prisma.taskReport.findMany({ where: { task: { projectId: { in: projectIds } } }, include: { task: { select: { title: true } }, user: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' }, take: 50 });
    scopeLabel = `دپارتمان ${managed.name}`;
  } else {
    return { context: 'دسترسی ندارید.', stats: {} };
  }

  const taskStats = {
    total: tasks.length,
    byStatus: tasks.reduce((acc: any, t: any) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; }, {}),
    overdue: tasks.filter((t: any) => isTaskOverdue(t.deadline, t.status)).length,
    byPriority: tasks.reduce((acc: any, t: any) => { acc[t.priority] = (acc[t.priority] || 0) + 1; return acc; }, {}),
  };

  const projectStats = {
    total: projects.length,
    active: projects.filter((p: any) => p._count.tasks > 0).length,
    empty: projects.filter((p: any) => p._count.tasks === 0).length,
  };

  const deptStats = departments.map((d: any) => ({
    name: d.name,
    users: d._count?.members || 0,
    projects: d._count?.projects || 0,
    manager: d.manager ? `${d.manager.firstName} ${d.manager.lastName}` : 'بدون مدیر',
  }));

  const userStats = {
    total: users.length,
    byRole: users.reduce((acc: any, u: any) => { acc[u.role] = (acc[u.role] || 0) + 1; return acc; }, {}),
  };

  const recentReports = reports.slice(0, 20).map((r: any) => `- ${r.user.firstName} ${r.user.lastName} روی "${r.task.title}": ${r.content.slice(0, 100)}`).join('\n');
  const taskList = tasks.slice(0, 50).map((t: any) => `- "${t.title}" [${t.status}] (${t.project?.name || 'بدون پروژه'})${t.deadline ? ` | مهلت: ${new Date(t.deadline).toLocaleDateString('fa-IR')}` : ''}`).join('\n');

  const context = `محدوده: ${scopeLabel}

=== آمار کلی ===
تسک‌ها: ${taskStats.total} (${Object.entries(taskStats.byStatus).map(([s, c]) => `${s}:${c}`).join(', ')}) | دیرکرد: ${taskStats.overdue}
اولویت‌ها: ${Object.entries(taskStats.byPriority).map(([p, c]) => `${p}:${c}`).join(', ')}
پروژه‌ها: ${projectStats.total} (فعال: ${projectStats.active}, خالی: ${projectStats.empty})
کاربران: ${userStats.total} (${Object.entries(userStats.byRole).map(([r, c]) => `${r}:${c}`).join(', ')})
دپارتمان‌ها: ${deptStats.length}

=== دپارتمان‌ها ===
${deptStats.map((d: any) => `- ${d.name}: ${d.users} کاربر، ${d.projects} پروژه، مدیر: ${d.manager}`).join('\n')}

=== تسک‌های اخیر (تا ۵۰ مورد) ===
${taskList || 'تسکی وجود ندارد'}

=== گزارش‌های اخیر (تا ۲۰ مورد) ===
${recentReports || 'گزارشی ثبت نشده'}`;

  return {
    context,
    stats: { tasks: taskStats, projects: projectStats, users: userStats, departments: deptStats },
  };
}
