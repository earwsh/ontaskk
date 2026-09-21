'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useToast } from '@/components/Toast';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import StatTile from '@/components/bento/StatTile';
import DashboardHeader from '@/components/bento/DashboardHeader';
import InkCard from '@/components/bento/InkCard';
import TaskRow, { daysTo, isOverdue } from '@/components/bento/TaskRow';
import api from '@/lib/api';

export default function EmployeeDashboardPage() {
  const { showToast } = useToast();
  const [me, setMe] = useState({ id: 0, name: '' });
  const [stats, setStats] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [analyticsRes, tasksRes] = await Promise.all([
        api.get('/analytics/me').catch(() => ({ data: null })),
        api.get('/tasks/my'),
      ]);
      setStats(analyticsRes.data);
      setTasks(tasksRes.data);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      setMe({ id: u.id, name: `${u.firstName || ''} ${u.lastName || ''}`.trim() });
    } catch {}
    fetchAll();
  }, [fetchAll]);

  const toggleDone = async (task: any, next: boolean) => {
    setTasks((prev) => prev.map((t) => t.id !== task.id ? t : {
      ...t,
      assignees: t.assignees?.map((a: any) => (a.userId === me.id || a.user?.id === me.id) ? { ...a, isCompleted: next } : a),
    }));
    try {
      const res = await api.patch(`/tasks/${task.id}/assignee-complete`, { isCompleted: next });
      showToast(res.data?.message || (next ? 'تیک انجام شما ثبت شد' : 'وضعیت برداشته شد'));
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا', 'error');
    }
    fetchAll();
  };

  const counts = useMemo(() => {
    const active = tasks.filter((t) => t.status !== 'DONE');
    return {
      total: tasks.length,
      done: tasks.filter((t) => t.status === 'DONE').length,
      inProgress: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
      pending: tasks.filter((t) => t.status === 'PENDING_APPROVAL').length,
      overdue: active.filter((t) => isOverdue(t)).length,
      today: active.filter((t) => daysTo(t.deadline) === 0).length,
    };
  }, [tasks]);

  const completion = counts.total ? Math.round((counts.done / counts.total) * 100) : 0;

  const upcoming = useMemo(
    () => tasks
      .filter((t) => t.status !== 'DONE')
      .sort((a, b) => (daysTo(a.deadline) ?? 9999) - (daysTo(b.deadline) ?? 9999))
      .slice(0, 6),
    [tasks]
  );

  const byProject = useMemo(() => {
    const acc: Record<string, { name: string; open: number; total: number }> = {};
    for (const t of tasks) {
      const n = t.project?.name || '—';
      const s = (acc[n] ||= { name: n, open: 0, total: 0 });
      s.total++;
      if (t.status !== 'DONE') s.open++;
    }
    return Object.values(acc).sort((a, b) => b.open - a.open);
  }, [tasks]);

  const peak = Math.max(1, ...byProject.map((p) => p.total));

  return (
    <ProtectedRoute allowedRoles={['EMPLOYEE']}>
      <DashboardHeader
        name={me.name}
        role="کارمند"
        actions={
          <Link href="/dashboard/my-tasks" className="rounded-full bg-pill px-4 py-2 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90">
            همه تسک‌های من
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="grid grid-cols-2 gap-3 lg:col-span-12 lg:grid-cols-4">
          <StatTile index={0} label="دیرکرد" value={counts.overdue} hint="از سررسید گذشته" tone={counts.overdue ? 'bad' : 'ok'} href="/dashboard/my-tasks" loading={loading} />
          <StatTile index={1} label="امروز" value={counts.today} hint="سررسید امروز" tone={counts.today ? 'warn' : 'ok'} href="/dashboard/my-tasks" loading={loading} />
          <StatTile index={2} label="در حال انجام" value={counts.inProgress} hint="در جریان" tone="info" loading={loading} />
          <StatTile index={3} label="نرخ تکمیل" value={`${completion}٪`} hint={`${counts.done} از ${counts.total} تسک`} tone={completion >= 60 ? 'ok' : completion >= 30 ? 'warn' : 'bad'} loading={loading} />
        </div>

        <Card className="lg:col-span-8">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-fg">نزدیک‌ترین کارها</h3>
            <Link href="/dashboard/my-tasks" className="text-[11px] text-brand-ink hover:text-brand">مشاهده همه</Link>
          </div>
          {loading ? (
            <div className="space-y-2">{[0,1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div>
          ) : upcoming.length ? (
            <div className="space-y-2">
              {upcoming.map((t) => (
                <TaskRow key={t.id} task={t} userId={me.id} onToggle={toggleDone} showOwner={false} />
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ok-soft text-ok">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
              <p className="text-sm text-fg">همه کارها انجام شده</p>
            </div>
          )}
        </Card>

        <InkCard className="lg:col-span-4">
          <h3 className="mb-3 text-sm font-semibold">وضعیت شما</h3>
          <p className="tnum text-3xl font-extrabold">{counts.total - counts.done}</p>
          <p className="mt-1 text-xs text-ink-muted">تسک باز</p>

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between rounded-tile bg-white/10 px-3 py-2">
              <span className="text-[11px] text-ink-muted">منتظر تایید مدیر</span>
              <span className="tnum text-sm font-bold">{counts.pending}</span>
            </div>
            <div className="flex items-center justify-between rounded-tile bg-white/10 px-3 py-2">
              <span className="text-[11px] text-ink-muted">تکمیل‌شده</span>
              <span className="tnum text-sm font-bold">{counts.done}</span>
            </div>
            {stats?.avgCompletionDays != null && (
              <div className="flex items-center justify-between rounded-tile bg-white/10 px-3 py-2">
                <span className="text-[11px] text-ink-muted">میانگین زمان تکمیل</span>
                <span className="tnum text-sm font-bold">{Math.round(stats.avgCompletionDays)} روز</span>
              </div>
            )}
          </div>
        </InkCard>

        <Card className="lg:col-span-12">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-fg">تسک‌های شما به تفکیک پروژه</h3>
            <Badge tone="neutral">{byProject.length} پروژه</Badge>
          </div>
          {loading ? (
            <div className="space-y-2">{[0,1,2].map(i => <Skeleton key={i} className="h-11" />)}</div>
          ) : byProject.length ? (
            <div className="space-y-2">
              {byProject.map((p) => (
                <div key={p.name} className="flex items-center gap-3 rounded-tile bg-sunken px-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg">{p.name}</span>
                  <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-panel-strong sm:block">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(p.total / peak) * 100}%` }} />
                  </div>
                  <span className="tnum w-16 text-left text-[11px] text-fg-muted">{p.open} از {p.total}</span>
                </div>
              ))}
            </div>
          ) : <p className="py-8 text-center text-xs text-fg-muted">تسکی به شما محول نشده</p>}
        </Card>
      </div>
    </ProtectedRoute>
  );
}
