'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import ProjectFormModal from '@/components/ProjectFormModal';
import SetQcModal from '@/components/SetQcModal';
import { useToast } from '@/components/Toast';
import Card from '@/components/ui/Card';
import Badge, { BadgeTone } from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import Avatar from '@/components/ui/Avatar';
import AvatarStack from '@/components/ui/AvatarStack';
import TaskRow, { daysTo, isOverdue } from '@/components/bento/TaskRow';
import TaskMiniCard from '@/components/bento/TaskMiniCard';
import api from '@/lib/api';
import { roleLabels } from '@/lib/roles';

interface Member {
  id: number;
  userId: number;
  user: { id: number; firstName: string; lastName: string; email: string; role: string };
}



const columns: { key: string; label: string; tone: BadgeTone }[] = [
  { key: 'TODO', label: 'انجام نشده', tone: 'neutral' },
  { key: 'IN_PROGRESS', label: 'در حال انجام', tone: 'info' },
  { key: 'PENDING_QC', label: 'کنترل کیفیت', tone: 'warn' },
  { key: 'PENDING_APPROVAL', label: 'منتظر تایید', tone: 'violet' },
  { key: 'DONE', label: 'تکمیل شده', tone: 'ok' },
];

const deadlineGroups = [
  { key: 'overdue', label: 'دیرکرد', tone: 'bad' as BadgeTone },
  { key: 'today', label: 'امروز', tone: 'warn' as BadgeTone },
  { key: 'week', label: 'هفت روز آینده', tone: 'info' as BadgeTone },
  { key: 'future', label: 'آینده', tone: 'neutral' as BadgeTone },
  { key: 'noDeadline', label: 'بدون سررسید', tone: 'neutral' as BadgeTone },
  { key: 'done', label: 'تکمیل شده', tone: 'ok' as BadgeTone },
];

