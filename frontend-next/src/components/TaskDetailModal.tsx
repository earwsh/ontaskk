'use client';

import { useState, useEffect } from 'react';
import { jalaliDateTime } from '@/lib/date';
import TaskRecurrenceBadge from '@/components/TaskRecurrenceBadge';
import api from '@/lib/api';

interface TaskDetailModalProps {
  open: boolean;
  onClose: () => void;
  taskId: number | null;
  onTaskUpdated: () => void;
}

interface Report {
  id: number;
  content: string;
  createdAt: string;
  user: { id: number; firstName: string; lastName: string };
}

interface TaskDetail {
  id: number;
  title: string;
  description: string | null;
  status: string;
  assignee: { id: number; firstName: string; lastName: string; email: string };
  createdBy: { id: number; firstName: string; lastName: string };
  project: { id: number; name: string; departmentId: number };
  reports: Report[];
  isRecurring?: boolean;
  recurrencePattern?: string | null;
  recurrenceDays?: string | null;
  recurringParentId?: number | null;
}

const statusColors: Record<string, string> = {
  TODO: 'bg-yellow-500/20 text-yellow-400',
  IN_PROGRESS: 'bg-blue-500/20 text-blue-400',
  DONE: 'bg-green-500/20 text-green-400',
};
const statusLabel: Record<string, string> = {
  TODO: 'انجام نشده',
  IN_PROGRESS: 'در حال انجام',
  DONE: 'تکمیل شده',
};

function toJalali(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('fa-IR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TaskDetailModal({ open, onClose, taskId, onTaskUpdated }: TaskDetailModalProps) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportContent, setReportContent] = useState('');
  const [sendingReport, setSendingReport] = useState(false);
  const [role, setRole] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      const u = JSON.parse(stored);
      setRole(u.role);
    }
  }, []);

  useEffect(() => {
    if (open && taskId) {
      setLoading(true);
      api.get(`/tasks/${taskId}`)
        .then(({ data }) => setTask(data))
        .catch(() => {})
        .finally(() => setLoading(false));
      setReportContent('');
    }
  }, [open, taskId]);

  const handleStatusChange = async (status: string) => {
    if (!task) return;
    try {
      await api.patch(`/tasks/${task.id}/status`, { status });
      onTaskUpdated();
      const { data } = await api.get(`/tasks/${task.id}`);
      setTask(data);
    } catch (err: any) {
      alert(err.response?.data?.error || 'خطا');
    }
  };

  const handleAddReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || !reportContent.trim()) return;
    setSendingReport(true);
    try {
      const { data } = await api.post(`/tasks/${task.id}/reports`, { content: reportContent });
      setTask((prev) => prev ? { ...prev, reports: [...prev.reports, data] } : prev);
      setReportContent('');
    } catch (err: any) {
      alert(err.response?.data?.error || 'خطا');
    } finally {
      setSendingReport(false);
    }
  };

  const canManage = ['TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER', 'CEO', 'INTERNAL_MANAGER'].includes(role);
  const canChangeStatus = canManage || role === 'EMPLOYEE';

  if (!open) return null;

  const inputClass = "w-full px-4 py-2.5 bg-card border border-line rounded-xl text-fg placeholder-text-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all duration-200";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-line rounded-[20px] w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-scale-in">
        <div className="sticky top-0 bg-card border-b border-line px-6 py-4 flex items-center justify-between rounded-t-[20px] z-10">
          <h2 className="text-lg font-semibold text-fg">جزئیات تسک</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-fg-muted hover:text-fg hover:bg-card-hover transition-all">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-fg-muted">در حال بارگذاری...</div>
        ) : task ? (
          <div className="p-6 space-y-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="text-xl font-bold text-fg">{task.title}</h3>
                  <TaskRecurrenceBadge
                    isRecurring={task.isRecurring}
                    recurrencePattern={task.recurrencePattern}
                    recurrenceDays={task.recurrenceDays}
                    recurringParentId={task.recurringParentId}
                  />
                </div>
                <p className="text-sm text-fg-muted">پروژه: {task.project.name}</p>
              </div>
              <span className={`px-3 py-1 rounded-lg text-xs font-medium ${statusColors[task.status]}`}>
                {statusLabel[task.status]}
              </span>
            </div>

            {task.description && (
              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-1">توضیحات</label>
                <p className="text-fg-secondary text-sm bg-card rounded-xl px-4 py-3">{task.description}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-fg-muted">انجام‌دهنده: </span>
                <span className="text-fg">{task.assignee.firstName} {task.assignee.lastName}</span>
              </div>
              <div>
                <span className="text-fg-muted">ایجادکننده: </span>
                <span className="text-fg">{task.createdBy.firstName} {task.createdBy.lastName}</span>
              </div>
            </div>

            {canChangeStatus && (
              <div className="flex gap-2">
                {['TODO', 'IN_PROGRESS', 'DONE'].map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    disabled={task.status === s || (role === 'EMPLOYEE' && s !== 'DONE')}
                    className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                      task.status === s
                        ? 'bg-primary/20 text-brand cursor-default'
                        : 'bg-card-hover text-fg-secondary hover:text-fg'
                    } disabled:opacity-30 disabled:cursor-not-allowed`}
                  >
                    {statusLabel[s]}
                  </button>
                ))}
              </div>
            )}

            <div className="border-t border-line pt-5">
              <h4 className="text-sm font-semibold text-fg mb-4">گزارشات</h4>

              <div className="space-y-3 mb-4">
                {task.reports.length === 0 ? (
                  <p className="text-fg-muted text-sm">هنوز گزارشی ثبت نشده</p>
                ) : (
                  task.reports.map((report) => (
                    <div key={report.id} className="bg-card rounded-xl px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-brand">{report.user.firstName} {report.user.lastName}</span>
                        <span className="text-xs text-fg-muted">{jalaliDateTime(report.createdAt)}</span>
                      </div>
                      <p className="text-fg-secondary text-sm">{report.content}</p>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleAddReport} className="flex gap-2">
                <input
                  type="text" value={reportContent} onChange={(e) => setReportContent(e.target.value)}
                  className={inputClass} placeholder="ثبت گزارش جدید..."
                />
                <button
                  type="submit" disabled={!reportContent.trim() || sendingReport}
                  className="px-4 py-2.5 bg-pill hover:opacity-90 disabled:opacity-40 text-pill-fg rounded-xl font-medium text-sm transition-all shrink-0"
                >
                  {sendingReport ? '...' : 'ارسال'}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="p-12 text-center text-fg-muted">تسک یافت نشد</div>
        )}
      </div>
    </div>
  );
}
