'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import ShamsiDatePicker from '@/components/ShamsiDatePicker';
import ProjectPicker from '@/components/ProjectPicker';
import { describeRequestError } from '@/lib/requestError';
import DayCapacity from '@/components/DayCapacity';
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_LABEL, oversizedFilesMessage } from '@/lib/uploadLimits';
import SubtaskReorder from '@/components/SubtaskReorder';
import { moveItem } from '@/lib/reorder';
import TaskRecurrenceConfig, { RecurrenceConfigState } from '@/components/TaskRecurrenceConfig';
import { useToast } from '@/components/Toast';
import Card from '@/components/ui/Card';
import Skeleton from '@/components/ui/Skeleton';
import Avatar from '@/components/ui/Avatar';
import api from '@/lib/api';

const MANAGER_ROLES = ['TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER', 'CEO'];

const fieldClass =
  'w-full rounded-tile bg-sunken px-3.5 py-2.5 text-sm text-fg outline-none transition-colors placeholder:text-fg-muted focus:bg-hover';

/** Local calendar day as YYYY-MM-DD, the format the date picker exchanges. */
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whole days between two dates, or null when either is missing. */
function spanInDays(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null;
  const a = new Date(from), b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

interface SubtaskDraft {
  title: string;
  assigneeId: number | null;
}

export default function NewTaskPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const projectIdParam = searchParams.get('projectId');
  /** Set when the page was opened from a task's «کپی» action. */
  const copyFromId = searchParams.get('from');

  const [projectId, setProjectId] = useState<string>(projectIdParam || '');
  /**
   * Extra projects to create the same task in. Each one gets its own
   * independent task: a task belongs to exactly one project everywhere else in
   * the system — QC reviewer, department scoping, per-project completion — so a
   * single task spanning several would be counted repeatedly or not at all.
   */
  const [extraProjectIds, setExtraProjectIds] = useState<number[]>([]);
  const [membership, setMembership] = useState<{ projectId: number; name: string; included: number[]; missing: number[] }[]>([]);
  const [addingMember, setAddingMember] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectName, setProjectName] = useState('');
  const [projectUsers, setProjectUsers] = useState<any[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [startDate, setStartDate] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [approverId, setApproverId] = useState<number | ''>('');
  /** A subtask now carries who is responsible for it, so it is no longer a
   *  bare string. `assigneeId` null means any assignee of the task may do it. */
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>([{ title: '', assigneeId: null }]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [recurrence, setRecurrence] = useState<RecurrenceConfigState>({
    isRecurring: false, recurrencePattern: 'DAILY', recurrenceDays: [], recurrenceEnd: '',
  });

  const [saving, setSaving] = useState(false);
  /** Name of the task being copied, shown so the origin is never a mystery. */
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let currentUserId: number | '' = '';
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        const u = JSON.parse(stored);
        currentUserId = u.id;
        if (!MANAGER_ROLES.includes(u.role)) { router.push('/dashboard/projects'); return; }
      }
    } catch {}
    setApproverId(currentUserId);

    // No project in the URL is a normal entry point (the rail's "new task"
    // shortcut), so offer a picker instead of bouncing the user away.
    api.get('/projects')
      .then(({ data }) => setProjects(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  const loadProject = useCallback((pid: string) => {
    if (!pid) { setProjectName(''); setProjectUsers([]); return; }
    api.get(`/projects/${pid}`)
      .then(({ data }) => {
        setProjectName(data.name);
        setProjectUsers(data.members.map((m: any) => m.user));
        setAssigneeIds([]);
      })
      .catch(() => showToast('پروژه یافت نشد', 'error'));
  }, [showToast]);

  useEffect(() => { if (projectId) loadProject(projectId); }, [projectId, loadProject]);

  const allProjectIds = useMemo(
    () => [projectId ? Number(projectId) : 0, ...extraProjectIds].filter(Boolean),
    [projectId, extraProjectIds]
  );

  // Which chosen people actually belong to each chosen project. Surfaced before
  // anything is created, so a missing membership is a visible decision rather
  // than a task that quietly lands on nobody.
  useEffect(() => {
    if (allProjectIds.length < 2 || assigneeIds.length === 0) { setMembership([]); return; }
    api.post('/tasks/membership-check', { projectIds: allProjectIds, userIds: assigneeIds })
      .then(({ data }) => setMembership(data.projects || []))
      .catch(() => setMembership([]));
  }, [allProjectIds, assigneeIds, addingMember]);

  const addMemberToProject = async (pid: number, userId: number) => {
    setAddingMember(true);
    try {
      await api.post(`/projects/${pid}/members`, { userId });
      showToast('به اعضای پروژه اضافه شد');
    } catch (err: any) {
      showToast(describeRequestError(err, 'افزودن عضو'), 'error');
    } finally { setAddingMember(false); }
  };

  /**
   * Copying opens this form pre-filled rather than creating the task outright,
   * so the change that motivated the copy — a different assignee, a reworded
   * title — is made before anything exists, not corrected afterwards.
   */
  useEffect(() => {
    if (!copyFromId) return;
    api.get(`/tasks/${copyFromId}`)
      .then(({ data: t }) => {
        setCopiedFrom(t.title);
        setTitle(t.title);
        setDescription(t.description || '');
        setProjectId(String(t.projectId ?? ''));
        setEstimatedMinutes(t.estimatedMinutes != null ? String(t.estimatedMinutes) : '');
        if (t.approverId) setApproverId(t.approverId);
        // Owners are not carried over: the copy usually goes to someone else,
        // so keeping the previous owners would lock every step to the wrong person.
        setSubtasks(
          t.subtasks?.length
            ? t.subtasks.map((st: any) => ({ title: st.title, assigneeId: null }))
            : [{ title: '', assigneeId: null }]
        );

        // Dates are rebased onto today, keeping the original span. Copying the
        // literal dates across would hand you a task that is already overdue
        // the moment it is created.
        const span = spanInDays(t.startDate ?? t.createdAt, t.deadline);
        if (span !== null) {
          const today = new Date();
          setStartDate(isoDay(today));
          setDeadline(isoDay(new Date(today.getTime() + span * 86400000)));
        }

        // Assignees are deliberately left empty: a copy exists to go to
        // someone else, so the person must be chosen rather than inherited.
      })
      .catch(() => showToast('تسک مبدأ پیدا نشد', 'error'));
  }, [copyFromId, showToast]);

  const nameOfUser = useCallback(
    (id: number) => {
      const u = projectUsers.find((x: any) => x.id === id);
      return u ? `${u.firstName} ${u.lastName}`.trim() : `کاربر ${id}`;
    },
    [projectUsers]
  );

  const addSubtaskRow = () => setSubtasks((p) => [...p, { title: '', assigneeId: null }]);
  const removeSubtaskRow = (i: number) => setSubtasks((p) => p.filter((_, idx) => idx !== i));
  const moveSubtaskRow = (from: number, to: number) => setSubtasks((p) => moveItem(p, from, to));
  const updateSubtask = (i: number, val: string) =>
    setSubtasks((p) => p.map((s, idx) => (idx === i ? { ...s, title: val } : s)));
  const updateSubtaskOwner = (i: number, uid: number | null) =>
    setSubtasks((p) => p.map((s, idx) => (idx === i ? { ...s, assigneeId: uid } : s)));

  const toggleAssignee = (uid: number) =>
    setAssigneeIds((prev) => prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    // Refused here rather than after a long upload that the server would
    // reject on arrival.
    const picked = Array.from(e.target.files);
    const tooBig = oversizedFilesMessage(picked);
    if (tooBig) showToast(tooBig, 'error');
    setSelectedFiles((prev) => [...prev, ...picked.filter((f) => f.size <= MAX_ATTACHMENT_BYTES)]);
  };
  const removeSelectedFile = (index: number) => setSelectedFiles((prev) => prev.filter((_, idx) => idx !== index));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) { showToast('لطفاً پروژه را انتخاب کنید', 'error'); return; }
    if (!title.trim()) { showToast('لطفاً عنوان تسک را وارد کنید', 'error'); return; }
    if (assigneeIds.length === 0) { showToast('لطفاً حداقل یک انجام‌دهنده انتخاب کنید', 'error'); return; }

    setSaving(true);
    try {
      const payload = {
        title,
        description,
        projectId: parseInt(projectId),
        assigneeIds,
        approverId: approverId || undefined,
        startDate: startDate || undefined,
        deadline: deadline || undefined,
        estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes) : undefined,
        subtasks: subtasks
          .filter((s) => s.title.trim())
          .map((s) => ({ title: s.title.trim(), assigneeId: s.assigneeId ?? undefined })),
        isRecurring: recurrence.isRecurring,
        recurrencePattern: recurrence.isRecurring ? recurrence.recurrencePattern : undefined,
        recurrenceDays: recurrence.isRecurring ? recurrence.recurrenceDays : undefined,
        recurrenceEnd: recurrence.isRecurring && recurrence.recurrenceEnd ? recurrence.recurrenceEnd : undefined,
      };

      // More than one project means one independent task per project, so there
      // is no single task to attach files to or navigate into.
      if (allProjectIds.length > 1) {
        const { data: batch } = await api.post('/tasks/batch', { ...payload, projectIds: allProjectIds });
        showToast(`${batch.count} تسک در ${batch.count} پروژه ساخته شد`);
        router.push('/dashboard/projects');
        return;
      }

      const { data } = await api.post('/tasks', payload);

      // The task exists from here on. A failed upload must not be reported as
      // a failed save, or the person creates the whole task a second time.
      const failedUploads: string[] = [];
      for (const file of selectedFiles) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          await api.post(`/tasks/${data.id}/attachments`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        } catch {
          failedUploads.push(file.name);
        }
      }

      router.push(`/dashboard/tasks/${data.id}`);
      if (failedUploads.length) {
        showToast(`تسک ساخته شد، اما این فایل‌ها آپلود نشدند: ${failedUploads.join('، ')}. از صفحه تسک دوباره اضافه کنید.`, 'error');
      } else {
        showToast('تسک با موفقیت ایجاد شد');
      }
    } catch (err: any) {
      showToast(describeRequestError(err, 'ثبت تسک'), 'error');
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={MANAGER_ROLES}>
        <div className="space-y-3 py-5">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 rounded-card" />
        </div>
      </ProtectedRoute>
    );
  }

  const filledSubtasks = subtasks.filter((s) => s.title.trim()).length;

  return (
    <ProtectedRoute allowedRoles={MANAGER_ROLES}>
      <div className="py-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-fg md:text-[32px] md:leading-none">
          {copiedFrom ? 'کپی تسک' : 'تسک جدید'}
        </h1>
        <p className="mt-1.5 text-sm text-fg-muted">
          {projectName ? `در پروژه «${projectName}»` : 'ابتدا پروژه مقصد را انتخاب کنید'}
        </p>
      </div>

      {copiedFrom && (
        <Card className="mb-3" tint="info" padding="sm">
          <p className="text-xs leading-relaxed text-fg-secondary">
            <b className="text-fg">کپی از «{copiedFrom}»</b> — عنوان، توضیحات، زیرتسک‌ها و تخمین زمان پر شده‌اند.
            مسئولان خالی است تا خودتان انتخاب کنید، و تاریخ‌ها با همان فاصله به امروز منتقل شده‌اند.
          </p>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-8">
          <Card padding="lg">
            <h2 className="mb-5 text-sm font-semibold text-fg">اطلاعات اصلی</h2>
            <div className="grid gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-fg-secondary">پروژه</label>
                <ProjectPicker
                  projects={projects}
                  value={allProjectIds}
                  onChange={(ids) => {
                    // The first chip is the task's own project; the rest are
                    // copies. Dropping the first promotes the next one rather
                    // than leaving the form with copies and no project.
                    setProjectId(ids.length ? String(ids[0]) : '');
                    setExtraProjectIds(ids.slice(1));
                  }}
                />
                <p className="mt-2 text-[11px] text-fg-muted">
                  {allProjectIds.length > 1 ? (
                    <span className="tnum font-medium text-brand-ink">
                      {allProjectIds.length} تسک ساخته می‌شود — در هر پروژه یک تسک مستقل
                    </span>
                  ) : (
                    'اگر پروژه دیگری اضافه کنید، همین تسک در هر کدام جداگانه ساخته می‌شود.'
                  )}
                </p>
              </div>

              {/* Membership is per project, so a person chosen for the batch may
                  belong to some of them and not others. Say which, and offer the
                  fix, rather than quietly dropping them. */}
              {membership.some((m) => m.missing.length > 0) && (
                <div className="rounded-tile bg-warn-soft px-3 py-2.5">
                  <p className="mb-2 text-[11px] font-semibold text-warn">
                    بعضی از افراد انتخاب‌شده عضو همه پروژه‌ها نیستند
                  </p>
                  <div className="space-y-1.5">
                    {membership.filter((m) => m.missing.length > 0).map((m) => (
                      <div key={m.projectId} className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] text-fg-secondary">
                          «{m.name}» —{' '}
                          {m.missing.map((uid) => {
                            const u = projectUsers.find((x: any) => x.id === uid);
                            return u ? `${u.firstName} ${u.lastName}` : `کاربر ${uid}`;
                          }).join('، ')}{' '}
                          عضو نیست
                        </span>
                        {m.missing.map((uid) => (
                          <button
                            key={uid}
                            type="button"
                            disabled={addingMember}
                            onClick={() => addMemberToProject(m.projectId, uid)}
                            className="rounded-full bg-card px-2.5 py-1 text-[10px] font-medium text-fg-secondary shadow-flat transition-colors hover:text-fg disabled:opacity-50"
                          >
                            افزودن به پروژه
                          </button>
                        ))}
                        {m.included.length === 0 && (
                          <span className="text-[10px] font-medium text-bad">
                            بدون افزودن، این پروژه هیچ مسئولی نمی‌گیرد
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-medium text-fg-secondary">عنوان تسک</label>
                <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثلاً: پیاده‌سازی صفحه ورود" className={fieldClass} />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-fg-secondary">توضیحات</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
                  placeholder="جزئیات کار، معیار پذیرش، نکات…" className={`${fieldClass} resize-y`} />
              </div>
            </div>
          </Card>

          <Card padding="lg">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-fg">زیرتسک‌ها</h2>
              {filledSubtasks > 0 && <span className="tnum text-[11px] text-fg-muted">{filledSubtasks} مورد</span>}
            </div>
            <div className="space-y-2">
              {subtasks.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <SubtaskReorder index={i} count={subtasks.length} onMove={moveSubtaskRow} />
                  <span className="tnum w-5 shrink-0 text-center text-[11px] text-fg-muted">{i + 1}</span>
                  <input value={s.title} onChange={(e) => updateSubtask(i, e.target.value)}
                    placeholder="عنوان زیرتسک" className={fieldClass} />
                  {/* Only people already on the task can own a step — anyone
                      else could never open the task to tick it. */}
                  <select
                    value={s.assigneeId ?? ''}
                    onChange={(e) => updateSubtaskOwner(i, e.target.value ? Number(e.target.value) : null)}
                    disabled={assigneeIds.length === 0}
                    title={assigneeIds.length === 0 ? 'ابتدا مسئولان تسک را انتخاب کنید' : 'مسئول این زیرتسک'}
                    className="h-9 w-32 shrink-0 rounded-full bg-sunken px-3 text-[11px] text-fg outline-none disabled:opacity-50"
                  >
                    <option value="">همه مسئولان</option>
                    {projectUsers
                      .filter((u: any) => assigneeIds.includes(u.id))
                      .map((u: any) => (
                        <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                      ))}
                  </select>
                  {subtasks.length > 1 && (
                    <button type="button" onClick={() => removeSubtaskRow(i)} aria-label={`حذف زیرتسک ${i + 1}`}
                      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-bad-soft hover:text-bad">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={addSubtaskRow}
              className="mt-3 cursor-pointer rounded-full bg-sunken px-4 py-2 text-[11px] font-medium text-fg-secondary transition-colors hover:text-fg">
              + افزودن زیرتسک
            </button>
            <p className="mt-3 text-[10px] leading-relaxed text-fg-muted">
              تا وقتی همه زیرتسک‌ها تکمیل نشوند، تسک قابل علامت‌گذاری به‌عنوان انجام‌شده نیست.
              اگر برای زیرتسکی مسئول تعیین کنید، فقط همان شخص می‌تواند آن را انجام‌شده کند.
            </p>
          </Card>

          <Card padding="lg">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-fg">پیوست‌ها</h2>
                <p className="mt-0.5 text-[10px] text-fg-muted">حداکثر {MAX_ATTACHMENT_LABEL} برای هر فایل</p>
              </div>
              <label className="cursor-pointer rounded-full bg-sunken px-3.5 py-1.5 text-[11px] font-medium text-fg-secondary transition-colors hover:text-fg">
                انتخاب فایل
                <input type="file" multiple onChange={handleFileChange} className="hidden" />
              </label>
            </div>
            {selectedFiles.length ? (
              <div className="space-y-2">
                {selectedFiles.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-tile bg-sunken px-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-xs text-fg">{f.name}</span>
                    <span className="tnum shrink-0 text-[10px] text-fg-muted">{Math.ceil(f.size / 1024)} KB</span>
                    <button type="button" onClick={() => removeSelectedFile(i)} aria-label={`حذف ${f.name}`}
                      className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-bad-soft hover:text-bad">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-xs text-fg-muted">فایلی انتخاب نشده</p>
            )}
          </Card>
        </div>

        <div className="space-y-3 lg:col-span-4">
          <Card padding="lg">
            <h2 className="mb-4 text-sm font-semibold text-fg">مسئولان</h2>
            {projectId ? (
              projectUsers.length ? (
                <>
                  <div className="mb-3 flex items-center gap-2">
                    <button type="button" onClick={() => setAssigneeIds(projectUsers.map((u) => u.id))}
                      className="cursor-pointer rounded-full bg-sunken px-3 py-1 text-[10px] text-fg-secondary transition-colors hover:text-fg">
                      انتخاب همه
                    </button>
                    <button type="button" onClick={() => setAssigneeIds([])}
                      className="cursor-pointer rounded-full bg-sunken px-3 py-1 text-[10px] text-fg-secondary transition-colors hover:text-fg">
                      حذف انتخاب‌ها
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {projectUsers.map((u) => {
                      const on = assigneeIds.includes(u.id);
                      return (
                        <button key={u.id} type="button" onClick={() => toggleAssignee(u.id)}
                          className={`flex cursor-pointer items-center gap-2 rounded-full py-1.5 pl-3.5 pr-1.5 text-xs font-medium transition-colors ${
                            on ? 'bg-pill text-pill-fg' : 'bg-sunken text-fg-secondary hover:text-fg'
                          }`}>
                          <Avatar name={`${u.firstName} ${u.lastName}`} size={22} />
                          {u.firstName} {u.lastName}
                        </button>
                      );
                    })}
                  </div>
                  {!assigneeIds.length && <p className="mt-3 text-[10px] text-warn">حداقل یک نفر باید انتخاب شود.</p>}
                </>
              ) : (
                <p className="text-xs text-fg-muted">این پروژه عضوی ندارد. ابتدا از صفحه پروژه عضو اضافه کنید.</p>
              )
            ) : (
              <p className="text-xs text-fg-muted">پس از انتخاب پروژه، اعضای آن اینجا نمایش داده می‌شوند.</p>
            )}
          </Card>

          <Card padding="lg">
            <h2 className="mb-4 text-sm font-semibold text-fg">زمان‌بندی</h2>
            <div className="grid gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-fg-secondary">تاریخ شروع</label>
                <ShamsiDatePicker value={startDate} onChange={setStartDate} placeholder="انتخاب تاریخ" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-fg-secondary">سررسید</label>
                <ShamsiDatePicker value={deadline} onChange={setDeadline} placeholder="انتخاب تاریخ" />
                {/* Shown here rather than next to the assignees: the overload
                    is a property of the date, and moving the deadline is the
                    first thing anyone does about it. */}
                <DayCapacity
                  date={deadline}
                  assigneeIds={assigneeIds}
                  nameOf={nameOfUser}
                  addingMinutes={parseInt(estimatedMinutes) || 0}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-fg-secondary">زمان (دقیقه)</label>
                  <input type="number" min={0} value={estimatedMinutes} onChange={(e) => setEstimatedMinutes(e.target.value)} className={fieldClass} />
                  {/* The old "وزن ۱ تا ۵" box beside this one wrote to the same
                      column the API filled from the estimate, so the workload
                      figures added a 1 to a 90. Minutes are the weight now. */}
                  <p className="mt-1.5 text-[10px] text-fg-muted">وزن تسک در گزارش‌ها برابر همین زمان است.</p>
                </div>

              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-fg-secondary">تایید کننده</label>
                <select value={approverId} onChange={(e) => setApproverId(e.target.value ? Number(e.target.value) : '')}
                  className={`${fieldClass} cursor-pointer`}>
                  <option value="">بدون تایید کننده مشخص</option>
                  {projectUsers.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                </select>
              </div>
            </div>
          </Card>

          <Card padding="lg">
            <h2 className="mb-4 text-sm font-semibold text-fg">تکرار</h2>
            <TaskRecurrenceConfig value={recurrence} onChange={setRecurrence} />
          </Card>

          <div className="flex items-center gap-2">
            <button type="submit" disabled={saving || !projectId || !title.trim() || !assigneeIds.length}
              className="flex-1 cursor-pointer rounded-full bg-pill py-3 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
              {saving ? 'در حال ایجاد…' : 'ایجاد تسک'}
            </button>
            <button type="button" onClick={() => router.back()}
              className="cursor-pointer rounded-full bg-sunken px-5 py-3 text-xs font-medium text-fg-secondary transition-colors hover:text-fg">
              انصراف
            </button>
          </div>
        </div>
      </form>
    </ProtectedRoute>
  );
}
