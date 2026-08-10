'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useToast } from '@/components/Toast';
import api from '@/lib/api';
import { gregorianToShamsi } from '@/lib/date';
import Link from 'next/link';
import { isPast, parseISO } from 'date-fns';

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  TODO: { label: 'انجام نشده', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  IN_PROGRESS: { label: 'در حال انجام', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  PENDING_APPROVAL: { label: 'منتظر تایید', color: 'text-purple-400', bg: 'bg-purple-500/10' },
  DONE: { label: 'تکمیل شده', color: 'text-green-400', bg: 'bg-green-500/10' },
};

const groupConfig: Record<string, { label: string; color: string; icon: string }> = {
  overdue: { label: 'دیرکرد', color: 'text-red-400', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  today: { label: 'امروز', color: 'text-yellow-400', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  tomorrow: { label: 'فردا', color: 'text-blue-400', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
  week: { label: 'این هفته', color: 'text-cyan-400', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  future: { label: 'آینده', color: 'text-text-secondary', icon: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z' },
  noDeadline: { label: 'بدون سررسید', color: 'text-text-muted', icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6' },
};

function getDeadlineGroup(deadline: string | null): string {
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

const groupOrder = ['overdue', 'today', 'tomorrow', 'week', 'future', 'noDeadline'];

export default function MyTasksPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active' | 'history'>('active');

  useEffect(() => {
    api.get('/tasks/my').then(({ data }) => {
      setTasks(data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleDelete = async (task: any) => {
    if (!confirm(`آیا از حذف تسک "${task.title}" اطمینان دارید؟`)) return;
    try {
      await api.delete(`/tasks/${task.id}`);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      showToast('تسک با موفقیت حذف شد');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در حذف', 'error');
    }
  };

  const historyTasks = useMemo(() => tasks.filter((t) => t.status === 'DONE'), [tasks]);

  const activeTasks = useMemo(() => tasks.filter((t) => t.status !== 'DONE'), [tasks]);

  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const key of groupOrder) groups[key] = [];
    for (const t of activeTasks) {
      const key = getDeadlineGroup(t.deadline);
      if (groups[key]) groups[key].push(t);
    }
    return groups;
  }, [activeTasks]);

  const hasActive = activeTasks.length > 0;

  return (
    <ProtectedRoute allowedRoles={['CEO', 'HR_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER', 'EMPLOYEE']}>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">تسک‌های من</h1>
          <p className="text-text-muted text-sm mt-1">تسک‌هایی که به شما محول شده</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-text-muted">در حال بارگذاری...</div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-text-muted">
            <svg className="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm">تسکی به شما محول نشده</p>
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
              hasActive ? (
                <div className="space-y-4">
                  {groupOrder.map((key) => {
                    const groupTasks = grouped[key];
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
                              <tr className="border-b border-[rgba(255,255,255,0.03)]">
                                <th className="text-right px-4 py-2.5 text-text-muted font-medium whitespace-nowrap text-xs">عنوان</th>
                                <th className="text-right px-4 py-2.5 text-text-muted font-medium whitespace-nowrap text-xs">پروژه</th>
                                <th className="text-right px-4 py-2.5 text-text-muted font-medium whitespace-nowrap text-xs">وضعیت</th>
                                <th className="text-right px-4 py-2.5 text-text-muted font-medium whitespace-nowrap text-xs">سررسید</th>
                                <th className="text-right px-4 py-2.5 text-text-muted font-medium whitespace-nowrap text-xs">زیر تسک</th>
                                <th className="text-right px-4 py-2.5 text-text-muted font-medium whitespace-nowrap text-xs">ایجاد کننده</th>
                                <th className="text-center px-4 py-2.5 text-text-muted font-medium whitespace-nowrap text-xs">عملیات</th>
                              </tr>
                            </thead>
                            <tbody>
                              {groupTasks.map((task: any) => {
                                const doneSubtasks = task.subtasks?.filter((s: any) => s.isDone).length || 0;
                                const totalSubtasks = task.subtasks?.length || 0;
                                const conf = statusConfig[task.status] || statusConfig.TODO;
                                return (
                                  <tr key={task.id} className="border-b border-[rgba(255,255,255,0.03)] hover:bg-card-hover transition-colors">
                                    <td className="px-4 py-2.5">
                                      <Link href={`/dashboard/tasks/${task.id}`} className="text-white hover:text-primary transition-colors font-medium">{task.title}</Link>
                                    </td>
                                    <td className="px-4 py-2.5 text-text-secondary whitespace-nowrap text-xs">{task.project?.name || '-'}</td>
                                    <td className="px-4 py-2.5 whitespace-nowrap">
                                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${conf.bg} ${conf.color}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${conf.color.replace('text', 'bg')}`} />
                                        {conf.label}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-text-secondary whitespace-nowrap font-mono text-xs">
                                      {task.deadline ? gregorianToShamsi(task.deadline) : '-'}
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
                                        <button onClick={() => handleDelete(task)}
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
                    );
                  })}
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
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[rgba(255,255,255,0.03)]">
                        <th className="text-right px-4 py-2.5 text-text-muted font-medium whitespace-nowrap text-xs">عنوان</th>
                        <th className="text-right px-4 py-2.5 text-text-muted font-medium whitespace-nowrap text-xs">پروژه</th>
                        <th className="text-right px-4 py-2.5 text-text-muted font-medium whitespace-nowrap text-xs">سررسید</th>
                        <th className="text-right px-4 py-2.5 text-text-muted font-medium whitespace-nowrap text-xs">تکمیل در</th>
                        <th className="text-right px-4 py-2.5 text-text-muted font-medium whitespace-nowrap text-xs">تایید کننده</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyTasks.map((task: any) => (
                        <tr key={task.id} className="border-b border-[rgba(255,255,255,0.03)] hover:bg-card-hover transition-colors">
                          <td className="px-4 py-2.5">
                            <Link href={`/dashboard/tasks/${task.id}`} className="text-text-secondary hover:text-primary transition-colors text-sm">{task.title}</Link>
                          </td>
                          <td className="px-4 py-2.5 text-text-muted whitespace-nowrap text-xs">{task.project?.name || '-'}</td>
                          <td className="px-4 py-2.5 text-text-muted whitespace-nowrap font-mono text-xs">
                            {task.deadline ? gregorianToShamsi(task.deadline) : '-'}
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
              </div>
            )}
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
