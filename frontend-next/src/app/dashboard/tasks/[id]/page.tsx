'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import ShamsiDatePicker from '@/components/ShamsiDatePicker';
import TaskRecurrenceConfig, { RecurrenceConfigState } from '@/components/TaskRecurrenceConfig';
import TaskRecurrenceBadge, { getRecurrenceDescription } from '@/components/TaskRecurrenceBadge';
import { useToast } from '@/components/Toast';
import Card from '@/components/ui/Card';
import Badge, { BadgeTone } from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import Avatar from '@/components/ui/Avatar';
import { gregorianToShamsi, jalaliDate, jalaliDateTime } from '@/lib/date';
import RejectionHistory from '@/components/RejectionHistory';
import api from '@/lib/api';
import TaskAttachments from '@/components/TaskAttachments';
import SeriesBar, { type SeriesInfo } from '@/components/SeriesBar';
import SubtaskReorder from '@/components/SubtaskReorder';
import { moveItem } from '@/lib/reorder';
import { REJECTION_CATEGORIES, meaningfulReason, validReworkMinutes, type RejectionCategoryKey } from '@/lib/rejectionCategories';
import ReworkMinutesPicker from '@/components/ReworkMinutesPicker';
import CategoryIcon from '@/components/CategoryIcon';
import DayCapacity from '@/components/DayCapacity';
import { describeRequestError } from '@/lib/requestError';

const statusMeta: Record<string, { label: string; tone: BadgeTone }> = {
  TODO: { label: 'انجام نشده', tone: 'neutral' },
  IN_PROGRESS: { label: 'در حال انجام', tone: 'info' },
  PENDING_QC: { label: 'کنترل کیفیت', tone: 'warn' },
  PENDING_APPROVAL: { label: 'منتظر تایید', tone: 'violet' },
  DONE: { label: 'تکمیل شده', tone: 'ok' },
};

/** A calendar date: deadline, start date. Read in UTC, where it is pinned. */
const toJalali = (d: string | null) => (d ? gregorianToShamsi(d.split('T')[0]) : '—');

