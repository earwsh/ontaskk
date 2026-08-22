'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import TaskRecurrenceBadge from '@/components/TaskRecurrenceBadge';
import api from '@/lib/api';
import { gregorianToShamsi } from '@/lib/date';
import Link from 'next/link';
import _ from 'lodash';
import { isPast, parseISO } from 'date-fns';

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  TODO: { label: 'انجام نشده', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  IN_PROGRESS: { label: 'در حال انجام', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  PENDING_APPROVAL: { label: 'منتظر تایید', color: 'text-purple-400', bg: 'bg-purple-500/10' },
  DONE: { label: 'تکمیل شده', color: 'text-green-400', bg: 'bg-green-500/10' },
};

export default function OrgTasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active' | 'history'>('active');

  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState<number | null>(null);
  const [filterProject, setFilterProject] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterUser, setFilterUser] = useState<number | null>(null);
  const [filterDeadline, setFilterDeadline] = useState<string | null>(null);

  useEffect(() => {
    api.get('/tasks').then(({ data }) => {
      setTasks(data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const departments = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of tasks) {
      const deptId = t.project?.departmentId;
      const deptName = t.project?.department?.name;
      if (deptId && deptName) map.set(deptId, deptName);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [tasks]);

  const projects = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of tasks) {
      if (filterDept !== null && t.project?.departmentId !== filterDept) continue;
      if (t.project?.id && t.project?.name) map.set(t.project.id, t.project.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [tasks, filterDept]);

  const usersList = useMemo(() => {
    const map = new Map<number, { id: number; firstName: string; lastName: string }>();
    for (const t of tasks) {
      if (t.assignees) {
        for (const a of t.assignees) {
          if (a.user) {
            map.set(a.user.id, { id: a.user.id, firstName: a.user.firstName, lastName: a.user.lastName });
          }
        }
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'fa')
    );
  }, [tasks]);

  const filtered = useMemo(() => {
    let result = [...tasks];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((t) => t.title.toLowerCase().includes(q));
    }
    if (filterDept !== null) {
      result = result.filter((t) => t.project?.departmentId === filterDept);
    }
    if (filterProject !== null) {
      result = result.filter((t) => t.project?.id === filterProject);
    }
    if (filterStatus) {
      result = result.filter((t) => t.status === filterStatus);
    }
    if (filterUser !== null) {
      result = result.filter((t) => t.assignees?.some((a: any) => a.user?.id === filterUser));
    }
    if (filterDeadline) {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      result = result.filter((t) => {
        if (!t.deadline) return false;
        const [y, m, d] = t.deadline.split('T')[0].split('-').map(Number);
        const deadlineDay = new Date(y, m - 1, d);

        if (filterDeadline === 'overdue') {
          return deadlineDay.getTime() < todayStart.getTime() && t.status !== 'DONE';
        }
        if (filterDeadline === 'today') {
          return deadlineDay.getTime() === todayStart.getTime();
        }
        if (filterDeadline === 'tomorrow') {
          const tomStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 1);
          return deadlineDay.getTime() === tomStart.getTime();
        }
        if (filterDeadline === 'week') {
          const weekEnd = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 7);
          return deadlineDay.getTime() >= todayStart.getTime() && deadlineDay.getTime() <= weekEnd.getTime();
        }
        if (filterDeadline === 'month') {
          const monthEnd = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 30);
          return deadlineDay.getTime() >= todayStart.getTime() && deadlineDay.getTime() <= monthEnd.getTime();
        }
        return true;
      });
    }

    return result;
  }, [tasks, search, filterDept, filterProject, filterStatus, filterUser, filterDeadline]);

  const activeTasks = useMemo(() => filtered.filter((t) => t.status !== 'DONE'), [filtered]);

  const historyTasks = useMemo(() => {
    let result = [...tasks];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((t) => t.title.toLowerCase().includes(q));
    }
    if (filterDept !== null) {
      result = result.filter((t) => t.project?.departmentId === filterDept);
    }
    if (filterProject !== null) {
      result = result.filter((t) => t.project?.id === filterProject);
    }
    if (filterUser !== null) {
      result = result.filter((t) => t.assignees?.some((a: any) => a.user?.id === filterUser));
    }
    if (filterDeadline) {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      result = result.filter((t) => {
        if (!t.deadline) return false;
        const [y, m, d] = t.deadline.split('T')[0].split('-').map(Number);
        const deadlineDay = new Date(y, m - 1, d);

        if (filterDeadline === 'overdue') {
          return false;
        }
        if (filterDeadline === 'today') {
          return deadlineDay.getTime() === todayStart.getTime();
        }
        if (filterDeadline === 'tomorrow') {
          const tomStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 1);
          return deadlineDay.getTime() === tomStart.getTime();
        }
        if (filterDeadline === 'week') {
          const weekEnd = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 7);
          return deadlineDay.getTime() >= todayStart.getTime() && deadlineDay.getTime() <= weekEnd.getTime();
        }
        if (filterDeadline === 'month') {
          const monthEnd = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 30);
          return deadlineDay.getTime() >= todayStart.getTime() && deadlineDay.getTime() <= monthEnd.getTime();
        }
        return true;
      });
    }
    return result.filter((t) => t.status === 'DONE');
  }, [tasks, search, filterDept, filterProject, filterUser, filterDeadline]);

  const grouped = useMemo(() => {
    const groups: Record<string, Record<string, any[]>> = {};

    for (const t of activeTasks) {
      const deptName: string = t.project?.department?.name || t.project?.name || 'بدون دپارتمان';
      const projName: string = t.project?.name || 'بدون پروژه';

      if (!groups[deptName]) groups[deptName] = {};
      if (!groups[deptName][projName]) groups[deptName][projName] = [];
      groups[deptName][projName].push(t);
    }

    return groups;
  }, [activeTasks]);

  const historyGrouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const t of historyTasks) {
      const deptName: string = t.project?.department?.name || t.project?.name || 'بدون دپارتمان';
      if (!groups[deptName]) groups[deptName] = [];
      groups[deptName].push(t);
    }
    return groups;
  }, [historyTasks]);

  const clearFilters = () => {
    setSearch('');
    setFilterDept(null);
    setFilterProject(null);
    setFilterStatus(null);
    setFilterUser(null);
    setFilterDeadline(null);
  };

  const hasFilters = search || filterDept !== null || filterProject !== null || filterStatus || filterUser !== null || filterDeadline !== null;

  const statuses = ['TODO', 'IN_PROGRESS', 'PENDING_APPROVAL', 'DONE'];

  return (
    <ProtectedRoute allowedRoles={['TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'CEO', 'HR_MANAGER']}>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">تسک‌های سازمان</h1>
          <p className="text-text-muted text-sm mt-1">تمام تسک‌های تمام دپارتمان‌ها</p>
        </div>

        {/* Filters */}
        <div className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <label className="block text-xs text-text-muted mb-1.5">جستجو</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="عنوان تسک..."
                className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-2 text-sm text-white placeholder-text-muted outline-none focus:border-primary/50 transition-colors"
              />
            </div>

            <div className="min-w-[150px]">
              <label className="block text-xs text-text-muted mb-1.5">دپارتمان</label>
              <select
                value={filterDept ?? ''}
                onChange={(e) => { setFilterDept(e.target.value ? Number(e.target.value) : null); setFilterProject(null); }}
                className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-primary/50 transition-colors appearance-none cursor-pointer"
              >
                <option value="">همه</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="min-w-[150px]">
              <label className="block text-xs text-text-muted mb-1.5">پروژه</label>
              <select
                value={filterProject ?? ''}
                onChange={(e) => setFilterProject(e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-primary/50 transition-colors appearance-none cursor-pointer"
              >
                <option value="">همه</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="min-w-[130px]">
              <label className="block text-xs text-text-muted mb-1.5">وضعیت</label>
              <select
                value={filterStatus ?? ''}
                onChange={(e) => setFilterStatus(e.target.value || null)}
                className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-primary/50 transition-colors appearance-none cursor-pointer"
              >
                <option value="">همه</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>{statusConfig[s].label}</option>
                ))}
              </select>
            </div>

            <div className="min-w-[150px]">
              <label className="block text-xs text-text-muted mb-1.5">شخص</label>
              <select
                value={filterUser ?? ''}
                onChange={(e) => setFilterUser(e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-primary/50 transition-colors appearance-none cursor-pointer"
              >
                <option value="">همه</option>
                {usersList.map((u) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>

            <div className="min-w-[150px]">
              <label className="block text-xs text-text-muted mb-1.5">سررسید</label>
              <select
                value={filterDeadline ?? ''}
                onChange={(e) => setFilterDeadline(e.target.value || null)}
                className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-primary/50 transition-colors appearance-none cursor-pointer"
              >
                <option value="">همه</option>
                <option value="overdue">دیرکرد</option>
                <option value="today">امروز</option>
                <option value="tomorrow">فردا</option>
                <option value="week">این هفته</option>
                <option value="month">این ماه</option>
              </select>
            </div>

            <div className="flex items-center gap-2 pb-0.5">
              {hasFilters && (
                <button onClick={clearFilters}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-[rgba(255,255,255,0.04)] text-text-muted hover:text-white border border-[rgba(255,255,255,0.08)] transition-all cursor-pointer">
                  پاک کردن
                </button>
              )}
            </div>
          </div>

          {hasFilters && (
            <div className="mt-3 text-xs text-text-muted">
              {filtered.length} نتیجه از {tasks.length} تسک
            </div>
          )}
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-text-muted">در حال بارگذاری...</div>
        ) : filtered.length === 0 && historyTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-text-muted">
            <svg className="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm">تسکی یافت نشد</p>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex items-center gap-2">
              <button onClick={() => setTab('active')}
                className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${tab === 'active' ? 'bg-primary text-white' : 'bg-card-hover text-text-secondary hover:text-white'}`}>
                فعال {activeTasks.length > 0 && `(${activeTasks.length})`}
              </button>
              <button onClick={() => setTab('history')}
                className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${tab === 'history' ? 'bg-primary text-white' : 'bg-card-hover text-text-secondary hover:text-white'}`}>
                تاریخچه {historyTasks.length > 0 && `(${historyTasks.length})`}
              </button>
            </div>

            {tab === 'active' ? (
              Object.keys(grouped).length > 0 ? (
                <div className="space-y-6">
                  {Object.entries(grouped).map(([deptName, deptProjects]) => (
                    <div key={deptName} className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] overflow-hidden">
                      <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.06)] flex items-center gap-2 bg-[rgba(99,102,241,0.05)]">
                        <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        <span className="text-white font-medium text-sm">{deptName}</span>
                        <span className="text-text-muted text-xs mr-auto">
                          {_.sumBy(Object.values(deptProjects), (ts: any[]) => ts.length)} تسک
                        </span>
                      </div>

                      {Object.entries(deptProjects).map(([projName, projectTasks]) => (
                        <div key={projName}>
                          <div className="px-4 py-2 border-b border-[rgba(255,255,255,0.03)] bg-[rgba(255,255,255,0.01)] flex items-center gap-2">
                            <svg className="w-3.5 h-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                            <span className="text-text-secondary text-xs font-medium">{projName}</span>
                            <span className="text-text-muted text-[10px] mr-auto">{projectTasks.length} تسک</span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-[rgba(255,255,255,0.03)]">
                                  <th className="text-right px-4 py-2 text-text-muted font-medium whitespace-nowrap text-xs">عنوان</th>
                                  <th className="text-right px-4 py-2 text-text-muted font-medium whitespace-nowrap text-xs">وضعیت</th>
                                  <th className="text-right px-4 py-2 text-text-muted font-medium whitespace-nowrap text-xs">محول به</th>
                                  <th className="text-right px-4 py-2 text-text-muted font-medium whitespace-nowrap text-xs">شروع</th>
                                  <th className="text-right px-4 py-2 text-text-muted font-medium whitespace-nowrap text-xs">سررسید</th>
                                  <th className="text-right px-4 py-2 text-text-muted font-medium whitespace-nowrap text-xs">تاریخ ایجاد</th>
                                  <th className="text-right px-4 py-2 text-text-muted font-medium whitespace-nowrap text-xs">زیر تسک</th>
                                  <th className="text-right px-4 py-2 text-text-muted font-medium whitespace-nowrap text-xs">ایجاد کننده</th>
                                  <th className="text-center px-4 py-2 text-text-muted font-medium whitespace-nowrap text-xs">عملیات</th>
                                </tr>
                              </thead>
                              <tbody>
                                {projectTasks.map((task: any) => {
                                  const doneSubtasks = task.subtasks?.filter((s: any) => s.isDone).length || 0;
                                  const totalSubtasks = task.subtasks?.length || 0;
                                  const conf = statusConfig[task.status] || statusConfig.TODO;

                                  return (
                                    <tr key={task.id} className="border-b border-[rgba(255,255,255,0.03)] hover:bg-card-hover transition-colors">
                                      <td className="px-4 py-2.5">
                                        <div className="flex items-center gap-2">
                                          <Link href={`/dashboard/tasks/${task.id}`} className="text-white hover:text-primary transition-colors font-medium">
                                            {task.title}
                                          </Link>
                                          <TaskRecurrenceBadge
                                            isRecurring={task.isRecurring}
                                            recurrencePattern={task.recurrencePattern}
                                            recurrenceDays={task.recurrenceDays}
                                            recurringParentId={task.recurringParentId}
                                            compact
                                          />
                                        </div>
                                      </td>
                                      <td className="px-4 py-2.5 whitespace-nowrap">
                                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${conf.bg} ${conf.color}`}>
                                          <div className={`w-1.5 h-1.5 rounded-full ${conf.color.replace('text', 'bg')}`} />
                                          {conf.label}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2.5 text-text-secondary whitespace-nowrap text-xs">
                                        {task.assignees?.length
                                          ? task.assignees.map((a: any) => `${a.user.firstName} ${a.user.lastName}`).join('، ')
                                          : '-'}
                                      </td>
                                      <td className="px-4 py-2.5 text-text-secondary whitespace-nowrap font-mono text-xs">
                                        {task.startDate ? gregorianToShamsi(task.startDate) : '-'}
                                      </td>
                                      <td className="px-4 py-2.5 text-text-secondary whitespace-nowrap font-mono text-xs">
                                        {task.deadline ? gregorianToShamsi(task.deadline) : '-'}
                                      </td>
                                      <td className="px-4 py-2.5 text-text-secondary whitespace-nowrap font-mono text-xs">
                                        {task.createdAt ? gregorianToShamsi(task.createdAt) : '-'}
                                      </td>
                                      <td className="px-4 py-2.5 text-text-secondary whitespace-nowrap text-xs">
                                        {totalSubtasks > 0 ? `${doneSubtasks}/${totalSubtasks}` : '-'}
                                      </td>
                                      <td className="px-4 py-2.5 text-text-secondary whitespace-nowrap text-xs">
                                        {task.createdBy ? `${task.createdBy.firstName} ${task.createdBy.lastName}` : '-'}
                                      </td>
                                      <td className="px-4 py-2.5 whitespace-nowrap">
                                        <div className="flex items-center justify-center gap-1">
                                          <button onClick={() => router.push(`/dashboard/tasks/${task.id}`)}
                                            className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-primary/5 transition-all cursor-pointer" title="ویرایش">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                          </button>
                                          <button onClick={async () => {
                                            if (!confirm(`آیا از حذف تسک "${task.title}" اطمینان دارید؟`)) return;
                                            try {
                                              await api.delete(`/tasks/${task.id}`);
                                              setTasks((prev) => prev.filter((t) => t.id !== task.id));
                                            } catch {}
                                          }}
                                            className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/5 transition-all cursor-pointer" title="حذف">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-text-muted">
                  <svg className="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm">هیچ تسک فعالی وجود ندارد</p>
                </div>
              )
            ) : (
              <div className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] overflow-hidden">
                {Object.entries(historyGrouped).map(([deptName, deptTasks]) => (
                  <div key={deptName}>
                    <div className="px-4 py-2 border-b border-[rgba(255,255,255,0.03)] flex items-center gap-2 bg-[rgba(34,197,94,0.03)]">
                      <span className="text-text-secondary text-xs font-medium">{deptName}</span>
                      <span className="text-text-muted text-[10px] mr-auto">{deptTasks.length} تسک</span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[rgba(255,255,255,0.03)]">
                          <th className="text-right px-4 py-2 text-text-muted font-medium whitespace-nowrap text-xs">عنوان</th>
                          <th className="text-right px-4 py-2 text-text-muted font-medium whitespace-nowrap text-xs">پروژه</th>
                          <th className="text-right px-4 py-2 text-text-muted font-medium whitespace-nowrap text-xs">انجام دهنده</th>
                          <th className="text-right px-4 py-2 text-text-muted font-medium whitespace-nowrap text-xs">شروع</th>
                          <th className="text-right px-4 py-2 text-text-muted font-medium whitespace-nowrap text-xs">سررسید</th>
                          <th className="text-right px-4 py-2 text-text-muted font-medium whitespace-nowrap text-xs">تاریخ ایجاد</th>
                          <th className="text-right px-4 py-2 text-text-muted font-medium whitespace-nowrap text-xs">تکمیل در</th>
                          <th className="text-right px-4 py-2 text-text-muted font-medium whitespace-nowrap text-xs">تایید کننده</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deptTasks.map((task: any) => (
                          <tr key={task.id} className="border-b border-[rgba(255,255,255,0.03)] hover:bg-card-hover transition-colors">
                            <td className="px-4 py-2.5">
                              <Link href={`/dashboard/tasks/${task.id}`} className="text-text-secondary hover:text-primary transition-colors text-sm">{task.title}</Link>
                            </td>
                            <td className="px-4 py-2.5 text-text-muted whitespace-nowrap text-xs">{task.project?.name || '-'}</td>
                            <td className="px-4 py-2.5 text-text-muted whitespace-nowrap text-xs">
                              {task.assignees?.length
                                ? task.assignees.map((a: any) => `${a.user.firstName} ${a.user.lastName}`).join('، ')
                                : '-'}
                            </td>
                            <td className="px-4 py-2.5 text-text-muted whitespace-nowrap font-mono text-xs">
                              {task.startDate ? gregorianToShamsi(task.startDate) : '-'}
                            </td>
                            <td className="px-4 py-2.5 text-text-muted whitespace-nowrap font-mono text-xs">
                              {task.deadline ? gregorianToShamsi(task.deadline) : '-'}
                            </td>
                            <td className="px-4 py-2.5 text-text-muted whitespace-nowrap font-mono text-xs">
                              {task.createdAt ? gregorianToShamsi(task.createdAt) : '-'}
                            </td>
                            <td className="px-4 py-2.5 text-text-muted whitespace-nowrap font-mono text-xs">
                              {task.approvedAt ? gregorianToShamsi(task.approvedAt) : '-'}
                            </td>
                            <td className="px-4 py-2.5 text-text-muted whitespace-nowrap text-xs">
                              {task.approvedBy ? `${task.approvedBy.firstName} ${task.approvedBy.lastName}` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
