'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import ShamsiDatePicker from '@/components/ShamsiDatePicker';
import TaskRecurrenceConfig, { RecurrenceConfigState } from '@/components/TaskRecurrenceConfig';
import { useToast } from '@/components/Toast';
import api from '@/lib/api';

export default function NewTaskPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const projectId = searchParams.get('projectId');

  const [projectName, setProjectName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [startDate, setStartDate] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState('');
  const [weight, setWeight] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [subtasks, setSubtasks] = useState<string[]>(['']);
  const [projectUsers, setProjectUsers] = useState<{ id: number; firstName: string; lastName: string; email: string }[]>([]);
  const [approverId, setApproverId] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [recurrence, setRecurrence] = useState<RecurrenceConfigState>({
    isRecurring: false,
    recurrencePattern: 'DAILY',
    recurrenceDays: [],
    recurrenceEnd: '',
  });

  useEffect(() => {
    if (!projectId) {
      router.push('/dashboard/projects');
      return;
    }
    const stored = localStorage.getItem('user');
    let currentUserId: number | '' = '';
    if (stored) {
      const u = JSON.parse(stored);
      currentUserId = u.id;
      if (!['TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER', 'CEO'].includes(u.role)) {
        router.push('/dashboard/projects');
        return;
      }
    }
    setApproverId(currentUserId);
    const id = parseInt(projectId);
    api.get(`/projects/${id}`).then(({ data }) => {
      setProjectName(data.name);
      setProjectUsers(data.members.map((m: any) => m.user));
    }).catch(() => router.push('/dashboard/projects'))
    .finally(() => setLoading(false));
  }, [projectId]);

  const addSubtask = () => setSubtasks([...subtasks, '']);
  const removeSubtask = (i: number) => setSubtasks(subtasks.filter((_, idx) => idx !== i));
  const updateSubtask = (i: number, val: string) => {
    const copy = [...subtasks];
    copy[i] = val;
    setSubtasks(copy);
  };

  const toggleAssignee = (uid: number) => {
    setAssigneeIds((prev) => prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]);
  };

  const selectAll = () => setAssigneeIds(projectUsers.map((u) => u.id));
  const deselectAll = () => setAssigneeIds([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setSelectedFiles((prev) => [...prev, ...filesArray]);
    }
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      showToast('لطفاً عنوان تسک را وارد کنید', 'error');
      return;
    }
    if (!projectId) {
      showToast('پروژه مشخص نشده است', 'error');
      return;
    }
    if (assigneeIds.length === 0) {
      showToast('لطفاً حداقل یک انجام‌دهنده (عضو) انتخاب کنید', 'error');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/tasks', {
        title,
        description,
        projectId: parseInt(projectId),
        assigneeIds,
        approverId: approverId || undefined,
        startDate: startDate || undefined,
        deadline: deadline || undefined,
        estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes) : undefined,
        weight: weight ? parseInt(weight) : undefined,
        subtasks: subtasks.filter((s) => s.trim()).map((s) => ({ title: s })),
        isRecurring: recurrence.isRecurring,
        recurrencePattern: recurrence.isRecurring ? recurrence.recurrencePattern : undefined,
        recurrenceDays: recurrence.isRecurring ? recurrence.recurrenceDays : undefined,
        recurrenceEnd: recurrence.isRecurring && recurrence.recurrenceEnd ? recurrence.recurrenceEnd : undefined,
      });

      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          const formData = new FormData();
          formData.append('file', file);
          await api.post(`/tasks/${data.id}/attachments`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        }
      }

      router.push(`/dashboard/tasks/${data.id}`);
      showToast('تسک با موفقیت ایجاد شد');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در ایجاد تسک', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <ProtectedRoute allowedRoles={['TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER', 'CEO']}>
      <div className="h-full flex flex-col overflow-hidden animate-fade-in">
        <div className="flex items-center justify-between shrink-0 mb-4">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="w-9 h-9 rounded-xl flex items-center justify-center text-text-muted hover:text-white hover:bg-card-hover transition-all cursor-pointer" title="بازگشت">
              <svg className="w-5 h-5 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold text-white">تسک جدید</h1>
              <div className="flex items-center gap-2 text-text-muted text-xs">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span>پروژه: {projectName}</span>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-y-auto pr-1 pb-2 space-y-4">
          <div className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-5 shrink-0">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 md:col-span-6">
                <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-1.5">
                  <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  عنوان تسک *
                </label>
                <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[rgba(22,27,38,0.6)] border border-[rgba(255,255,255,0.08)] rounded-xl text-white placeholder-text-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all duration-200"
                  placeholder="عنوان تسک را وارد کنید" />
              </div>
              <div className="col-span-12 md:col-span-6">
                <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-1.5">
                  <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  تایید کننده *
                </label>
                <select required value={approverId} onChange={(e) => setApproverId(Number(e.target.value))}
                  className="w-full px-4 py-2.5 bg-[rgba(22,27,38,0.6)] border border-[rgba(255,255,255,0.08)] rounded-xl text-white outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all duration-200 cursor-pointer text-sm">
                  {projectUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                  ))}
                  {!projectUsers.some(u => u.id === approverId) && approverId && (
                    <option value={approverId}>من (ایجاد کننده)</option>
                  )}
                </select>
              </div>
              <div className="col-span-12 md:col-span-3">
                <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-1.5">
                  <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  تاریخ شروع
                </label>
                <ShamsiDatePicker value={startDate} onChange={setStartDate} placeholder="شروع (اختیاری)" />
              </div>
              <div className="col-span-12 md:col-span-3">
                <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-1.5">
                  <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  ددلاین
                </label>
                <ShamsiDatePicker value={deadline} onChange={setDeadline} placeholder="سررسید (اختیاری)" />
              </div>
              <div className="col-span-12 md:col-span-3">
                <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-1.5 whitespace-nowrap">
                  زمان (دقیقه)
                </label>
                <input type="number" min="0" value={estimatedMinutes}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEstimatedMinutes(val);
                    setWeight(val);
                  }}
                  className="w-full px-4 py-2.5 bg-[rgba(22,27,38,0.6)] border border-[rgba(255,255,255,0.08)] rounded-xl text-white placeholder-text-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all duration-200 text-sm"
                  placeholder="۰" />
              </div>
              <div className="col-span-12 md:col-span-3">
                <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-1.5">
                  وزن
                </label>
                <input type="number" min="0" value={weight} onChange={(e) => setWeight(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[rgba(22,27,38,0.6)] border border-[rgba(255,255,255,0.08)] rounded-xl text-white placeholder-text-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all duration-200 text-sm"
                  placeholder="۰" />
              </div>
            </div>
          </div>

          {/* Recurrence Settings */}
          <div className="shrink-0">
            <TaskRecurrenceConfig value={recurrence} onChange={setRecurrence} />
          </div>

            <div className="grid grid-cols-12 gap-4 min-h-0">
              <div className="col-span-5 flex flex-col gap-4 min-h-0">
                <div className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-5 flex flex-col flex-1 min-h-0">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-3 shrink-0">
                    <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16m-7 6h7" />
                    </svg>
                    توضیحات
                  </label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                    className="w-full flex-1 px-4 py-2.5 bg-[rgba(22,27,38,0.6)] border border-[rgba(255,255,255,0.08)] rounded-xl text-white placeholder-text-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all duration-200 resize-none min-h-0"
                    placeholder="توضیحات تسک را وارد کنید..." />
                </div>

                <div className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-5 flex flex-col flex-1 min-h-0">
                  <div className="flex items-center justify-between mb-3 shrink-0">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                      <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      زیرلیست
                    </label>
                    <button type="button" onClick={addSubtask} className="text-xs text-primary hover:text-primary-hover flex items-center gap-1 transition-all cursor-pointer">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      افزودن آیتم
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
                    {subtasks.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 bg-[rgba(22,27,38,0.6)] rounded-lg px-3 py-1.5 group">
                        <div className="w-1.5 h-1.5 rounded-full bg-text-muted shrink-0" />
                        <input type="text" value={s} onChange={(e) => updateSubtask(i, e.target.value)}
                          className="w-full bg-transparent text-white placeholder-text-muted text-sm focus:outline-none"
                          placeholder={`آیتم ${i + 1}`} />
                        {subtasks.length > 1 && (
                          <button type="button" onClick={() => removeSubtask(i)} className="p-1 text-text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-all shrink-0">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                    {subtasks.length === 0 && (
                      <p className="text-text-muted text-xs text-center py-4">هنوز آیتمی اضافه نشده</p>
                    )}
                  </div>
                </div>

                <div className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-5 flex flex-col flex-1 min-h-0">
                  <div className="flex items-center justify-between mb-3 shrink-0">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                      <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.414a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      ضمائم و فایل‌ها
                    </label>
                    <label className="text-xs text-primary hover:text-primary-hover flex items-center gap-1 transition-all cursor-pointer">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      انتخاب فایل
                      <input type="file" multiple onChange={handleFileChange} className="hidden" />
                    </label>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
                    {selectedFiles.map((file, i) => (
                      <div key={i} className="flex items-center justify-between bg-[rgba(22,27,38,0.6)] rounded-lg px-3 py-2 border border-[rgba(255,255,255,0.04)]">
                        <div className="flex items-center gap-2 min-w-0">
                          <svg className="w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="text-xs text-white truncate block">{file.name}</span>
                          <span className="text-[10px] text-text-muted shrink-0">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                        </div>
                        <button type="button" onClick={() => removeSelectedFile(i)} className="p-1 text-text-muted hover:text-danger transition-all shrink-0">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    {selectedFiles.length === 0 && (
                      <p className="text-text-muted text-xs text-center py-4">فایلی انتخاب نشده است</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="col-span-7 flex flex-col min-h-0">
                <div className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-5 flex flex-col flex-1 min-h-0">
                  <div className="flex items-center justify-between mb-3 shrink-0">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                      <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                      </svg>
                      انجام‌دهندگان *
                    </label>
                    {projectUsers.length > 0 && (
                      <div className="flex gap-3 text-xs">
                        <button type="button" onClick={selectAll} className="text-primary hover:text-primary-hover transition-all">انتخاب همه</button>
                        <button type="button" onClick={deselectAll} className="text-text-muted hover:text-white transition-all">لغو همه</button>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    {projectUsers.length > 0 ? (
                      <div className="grid grid-cols-2 gap-1.5">
                        {projectUsers.map((u) => (
                          <label key={u.id} onClick={() => toggleAssignee(u.id)} className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl cursor-pointer transition-all border ${
                              assigneeIds.includes(u.id)
                                ? 'border-primary/40 bg-primary/[0.06] shadow-[inset_0_0_0_1px_rgba(99,102,241,0.15)]'
                                : 'border-transparent hover:bg-card-hover'
                            }`}>
                            <div className={`w-4.5 h-4.5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${
                              assigneeIds.includes(u.id) ? 'bg-primary border-primary' : 'border-[rgba(255,255,255,0.2)]'
                            }`}>
                              {assigneeIds.includes(u.id) && (
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
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-text-muted">
                        <svg className="w-10 h-10 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                        </svg>
                        <p className="text-xs">هیچ عضوی در این پروژه وجود ندارد</p>
                        <p className="text-xs opacity-60">ابتدا اعضا را به پروژه اضافه کنید</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

          <div className="flex items-center gap-3 mt-4 shrink-0">
            <button type="submit" disabled={saving}
              className="flex-1 h-11 bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2">
              {saving ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  در حال ذخیره...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  ایجاد تسک
                </>
              )}
            </button>
            <button type="button" onClick={() => router.back()}
              className="h-11 px-6 bg-card-hover text-text-secondary hover:text-white rounded-xl font-medium text-sm transition-all">
              انصراف
            </button>
          </div>
        </form>
      </div>
    </ProtectedRoute>
  );
}