function groupOf(task: any): string {
  if (task.status === 'DONE') return 'done';
  const d = daysTo(task.deadline);
  if (d === null) return 'noDeadline';
  if (isOverdue(task)) return 'overdue';
  if (d === 0) return 'today';
  if (d <= 7) return 'week';
  return 'future';
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const id = typeof params.id === 'string' ? parseInt(params.id) : 0;

  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'board' | 'list' | 'members'>('board');
  const [role, setRole] = useState('');
  const [userId, setUserId] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [qcOpen, setQcOpen] = useState(false);
  const [memberUserId, setMemberUserId] = useState('');
  const [deptUsers, setDeptUsers] = useState<any[]>([]);

  const fetchProject = useCallback(async () => {
    try {
      const { data } = await api.get(`/projects/${id}`);
      setProject(data);
    } catch {
      router.push('/dashboard/projects');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) { const u = JSON.parse(stored); setRole(u.role); setUserId(u.id); }
    } catch {}
  }, []);

  useEffect(() => { if (id) fetchProject(); }, [id, fetchProject]);

  useEffect(() => {
    if (tab === 'members' && project) {
      api.get(`/departments/${project.department.id}/users`)
        .then(({ data }) => setDeptUsers(data))
        .catch(() => {});
    }
  }, [tab, project]);

  const canManage = ['TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER', 'CEO'].includes(role);
  const canApprove = ['CEO', 'INTERNAL_MANAGER', 'TECHNICAL_MANAGER', 'DEPARTMENT_MANAGER'].includes(role);
  const canSetQc = ['CEO', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER'].includes(role);

  const handleAddMember = async () => {
    if (!memberUserId) return;
    try {
      await api.post(`/projects/${id}/members`, { userId: parseInt(memberUserId) });
      setMemberUserId('');
      fetchProject();
      showToast('عضو با موفقیت اضافه شد');
    } catch (err: any) { showToast(err.response?.data?.error || 'خطا', 'error'); }
  };

  const handleRemoveMember = async (uid: number) => {
    try {
      await api.delete(`/projects/${id}/members/${uid}`);
      fetchProject();
      showToast('عضو با موفقیت حذف شد');
    } catch (err: any) { showToast(err.response?.data?.error || 'خطا', 'error'); }
  };

  const handleQuickStatus = async (taskId: number, status: string) => {
    try {
      await api.patch(`/tasks/${taskId}/status`, { status });
      fetchProject();
      showToast(status === 'DONE' ? 'تسک تایید شد' : 'تسک برای تایید ارسال شد');
    } catch (err: any) { showToast(err.response?.data?.error || 'خطا', 'error'); }
  };

  const handleAssigneeComplete = async (task: any, isCompleted: boolean) => {
    try {
      const res = await api.patch(`/tasks/${task.id}/assignee-complete`, { isCompleted });
      showToast(res.data?.message || (isCompleted ? 'تیک انجام شما ثبت شد' : 'وضعیت برداشته شد'));
      fetchProject();
    } catch (err: any) { showToast(err.response?.data?.error || 'خطا', 'error'); }
  };

  const tasks: any[] = project?.tasks || [];
  const stats = useMemo(() => {
    const done = tasks.filter((t) => t.status === 'DONE').length;
    const overdue = tasks.filter((t) => isOverdue(t)).length;
    const pending = tasks.filter((t) => t.status === 'PENDING_APPROVAL').length;
    return { total: tasks.length, done, overdue, pending, progress: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
  }, [tasks]);

  const byColumn = useMemo(() => {
    const out: Record<string, any[]> = Object.fromEntries(columns.map((c) => [c.key, []]));
    for (const t of tasks) out[t.status]?.push(t);
    return out;
  }, [tasks]);

  const byDeadline = useMemo(() => {
    const out: Record<string, any[]> = Object.fromEntries(deadlineGroups.map((g) => [g.key, []]));
    for (const t of tasks) out[groupOf(t)]?.push(t);
    return out;
  }, [tasks]);

  const memberNames: string[] = (project?.members || []).map((m: Member) => `${m.user.firstName} ${m.user.lastName}`.trim());
  const health: BadgeTone = !stats.total ? 'neutral'
    : stats.overdue >= 2 || stats.progress < 25 ? 'bad'
    : stats.overdue > 0 || stats.progress < 60 ? 'warn' : 'ok';
  const healthLabel = health === 'bad' ? 'بحرانی' : health === 'warn' ? 'نیاز به توجه' : health === 'ok' ? 'سالم' : 'بدون تسک';

  const tabBtn = (active: boolean) =>
    `cursor-pointer rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
      active ? 'bg-pill text-pill-fg' : 'text-fg-secondary hover:text-fg'
    }`;

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={['CEO', 'INTERNAL_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER', 'EMPLOYEE']}>
        <div className="space-y-3 py-5">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-24 rounded-card" />
          <div className="grid gap-3 md:grid-cols-4">{[0,1,2,3].map(i => <Skeleton key={i} className="h-64 rounded-card" />)}</div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!project) return null;

  return (
    <ProtectedRoute allowedRoles={['CEO', 'INTERNAL_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER', 'EMPLOYEE']}>
      <div className="py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-extrabold tracking-tight text-fg md:text-[32px] md:leading-none">{project.name}</h1>
              <Badge tone={health}>{healthLabel}</Badge>
              {canManage && (
                <button onClick={() => setEditOpen(true)} title="ویرایش پروژه" aria-label="ویرایش پروژه"
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-card text-fg-muted shadow-flat transition-colors hover:text-fg">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
            </div>
            <p className="mt-1.5 text-sm text-fg-muted">
              {project.department?.name}
              {project.client && <> • کارفرما: {project.client}</>}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {canManage && (
              <Link
                href={`/dashboard/finance?projectId=${project.id}`}
                className="flex items-center gap-1.5 rounded-full bg-card px-3.5 py-2 text-xs font-medium text-fg shadow-flat hover:bg-hover transition-colors border border-line"
              >
                <svg className="h-3.5 w-3.5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>فاکتورها</span>
              </Link>
            )}
            {canManage && (
              <Link href={`/dashboard/tasks/new?projectId=${project.id}`}
                className="flex items-center gap-2 rounded-full bg-pill px-4 py-2 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                تسک جدید
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="tnum text-4xl font-extrabold text-fg">{stats.progress}٪</span>
            <span className="tnum text-xs text-fg-muted">{stats.done} از {stats.total} تسک</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-sunken">
            <div className={`h-full rounded-full transition-all duration-700 ${health === 'bad' ? 'bg-bad' : health === 'warn' ? 'bg-warn' : 'bg-ok'}`}
              style={{ width: `${stats.progress}%` }} />
          </div>
          {project.description && (
            <p className="mt-4 line-clamp-2 text-xs leading-relaxed text-fg-secondary">{project.description}</p>
          )}
        </Card>

        {[
          { label: 'تسک دیرکرد', value: stats.overdue, tone: stats.overdue ? 'bad' : 'ok' },
          { label: 'منتظر تایید', value: stats.pending, tone: stats.pending ? 'warn' : 'ok' },
        ].map((k) => (
          <Card key={k.label} padding="sm" className="lg:col-span-2">
            <span className="tnum text-3xl font-extrabold text-fg">{k.value}</span>
            <p className="mt-3 text-xs text-fg-secondary">{k.label}</p>
            <p className="mt-0.5 text-[10px] text-fg-muted">{k.value ? 'نیازمند پیگیری' : 'موردی نیست'}</p>
          </Card>
        ))}

        <Card className="lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-fg">اعضا</h3>
            <span className="tnum text-xs text-fg-muted">{memberNames.length}</span>
          </div>
          {memberNames.length ? <AvatarStack names={memberNames} max={6} size={30} />
            : <p className="text-xs text-fg-muted">هنوز عضوی ندارد</p>}

          <div className="mt-4 border-t border-line pt-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-[11px] font-semibold text-fg">کنترل کیفیت</h4>
              {canSetQc && (
                <button onClick={() => setQcOpen(true)}
                  className="cursor-pointer text-[10px] text-brand-ink transition-colors hover:text-brand">
                  {project.qc ? 'تغییر' : 'تعیین'}
                </button>
              )}
            </div>
            {project.qc ? (
              <div className="flex items-center gap-2">
                <Avatar name={`${project.qc.firstName} ${project.qc.lastName}`.trim()} size={26} />
                <span className="min-w-0 flex-1 truncate text-[11px] text-fg">
                  {project.qc.firstName} {project.qc.lastName}
                </span>
              </div>
            ) : (
              <p className="text-[11px] text-fg-muted">
                تعیین نشده — تسک‌ها مستقیم به تایید مدیر می‌روند
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="mb-3 inline-flex items-center gap-1 rounded-full bg-card p-1 shadow-flat">
        {([['board', 'بورد'], ['list', 'لیست'], ['members', 'اعضا']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={tabBtn(tab === key)}>{label}</button>
        ))}
      </div>

      {tab === 'board' && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {columns.map((col) => {
            const list = byColumn[col.key] || [];
            return (
              <section key={col.key} className="rounded-card bg-panel p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <h3 className="text-xs font-semibold text-fg">{col.label}</h3>
                  <Badge tone={col.tone}>{list.length}</Badge>
                </div>
                <div className="space-y-2">
                  {list.map((task) => {
                    const mine = task.assignees?.find((a: any) => a.userId === userId || a.user?.id === userId);
                    let action: React.ReactNode = null;
                    if (task.status === 'PENDING_APPROVAL' && canApprove) {
                      action = (
                        <button onClick={() => handleQuickStatus(task.id, 'DONE')}
                          className="cursor-pointer rounded-full bg-pill px-2.5 py-1 text-[10px] font-medium text-pill-fg transition-opacity hover:opacity-90">
                          تایید
                        </button>
                      );
                    } else if (task.status !== 'DONE' && mine) {
                      action = (
                        <button onClick={() => handleAssigneeComplete(task, !mine.isCompleted)}
                          title={mine.isCompleted ? 'لغو تیک انجام' : 'تیک زدن انجام'}
                          className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded-full transition-colors ${
                            mine.isCompleted ? 'bg-ok text-white' : 'bg-sunken text-fg-muted hover:text-fg'
                          }`}>
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                      );
                    }
                    return <TaskMiniCard key={task.id} task={task} action={action} />;
                  })}
                  {!list.length && <p className="py-6 text-center text-[11px] text-fg-muted">خالی</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {tab === 'list' && (
        tasks.length ? (
          <div className="space-y-3">
            {deadlineGroups.map((g) => {
              const list = byDeadline[g.key];
              if (!list?.length) return null;
              return (
                <Card key={g.key}>
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-fg">{g.label}</h3>
                    <Badge tone={g.tone}>{list.length} تسک</Badge>
                  </div>
                  <div className="space-y-2">
                    {list.map((t) => (
                      <TaskRow key={t.id} task={t} userId={userId}
                        onToggle={t.status !== 'DONE' ? handleAssigneeComplete : undefined} />
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="py-16 text-center"><p className="text-sm text-fg-muted">این پروژه هنوز تسکی ندارد</p></Card>
        )
      )}

      {tab === 'members' && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <h3 className="mb-4 text-sm font-semibold text-fg">اعضای پروژه</h3>
            {project.members?.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {project.members.map((m: Member) => {
                  const name = `${m.user.firstName} ${m.user.lastName}`.trim();
                  const taskCount = tasks.filter((t) => t.assignees?.some((a: any) => (a.userId ?? a.user?.id) === m.userId)).length;
                  return (
                    <div key={m.id} className="group flex items-center gap-3 rounded-tile bg-sunken px-3 py-2.5">
                      <Avatar name={name} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-fg">{name}</p>
                        <p className="truncate text-[10px] text-fg-muted">
                          {roleLabels[m.user.role] || m.user.role}
                          {taskCount > 0 && <> • {taskCount} تسک</>}
                        </p>
                      </div>
                      {canManage && (
                        <button onClick={() => handleRemoveMember(m.userId)} title="حذف عضو" aria-label={`حذف ${name}`}
                          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-fg-muted opacity-0 transition-all hover:bg-bad-soft hover:text-bad focus:opacity-100 group-hover:opacity-100">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-10 text-center text-xs text-fg-muted">هنوز عضوی اضافه نشده</p>
            )}
          </Card>

          {canManage && (
            <Card>
              <h3 className="mb-4 text-sm font-semibold text-fg">افزودن عضو</h3>
              <select
                value={memberUserId}
                onChange={(e) => setMemberUserId(e.target.value)}
                aria-label="انتخاب کاربر"
                className="w-full cursor-pointer rounded-tile bg-sunken px-3 py-2.5 text-xs text-fg outline-none"
              >
                <option value="">یک کاربر انتخاب کنید…</option>
                {deptUsers
                  .filter((u) => !project.members?.some((m: Member) => m.userId === u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                  ))}
              </select>
              <button
                onClick={handleAddMember}
                disabled={!memberUserId}
                className="mt-3 w-full cursor-pointer rounded-full bg-pill py-2.5 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                افزودن به پروژه
              </button>
              <p className="mt-3 text-[10px] leading-relaxed text-fg-muted">
                فقط کاربران دپارتمان «{project.department?.name}» قابل افزودن هستند.
              </p>
            </Card>
          )}
        </div>
      )}

      <SetQcModal
        open={qcOpen}
        projectId={project.id}
        projectName={project.name}
        currentQcId={project.qc?.id ?? null}
        onClose={() => setQcOpen(false)}
        onSuccess={() => { setQcOpen(false); fetchProject(); }}
      />

      <ProjectFormModal
        open={editOpen}
        project={project}
        onClose={() => setEditOpen(false)}
        onSaved={() => { setEditOpen(false); fetchProject(); }}
      />
    </ProtectedRoute>
  );
}
