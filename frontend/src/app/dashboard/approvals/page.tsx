'use client';

import { useEffect, useState, useMemo } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import Link from 'next/link';
import { useToast } from '@/components/Toast';

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  PENDING_APPROVAL: { label: 'منتظر تایید', color: 'text-purple-400', bg: 'bg-purple-500/10' },
  TODO: { label: 'انجام نشده', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  IN_PROGRESS: { label: 'در حال انجام', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  DONE: { label: 'تکمیل شده', color: 'text-green-400', bg: 'bg-green-500/10' },
};

export default function ApprovalsPage() {
  const [userId, setUserId] = useState(0);
  const [tasks, setTasks] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      const u = JSON.parse(stored);
      setUserId(u.id);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    Promise.all([
      api.get('/departments'),
      api.get('/tasks'),
    ]).then(([deptRes, taskRes]) => {
      setDepartments(deptRes.data);
      const managedDeptIds = deptRes.data
        .filter((d: any) => d.managerId === userId)
        .map((d: any) => d.id);
      setTasks(
        taskRes.data.filter(
          (t: any) =>
            t.status === 'PENDING_APPROVAL' &&
            managedDeptIds.includes(t.project?.departmentId)
        )
      );
    }).catch(() => {}).finally(() => setLoading(false));
  }, [userId]);

  const deptMap = useMemo(() => {
    const map: Record<number, string> = {};
    for (const d of departments) {
      map[d.id] = d.name;
    }
    return map;
  }, [departments]);

  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const t of tasks) {
      const deptName = deptMap[t.project?.departmentId] || t.project?.name || 'بدون دپارتمان';
      if (!groups[deptName]) groups[deptName] = [];
      groups[deptName].push(t);
    }
    return groups;
  }, [tasks, deptMap]);

  const handleApprove = async (taskId: number) => {
    try {
      await api.patch(`/tasks/${taskId}/status`, { status: 'DONE' });
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      showToast('تسک با موفقیت تایید شد');
    } catch {
      showToast('خطا در تایید تسک', 'error');
    }
  };

  const handleReject = async (taskId: number) => {
    try {
      await api.patch(`/tasks/${taskId}/status`, { status: 'TODO' });
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      showToast('تسک برای ویرایش برگردانده شد');
    } catch {
      showToast('خطا در برگرداندن تسک', 'error');
    }
  };

  return (
    <ProtectedRoute allowedRoles={['CEO', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'HR_MANAGER', 'DEPARTMENT_MANAGER']}>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">تایید تسک‌ها</h1>
          <p className="text-text-muted text-sm mt-1">تسک‌های ارسال شده برای تایید</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-text-muted">در حال بارگذاری...</div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-text-muted">
            <svg className="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm">هیچ تسکی منتظر تایید نیست</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([deptName, deptTasks]) => (
              <div key={deptName} className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] overflow-hidden">
                <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.06)] flex items-center gap-2 bg-purple-500/5">
                  <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <span className="text-white font-medium text-sm">{deptName}</span>
                  <span className="text-text-muted text-xs mr-auto">{deptTasks.length} تسک</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[rgba(255,255,255,0.03)]">
                        <th className="text-right px-4 py-2.5 text-text-muted font-medium whitespace-nowrap text-xs">عنوان</th>
                        <th className="text-right px-4 py-2.5 text-text-muted font-medium whitespace-nowrap text-xs">پروژه</th>
                        <th className="text-right px-4 py-2.5 text-text-muted font-medium whitespace-nowrap text-xs">سررسید</th>
                        <th className="text-right px-4 py-2.5 text-text-muted font-medium whitespace-nowrap text-xs">محول به</th>
                        <th className="text-right px-4 py-2.5 text-text-muted font-medium whitespace-nowrap text-xs">ایجاد کننده</th>
                        <th className="text-center px-4 py-2.5 text-text-muted font-medium whitespace-nowrap text-xs">عملیات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deptTasks.map((task: any) => (
                        <tr key={task.id} className="border-b border-[rgba(255,255,255,0.03)] hover:bg-card-hover transition-colors">
                          <td className="px-4 py-2.5">
                            <Link href={`/dashboard/tasks/${task.id}`} className="text-white hover:text-primary transition-colors font-medium">
                              {task.title}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-text-secondary whitespace-nowrap text-xs">
                            {task.project?.name || '-'}
                          </td>
                          <td className="px-4 py-2.5 text-text-secondary whitespace-nowrap font-mono text-xs">
                            {task.deadline ? new Date(task.deadline).toLocaleDateString('fa-IR') : '-'}
                          </td>
                          <td className="px-4 py-2.5 text-text-secondary whitespace-nowrap text-xs">
                            {task.assignees?.length
                              ? task.assignees.map((a: any) => `${a.user.firstName} ${a.user.lastName}`).join('، ')
                              : '-'}
                          </td>
                          <td className="px-4 py-2.5 text-text-secondary whitespace-nowrap text-xs">
                            {task.createdBy ? `${task.createdBy.firstName} ${task.createdBy.lastName}` : '-'}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button onClick={() => handleApprove(task.id)}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-all cursor-pointer active:scale-[0.97]">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                تایید
                              </button>
                              <button onClick={() => handleReject(task.id)}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all cursor-pointer active:scale-[0.97]">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                رد
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
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
