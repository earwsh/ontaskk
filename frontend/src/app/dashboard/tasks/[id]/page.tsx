'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import ShamsiDatePicker from '@/components/ShamsiDatePicker';
import TaskRecurrenceConfig, { RecurrenceConfigState } from '@/components/TaskRecurrenceConfig';
import TaskRecurrenceBadge, { getRecurrenceDescription } from '@/components/TaskRecurrenceBadge';
import { useToast } from '@/components/Toast';
import { gregorianToShamsi } from '@/lib/date';
import api from '@/lib/api';
import Link from 'next/link';

interface TaskDetail {
  id: number;
  title: string;
  description: string | null;
  status: string;
  deadline: string | null;
  estimatedHours: number | null;
  project: { id: number; name: string; departmentId: number };
  assignees: { userId: number; isCompleted?: boolean; completedAt?: string | null; user: { id: number; firstName: string; lastName: string; email: string } }[];
  subtasks: { id: number; title: string; isDone: boolean; completedAt?: string | null }[];
  createdBy: { id: number; firstName: string; lastName: string };
  approvedBy: { id: number; firstName: string; lastName: string } | null;
  approvedAt: string | null;
  reports: { id: number; content: string; createdAt: string; user: { id: number; firstName: string; lastName: string } }[];
  approver?: { id: number; firstName: string; lastName: string } | null;
  startDate: string | null;
  estimatedMinutes: number | null;
  weight: number | null;
  isRecurring?: boolean;
  recurrencePattern?: string | null;
  recurrenceDays?: string | null;
  recurrenceEnd?: string | null;
  recurringParentId?: number | null;
  recurringParent?: { id: number; title: string } | null;
  recurringInstances?: {
    id: number;
    title: string;
    status: string;
    startDate: string | null;
    deadline: string | null;
    createdAt: string;
  }[];
  attachments: {
    id: number;
    filename: string;
    fileUrl: string;
    mimeType: string | null;
    createdAt: string;
    user: { id: number; firstName: string; lastName: string };
  }[];
}