const fieldClass =
  'w-full rounded-tile bg-sunken px-3.5 py-2.5 text-sm text-fg outline-none transition-colors placeholder:text-fg-muted focus:bg-hover';

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const id = typeof params.id === 'string' ? parseInt(params.id) : 0;

  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState('');
  const [userId, setUserId] = useState(0);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDeadline, setEditDeadline] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editMinutes, setEditMinutes] = useState('');
  const [editAssigneeIds, setEditAssigneeIds] = useState<number[]>([]);
  const [editApproverId, setEditApproverId] = useState<number | ''>('');
  /** Existing rows keep their id so ticks and completion history survive a rename. */
  const [editSubtasks, setEditSubtasks] = useState<{ id?: number; title: string; assigneeId: number | null }[]>([]);
  const [projectUsers, setProjectUsers] = useState<any[]>([]);
  const [series, setSeries] = useState<SeriesInfo | null>(null);
  const [initialRecurrence, setInitialRecurrence] = useState('');
  const [scopeOpen, setScopeOpen] = useState(false);
  const [scope, setScope] = useState<'this' | 'following'>('this');
  const [editRecurrence, setEditRecurrence] = useState<RecurrenceConfigState>({
    isRecurring: false, recurrencePattern: 'DAILY', recurrenceDays: [], recurrenceEnd: '',
  });

  const [generatingInstance, setGeneratingInstance] = useState(false);
  const [reportContent, setReportContent] = useState('');
  const [sendingReport, setSendingReport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [qcNote, setQcNote] = useState('');
  const [qcCategories, setQcCategories] = useState<RejectionCategoryKey[]>([]);
  const [qcRework, setQcRework] = useState<number | ''>('');
  const [qcBusy, setQcBusy] = useState(false);
  const [qcRejecting, setQcRejecting] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) { const u = JSON.parse(stored); setRole(u.role); setUserId(u.id); }
    } catch {}
  }, []);

  const fetchTask = useCallback(async () => {
    try {
      const { data } = await api.get(`/tasks/${id}`);
      setTask(data);
    } catch {
      router.push('/dashboard/projects');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { if (id) fetchTask(); }, [id, fetchTask]);

  const loadSeries = useCallback(() => {
    if (!id) return;
    api.get(`/tasks/${id}/series`).then(({ data }) => setSeries(data)).catch(() => setSeries(null));
  }, [id]);
  useEffect(() => { loadSeries(); }, [loadSeries]);

  const inSeries = !!series?.isSeries;

  const canManage = ['TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER', 'CEO'].includes(role);
  const isManager = ['TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER', 'CEO', 'INTERNAL_MANAGER'].includes(role);
  const isAssignee = task?.assignees?.some((a: any) => a.user.id === userId);
  const canSubmitForApproval = role === 'EMPLOYEE' && isAssignee && task && (task.status === 'TODO' || task.status === 'IN_PROGRESS');
  const canApproveOrReject = (isManager || (task && userId === task.approver?.id)) && task?.status === 'PENDING_APPROVAL';
  // Only the project's named reviewer, and only while the task is in the gate.
  const isQcReviewer = task?.project?.qcId === userId;
  const canReviewQc = isQcReviewer && task?.status === 'PENDING_QC';

  const startEdit = () => {
    if (!task) return;
    setEditTitle(task.title);
    setEditDescription(task.description || '');
    setEditDeadline(task.deadline ? task.deadline.split('T')[0] : '');
    setEditStartDate(task.startDate ? task.startDate.split('T')[0] : '');
    setEditMinutes(task.estimatedMinutes?.toString() || '');
    setEditAssigneeIds(task.assignees.map((a: any) => a.user.id));
    setEditApproverId(task.approver?.id || '');
    setEditSubtasks((task.subtasks || []).map((st: any) => ({
      id: st.id, title: st.title, assigneeId: st.assigneeId ?? null,
    })));

    // An occurrence carries no schedule of its own; the rule lives on the
    // series, so that is what the form starts from.
    const source = inSeries && series?.template ? series.template : task;
    let days: number[] = [];
    if (source.recurrenceDays) {
      try {
        const parsed = typeof source.recurrenceDays === 'string' ? JSON.parse(source.recurrenceDays) : source.recurrenceDays;
        if (Array.isArray(parsed)) days = parsed;
      } catch {}
    }
    const rec: RecurrenceConfigState = {
      isRecurring: inSeries ? true : !!task.isRecurring,
      recurrencePattern: (source.recurrencePattern as any) || 'DAILY',
      recurrenceDays: days,
      recurrenceEnd: source.recurrenceEnd ? source.recurrenceEnd.split('T')[0] : '',
    };
    setEditRecurrence(rec);
    setInitialRecurrence(JSON.stringify(rec));
    setScope('this');

    api.get(`/projects/${task.project.id}`)
      .then(({ data }) => setProjectUsers(data.members.map((m: any) => ({ ...m.user, email: m.user.email || '' }))))
      .catch(() => {});
    setEditing(true);
  };

  // A schedule change cannot mean "only this day" — it is a property of the
  // series — so it forces the wider scope.
  const recurrenceChanged = inSeries && JSON.stringify(editRecurrence) !== initialRecurrence;

  const saveEdit = () => {
    if (!task || !editTitle) return;
    if (inSeries) {
      setScope(recurrenceChanged ? 'following' : scope);
      setScopeOpen(true);
      return;
    }
    doSave(undefined);
  };

  const doSave = async (chosen: 'this' | 'following' | undefined) => {
    if (!task || !editTitle) return;
    setScopeOpen(false);
    setSaving(true);
    const sendSchedule = !inSeries || chosen === 'following';
    try {
      const { data } = await api.put(`/tasks/${task.id}`, {
        scope: chosen,
        title: editTitle,
        description: editDescription,
        deadline: editDeadline || null,
        startDate: editStartDate || null,
        estimatedMinutes: editMinutes ? parseInt(editMinutes) : null,
        assigneeIds: editAssigneeIds,
        approverId: editApproverId || null,
        subtasks: editSubtasks
          .filter((st) => st.title.trim())
          .map((st) => ({ id: st.id, title: st.title.trim(), assigneeId: st.assigneeId ?? undefined })),
        ...(sendSchedule
          ? {
              isRecurring: editRecurrence.isRecurring,
              recurrencePattern: editRecurrence.isRecurring ? editRecurrence.recurrencePattern : null,
              recurrenceDays: editRecurrence.isRecurring ? editRecurrence.recurrenceDays : null,
              recurrenceEnd: editRecurrence.isRecurring && editRecurrence.recurrenceEnd ? editRecurrence.recurrenceEnd : null,
            }
          : {}),
      });
      setEditing(false);
      fetchTask();
      loadSeries();
      const r = data?.series;
      if (r) {
        const parts = [`این نوبت و ${r.updated} نوبت بعدی به‌روز شد`];
        if (r.regenerated) parts.push(`${r.regenerated} نوبت با زمان‌بندی جدید ساخته شد`);
        if (r.subtasksKept) parts.push(`زیرتسک‌های ${r.subtasksKept} نوبت که شروع شده بودند دست نخورد`);
        showToast(parts.join(' · '));
      } else {
        showToast('تغییرات با موفقیت ذخیره شد');
      }
    } catch (err) {
      showToast(describeRequestError(err, 'ذخیره تغییرات'), 'error');
    } finally { setSaving(false); }
  };

  const handleManualTriggerRecurrence = async () => {
    setGeneratingInstance(true);
    try {
      const res = await api.post('/tasks/process-recurring');
      showToast(res.data?.count > 0
        ? `${res.data.count} تسک جدید برای امروز ایجاد شد`
        : 'تسک‌های امروز قبلاً ایجاد شده‌اند یا زمان تکرار هنوز فرا نرسیده است');
      fetchTask();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در اجرای تکرار تسک', 'error');
    } finally { setGeneratingInstance(false); }
  };

  const nameOfProjectUser = useCallback(
    (id: number) => {
      const u = projectUsers.find((x: any) => x.id === id);
      return u ? `${u.firstName} ${u.lastName}`.trim() : `کاربر ${id}`;
    },
    [projectUsers]
  );

  const submitQc = async (passed: boolean) => {
    if (!task) return;
    if (!passed) {
      if (!meaningfulReason(qcNote)) {
        showToast('دلیل رد را با جزئیات بنویسید تا انجام‌دهنده بداند چه چیزی باید اصلاح شود', 'error');
        return;
      }
      if (qcCategories.length === 0) {
        showToast('حداقل یک دسته دلیل رد را انتخاب کنید', 'error');
        return;
      }
      if (!validReworkMinutes(qcRework)) {
        showToast('زمان تخمینی اصلاح را وارد کنید', 'error');
        return;
      }
    }
    setQcBusy(true);
    try {
      await api.patch(`/tasks/${task.id}/qc`, {
        passed,
        note: qcNote.trim() || undefined,
        categories: passed ? undefined : qcCategories,
        reworkMinutes: passed ? undefined : qcRework,
      });
      showToast(passed ? 'کنترل کیفیت تایید شد' : 'تسک برای اصلاح برگردانده شد');
      setQcNote('');
      setQcCategories([]);
      setQcRework('');
      setQcRejecting(false);
      fetchTask();
    } catch (err: any) {
      showToast(describeRequestError(err, passed ? 'تایید کیفیت' : 'ثبت رد کیفیت'), 'error');
    } finally { setQcBusy(false); }
  };

  const handleStatusChange = async (status: string) => {
    if (!task) return;
    try {
      await api.patch(`/tasks/${task.id}/status`, { status });
      fetchTask();
      showToast('وضعیت تسک با موفقیت تغییر کرد');
    } catch (err: any) { showToast(err.response?.data?.error || 'خطا', 'error'); }
  };

  const toggleAssigneeComplete = async (isCompleted: boolean) => {
    if (!task) return;
    try {
      const res = await api.patch(`/tasks/${task.id}/assignee-complete`, { isCompleted });
      showToast(res.data?.message || (isCompleted ? 'انجام تسک توسط شما ثبت شد' : 'وضعیت انجام برداشته شد'));
      fetchTask();
    } catch (err: any) { showToast(err.response?.data?.error || 'خطا', 'error'); }
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
    } finally { setSendingReport(false); }
  };

  const toggleSubtask = async (subtaskId: number, isDone: boolean) => {
    try { await api.patch(`/tasks/${id}/subtasks/${subtaskId}`, { isDone: !isDone }); fetchTask(); }
    catch (err: any) { showToast(err.response?.data?.error || 'خطا', 'error'); }
  };

  const toggleEditAssignee = (uid: number) =>
    setEditAssigneeIds((prev) => prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]);

  const handleDeleteTask = () => {
    if (!confirm(`آیا از حذف تسک «${task.title}» اطمینان دارید؟`)) return;
    api.delete(`/tasks/${task.id}`)
      .then(() => { showToast('تسک حذف شد'); router.push(`/dashboard/projects/${task.project.id}`); })
      .catch((err) => showToast(err.response?.data?.error || 'خطا در حذف', 'error'));
  };

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={['CEO', 'INTERNAL_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER', 'EMPLOYEE']}>
        <div className="space-y-3 py-5">
          <Skeleton className="h-10 w-72" />
          <div className="grid gap-3 lg:grid-cols-12">
            <Skeleton className="h-80 rounded-card lg:col-span-8" />
            <Skeleton className="h-80 rounded-card lg:col-span-4" />
          </div>
        </div>
      </ProtectedRoute>
    );
  }
  if (!task) return null;

  // Chip list = project members ∪ people already assigned to this task.
  const assigneeOptions = (() => {
    const byId = new Map<number, any>();
    for (const u of projectUsers) byId.set(u.id, { ...u, isMember: true });
    for (const a of task.assignees || []) {
      if (!byId.has(a.user.id)) byId.set(a.user.id, { ...a.user, isMember: false });
    }
    return [...byId.values()];
  })();

  const status = statusMeta[task.status] || statusMeta.TODO;
  const subtasks = task.subtasks || [];
  const doneSubs = subtasks.filter((s: any) => s.isDone).length;
  const subPct = subtasks.length ? Math.round((doneSubs / subtasks.length) * 100) : 0;
  const mine = task.assignees?.find((a: any) => a.user.id === userId);

  return (
    <ProtectedRoute allowedRoles={['CEO', 'INTERNAL_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER', 'EMPLOYEE']}>
      <div className="py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-extrabold tracking-tight text-fg md:text-[30px] md:leading-tight">{task.title}</h1>
              <Badge tone={status.tone}>{status.label}</Badge>
              <TaskRecurrenceBadge
                isRecurring={task.isRecurring} recurrencePattern={task.recurrencePattern}
                recurrenceDays={task.recurrenceDays} recurringParentId={task.recurringParentId}
                recurringParent={task.recurringParent}
              />
            </div>
            <p className="mt-1.5 text-xs text-fg-muted">
              ایجاد توسط {task.createdBy?.firstName} {task.createdBy?.lastName}
              {task.approvedBy && <> • تایید شده توسط {task.approvedBy.firstName} {task.approvedBy.lastName}</>}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {mine && task.status !== 'DONE' && (
              <button onClick={() => toggleAssigneeComplete(!mine.isCompleted)}
                className={`flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition-colors ${
                  mine.isCompleted ? 'bg-ok text-white' : 'bg-card text-fg-secondary shadow-flat hover:text-fg'
                }`}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {mine.isCompleted ? 'انجام شد' : 'تیک انجام'}
              </button>
            )}
            {canSubmitForApproval && (
              <button onClick={() => handleStatusChange('PENDING_APPROVAL')}
                className="cursor-pointer rounded-full bg-card px-4 py-2 text-xs font-medium text-fg-secondary shadow-flat transition-colors hover:text-fg">
                ارسال برای تایید
              </button>
            )}
            {canApproveOrReject && (
              <>
                <button onClick={() => handleStatusChange('DONE')}
                  className="cursor-pointer rounded-full bg-pill px-4 py-2 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90">
                  تایید انجام
                </button>
                <button onClick={() => handleStatusChange('TODO')}
                  className="cursor-pointer rounded-full bg-bad-soft px-4 py-2 text-xs font-medium text-bad transition-opacity hover:opacity-80">
                  رد و برگشت
                </button>
              </>
            )}
            {canManage && !editing && (
              <>
                {/* Opens the create form pre-filled rather than duplicating on
                    the spot: the point of a copy is to change something first. */}
                <Link
                  href={`/dashboard/tasks/new?from=${task.id}`}
                  title="کپی این تسک برای شخص دیگر"
                  aria-label="کپی تسک"
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-card text-fg-muted shadow-flat transition-colors hover:text-fg"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </Link>
                <button onClick={startEdit} title="ویرایش" aria-label="ویرایش تسک"
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-card text-fg-muted shadow-flat transition-colors hover:text-fg">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button onClick={handleDeleteTask} title="حذف تسک" aria-label="حذف تسک"
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-card text-fg-muted shadow-flat transition-colors hover:text-bad">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <SeriesBar info={series} canManage={canManage} onChanged={() => { fetchTask(); loadSeries(); }} />

      {editing ? (
      <Card padding="lg">
          <h2 className="mb-5 text-sm font-semibold text-fg">ویرایش تسک</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-fg-secondary">عنوان</label>
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={fieldClass} />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-fg-secondary">توضیحات</label>
              <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={4} className={`${fieldClass} resize-y`} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-fg-secondary">تاریخ شروع</label>
              <ShamsiDatePicker value={editStartDate} onChange={setEditStartDate} placeholder="انتخاب تاریخ" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-fg-secondary">سررسید</label>
              <ShamsiDatePicker value={editDeadline} onChange={setEditDeadline} placeholder="انتخاب تاریخ" />
              {/* excludeTaskId so this task's own minutes are not counted
                  against the day twice while it is being edited. */}
              <DayCapacity
                date={editDeadline}
                assigneeIds={editAssigneeIds}
                nameOf={nameOfProjectUser}
                addingMinutes={parseInt(editMinutes) || 0}
                excludeTaskId={task.id}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-fg-secondary">زمان تخمینی (دقیقه)</label>
              <input type="number" min={0} value={editMinutes} onChange={(e) => setEditMinutes(e.target.value)} className={fieldClass} />
              <p className="mt-1.5 text-[10px] text-fg-muted">وزن تسک در گزارش‌ها برابر همین زمان است.</p>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-fg-secondary">مسئولان</label>
              <div className="flex flex-wrap gap-2">
                {assigneeOptions.map((u) => {
                  const on = editAssigneeIds.includes(u.id);
                  return (
                    <button key={u.id} onClick={() => toggleEditAssignee(u.id)} type="button"
                      title={u.isMember ? undefined : 'این کاربر عضو پروژه نیست ولی مسئول این تسک است'}
                      className={`flex cursor-pointer items-center gap-2 rounded-full py-1.5 pl-3.5 pr-1.5 text-xs font-medium transition-colors ${
                        on ? 'bg-pill text-pill-fg' : 'bg-sunken text-fg-secondary hover:text-fg'
                      }`}>
                      <Avatar name={`${u.firstName} ${u.lastName}`} size={22} />
                      {u.firstName} {u.lastName}
                      {!u.isMember && <span className={on ? 'opacity-70' : 'text-warn'}>•</span>}
                    </button>
                  );
                })}
                {!assigneeOptions.length && <p className="text-xs text-fg-muted">اعضای پروژه در حال بارگذاری…</p>}
              </div>
              {assigneeOptions.some((u) => !u.isMember) && (
                <p className="mt-2 text-[10px] text-fg-muted">
                  • نشان می‌دهد کاربر مسئول این تسک است ولی در فهرست اعضای پروژه نیست.
                </p>
              )}
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-fg-secondary">تایید کننده</label>
              <select value={editApproverId} onChange={(e) => setEditApproverId(e.target.value ? parseInt(e.target.value) : '')}
                className={`${fieldClass} cursor-pointer`}>
                <option value="">بدون تایید کننده مشخص</option>
                {projectUsers.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-fg-secondary">زیرتسک‌ها</label>
                <div className="space-y-2">
                  {editSubtasks.map((st, i) => (
                    <div key={st.id ?? `new-${i}`} className="flex items-center gap-2">
                      <SubtaskReorder
                        index={i}
                        count={editSubtasks.length}
                        onMove={(from, to) => setEditSubtasks((p) => moveItem(p, from, to))}
                      />
                      <span className="tnum w-5 shrink-0 text-center text-[11px] text-fg-muted">{i + 1}</span>
                      <input
                        value={st.title}
                        onChange={(e) => setEditSubtasks((p) => p.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x))}
                        placeholder="عنوان زیرتسک"
                        className={fieldClass}
                      />
                      <select
                        value={st.assigneeId ?? ''}
                        onChange={(e) => setEditSubtasks((p) => p.map((x, idx) => idx === i ? { ...x, assigneeId: e.target.value ? Number(e.target.value) : null } : x))}
                        disabled={editAssigneeIds.length === 0}
                        title={editAssigneeIds.length === 0 ? 'ابتدا مسئولان تسک را انتخاب کنید' : 'مسئول این زیرتسک'}
                        className="h-9 w-32 shrink-0 rounded-full bg-sunken px-3 text-[11px] text-fg outline-none disabled:opacity-50"
                      >
                        <option value="">همه مسئولان</option>
                        {projectUsers.filter((u: any) => editAssigneeIds.includes(u.id)).map((u: any) => (
                          <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setEditSubtasks((p) => p.filter((_, idx) => idx !== i))}
                        aria-label={`حذف زیرتسک ${i + 1}`}
                        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-bad-soft hover:text-bad"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setEditSubtasks((p) => [...p, { title: '', assigneeId: null }])}
                  className="mt-3 cursor-pointer rounded-full bg-sunken px-4 py-2 text-[11px] font-medium text-fg-secondary transition-colors hover:text-fg"
                >
                  + افزودن زیرتسک
                </button>
                <p className="mt-2 text-[10px] leading-relaxed text-fg-muted">
                  زیرتسکی که حذف کنید با ذخیره تغییرات از بین می‌رود. تیک‌های خورده روی
                  زیرتسک‌های موجود حفظ می‌شوند.
                </p>
              </div>

              {inSeries ? (
                <div>
                  <TaskRecurrenceConfig
                    value={editRecurrence}
                    onChange={(v) => setEditRecurrence({ ...v, isRecurring: true })}
                  />
                  <p className="mt-2 text-[10px] leading-relaxed text-fg-muted">
                    تغییر زمان‌بندی روی این نوبت و نوبت‌های بعدی اعمال می‌شود. برای توقف کامل تکرار از دکمهٔ «توقف تکرار» بالای صفحه استفاده کنید.
                  </p>
                </div>
              ) : (
                <TaskRecurrenceConfig value={editRecurrence} onChange={setEditRecurrence} />
              )}
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2">
            <button onClick={saveEdit} disabled={saving || !editTitle}
              className="cursor-pointer rounded-full bg-pill px-5 py-2.5 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
              {saving ? 'در حال ذخیره…' : 'ذخیره تغییرات'}
            </button>
            <button onClick={() => setEditing(false)}
              className="cursor-pointer rounded-full bg-sunken px-5 py-2.5 text-xs font-medium text-fg-secondary transition-colors hover:text-fg">
              انصراف
            </button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-8">
            {/* The quality gate, shown to whoever needs to act on it */}
            {task.status === 'PENDING_QC' && (
              <Card tint="warn">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warn-soft text-warn">
                    <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-fg">در انتظار کنترل کیفیت</h3>
                    <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">
                      {canReviewQc
                        ? 'این تسک منتظر بررسی شماست. پس از تایید، برای تایید نهایی مدیر ارسال می‌شود.'
                        : `بررسی توسط ${task.project?.qc ? `${task.project.qc.firstName} ${task.project.qc.lastName}` : 'مسئول کنترل کیفیت پروژه'} انجام می‌شود.`}
                    </p>

                    {canReviewQc && (
                      <div className="mt-4">
                        {qcRejecting ? (
                          <>
                            <label className="mb-1.5 block text-xs font-medium text-fg-secondary">
                              دلیل رد <span className="text-bad">*</span>
                            </label>
                            <textarea
                              value={qcNote}
                              onChange={(e) => setQcNote(e.target.value)}
                              rows={3}
                              autoFocus
                              placeholder="چه چیزی باید اصلاح شود؟"
                              className={`${fieldClass} resize-y`}
                            />

                            {/* After the text, not before it: the reviewer has
                                just written what is wrong, so picking which
                                kind of wrong it was is the natural next step. */}
                            <label className="mb-1.5 mt-3 block text-xs font-medium text-fg-secondary">
                              دسته دلیل <span className="text-bad">*</span>
                              <span className="mr-1.5 font-normal text-fg-muted">(می‌توانید چند مورد انتخاب کنید)</span>
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                              {REJECTION_CATEGORIES.map((c) => (
                                <button
                                  key={c.key}
                                  type="button"
                                  onClick={() => setQcCategories((prev) =>
                                    prev.includes(c.key) ? prev.filter((k) => k !== c.key) : [...prev, c.key])}
                                  aria-pressed={qcCategories.includes(c.key)}
                                  className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${
                                    qcCategories.includes(c.key) ? 'bg-pill text-pill-fg' : 'bg-sunken text-fg-secondary hover:text-fg'
                                  }`}
                                >
                                  <CategoryIcon category={c.key} />
                                  {c.label}
                                </button>
                              ))}
                            </div>

                            <label className="mb-1.5 mt-3 block text-xs font-medium text-fg-secondary">
                              زمان تخمینی اصلاح <span className="text-bad">*</span>
                            </label>
                            <ReworkMinutesPicker value={qcRework} onChange={setQcRework} />

                            <div className="mt-3 flex items-center gap-2">
                              <button onClick={() => submitQc(false)}
                                disabled={qcBusy || qcCategories.length === 0 || !meaningfulReason(qcNote) || !validReworkMinutes(qcRework)}
                                className="cursor-pointer rounded-full bg-bad px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
                                {qcBusy ? 'در حال ثبت…' : 'ثبت رد کیفیت'}
                              </button>
                              <button onClick={() => { setQcRejecting(false); setQcNote(''); setQcCategories([]); setQcRework(''); }}
                                className="cursor-pointer rounded-full bg-sunken px-4 py-2 text-xs font-medium text-fg-secondary transition-colors hover:text-fg">
                                انصراف
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <button onClick={() => submitQc(true)} disabled={qcBusy}
                              className="cursor-pointer rounded-full bg-pill px-4 py-2 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90 disabled:opacity-40">
                              {qcBusy ? '…' : 'تایید کیفیت'}
                            </button>
                            <button onClick={() => setQcRejecting(true)} disabled={qcBusy}
                              className="cursor-pointer rounded-full bg-bad-soft px-4 py-2 text-xs font-medium text-bad transition-opacity hover:opacity-80 disabled:opacity-40">
                              رد کیفیت
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Everything that ever sent this task back. Kept above the latest
                decision so the story reads in order. */}
            {task.rejections?.length > 0 && (
              <Card>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-fg">تاریخچه برگشت</h3>
                  <Badge tone="bad">{task.rejections.length} بار</Badge>
                </div>
                <RejectionHistory events={task.rejections} />
              </Card>
            )}

            {/* Outcome of a completed review */}
            {task.qcAt && task.status !== 'PENDING_QC' && (
              <Card tint={task.qcPassed === false ? 'bad' : task.qcPassed ? 'ok' : undefined}>
                <div className="flex items-start gap-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    task.qcPassed === false ? 'bg-bad-soft text-bad' : task.qcPassed ? 'bg-ok-soft text-ok' : 'bg-sunken text-fg-muted'
                  }`}>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={task.qcPassed === false ? 'M6 18L18 6M6 6l12 12' : 'M5 13l4 4L19 7'} />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-fg">
                        {task.qcPassed === false ? 'رد کنترل کیفیت' : 'تایید کنترل کیفیت'}
                      </h3>
                      <span className="tnum text-[10px] text-fg-muted">{jalaliDateTime(task.qcAt)}</span>
                    </div>
                    {task.qcBy && (
                      <p className="mt-0.5 text-[11px] text-fg-muted">توسط {task.qcBy.firstName} {task.qcBy.lastName}</p>
                    )}
                    {task.qcNote && (
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-fg-secondary">{task.qcNote}</p>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* A skipped gate still leaves a note, with no reviewer recorded */}
            {!task.qcAt && task.qcNote && (
              <Card>
                <p className="text-[11px] leading-relaxed text-fg-muted">{task.qcNote}</p>
              </Card>
            )}

            {task.description && (
              <Card>
                <h3 className="mb-3 text-sm font-semibold text-fg">توضیحات</h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg-secondary">{task.description}</p>
              </Card>
            )}

            <Card>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-fg">زیرتسک‌ها</h3>
                {subtasks.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="tnum text-[11px] text-fg-muted">{doneSubs}/{subtasks.length}</span>
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-sunken">
                      <div className="h-full rounded-full bg-ok transition-all duration-500" style={{ width: `${subPct}%` }} />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {subtasks.map((s: any) => (
                  <div key={s.id} className="group flex items-center gap-3 rounded-tile bg-sunken px-3 py-2.5">
                    <button onClick={() => toggleSubtask(s.id, s.isDone)}
                      aria-pressed={s.isDone} title={s.isDone ? 'برداشتن تیک' : 'تیک زدن'}
                      className={`flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${
                        s.isDone ? 'bg-ok text-white' : 'bg-card text-fg-muted shadow-flat hover:text-fg'
                      }`}>
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    <span className={`min-w-0 flex-1 text-xs ${s.isDone ? 'text-fg-muted line-through' : 'text-fg'}`}>{s.title}</span>

                    {/* Read-only here on purpose: this view is for doing the
                        work, so the tick stays, while adding, renaming,
                        removing and reassigning belong to the edit form. */}
                    {s.assignee ? (
                      <span className="shrink-0 rounded-full bg-card px-2 py-0.5 text-[10px] text-fg-secondary shadow-flat">
                        {s.assignee.firstName} {s.assignee.lastName}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[10px] text-fg-muted">همه مسئولان</span>
                    )}

                    {s.isDone && s.completedBy && (
                      <span className="shrink-0 text-[10px] text-fg-muted">
                        ✓ {s.completedBy.firstName}
                      </span>
                    )}
                  </div>
                ))}
                {!subtasks.length && <p className="py-6 text-center text-xs text-fg-muted">زیرتسکی ثبت نشده</p>}
              </div>

              {canManage && (
                <p className="mt-3 text-[10px] text-fg-muted">
                  برای افزودن، حذف یا تغییر مسئول زیرتسک‌ها از دکمه ویرایش تسک استفاده کنید.
                </p>
              )}
            </Card>

            <Card>
              <TaskAttachments taskId={task.id} />
            </Card>

            <Card>
              <h3 className="mb-4 text-sm font-semibold text-fg">گزارشات</h3>
              <div className="space-y-3">
                {(task.reports || []).map((r: any) => {
                  const name = `${r.user.firstName} ${r.user.lastName}`.trim();
                  return (
                    <div key={r.id} className="flex gap-3">
                      <Avatar name={name} size={32} />
                      <div className="min-w-0 flex-1 rounded-tile bg-sunken px-3.5 py-2.5">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-fg">{name}</span>
                          <span className="tnum shrink-0 text-[10px] text-fg-muted">{jalaliDateTime(r.createdAt)}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-fg-secondary">{r.content}</p>
                      </div>
                    </div>
                  );
                })}
                {!(task.reports || []).length && <p className="py-6 text-center text-xs text-fg-muted">هنوز گزارشی ثبت نشده</p>}
              </div>

              <form onSubmit={handleAddReport} className="mt-4 flex items-center gap-2">
                <input value={reportContent} onChange={(e) => setReportContent(e.target.value)}
                  placeholder="ثبت گزارش جدید…" className={fieldClass} />
                <button type="submit" disabled={sendingReport || !reportContent.trim()}
                  className="shrink-0 cursor-pointer rounded-full bg-pill px-4 py-2.5 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
                  {sendingReport ? 'در حال ارسال…' : 'ثبت'}
                </button>
              </form>
            </Card>
          </div>

          {/* Meta column */}
          <div className="space-y-3 lg:col-span-4">
            <Card>
              <h3 className="mb-4 text-sm font-semibold text-fg">مشخصات</h3>
              <dl className="space-y-2.5 text-xs">
                {[
                  ['پروژه', task.project?.name],
                  ['تاریخ شروع', toJalali(task.startDate)],
                  ['سررسید', toJalali(task.deadline)],
                  ['زمان تخمینی', task.estimatedMinutes ? `${task.estimatedMinutes} دقیقه` : task.estimatedHours ? `${task.estimatedHours} ساعت` : '—'],
                  ['تایید کننده', task.approver ? `${task.approver.firstName} ${task.approver.lastName}` : '—'],
                  ['تایید شده در', jalaliDateTime(task.approvedAt)],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex items-center justify-between gap-3">
                    <dt className="shrink-0 text-fg-muted">{k}</dt>
                    <dd className="tnum truncate text-fg">{v as any}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <Card>
              <h3 className="mb-4 text-sm font-semibold text-fg">مسئولان</h3>
              <div className="space-y-2">
                {(task.assignees || []).map((a: any) => {
                  const name = `${a.user.firstName} ${a.user.lastName}`.trim();
                  return (
                    <div key={a.user.id} className="flex items-center gap-3 rounded-tile bg-sunken px-3 py-2.5">
                      <Avatar name={name} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-fg">{name}</p>
                        <p className="text-[10px] text-fg-muted">
                          {a.isCompleted ? `انجام شد • ${jalaliDate(a.completedAt)}` : 'در انتظار انجام'}
                        </p>
                      </div>
                      {a.isCompleted && (
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok text-white">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                      )}
                    </div>
                  );
                })}
                {!(task.assignees || []).length && <p className="py-4 text-center text-xs text-fg-muted">مسئولی تعیین نشده</p>}
              </div>
            </Card>

            {(task.isRecurring || task.recurringParentId) && (
              <Card>
                <h3 className="mb-3 text-sm font-semibold text-fg">تکرار</h3>
                {task.isRecurring && (
                  <>
                    <p className="text-xs text-fg-secondary">
                      {getRecurrenceDescription(task.recurrencePattern, task.recurrenceDays)}
                    </p>
                    {task.recurrenceEnd && (
                      <p className="mt-1 text-[11px] text-fg-muted">تا {toJalali(task.recurrenceEnd)}</p>
                    )}
                    {canManage && (
                      <button onClick={handleManualTriggerRecurrence} disabled={generatingInstance}
                        className="mt-3 w-full cursor-pointer rounded-full bg-sunken py-2 text-[11px] font-medium text-fg-secondary transition-colors hover:text-fg disabled:opacity-50">
                        {generatingInstance ? 'در حال ایجاد…' : 'ایجاد دستی نمونه امروز'}
                      </button>
                    )}
                    {!!task.recurringInstances?.length && (
                      <div className="mt-4">
                        <p className="mb-2 text-[11px] text-fg-muted">
                          نمونه‌های ایجادشده ({task.recurringInstances.length})
                        </p>
                        <div className="max-h-56 space-y-1.5 overflow-y-auto">
                          {task.recurringInstances.map((inst: any) => (
                            <Link key={inst.id} href={`/dashboard/tasks/${inst.id}`}
                              className="flex items-center justify-between gap-2 rounded-tile bg-sunken px-3 py-2 transition-colors hover:bg-hover">
                              <span className="tnum truncate text-[11px] text-fg">{inst.deadline ? toJalali(inst.deadline) : jalaliDate(inst.createdAt)}</span>
                              <Badge tone={(statusMeta[inst.status] || statusMeta.TODO).tone}>
                                {(statusMeta[inst.status] || statusMeta.TODO).label}
                              </Badge>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
                {task.recurringParentId && series?.template && (
                  <p className="text-xs text-fg-secondary">
                    {getRecurrenceDescription(series.template.recurrencePattern, series.template.recurrenceDays)}
                  </p>
                )}
              </Card>
            )}
          </div>
        </div>
      )}

      {scopeOpen && series?.counts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setScopeOpen(false)}>
          <div className="w-full max-w-sm rounded-card bg-card p-5 shadow-float" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-fg">این تسک بخشی از یک سری تکرار است</h3>
            <p className="mt-1 text-[11px] text-fg-muted">تغییرات روی کدام نوبت‌ها ذخیره شود؟</p>

            <div className="mt-4 space-y-2">
              {([
                ['this', 'فقط همین نوبت', 'بقیهٔ نوبت‌ها همان‌طور که هستند می‌مانند.'],
                ['following', `این نوبت و نوبت‌های بعدی (${series.counts.upcoming})`, 'نوبت‌های انجام‌شده دست نمی‌خورند.'],
              ] as const).map(([key, label, hint]) => {
                const disabled = key === 'this' && recurrenceChanged;
                return (
                  <label key={key}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-tile px-3 py-2.5 transition-colors ${
                      scope === key ? 'bg-hover' : 'bg-sunken'
                    } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}>
                    <input type="radio" name="scope" className="mt-0.5" disabled={disabled}
                      checked={scope === key} onChange={() => setScope(key)} />
                    <span>
                      <span className="block text-xs font-medium text-fg">{label}</span>
                      <span className="block text-[10px] text-fg-muted">
                        {disabled ? 'زمان‌بندی را عوض کرده‌اید؛ این تغییر فقط برای کل سری معنی دارد.' : hint}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setScopeOpen(false)}
                className="cursor-pointer rounded-full bg-sunken px-4 py-2 text-xs font-medium text-fg-secondary transition-colors hover:text-fg">
                انصراف
              </button>
              <button onClick={() => doSave(scope)}
                className="cursor-pointer rounded-full bg-pill px-4 py-2 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90">
                ذخیره
              </button>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
