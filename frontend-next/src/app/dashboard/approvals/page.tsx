'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useToast } from '@/components/Toast';
import Card from '@/components/ui/Card';
import Badge, { BadgeTone } from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import Avatar from '@/components/ui/Avatar';
import AvatarStack from '@/components/ui/AvatarStack';
import { daysTo, daysAwaitingReview } from '@/components/bento/TaskRow';
import { RejectionBadge, type RejectionEvent } from '@/components/RejectionHistory';
import { gregorianToShamsi } from '@/lib/date';
import api from '@/lib/api';
import Link from 'next/link';

const ORG_WIDE = ['CEO', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'INTERNAL_MANAGER'];

/**
 * Why a given task is actionable for this user. The backend authorises the
 * designated approver *and* any non-employee role, so listing only the
 * departments a user manages hid work they were expected to act on.
 */
type Bucket = 'mine' | 'department' | 'organisation';

const buckets: { key: Bucket; title: string; hint: string; tone: BadgeTone }[] = [
  { key: 'mine', title: 'منتظر تایید شما', hint: 'شما به‌عنوان تاییدکننده تعیین شده‌اید', tone: 'bad' },
  { key: 'department', title: 'دپارتمان تحت مدیریت شما', hint: 'شما مدیر دپارتمان این تسک‌ها هستید', tone: 'warn' },
  { key: 'organisation', title: 'سایر تسک‌های سازمان', hint: 'با نقش سازمانی خود می‌توانید تایید کنید', tone: 'neutral' },
];

