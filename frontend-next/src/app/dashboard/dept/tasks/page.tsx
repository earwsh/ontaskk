'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import TaskRecurrenceBadge from '@/components/TaskRecurrenceBadge';
import AvatarStack from '@/components/ui/AvatarStack';
import api from '@/lib/api';
import Link from 'next/link';

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  TODO: { label: 'انجام نشده', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  IN_PROGRESS: { label: 'در حال انجام', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  PENDING_QC: { label: 'کنترل کیفیت', color: 'text-warn', bg: 'bg-warn-soft' },
  PENDING_APPROVAL: { label: 'منتظر تایید', color: 'text-violet', bg: 'bg-violet-soft' },
  DONE: { label: 'تکمیل شده', color: 'text-green-400', bg: 'bg-green-500/10' },
};

export default function DeptTasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/tasks').then(({ data }) => {
      setTasks(data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const grouped = tasks.reduce<Record<string, any[]>>((acc, t) => {
    const key = t.project?.name || 'بدون پروژه';
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  return (
    <ProtectedRoute allowedRoles={['CEO', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'INTERNAL_MANAGER', 'DEPARTMENT_MANAGER']}>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-fg">تسک‌های دپارتمان</h1>
          <p className="text-fg-muted text-sm mt-1">تمام تسک‌های پروژه‌های دپارتمان</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-fg-muted">در حال بارگذاری...</div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-fg-muted">
            <svg className="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm">هیچ تسکی در دپارتمان وجود ندارد</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([projectName, projectTasks]) => (
              <div key={projectName} className="bg-card border border-line rounded-[20px] overflow-hidden">
                <div className="px-4 py-3 border-b border-line flex items-center gap-2">
                  <svg className="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span className="text-fg font-medium text-sm">{projectName}</span>
                  <span className="text-fg-muted text-xs mr-auto">{projectTasks.length} تسک</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line">
                        <th className="text-right px-4 py-2.5 text-fg-muted font-medium whitespace-nowrap text-xs">عنوان</th>
                        <th className="text-right px-4 py-2.5 text-fg-muted font-medium whitespace-nowrap text-xs">وضعیت</th>
                        <th className="text-right px-4 py-2.5 text-fg-muted font-medium whitespace-nowrap text-xs">سررسید</th>
                        <th className="text-right px-4 py-2.5 text-fg-muted font-medium whitespace-nowrap text-xs">محول به</th>
                        <th className="text-right px-4 py-2.5 text-fg-muted font-medium whitespace-nowrap text-xs">زیر تسک</th>
                        <th className="text-right px-4 py-2.5 text-fg-muted font-medium whitespace-nowrap text-xs">ایجاد کننده</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectTasks.map((task: any) => {
                        const doneSubtasks = task.subtasks?.filter((s: any) => s.isDone).length || 0;
                        const totalSubtasks = task.subtasks?.length || 0;
                        const conf = statusConfig[task.status] || statusConfig.TODO;

                        return (
                          <tr key={task.id} className="border-b border-line hover:bg-card-hover transition-colors">
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <Link href={`/dashboard/tasks/${task.id}`} className="text-fg hover:text-brand transition-colors font-medium">
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
                            <td className="px-4 py-2.5 text-fg-secondary whitespace-nowrap font-mono text-xs">
                              {task.deadline ? new Date(task.deadline).toLocaleDateString('fa-IR') : '-'}
                            </td>
                            <td className="px-4 py-2.5 text-fg-secondary whitespace-nowrap text-xs">
                              {task.assignees?.length ? (
                                <div className="flex items-center gap-1.5">
                                  <AvatarStack
                                    users={task.assignees.map((a: any) => ({
                                      id: a.user?.id,
                                      name: `${a.user?.firstName || ''} ${a.user?.lastName || ''}`.trim() || 'کاربر',
                                      avatarUrl: a.user?.avatarUrl || null,
                                    }))}
                                    size={24}
                                    max={3}
                                  />
                                  <span className="truncate max-w-[140px]" title={task.assignees.map((a: any) => `${a.user?.firstName || ''} ${a.user?.lastName || ''}`.trim()).join('، ')}>
                                    {task.assignees.map((a: any) => `${a.user?.firstName || ''} ${a.user?.lastName || ''}`.trim()).join('، ')}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-fg-muted">-</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-fg-secondary whitespace-nowrap text-xs">
                              {totalSubtasks > 0 ? `${doneSubtasks}/${totalSubtasks}` : '-'}
                            </td>
                            <td className="px-4 py-2.5 text-fg-secondary whitespace-nowrap text-xs">
                              {task.createdBy ? `${task.createdBy.firstName} ${task.createdBy.lastName}` : '-'}
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
        )}
      </div>
    </ProtectedRoute>
  );
}
