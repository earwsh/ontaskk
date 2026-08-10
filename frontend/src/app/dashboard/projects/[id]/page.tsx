'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import ProjectFormModal from '@/components/ProjectFormModal';
import { useToast } from '@/components/Toast';
import api from '@/lib/api';
import { gregorianToShamsi } from '@/lib/date';
import Link from 'next/link';

interface ProjectDetail {
  id: number;
  name: string;
  description: string | null;
  client: string | null;
  department: { id: number; name: string };
  createdBy: { id: number; firstName: string; lastName: string };
  _count: { tasks: number; members: number };
  tasks: Task[];
  members: Member[];
}

interface Task {
  id: number;
  title: string;
  description: string | null;
  status: string;
  assignees: { user: { id: number; firstName: string; lastName: string } }[];
  createdBy: { id: number; firstName: string; lastName: string };
  _count: { reports: number };
  createdAt: string;
  deadline?: string | null;
}

interface Member {
  id: number;
  userId: number;
  user: { id: number; firstName: string; lastName: string; email: string; role: string };
}

const statusConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
  TODO: { label: 'انجام نشده', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/25' },
  IN_PROGRESS: { label: 'در حال انجام', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/25' },
  PENDING_APPROVAL: { label: 'منتظر تایید', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/25' },
  DONE: { label: 'تکمیل شده', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/25' },
};

const tabLabels: Record<string, string> = {
  board: 'Board',
  table: 'جدول',
  members: 'اعضا',
};

function toJalali(dateStr: string) {
  return gregorianToShamsi(dateStr);
}

const groupConfig: Record<string, { label: string; color: string; icon: string }> = {
  overdue: { label: 'دیرکرد', color: 'text-red-400', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  today: { label: 'امروز', color: 'text-yellow-400', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  tomorrow: { label: 'فردا', color: 'text-blue-400', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
  week: { label: 'این هفته', color: 'text-cyan-400', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  future: { label: 'آینده', color: 'text-text-secondary', icon: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z' },
  noDeadline: { label: 'بدون سررسید', color: 'text-text-muted', icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6' },
  done: { label: 'تکمیل شده', color: 'text-green-400', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
};

const groupOrder = ['overdue', 'today', 'tomorrow', 'week', 'future', 'noDeadline', 'done'];

function getDeadlineGroup(deadline: string | null | undefined, status: string): string {
  if (status === 'DONE') return 'done';
  if (!deadline) return 'noDeadline';
  const now = new Date();
  const d = new Date(deadline);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const deadlineDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((deadlineDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff <= 7) return 'week';
  return 'future';
}

const roleLabels: Record<string, string> = {
  EMPLOYEE: 'کارمند',
  DEPARTMENT_MANAGER: 'مدیر دپارتمان',
  TECHNICAL_MANAGER: 'مدیر فنی',
  STRATEGY_MANAGER: 'مدیر استراتژی',
  CEO: 'مدیر عامل',
  HR_MANAGER: 'مدیر منابع انسانی',
  CUSTOMER: 'مشتری',
};

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const id = typeof params.id === 'string' ? parseInt(params.id) : 0;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'board' | 'table' | 'members'>('board');
  const [role, setRole] = useState('');

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [memberUserId, setMemberUserId] = useState('');
  const [deptUsers, setDeptUsers] = useState<{ id: number; firstName: string; lastName: string; email: string }[]>([]);
  const [userId, setUserId] = useState<number>(0);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      const u = JSON.parse(stored);
      setRole(u.role);
      setUserId(u.id);
    }
  }, []);

  const fetchProject = async () => {
    try {
      const { data } = await api.get(`/projects/${id}`);
      setProject(data);
    } catch {
      router.push('/dashboard/projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchProject();
  }, [id]);

  useEffect(() => {
    if (activeTab === 'members' && project) {
      api.get(`/departments/${project.department.id}/users`)
        .then(({ data }) => setDeptUsers(data))
        .catch(() => {});
    }
  }, [activeTab, project]);

  const canManage = ['TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER', 'CEO'].includes(role);
  const canApprove = ['CEO', 'HR_MANAGER', 'TECHNICAL_MANAGER', 'DEPARTMENT_MANAGER'].includes(role);

  const handleAddMember = async () => {
    if (!memberUserId) return;
    try {
      await api.post(`/projects/${id}/members`, { userId: parseInt(memberUserId) });
      setMemberUserId('');
      fetchProject();
      showToast('عضو با موفقیت اضافه شد');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا', 'error');
    }
  };

  const handleRemoveMember = async (userId: number) => {
    try {
      await api.delete(`/projects/${id}/members/${userId}`);
      fetchProject();
      showToast('عضو با موفقیت حذف شد');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا', 'error');
    }
  };

  const handleQuickStatus = async (taskId: number, status: string) => {
    try {
      await api.patch(`/tasks/${taskId}/status`, { status });
      fetchProject();
      showToast(status === 'DONE' ? 'تسک تایید شد' : 'تسک برای تایید ارسال شد');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا', 'error');
    }
  };

  const doneCount = project?.tasks.filter((t) => t.status === 'DONE').length || 0;
  const totalCount = project?.tasks.length || 0;
  const pendingCount = project?.tasks.filter((t) => t.status === 'PENDING_APPROVAL').length || 0;
  const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const groupedTasks = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    for (const key of groupOrder) groups[key] = [];
    if (!project?.tasks) return groups;
    for (const t of project.tasks) {
      const key = getDeadlineGroup(t.deadline, t.status);
      if (groups[key]) groups[key].push(t);
    }
    return groups;
  }, [project?.tasks]);

  const taskColumns = ['TODO', 'IN_PROGRESS', 'PENDING_APPROVAL', 'DONE'];

  return (
    <ProtectedRoute allowedRoles={['CEO', 'HR_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER', 'EMPLOYEE']}>
      <div className="h-full flex flex-col overflow-hidden animate-fade-in">
        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <svg className="w-6 h-6 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : project ? (
          <>
            <div className="flex items-start justify-between shrink-0 mb-4">
              <div>
                <button onClick={() => router.push('/dashboard/projects')}
                  className="text-text-muted hover:text-white text-sm mb-2 flex items-center gap-1.5 transition-all cursor-pointer">
                  <svg className="w-4 h-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  بازگشت به پروژه‌ها
                </button>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-xl font-bold text-white">{project.name}</h1>
                  {canManage && (
                    <button onClick={() => setEditModalOpen(true)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-primary/5 transition-all cursor-pointer" title="ویرایش پروژه">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  )}
                  <div className="flex items-center gap-1.5">
                    {totalCount > 0 && (
                      <span className="text-xs text-text-muted bg-card-hover px-2.5 py-0.5 rounded-lg">
                        {totalCount} تسک
                      </span>
                    )}
                    {pendingCount > 0 && (
                      <span className="text-xs text-purple-400 bg-purple-500/10 px-2.5 py-0.5 rounded-lg">
                        {pendingCount} منتظر تایید
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-text-muted">
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    {project.department.name}
                  </span>
                  {project.client && (
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {project.client}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                    </svg>
                    {project._count.members} عضو
                  </span>
                </div>
              </div>
              {canManage && (
                <Link href={`/dashboard/tasks/new?projectId=${project.id}`}
                  className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-medium text-sm transition-all shrink-0 cursor-pointer active:scale-[0.98]">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  تسک جدید
                </Link>
              )}
            </div>

            {project.description && (
              <p className="text-sm text-text-secondary bg-card border border-[rgba(255,255,255,0.06)] rounded-xl px-4 py-2.5 shrink-0 mb-3 leading-relaxed">
                {project.description}
              </p>
            )}

            {totalCount > 0 && (
              <div className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-4 shrink-0 mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-sm text-text-muted shrink-0">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    پیشرفت
                  </div>
                  <div className="flex-1 h-2 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-l from-primary to-primary/60 rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="text-sm text-white font-medium tabular-nums shrink-0">{progress}%</span>
                  <span className="text-xs text-text-muted shrink-0">({doneCount}/{totalCount})</span>
                </div>
              </div>
            )}

            <div className="flex gap-1 bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-1 shrink-0 mb-3">
              {['board', 'table', 'members'].map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab as any)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer active:scale-[0.98] ${
                    activeTab === tab
                      ? 'bg-primary text-white shadow-lg shadow-primary/20'
                      : 'text-text-muted hover:text-white'
                  }`}>
                  {tabLabels[tab]}
                </button>
              ))}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {activeTab === 'board' && (
                <div className="grid grid-cols-4 gap-3 h-full">
                  {taskColumns.map((col) => {
                    const cfg = statusConfig[col];
                    const tasks = project.tasks.filter((t) => t.status === col);
                    return (
                      <div key={col} className={`bg-card border ${cfg.border} rounded-[20px] p-4 flex flex-col min-h-0`}>
                        <div className="flex items-center justify-between mb-3 shrink-0">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${cfg.color.replace('text', 'bg')}`} />
                            <h3 className={`text-sm font-semibold ${cfg.color}`}>
                              {cfg.label}
                            </h3>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                            {tasks.length}
                          </span>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
                          {tasks.map((task) => (
                            <div key={task.id}
                              className="bg-[rgba(22,27,38,0.6)] border border-[rgba(255,255,255,0.04)] rounded-xl p-3 transition-all group hover:border-primary/30">
                              <Link href={`/dashboard/tasks/${task.id}`} className="block text-right">
                                <h4 className="text-sm font-medium text-white group-hover:text-primary transition-colors">{task.title}</h4>
                                <div className="flex items-center justify-between mt-2 text-xs text-text-muted">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                    <span className="truncate">{task.assignees?.map((a) => a.user.firstName).join(', ') || '-'}</span>
                                  </div>
                                  {task._count.reports > 0 && (
                                    <span className="flex items-center gap-1 shrink-0">
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                      </svg>
                                      {task._count.reports}
                                    </span>
                                  )}
                                </div>
                              </Link>
                              {col === 'PENDING_APPROVAL' && canApprove && (
                                <button onClick={() => handleQuickStatus(task.id, 'DONE')}
                                  className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-all cursor-pointer active:scale-[0.97]">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                  تایید
                                </button>
                              )}
                              {['TODO', 'IN_PROGRESS'].includes(col) && role === 'EMPLOYEE' && task.assignees?.some((a) => a.user.id === userId) && (
                                <button onClick={() => handleQuickStatus(task.id, 'PENDING_APPROVAL')}
                                  className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-all cursor-pointer active:scale-[0.97]">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  ارسال برای تایید
                                </button>
                              )}
                            </div>
                          ))}
                          {tasks.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-6 text-text-muted">
                              <svg className="w-8 h-8 mb-1 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                              </svg>
                              <p className="text-xs opacity-60">تسکی وجود ندارد</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeTab === 'table' && (
                <div className="space-y-4">
                  {project.tasks.length === 0 ? (
                    <div className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-12 text-center text-text-muted">
                      هیچ تسکی وجود ندارد
                    </div>
                  ) : (
                    groupOrder.map((key) => {
                      const groupTasks = groupedTasks[key];
                      if (!groupTasks || groupTasks.length === 0) return null;
                      const cfg = groupConfig[key];
                      return (
                        <div key={key} className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] overflow-hidden">
                          <div className={`px-4 py-3 border-b border-[rgba(255,255,255,0.06)] flex items-center gap-2 ${cfg.color}`}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d={cfg.icon} />
                            </svg>
                            <span className="text-white font-medium text-sm">{cfg.label}</span>
                            <span className="text-text-muted text-xs mr-auto">{groupTasks.length} تسک</span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-[rgba(255,255,255,0.06)]">
                                  <th className="text-right px-4 py-3 text-text-muted font-medium whitespace-nowrap text-xs">عنوان</th>
                                  <th className="text-right px-4 py-3 text-text-muted font-medium whitespace-nowrap text-xs">انجام‌دهنده</th>
                                  <th className="text-right px-4 py-3 text-text-muted font-medium whitespace-nowrap text-xs">وضعیت</th>
                                  <th className="text-right px-4 py-3 text-text-muted font-medium whitespace-nowrap text-xs">گزارشات</th>
                                  <th className="text-right px-4 py-3 text-text-muted font-medium whitespace-nowrap text-xs">سررسید</th>
                                  <th className="text-right px-4 py-3 text-text-muted font-medium whitespace-nowrap text-xs">تاریخ ایجاد</th>
                                  <th className="text-center px-4 py-3 text-text-muted font-medium whitespace-nowrap text-xs">عملیات</th>
                                </tr>
                              </thead>
                              <tbody>
                                {groupTasks.map((task) => (
                                  <tr key={task.id}
                                    className="border-b border-[rgba(255,255,255,0.03)] hover:bg-card-hover transition-colors">
                                    <td className="px-4 py-3">
                                      <button onClick={() => router.push(`/dashboard/tasks/${task.id}`)} className="cursor-pointer text-white font-medium hover:text-primary transition-colors text-right">
                                        {task.title}
                                      </button>
                                    </td>
                                    <td className="px-4 py-3">
                                      <span className="text-text-secondary">{task.assignees?.map((a) => a.user.firstName + ' ' + a.user.lastName).join(', ') || '-'}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${statusConfig[task.status].bg} ${statusConfig[task.status].color} ${statusConfig[task.status].border} border`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${statusConfig[task.status].color.replace('text', 'bg')}`} />
                                        {statusConfig[task.status].label}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-text-muted">{task._count.reports}</td>
                                    <td className="px-4 py-3 text-text-muted font-mono">{task.deadline ? toJalali(task.deadline) : '-'}</td>
                                    <td className="px-4 py-3 text-text-muted font-mono">{toJalali(task.createdAt)}</td>
                                    <td className="px-4 py-3 text-center">
                                      {task.status === 'PENDING_APPROVAL' && canApprove && (
                                        <button onClick={() => handleQuickStatus(task.id, 'DONE')}
                                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-all cursor-pointer active:scale-[0.97]">
                                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                          </svg>
                                          تایید
                                        </button>
                                      )}
                                      {['TODO', 'IN_PROGRESS'].includes(task.status) && role === 'EMPLOYEE' && task.assignees?.some((a) => a.user.id === userId) && (
                                        <button onClick={() => handleQuickStatus(task.id, 'PENDING_APPROVAL')}
                                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-all cursor-pointer active:scale-[0.97]">
                                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                          </svg>
                                          ارسال برای تایید
                                        </button>
                                      )}
                                      {task.status === 'DONE' && (
                                        <span className="inline-flex items-center gap-1 text-xs text-green-400/60">
                                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                          </svg>
                                          انجام شده
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {activeTab === 'members' && (
                <div className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-5">
                  <div className="space-y-2">
                    {project.members.map((member) => (
                      <div key={member.id}
                        className="flex items-center justify-between bg-[rgba(22,27,38,0.6)] rounded-xl px-4 py-3 group hover:bg-[rgba(22,27,38,0.8)] transition-all">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0">
                            {member.user.firstName[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate">{member.user.firstName} {member.user.lastName}</p>
                            <div className="flex items-center gap-2 text-xs text-text-muted">
                              <span className="truncate">{member.user.email}</span>
                              <span className="w-1 h-1 rounded-full bg-text-muted/30 shrink-0" />
                              <span>{roleLabels[member.user.role] || member.user.role}</span>
                            </div>
                          </div>
                        </div>
                        {canManage && (
                          <button onClick={() => handleRemoveMember(member.userId)}
                            className="p-2 rounded-lg text-text-muted hover:text-danger hover:bg-danger/5 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                            title="حذف عضو">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                    {project.members.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-8 text-text-muted">
                        <svg className="w-10 h-10 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                        </svg>
                        <p className="text-xs">هیچ عضوی وجود ندارد</p>
                      </div>
                    )}
                  </div>

                  {canManage && (
                    <div className="mt-5 pt-5 border-t border-[rgba(255,255,255,0.06)]">
                      <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                        </svg>
                        افزودن عضو جدید
                      </h4>
                      <div className="flex gap-2">
                        <select value={memberUserId} onChange={(e) => setMemberUserId(e.target.value)}
                          className="flex-1 px-4 py-2.5 bg-[rgba(22,27,38,0.6)] border border-[rgba(255,255,255,0.08)] rounded-xl text-white focus:outline-none focus:border-primary/50 text-sm cursor-pointer">
                          <option value="">انتخاب کارمند</option>
                          {deptUsers
                            .filter((u) => !project.members.some((m) => m.userId === u.id))
                            .map((u) => (
                              <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                            ))}
                        </select>
                        <button onClick={handleAddMember} disabled={!memberUserId}
                          className="px-5 h-11 bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-medium text-sm transition-all shrink-0 cursor-pointer active:scale-[0.98]">
                          افزودن
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center flex-1 text-text-muted">پروژه یافت نشد</div>
        )}
        <ProjectFormModal
          open={editModalOpen}
          project={project ? { id: project.id, name: project.name, description: project.description, client: project.client, departmentId: project.department.id, department: project.department } : null}
          onClose={() => setEditModalOpen(false)}
          onSaved={() => { setEditModalOpen(false); fetchProject(); }}
        />
      </div>
    </ProtectedRoute>
  );
}