export default function ApprovalsPage() {
  const { showToast } = useToast();
  const [userId, setUserId] = useState(0);
  const [role, setRole] = useState('');
  const [tasks, setTasks] = useState<any[]>([]);
  const [managedDeptIds, setManagedDeptIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) { const u = JSON.parse(stored); setUserId(u.id); setRole(u.role); }
    } catch {}
  }, []);

  const fetchAll = useCallback(async (uid: number) => {
    try {
      const [deptRes, taskRes] = await Promise.all([api.get('/departments'), api.get('/tasks')]);
      setManagedDeptIds(deptRes.data.filter((d: any) => d.managerId === uid).map((d: any) => d.id));
      setTasks(taskRes.data.filter((t: any) => t.status === 'PENDING_APPROVAL'));
    } catch {
      // auth handled by the interceptor
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (userId) fetchAll(userId); }, [userId, fetchAll]);

  const act = async (taskId: number, next: 'DONE' | 'TODO') => {
    setBusyId(taskId);
    try {
      await api.patch(`/tasks/${taskId}/status`, { status: next });
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      showToast(next === 'DONE' ? 'تسک تایید شد' : 'تسک برای اصلاح برگردانده شد');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در تغییر وضعیت', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const bucketOf = useCallback((t: any): Bucket | null => {
    if (t.approver?.id === userId || t.approverId === userId) return 'mine';
    if (managedDeptIds.includes(t.project?.departmentId)) return 'department';
    if (ORG_WIDE.includes(role)) return 'organisation';
    return null;
  }, [userId, managedDeptIds, role]);

  const grouped = useMemo(() => {
    const out: Record<Bucket, any[]> = { mine: [], department: [], organisation: [] };
    for (const t of tasks) {
      const b = bucketOf(t);
      if (b) out[b].push(t);
    }
    // Oldest deadline first: the most overdue decision should surface first.
    for (const k of Object.keys(out) as Bucket[]) {
      out[k].sort((a, b) => (daysAwaitingReview(b) ?? -1) - (daysAwaitingReview(a) ?? -1)
        || (daysTo(a.deadline) ?? 9999) - (daysTo(b.deadline) ?? 9999));
    }
    return out;
  }, [tasks, bucketOf]);

  const actionable = grouped.mine.length + grouped.department.length + grouped.organisation.length;
  // Three days is a display threshold, not a rule: long enough that the wait
  // is the approver's doing rather than normal turnaround.
  const stale = [...grouped.mine, ...grouped.department, ...grouped.organisation]
    .filter((t) => (daysAwaitingReview(t) ?? 0) >= 3).length;

  return (
    <ProtectedRoute allowedRoles={['CEO', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'INTERNAL_MANAGER', 'DEPARTMENT_MANAGER']}>
      <div className="pt-3" />

      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'در انتظار شما', value: grouped.mine.length, hint: 'تاییدکننده تعیین‌شده', tone: grouped.mine.length ? 'bad' : 'ok' },
          { label: 'دپارتمان شما', value: grouped.department.length, hint: 'به‌عنوان مدیر واحد', tone: grouped.department.length ? 'warn' : 'ok' },
          { label: 'سایر سازمان', value: grouped.organisation.length, hint: 'با نقش سازمانی' },
          { label: 'معطل تایید', value: stale, hint: '۳ روز یا بیشتر منتظر شما', tone: stale ? 'bad' : 'ok' },
        ].map((k) => (
          <Card key={k.label} padding="sm">
            <div className="flex items-start justify-between">
              {loading ? <Skeleton className="h-8 w-12" /> : <span className="tnum text-3xl font-extrabold text-fg">{k.value}</span>}
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                k.tone === 'bad' ? 'bg-bad-soft text-bad' : k.tone === 'warn' ? 'bg-warn-soft text-warn'
                : k.tone === 'ok' ? 'bg-ok-soft text-ok' : 'bg-sunken text-fg-secondary'
              }`}>{k.label}</span>
            </div>
            <p className="mt-3 text-[11px] text-fg-muted">{k.hint}</p>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-56 rounded-card" />)}</div>
      ) : actionable ? (
        <div className="space-y-3">
          {buckets.map((b) => {
            const list = grouped[b.key];
            if (!list.length) return null;
            return (
              <Card key={b.key}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-fg">{b.title}</h3>
                    <p className="mt-0.5 text-[11px] text-fg-muted">{b.hint}</p>
                  </div>
                  <Badge tone={b.tone}>{list.length} تسک</Badge>
                </div>

                <div className="space-y-2">
                  {list.map((t) => {
                    // In an approval queue the useful number is how long this has
                    // been waiting on the approver, not the assignee's deadline.
                    const waited = daysAwaitingReview(t);
                    const history: RejectionEvent[] = t.rejections || [];
                    const names = (t.assignees || [])
                      .map((a: any) => a.user ? `${a.user.firstName} ${a.user.lastName}`.trim() : null)
                      .filter(Boolean) as string[];
                    const busy = busyId === t.id;

                    return (
                      <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-tile bg-sunken px-3 py-3">
                        <div className="min-w-0 flex-1">
                          <Link href={`/dashboard/tasks/${t.id}`} className="truncate text-sm font-medium text-fg transition-colors hover:text-brand-ink">
                            {t.title}
                          </Link>
                          <p className="mt-1 truncate text-[11px] text-fg-muted">
                            {t.project?.name}
                            {t.project?.department?.name && <> • {t.project.department.name}</>}
                          </p>
                        </div>

                        {history.length > 0 && <RejectionBadge events={history} />}

                        {names.length > 0 && <AvatarStack names={names} max={3} size={26} />}

                        <Badge tone={waited === null ? 'neutral' : waited >= 3 ? 'bad' : waited > 0 ? 'warn' : 'neutral'}>
                          {waited === null
                            ? (t.deadline ? gregorianToShamsi(t.deadline) : 'بدون سررسید')
                            : waited > 0 ? `${waited} روز در انتظار شما` : 'امروز رسیده'}
                        </Badge>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            onClick={() => act(t.id, 'DONE')}
                            disabled={busy}
                            className="cursor-pointer rounded-full bg-pill px-3.5 py-1.5 text-[11px] font-medium text-pill-fg transition-opacity hover:opacity-90 disabled:opacity-40"
                          >
                            {busy ? '…' : 'تایید'}
                          </button>
                          <button
                            onClick={() => act(t.id, 'TODO')}
                            disabled={busy}
                            title="برگرداندن برای اصلاح"
                            className="cursor-pointer rounded-full bg-bad-soft px-3.5 py-1.5 text-[11px] font-medium text-bad transition-opacity hover:opacity-80 disabled:opacity-40"
                          >
                            برگشت
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
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
          <p className="text-sm text-fg">هیچ تسکی منتظر تایید شما نیست</p>
          <p className="mt-1 text-xs text-fg-muted">صف تایید خالی است</p>
        </Card>
      )}
    </ProtectedRoute>
  );
}
