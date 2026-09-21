'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useToast } from '@/components/Toast';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import AvatarStack from '@/components/ui/AvatarStack';
import StatTile from '@/components/bento/StatTile';
import { daysTo, daysAwaitingReview } from '@/components/bento/TaskRow';
import RejectionHistory, { RejectionBadge, type RejectionEvent } from '@/components/RejectionHistory';
import { gregorianToShamsi, jalaliDateTime } from '@/lib/date';
import api from '@/lib/api';
import { describeRequestError } from '@/lib/requestError';
import { REJECTION_CATEGORIES, meaningfulReason, validReworkMinutes, type RejectionCategoryKey } from '@/lib/rejectionCategories';
import ReworkMinutesPicker from '@/components/ReworkMinutesPicker';
import CategoryIcon from '@/components/CategoryIcon';

type QcDecision = {
  outcome: 'passed' | 'rejected';
  stage: 'QC' | 'APPROVAL';
  taskId: number;
  at: string;
  note: string | null;
  assignees: { id: number; name: string }[];
  task: { id: number; title: string; status: string; project: { id: number; name: string } | null } | null;
};

export default function QcQueuePage() {
  const { showToast } = useToast();
  const [userId, setUserId] = useState(0);
  const [tasks, setTasks] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [tab, setTab] = useState<'queue' | 'history'>('queue');
  const [decisions, setDecisions] = useState<QcDecision[] | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'passed' | 'rejected'>('all');
  const [note, setNote] = useState('');
  const [categories, setCategories] = useState<RejectionCategoryKey[]>([]);
  const [rework, setRework] = useState<number | ''>('');

  const fetchAll = useCallback(async (uid: number) => {
    try {
      // The queue is filtered in the query now: both conditions this page used
      // to apply in the browser live in /tasks/qc-queue, so what arrives is
      // already exactly the queue instead of all 4,142 tasks.
      const [taskRes, projRes] = await Promise.all([api.get('/tasks/qc-queue'), api.get('/projects')]);
      setProjects(projRes.data.filter((p: any) => p.qc?.id === uid || p.qcId === uid));
      setTasks(taskRes.data);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      setUserId(u.id);
      if (u.id) fetchAll(u.id); else setLoading(false);
    } catch { setLoading(false); }
  }, [fetchAll]);

  // Both outcomes arrive together and the filter is applied here: the list is
  // capped at 60, so switching between them should not cost a round trip.
  useEffect(() => {
    if (tab !== 'history' || decisions !== null) return;
    api.get('/tasks/qc-decisions/by-me?limit=60')
      .then(({ data }) => setDecisions(data))
      .catch(() => setDecisions([]));
  }, [tab, decisions]);

  const shownDecisions = useMemo(
    () => (decisions ?? []).filter((d) => historyFilter === 'all' || d.outcome === historyFilter),
    [decisions, historyFilter]
  );

  const review = async (taskId: number, passed: boolean, reason?: string) => {
    if (!passed) {
      if (categories.length === 0) {
        showToast('حداقل یک دسته دلیل رد را انتخاب کنید', 'error');
        return;
      }
      if (!validReworkMinutes(rework)) {
        showToast('زمان تخمینی اصلاح را وارد کنید', 'error');
        return;
      }
      // The same check the API makes: a full stop is not a reason.
      if (!meaningfulReason(reason ?? '')) {
        showToast('دلیل رد را با جزئیات بنویسید تا انجام‌دهنده بداند چه چیزی باید اصلاح شود', 'error');
        return;
      }
    }
    setBusyId(taskId);
    try {
      await api.patch(`/tasks/${taskId}/qc`, {
        passed,
        note: reason?.trim() || undefined,
        categories: passed ? undefined : categories,
        reworkMinutes: passed ? undefined : rework,
      });
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      showToast(passed ? 'کنترل کیفیت تایید شد' : 'تسک برای اصلاح برگردانده شد');
      setRejectingId(null);
      setNote('');
      setCategories([]);
      setRework('');
      setDecisions(null); // refetch on next visit rather than guess the shape
    } catch (err: any) {
      showToast(describeRequestError(err, passed ? 'تایید کنترل کیفیت' : 'رد کنترل کیفیت'), 'error');
      if (userId) fetchAll(userId);
    } finally { setBusyId(null); }
  };

  // Longest wait first: the decision that is costing the most time comes first.
  const queue = useMemo(
    () => [...tasks].sort((a, b) => (daysAwaitingReview(b) ?? -1) - (daysAwaitingReview(a) ?? -1)
      || (daysTo(a.deadline) ?? 9999) - (daysTo(b.deadline) ?? 9999)),
    [tasks]
  );
  // Three days is a display threshold, not a rule: long enough that the wait
  // is the reviewer's doing rather than normal turnaround.
  const stale = queue.filter((t) => (daysAwaitingReview(t) ?? 0) >= 3).length;

  return (
    <ProtectedRoute allowedRoles={['CEO', 'INTERNAL_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER', 'EMPLOYEE']}>
      <div className="pt-3" />

      <div className="mb-3 flex gap-1 rounded-full bg-card p-1 shadow-flat">
        {([['queue', 'صف بررسی'], ['history', 'تاریخچه بررسی‌های من']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`cursor-pointer whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
              tab === key ? 'bg-pill text-pill-fg' : 'text-fg-secondary hover:text-fg'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'history' ? (
        decisions === null ? (
          <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-24 rounded-card" />)}</div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {([['all', 'همه'], ['passed', 'تایید شده'], ['rejected', 'رد شده']] as const).map(([key, label]) => {
                const n = key === 'all' ? decisions.length : decisions.filter((d) => d.outcome === key).length;
                return (
                  <button
                    key={key}
                    onClick={() => setHistoryFilter(key)}
                    className={`cursor-pointer whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                      historyFilter === key ? 'bg-pill text-pill-fg' : 'bg-sunken text-fg-secondary hover:text-fg'
                    }`}
                  >
                    {label} <span className="tnum opacity-70">{n}</span>
                  </button>
                );
              })}
            </div>

            {shownDecisions.length === 0 ? (
              <Card className="py-16 text-center">
                <p className="text-sm text-fg-muted">
                  {historyFilter === 'passed' ? 'هنوز چیزی تایید نکرده‌اید'
                    : historyFilter === 'rejected' ? 'هنوز چیزی رد نکرده‌اید'
                    : 'هنوز تسکی بررسی نکرده‌اید'}
                </p>
              </Card>
            ) : (
              <div className="space-y-2">
                {shownDecisions.map((d, i) => (
                  <Card key={`${d.outcome}-${d.taskId}-${d.at}-${i}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={d.outcome === 'passed' ? 'ok' : 'bad'}>
                        {d.outcome === 'passed' ? 'تایید شد' : 'رد شد'}
                      </Badge>
                      {/* A reviewer who is also an approver sees both gates
                          here; without this they read as the same decision. */}
                      {d.stage === 'APPROVAL' && <Badge tone="neutral">تایید نهایی</Badge>}
                      <Link href={`/dashboard/tasks/${d.taskId}`}
                            className="min-w-0 flex-1 truncate text-sm font-medium text-fg transition-colors hover:text-brand-ink">
                        {d.task?.title || `تسک ${d.taskId}`}
                      </Link>
                      {d.task?.project?.name && <Badge tone="neutral">{d.task.project.name}</Badge>}
                      <Badge tone={d.task?.status === 'DONE' ? 'ok' : d.task?.status === 'PENDING_QC' ? 'warn' : 'neutral'}>
                        {d.task?.status === 'DONE' ? 'تمام شد'
                          : d.task?.status === 'PENDING_QC' ? 'دوباره در صف شما'
                          : d.outcome === 'passed' ? 'در جریان' : 'در حال اصلاح'}
                      </Badge>
                      <span className="tnum text-[10px] text-fg-muted">{jalaliDateTime(d.at)}</span>
                    </div>
                    {d.note && (
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-fg-secondary">{d.note}</p>
                    )}
                    {d.assignees.length > 0 && (
                      <p className="mt-1.5 text-[10px] text-fg-muted">برگشت به {d.assignees.map((a) => a.name).join('، ')}</p>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </>
        )
      ) : (
      <>
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile index={0} label="در صف بررسی" value={queue.length} hint="منتظر تصمیم شما" tone={queue.length ? 'warn' : 'ok'} loading={loading} />
        <StatTile index={1} label="معطل بررسی" value={stale} hint="۳ روز یا بیشتر منتظر شما" tone={stale ? 'bad' : 'ok'} loading={loading} />
        <StatTile index={2} label="پروژه‌های شما" value={projects.length} hint="مسئول کیفیت آن‌ها هستید" loading={loading} />
      </div>

      {loading ? (
        <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-32 rounded-card" />)}</div>
      ) : !projects.length ? (
        <Card className="py-16 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sunken text-fg-muted">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </span>
          <p className="text-sm text-fg">شما مسئول کنترل کیفیت هیچ پروژه‌ای نیستید</p>
          <p className="mt-1 text-xs text-fg-muted">مدیرعامل یا مدیر فنی می‌تواند شما را برای یک پروژه تعیین کند.</p>
        </Card>
      ) : queue.length ? (
        <div className="space-y-2">
          {queue.map((t) => {
            // In a review queue the useful number is how long the task has been
            // waiting on this reviewer, not how the assignee did against the deadline.
            const waited = daysAwaitingReview(t);
            const names = (t.assignees || [])
              .map((a: any) => a.user ? `${a.user.firstName} ${a.user.lastName}`.trim() : null)
              .filter(Boolean) as string[];
            const busy = busyId === t.id;
            const rejecting = rejectingId === t.id;
            const history: RejectionEvent[] = t.rejections || [];

            return (
              <Card key={t.id}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/dashboard/tasks/${t.id}`} className="truncate text-sm font-medium text-fg transition-colors hover:text-brand-ink">
                      {t.title}
                    </Link>
                    <p className="mt-1 truncate text-[11px] text-fg-muted">
                      {t.project?.name}
                      {t.project?.department?.name && <> • {t.project.department.name}</>}
                      {t.subtasks?.length > 0 && <> • {t.subtasks.filter((x: any) => x.isDone).length}/{t.subtasks.length} زیرتسک</>}
                    </p>
                  </div>

                  {history.length > 0 && <RejectionBadge events={history} />}

                  {names.length > 0 && <AvatarStack names={names} max={3} size={26} />}

                  <Badge tone={waited === null ? 'neutral' : waited >= 3 ? 'bad' : waited > 0 ? 'warn' : 'neutral'}>
                    {waited === null
                      ? (t.deadline ? gregorianToShamsi(t.deadline) : 'بدون سررسید')
                      : waited > 0 ? `${waited} روز در انتظار شما` : 'امروز رسیده'}
                  </Badge>

                  {!rejecting && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button onClick={() => review(t.id, true)} disabled={busy}
                        className="cursor-pointer rounded-full bg-pill px-3.5 py-1.5 text-[11px] font-medium text-pill-fg transition-opacity hover:opacity-90 disabled:opacity-40">
                        {busy ? '…' : 'تایید'}
                      </button>
                      <button onClick={() => { setRejectingId(t.id); setNote(''); setCategories([]); setRework(''); }} disabled={busy}
                        className="cursor-pointer rounded-full bg-bad-soft px-3.5 py-1.5 text-[11px] font-medium text-bad transition-opacity hover:opacity-80 disabled:opacity-40">
                        رد
                      </button>
                    </div>
                  )}
                </div>

                {history.length > 0 && (
                  <div className="mt-3 border-t border-line pt-3">
                    <p className="mb-2 text-[11px] font-medium text-fg-secondary">
                      قبلاً چه چیزی خواسته بودید
                    </p>
                    <RejectionHistory events={history} compact />
                  </div>
                )}

                {rejecting && (
                  <div className="mt-3 border-t border-line pt-3">
                    <label className="mb-1.5 block text-xs font-medium text-fg-secondary">
                      توضیح <span className="text-bad">*</span>
                    </label>
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} autoFocus
                      placeholder="چه چیزی باید اصلاح شود؟"
                      className="w-full resize-y rounded-tile bg-sunken px-3.5 py-2.5 text-sm text-fg outline-none placeholder:text-fg-muted" />

                    {/* The category comes after the text: the reviewer has
                        just said what is wrong, so labelling which kind of
                        wrong it was follows naturally. Picked from a list
                        because free text cannot be counted — of the first 21
                        rejections, 16 read "." or "/". */}
                    <label className="mb-1.5 mt-3 block text-xs font-medium text-fg-secondary">
                      دسته دلیل <span className="text-bad">*</span>
                      <span className="mr-1.5 font-normal text-fg-muted">(می‌توانید چند مورد انتخاب کنید)</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {REJECTION_CATEGORIES.map((c) => (
                        <button
                          key={c.key}
                          type="button"
                          onClick={() => setCategories((prev) =>
                            prev.includes(c.key) ? prev.filter((k) => k !== c.key) : [...prev, c.key])}
                          aria-pressed={categories.includes(c.key)}
                          className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${
                            categories.includes(c.key) ? 'bg-pill text-pill-fg' : 'bg-sunken text-fg-secondary hover:text-fg'
                          }`}
                        >
                          <CategoryIcon category={c.key} />
                          {c.label}
                        </button>
                      ))}
                    </div>
                    {/* The reviewer knows how long the fix takes at exactly
                        this moment and nowhere else, so it is asked here. */}
                    <label className="mb-1.5 mt-3 block text-xs font-medium text-fg-secondary">
                      زمان تخمینی اصلاح <span className="text-bad">*</span>
                    </label>
                    <ReworkMinutesPicker value={rework} onChange={setRework} />

                    <div className="mt-3 flex items-center gap-2">
                      <button onClick={() => review(t.id, false, note)}
                        disabled={busy || categories.length === 0 || !meaningfulReason(note) || !validReworkMinutes(rework)}
                        className="cursor-pointer rounded-full bg-bad px-4 py-1.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
                        ثبت رد
                      </button>
                      <button onClick={() => { setRejectingId(null); setNote(''); setCategories([]); setRework(''); }}
                        className="cursor-pointer rounded-full bg-sunken px-4 py-1.5 text-[11px] font-medium text-fg-secondary transition-colors hover:text-fg">
                        انصراف
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="py-16 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ok-soft text-ok">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </span>
          <p className="text-sm text-fg">صف کنترل کیفیت خالی است</p>
          <p className="mt-1 text-xs text-fg-muted">
            مسئول کیفیت {projects.length} پروژه هستید و همه‌چیز بررسی شده.
          </p>
        </Card>
      )}
      </>
      )}
    </ProtectedRoute>
  );
}