const statusConfig: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
  TODO: { label: 'انجام نشده', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/25', icon: 'M6 18L18 6M6 6l12 12' },
  IN_PROGRESS: { label: 'در حال انجام', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/25', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  PENDING_APPROVAL: { label: 'منتظر تایید', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/25', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  DONE: { label: 'تکمیل شده', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/25', icon: 'M5 13l4 4L19 7' },
};

function toJalali(dateStr: string | null) {
  if (!dateStr) return '-';
  return gregorianToShamsi(dateStr.split('T')[0]);
}

function toJalaliDateTime(dateStr: string | null) {
  if (!dateStr) return '-';
  const parts = dateStr.split('T');
  const date = gregorianToShamsi(parts[0]);
  if (parts[1]) {
    const time = parts[1].substring(0, 5);
    return `${date} ${time}`;
  }
  return date;
}

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? parseInt(params.id) : 0;

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState('');
  const [userId, setUserId] = useState(0);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDeadline, setEditDeadline] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editMinutes, setEditMinutes] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editAssigneeIds, setEditAssigneeIds] = useState<number[]>([]);
  const [editApproverId, setEditApproverId] = useState<number | ''>('');
  const [projectUsers, setProjectUsers] = useState<{ id: number; firstName: string; lastName: string; email: string }[]>([]);
  const [editRecurrence, setEditRecurrence] = useState<RecurrenceConfigState>({
    isRecurring: false,
    recurrencePattern: 'DAILY',
    recurrenceDays: [],
    recurrenceEnd: '',
  });
  const [generatingInstance, setGeneratingInstance] = useState(false);

  const [reportContent, setReportContent] = useState('');
  const [sendingReport, setSendingReport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  const [newSubtask, setNewSubtask] = useState('');
  const { showToast } = useToast();

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      const u = JSON.parse(stored);
      setRole(u.role);
      setUserId(u.id);
    }
  }, []);

  const fetchTask = async () => {
    try {
      const { data } = await api.get(`/tasks/${id}`);
      setTask(data);
    } catch {
      router.push('/dashboard/projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchTask();
  }, [id]);

  const canManage = ['TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER', 'CEO'].includes(role);
  const isManager = ['TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER', 'CEO', 'HR_MANAGER'].includes(role);
  const isAssignee = task?.assignees.some((a) => a.user.id === userId);

  const canSubmitForApproval = role === 'EMPLOYEE' && isAssignee &&
    task && (task.status === 'TODO' || task.status === 'IN_PROGRESS');

  const canApproveOrReject = (isManager || (task && userId === task.approver?.id)) && task?.status === 'PENDING_APPROVAL';

  const canChangeStatus = isManager || (role === 'EMPLOYEE' && isAssignee) || (task && userId === task.approver?.id);

  const startEdit = () => {
    if (!task) return;
    setEditTitle(task.title);
    setEditDescription(task.description || '');
    setEditDeadline(task.deadline ? task.deadline.split('T')[0] : '');
    setEditStartDate(task.startDate ? task.startDate.split('T')[0] : '');
    setEditMinutes(task.estimatedMinutes?.toString() || '');
    setEditWeight(task.weight?.toString() || '');
    setEditAssigneeIds(task.assignees.map((a) => a.user.id));
    setEditApproverId(task.approver?.id || '');

    let days: number[] = [];
    if (task.recurrenceDays) {
      try {
        const parsed = typeof task.recurrenceDays === 'string' ? JSON.parse(task.recurrenceDays) : task.recurrenceDays;
        if (Array.isArray(parsed)) days = parsed;
      } catch {}
    }
    setEditRecurrence({
      isRecurring: !!task.isRecurring,
      recurrencePattern: (task.recurrencePattern as any) || 'DAILY',
      recurrenceDays: days,
      recurrenceEnd: task.recurrenceEnd ? task.recurrenceEnd.split('T')[0] : '',
    });

    api.get(`/projects/${task.project.id}`).then(({ data }) => {
      setProjectUsers(data.members.map((m: any) => ({ ...m.user, email: m.user.email || '' })));
    }).catch(() => {});
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const saveEdit = async () => {
    if (!task || !editTitle) return;
    setSaving(true);
    try {
      await api.put(`/tasks/${task.id}`, {
        title: editTitle,
        description: editDescription,
        deadline: editDeadline || null,
        startDate: editStartDate || null,
        estimatedMinutes: editMinutes ? parseInt(editMinutes) : null,
        weight: editWeight ? parseInt(editWeight) : null,
        assigneeIds: editAssigneeIds,
        approverId: editApproverId || null,
        isRecurring: editRecurrence.isRecurring,
        recurrencePattern: editRecurrence.isRecurring ? editRecurrence.recurrencePattern : null,
        recurrenceDays: editRecurrence.isRecurring ? editRecurrence.recurrenceDays : null,
        recurrenceEnd: editRecurrence.isRecurring && editRecurrence.recurrenceEnd ? editRecurrence.recurrenceEnd : null,
      });
      setEditing(false);
      fetchTask();
      showToast('تغییرات با موفقیت ذخیره شد');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleManualTriggerRecurrence = async () => {
    setGeneratingInstance(true);
    try {
      const res = await api.post('/tasks/process-recurring');
      if (res.data?.count > 0) {
        showToast(`${res.data.count} تسک جدید برای امروز ایجاد شد`);
      } else {
        showToast('تسک‌های امروز قبلاً ایجاد شده‌اند یا زمان تکرار هنوز فرا نرسیده است');
      }
      fetchTask();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در اجرای تکرار تسک', 'error');
    } finally {
      setGeneratingInstance(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!task) return;
    try {
      await api.patch(`/tasks/${task.id}/status`, { status });
      fetchTask();
      showToast('وضعیت تسک با موفقیت تغییر کرد');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا', 'error');
    }
  };

  const toggleAssigneeComplete = async (isCompleted: boolean) => {
    if (!task) return;
    try {
      const res = await api.patch(`/tasks/${task.id}/assignee-complete`, { isCompleted });
      if (res.data?.message) {
        showToast(res.data.message);
      } else {
        showToast(isCompleted ? 'انجام تسک توسط شما ثبت شد' : 'وضعیت انجام برداشته شد');
      }
      fetchTask();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا', 'error');
    }
  };

  const handleAddReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || !reportContent.trim()) return;
    setSendingReport(true);
    try {
      await api.post(`/tasks/${task.id}/reports`, { content: reportContent });
      setReportContent('');
      fetchTask();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا', 'error');
    } finally {
      setSendingReport(false);
    }
  };

  const toggleSubtask = async (subtaskId: number, isDone: boolean) => {
    try {
      await api.patch(`/tasks/${id}/subtasks/${subtaskId}`, { isDone: !isDone });
      fetchTask();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا', 'error');
    }
  };

  const addSubtask = async () => {
    if (!newSubtask.trim()) return;
    try {
      await api.post(`/tasks/${id}/subtasks`, { title: newSubtask });
      setNewSubtask('');
      fetchTask();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا', 'error');
    }
  };

  const removeSubtask = async (subtaskId: number) => {
    try {
      await api.delete(`/tasks/${id}/subtasks/${subtaskId}`);
      fetchTask();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا', 'error');
    }
  };

  const toggleEditAssignee = (uid: number) => {
    setEditAssigneeIds((prev) => prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.post(`/tasks/${id}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      fetchTask();
      showToast('فایل با موفقیت آپلود شد');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در آپلود فایل', 'error');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: number) => {
    if (!confirm('آیا از حذف این فایل اطمینان دارید؟')) return;
    try {
      await api.delete(`/tasks/${id}/attachments/${attachmentId}`);
      fetchTask();
      showToast('فایل با موفقیت حذف شد');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در حذف فایل', 'error');
    }
  };

  const inputClass = "w-full px-4 py-2.5 bg-[rgba(22,27,38,0.6)] border border-[rgba(255,255,255,0.08)] rounded-xl text-white placeholder-text-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all duration-200";

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
        ) : task ? (
          <>
            <div className="flex items-start justify-between shrink-0 mb-4">
              <div>
                <button onClick={() => router.push(`/dashboard/projects/${task.project.id}`)}
                  className="text-text-muted hover:text-white text-sm mb-2 flex items-center gap-1.5 transition-all">
                  <svg className="w-4 h-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  بازگشت به پروژه
                </button>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-xl font-bold text-white">{task.title}</h1>
                  <span className={`px-3 py-1 rounded-lg text-xs font-medium ${statusConfig[task.status].bg} ${statusConfig[task.status].color} ${statusConfig[task.status].border} border`}>
                    {statusConfig[task.status].label}
                  </span>
                  <TaskRecurrenceBadge
                    isRecurring={task.isRecurring}
                    recurrencePattern={task.recurrencePattern}
                    recurrenceDays={task.recurrenceDays}
                    recurringParentId={task.recurringParentId}
                    recurringParent={task.recurringParent}
                  />
                </div>
                <div className="flex items-center gap-2 mt-1 text-text-muted text-xs">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  {task.project.name}
                </div>

                {task.recurringParentId && task.recurringParent && (
                  <div className="mt-2.5 px-3 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-xl flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 text-cyan-300">
                      <svg className="w-4 h-4 text-cyan-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>تولید شده از تسک تکرارشونده اصلی:</span>
                      <strong className="text-white">{task.recurringParent.title}</strong>
                    </div>
                    <Link
                      href={`/dashboard/tasks/${task.recurringParentId}`}
                      className="px-2.5 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 rounded-lg transition-all"
                    >
                      مشاهده مادر
                    </Link>
                  </div>
                )}
              </div>
              {canManage && !editing && (
                <div className="flex gap-2">
                  {task.isRecurring && (
                    <button
                      onClick={handleManualTriggerRecurrence}
                      disabled={generatingInstance}
                      className="flex items-center gap-2 px-3.5 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 rounded-xl font-medium text-xs transition-all cursor-pointer"
                      title="اجرای تکرار امروز"
                    >
                      <svg className={`w-3.5 h-3.5 ${generatingInstance ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      {generatingInstance ? 'در حال تولید...' : 'تولید تسک امروز'}
                    </button>
                  )}
                  <button onClick={startEdit}
                    className="flex items-center gap-2 px-4 py-2.5 bg-card-hover hover:bg-primary/10 text-text-secondary hover:text-primary rounded-xl font-medium text-sm transition-all">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    ویرایش
                  </button>
                  <button onClick={() => {
                    if (!confirm(`آیا از حذف تسک "${task.title}" اطمینان دارید؟`)) return;
                    api.delete(`/tasks/${task.id}`).then(() => {
                      router.push(`/dashboard/projects/${task.project.id}`);
                    }).catch((err: any) => {
                      showToast(err.response?.data?.error || 'خطا در حذف', 'error');
                    });
                  }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-card-hover hover:bg-danger/10 text-text-secondary hover:text-danger rounded-xl font-medium text-sm transition-all">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    حذف
                  </button>
                </div>
              )}
            </div>

            {canChangeStatus && (
              <div className="flex gap-2 shrink-0 mb-3 flex-wrap">
                {role === 'EMPLOYEE' ? (
                  <>
                    {canSubmitForApproval && (
                      <button onClick={() => handleStatusChange('PENDING_APPROVAL')}
                        className="px-5 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 bg-purple-500/10 text-purple-400 border border-purple-500/25 hover:bg-purple-500/20 cursor-pointer active:scale-[0.98]">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        ثبت به عنوان انجام شده
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {canApproveOrReject && (
                      <>
                        <button onClick={() => handleStatusChange('DONE')}
                          className="px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 bg-green-500/10 text-green-400 border border-green-500/25 hover:bg-green-500/20 cursor-pointer active:scale-[0.98]">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          تایید انجام
                        </button>
                        <button onClick={() => handleStatusChange('TODO')}
                          className="px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20 cursor-pointer active:scale-[0.98]">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          رد و برگشت
                        </button>
                      </>
                    )}
                    <div className="flex gap-2">
                      {['TODO', 'IN_PROGRESS', 'PENDING_APPROVAL', 'DONE'].map((s) => {
                        const cfg = statusConfig[s];
                        const active = task.status === s;
                        return (
                          <button key={s} onClick={() => handleStatusChange(s)}
                            disabled={active || (s === 'DONE' && task.status !== 'PENDING_APPROVAL')}
                            className={`px-3 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 border cursor-pointer active:scale-[0.98] ${
                              active
                                ? `${cfg.bg} ${cfg.color} ${cfg.border} cursor-default`
                                : 'bg-card-hover text-text-secondary hover:text-white border-transparent hover:border-[rgba(255,255,255,0.08)]'
                            } disabled:opacity-30 disabled:cursor-not-allowed`}>
                            {cfg.label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
              {editing ? (
                <div className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">عنوان</label>
                    <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">توضیحات</label>
                    <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)}
                      className={`${inputClass} min-h-[80px] resize-none`} />
                  </div>
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-12 md:col-span-6">
                      <label className="block text-xs font-medium text-text-secondary mb-1.5">تایید کننده</label>
                      <select required value={editApproverId} onChange={(e) => setEditApproverId(Number(e.target.value))}
                        className="w-full h-11 px-4 bg-[rgba(22,27,38,0.6)] border border-[rgba(255,255,255,0.08)] rounded-xl text-white outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all duration-200 cursor-pointer text-sm">
                        {projectUsers.map((u) => (
                          <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                        ))}
                        {!projectUsers.some(u => u.id === editApproverId) && editApproverId && (
                          <option value={editApproverId}>پیشین</option>
                        )}
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <label className="block text-xs font-medium text-text-secondary mb-1.5">تاریخ شروع (شمسی)</label>
                      <ShamsiDatePicker value={editStartDate} onChange={setEditStartDate} placeholder="انتخاب شروع" />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <label className="block text-xs font-medium text-text-secondary mb-1.5">ددلاین (شمسی)</label>
                      <ShamsiDatePicker value={editDeadline} onChange={setEditDeadline} placeholder="انتخاب ددلاین" />
                    </div>
                    <div className="col-span-12 md:col-span-6">
                      <label className="block text-xs font-medium text-text-secondary mb-1.5">تخمین (دقیقه)</label>
                      <input type="number" min="0" value={editMinutes} onChange={(e) => {
                        const val = e.target.value;
                        setEditMinutes(val);
                        setEditWeight(val);
                      }} className={inputClass} />
                    </div>
                    <div className="col-span-12 md:col-span-6">
                      <label className="block text-xs font-medium text-text-secondary mb-1.5">وزن</label>
                      <input type="number" min="0" value={editWeight} onChange={(e) => setEditWeight(e.target.value)} className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-2">انجام‌دهندگان</label>
                    <div className="grid grid-cols-2 gap-2">
                      {projectUsers.map((u) => (
                        <label key={u.id} onClick={() => toggleEditAssignee(u.id)}
                          className={`flex items-center gap-3 px-4 py-2.5 rounded-xl cursor-pointer transition-all border ${
                            editAssigneeIds.includes(u.id)
                              ? 'border-primary/40 bg-primary/[0.06]'
                              : 'border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] bg-[rgba(22,27,38,0.4)]'
                          }`}>
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all shrink-0 ${
                            editAssigneeIds.includes(u.id) ? 'bg-primary border-primary' : 'border-[rgba(255,255,255,0.2)]'
                          }`}>
                            {editAssigneeIds.includes(u.id) && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm text-white block truncate">{u.firstName} {u.lastName}</span>
                            <span className="text-xs text-text-muted truncate block">{u.email}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <TaskRecurrenceConfig value={editRecurrence} onChange={setEditRecurrence} />

                  <div className="flex gap-3 pt-2">
                    <button onClick={saveEdit} disabled={saving || !editTitle}
                      className="flex-1 h-11 bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2">
                      {saving ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          در حال ذخیره...
                        </>
                      ) : 'ذخیره تغییرات'}
                    </button>
                    <button onClick={cancelEdit}
                      className="h-11 px-6 bg-card-hover text-text-secondary hover:text-white rounded-xl font-medium text-sm transition-all">
                      انصراف
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-5 space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                      <div className="bg-[rgba(22,27,38,0.6)] rounded-xl px-4 py-3.5">
                        <div className="flex items-center gap-2 text-text-muted text-xs mb-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          تاریخ شروع
                        </div>
                        <span className="text-sm text-white font-medium">{toJalali(task.startDate)}</span>
                      </div>
                      <div className="bg-[rgba(22,27,38,0.6)] rounded-xl px-4 py-3.5">
                        <div className="flex items-center gap-2 text-text-muted text-xs mb-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          ددلاین
                        </div>
                        <span className="text-sm text-white font-medium">{toJalali(task.deadline)}</span>
                      </div>
                      <div className="bg-[rgba(22,27,38,0.6)] rounded-xl px-4 py-3.5">
                        <div className="flex items-center gap-2 text-text-muted text-xs mb-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          زمان تخمینی
                        </div>
                        <span className="text-sm text-white font-medium">{task.estimatedMinutes ? `${task.estimatedMinutes} دقیقه` : '-'}</span>
                      </div>
                      <div className="bg-[rgba(22,27,38,0.6)] rounded-xl px-4 py-3.5">
                        <div className="flex items-center gap-2 text-text-muted text-xs mb-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          وزن تسک
                        </div>
                        <span className="text-sm text-white font-medium">{task.weight !== null ? `${task.weight}` : '-'}</span>
                      </div>
                      <div className="bg-[rgba(22,27,38,0.6)] rounded-xl px-4 py-3.5">
                        <div className="flex items-center gap-2 text-text-muted text-xs mb-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                          تایید کننده
                        </div>
                        <span className="text-sm text-white font-medium">
                          {task.approver ? `${task.approver.firstName} ${task.approver.lastName}` : '-'}
                        </span>
                      </div>
                      <div className="bg-[rgba(22,27,38,0.6)] rounded-xl px-4 py-3.5">
                        <div className="flex items-center gap-2 text-text-muted text-xs mb-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          ایجادکننده
                        </div>
                        <span className="text-sm text-white font-medium">{task.createdBy.firstName} {task.createdBy.lastName}</span>
                      </div>
                    </div>

                    {task.isRecurring && (
                      <div className="space-y-3">
                        <div className="p-3 bg-primary/[0.06] border border-primary/20 rounded-xl flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                              <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            </div>
                            <div>
                              <span className="text-xs font-semibold text-white block">
                                وضعیت تکرار: {getRecurrenceDescription(task.recurrencePattern, task.recurrenceDays)}
                              </span>
                              <span className="text-[11px] text-text-muted">
                                {task.recurrenceEnd ? `پایان تکرار تا تاریخ ${toJalali(task.recurrenceEnd)}` : 'بدون محدودیت زمانی پایان (تکرار دائمی)'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Generated Instances */}
                        <div className="p-4 bg-[rgba(22,27,38,0.5)] border border-[rgba(255,255,255,0.06)] rounded-xl space-y-2.5">
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
                              <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              نمونه‌های ایجاد شده از این تسک ({task.recurringInstances?.length || 0})
                            </label>
                            {canManage && (
                              <button
                                type="button"
                                onClick={handleManualTriggerRecurrence}
                                disabled={generatingInstance}
                                className="text-xs text-primary hover:text-primary-hover flex items-center gap-1 cursor-pointer transition-all"
                              >
                                <svg className={`w-3 h-3 ${generatingInstance ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                {generatingInstance ? 'در حال بررسی...' : 'بررسی و ایجاد تسک امروز'}
                              </button>
                            )}
                          </div>

                          {task.recurringInstances && task.recurringInstances.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto">
                              {task.recurringInstances.map((inst) => {
                                const cfg = statusConfig[inst.status] || statusConfig.TODO;
                                return (
                                  <Link
                                    key={inst.id}
                                    href={`/dashboard/tasks/${inst.id}`}
                                    className="flex items-center justify-between p-2.5 bg-[rgba(22,27,38,0.7)] hover:bg-[rgba(22,27,38,0.95)] border border-[rgba(255,255,255,0.04)] hover:border-primary/40 rounded-xl transition-all group"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                                      <div className="min-w-0">
                                        <span className="text-xs font-medium text-white group-hover:text-primary transition-colors block truncate">
                                          {inst.title}
                                        </span>
                                        <span className="text-[10px] text-text-muted">
                                          موعد: {toJalali(inst.startDate || inst.createdAt)}
                                        </span>
                                      </div>
                                    </div>
                                    <span className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-medium ${cfg.bg} ${cfg.color} ${cfg.border} border`}>
                                      {cfg.label}
                                    </span>
                                  </Link>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-[11px] text-text-muted py-2 text-center">
                              هنوز نمونه‌ای برای این تسک تولید نشده است. با فرا رسیدن روز موعد، سیستم خودکار نمونه جدید را ایجاد می‌کند.
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {task.status === 'DONE' && task.approvedBy && (
                      <div className="bg-[rgba(34,197,94,0.06)] border border-green-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-xs text-green-400 font-medium">تایید شده توسط {task.approvedBy.firstName} {task.approvedBy.lastName}</p>
                          <p className="text-[10px] text-text-muted">{toJalali(task.approvedAt)}</p>
                        </div>
                      </div>
                    )}

                    {task.description && (
                      <div>
                        <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-2">
                          <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16m-7 6h7" />
                          </svg>
                          توضیحات
                        </label>
                        <p className="text-sm text-text-primary bg-[rgba(22,27,38,0.6)] rounded-xl px-4 py-3 leading-relaxed">{task.description}</p>
                      </div>
                    )}

                    {task.assignees.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                            <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                            </svg>
                            انجام‌دهندگان
                            <span className="text-xs text-text-muted font-normal">
                              ({task.assignees.filter((a) => a.isCompleted).length} از {task.assignees.length} نفر تیک زده‌اند)
                            </span>
                          </label>
                          {task.status !== 'DONE' && isAssignee && (
                            <button
                              onClick={() => {
                                const myAssignee = task.assignees.find((a) => a.user.id === userId);
                                toggleAssigneeComplete(!myAssignee?.isCompleted);
                              }}
                              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                                task.assignees.find((a) => a.user.id === userId)?.isCompleted
                                  ? 'bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25'
                                  : 'bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20'
                              }`}>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                              {task.assignees.find((a) => a.user.id === userId)?.isCompleted
                                ? 'تیک انجام زده شده (لغو)'
                                : 'تیک زدن انجام تسک توسط من'}
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {task.assignees.map((a) => {
                            const isMe = a.user.id === userId;
                            return (
                              <div
                                key={a.user.id}
                                className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs transition-all ${
                                  a.isCompleted
                                    ? 'bg-green-500/[0.06] border-green-500/25 text-green-400'
                                    : 'bg-[rgba(22,27,38,0.6)] border-[rgba(255,255,255,0.06)] text-text-secondary'
                                }`}>
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                    a.isCompleted ? 'bg-green-500/20 text-green-400' : 'bg-primary/20 text-primary'
                                  }`}>
                                    {a.user.firstName[0]}
                                  </div>
                                  <span className="truncate font-medium">
                                    {a.user.firstName} {a.user.lastName} {isMe && '(شما)'}
                                  </span>
                                </div>
                                <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-md font-medium ${
                                  a.isCompleted
                                    ? 'bg-green-500/20 text-green-300'
                                    : 'bg-[rgba(255,255,255,0.05)] text-text-muted'
                                }`}>
                                  {a.isCompleted ? 'انجام داده ✓' : 'در انتظار انجام'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {(canManage || task.subtasks.length > 0) && (
                    <div className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          <h3 className="text-sm font-semibold text-white">زیرلیست</h3>
                        </div>
                        {task.subtasks.length > 0 && (
                          <span className="text-xs text-text-muted">{task.subtasks.filter((s) => s.isDone).length}/{task.subtasks.length} انجام شده</span>
                        )}
                      </div>
                      <div className="space-y-1.5 mb-3">
                        {task.subtasks.map((s) => (
                          <div key={s.id}
                            className="flex items-center gap-3 bg-[rgba(22,27,38,0.6)] rounded-xl px-4 py-2.5 group hover:bg-[rgba(22,27,38,0.8)] transition-all">
                            <button onClick={() => toggleSubtask(s.id, s.isDone)}
                              className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${
                                s.isDone ? 'bg-primary border-primary' : 'border-text-muted hover:border-primary/50'
                              }`}>
                              {s.isDone && (
                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                            <div className="flex flex-col flex-1 min-w-0">
                              <span className={`text-sm ${s.isDone ? 'text-text-muted line-through' : 'text-white'}`}>{s.title}</span>
                              {s.isDone && s.completedAt && (
                                <span className="text-[10px] text-text-muted mt-0.5">تکمیل در: {toJalaliDateTime(s.completedAt)}</span>
                              )}
                            </div>
                            {canManage && (
                              <button onClick={() => removeSubtask(s.id)}
                                className="p-1.5 text-text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-danger/10">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </div>
                        ))}
                        {task.subtasks.length === 0 && (
                          <p className="text-text-muted text-xs text-center py-3">هیچ آیتمی وجود ندارد</p>
                        )}
                      </div>
                      {canManage && (
                        <div className="flex gap-2">
                          <input type="text" value={newSubtask} onChange={(e) => setNewSubtask(e.target.value)}
                            className={inputClass} placeholder="افزودن آیتم جدید..."
                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSubtask())} />
                          <button onClick={addSubtask} disabled={!newSubtask.trim()}
                            className="px-5 h-11 bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-medium text-sm transition-all shrink-0">
                            افزودن
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.414a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                        <h3 className="text-sm font-semibold text-white">ضمائم و فایل‌ها</h3>
                      </div>
                      <div>
                        <label className={`px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl font-medium text-xs transition-all cursor-pointer flex items-center gap-1.5 ${uploadingFile ? 'opacity-50 pointer-events-none' : ''}`}>
                          {uploadingFile ? (
                            <>
                              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              در حال آپلود...
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                              </svg>
                              افزودن فایل
                            </>
                          )}
                          <input type="file" onChange={handleFileUpload} className="hidden" />
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
                      {task.attachments && task.attachments.length > 0 ? (
                        task.attachments.map((att) => {
                          const isImage = att.mimeType?.startsWith('image/');
                          const isAudio = att.mimeType?.startsWith('audio/');
                          return (
                            <div key={att.id} className="bg-[rgba(22,27,38,0.6)] rounded-xl p-3 border border-[rgba(255,255,255,0.04)] flex flex-col justify-between gap-3 group relative">
                              <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary">
                                  {isImage ? (
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                  ) : isAudio ? (
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                    </svg>
                                  ) : (
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <a href={att.fileUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-white block truncate hover:text-primary transition-all">
                                    {att.filename}
                                  </a>
                                  <span className="text-[10px] text-text-muted block mt-0.5">
                                    توسط {att.user.firstName} {att.user.lastName} • {toJalali(att.createdAt)}
                                  </span>
                                </div>
                                {(att.user.id === userId || canManage) && (
                                  <button onClick={() => handleDeleteAttachment(att.id)} className="p-1 text-text-muted hover:text-danger rounded hover:bg-danger/10 transition-all shrink-0">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                              {isImage && (
                                <div className="mt-1 rounded-lg overflow-hidden border border-[rgba(255,255,255,0.06)] bg-black/25 flex items-center justify-center max-h-[140px]">
                                  <img src={att.fileUrl} alt={att.filename} className="object-contain max-h-[140px] w-full" />
                                </div>
                              )}
                              {isAudio && (
                                <div className="mt-1">
                                  <audio src={att.fileUrl} controls className="w-full h-8 scale-95" />
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div className="col-span-2 flex flex-col items-center justify-center py-6 text-text-muted">
                          <svg className="w-8 h-8 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.414a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          <p className="text-xs">هیچ فایلی ضمیمه نشده است</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      <h3 className="text-sm font-semibold text-white">گزارشات</h3>
                    </div>
                    <div className="space-y-2.5 mb-3 max-h-[220px] overflow-y-auto">
                      {task.reports.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-5 text-text-muted">
                          <svg className="w-8 h-8 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          <p className="text-xs">هنوز گزارشی ثبت نشده</p>
                          <p className="text-xs opacity-60 mt-0.5">اولین گزارش را ثبت کنید</p>
                        </div>
                      ) : (
                        task.reports.map((report) => (
                          <div key={report.id} className="bg-[rgba(22,27,38,0.6)] rounded-xl px-4 py-3 border border-[rgba(255,255,255,0.04)]">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                                {report.user.firstName[0]}
                              </div>
                              <span className="text-xs font-medium text-primary">{report.user.firstName} {report.user.lastName}</span>
                              <span className="text-[10px] text-text-muted">• {toJalali(report.createdAt)}</span>
                            </div>
                            <p className="text-text-secondary text-sm leading-relaxed">{report.content}</p>
                          </div>
                        ))
                      )}
                    </div>
                    <form onSubmit={handleAddReport} className="flex gap-2 border-t border-[rgba(255,255,255,0.06)] pt-3">
                      <input type="text" value={reportContent} onChange={(e) => setReportContent(e.target.value)}
                        className={inputClass} placeholder="ثبت گزارش جدید..."
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleAddReport(e))} />
                      <button type="submit" disabled={!reportContent.trim() || sendingReport}
                        className="px-5 h-11 bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-medium text-sm transition-all shrink-0 flex items-center gap-1.5">
                        {sendingReport ? (
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                        )}
                        ارسال
                      </button>
                    </form>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center flex-1 text-text-muted">تسک یافت نشد</div>
        )}
      </div>
    </ProtectedRoute>
  );
}
