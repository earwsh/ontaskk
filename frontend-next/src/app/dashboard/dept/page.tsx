'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useToast } from '@/components/Toast';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import Avatar from '@/components/ui/Avatar';
import StatTile from '@/components/bento/StatTile';
import DashboardHeader from '@/components/bento/DashboardHeader';
import InkCard from '@/components/bento/InkCard';
import TaskRow, { daysTo, isOverdue, daysAwaitingReview } from '@/components/bento/TaskRow';
import api from '@/lib/api';

export default function DeptDashboardPage() {
  const { showToast } = useToast();
  const [me, setMe] = useState({ id: 0, name: '' });
  // A person can run more than one department, so this is a list. Taking only
  // the first one hid every other department they were responsible for.
  const [depts, setDepts] = useState<any[]>([]);
  const dept = depts[0] ?? null;
  const [notManager, setNotManager] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async (uid: number) => {
    try {
      const deptRes = await api.get('/departments');
      const managed = deptRes.data.filter((d: any) => d.managerId === uid);
      if (managed.length === 0) { setNotManager(true); return; }
      setDepts(managed);

      const ids = new Set(managed.map((d: any) => d.id));
      const [taskRes, projRes] = await Promise.all([
        api.get('/tasks'),
        api.get('/projects').catch(() => ({ data: [] })),
      ]);
      setTasks(taskRes.data.filter((t: any) => ids.has(t.project?.departmentId)));
      setProjects(projRes.data.filter((p: any) => ids.has(p.departmentId)));
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      setMe({ id: u.id, name: `${u.firstName || ''} ${u.lastName || ''}`.trim() });
      if (u.id) fetchAll(u.id); else setLoading(false);
    } catch { setLoading(false); }
  }, [fetchAll]);

  const approve = async (taskId: number) => {
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: 'DONE' } : t));
    try { await api.patch(`/tasks/${taskId}/status`, { status: 'DONE' }); showToast('تسک تایید شد'); }
    catch (err: any) { showToast(err.response?.data?.error || 'خطا', 'error'); }
    if (me.id) fetchAll(me.id);
  };

  const counts = useMemo(() => {
    const active = tasks.filter((t) => t.status !== 'DONE');
    return {
      total: tasks.length,
      done: tasks.filter((t) => t.status === 'DONE').length,
      overdue: active.filter((t) => isOverdue(t)).length,
      // Handed over and waiting on a reviewer. Kept apart from دیرکرد because
      // it is a queue somebody has to work through, not slipping work.
      awaitingReview: active.filter((t) => daysAwaitingReview(t) !== null).length,
      stalledInReview: active.filter((t) => (daysAwaitingReview(t) ?? 0) >= 3).length,
      pending: tasks.filter((t) => t.status === 'PENDING_APPROVAL').length,
    };
  }, [tasks]);

  const pendingTasks = useMemo(() => tasks.filter((t) => t.status === 'PENDING_APPROVAL'), [tasks]);
  const completion = counts.total ? Math.round((counts.done / counts.total) * 100) : 0;

  // Who is carrying what, so the manager can rebalance.
  const workload = useMemo(() => {
    const acc: Record<string, { name: string; open: number; overdue: number }> = {};
    for (const t of tasks) {
      if (t.status === 'DONE') continue;
      const late = isOverdue(t);
      for (const a of t.assignees || []) {
        if (!a.user) continue;
        const name = `${a.user.firstName} ${a.user.lastName}`.trim();
        const s = (acc[name] ||= { name, open: 0, overdue: 0 });
        s.open++;
        if (late) s.overdue++;
      }
    }
    return Object.values(acc).sort((a, b) => b.open - a.open);
  }, [tasks]);

  const urgent = useMemo(
    () => tasks
      .filter((t) => t.status !== 'DONE' && t.deadline)
      .sort((a, b) => (daysTo(a.deadline) ?? 9999) - (daysTo(b.deadline) ?? 9999))
      .slice(0, 6),
    [tasks]
  );

  const peak = Math.max(1, ...workload.map((w) => w.open));

  if (notManager) {
    return (
      <ProtectedRoute allowedRoles={['CEO', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'INTERNAL_MANAGER', 'DEPARTMENT_MANAGER']}>
        <div className="py-5">
          <h1 className="text-2xl font-extrabold tracking-tight text-fg md:text-[32px] md:leading-none">داشبورد دپارتمان</h1>
        </div>
        <Card className="py-16 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-warn-soft text-warn">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </span>
          <p className="text-sm text-fg">شما مدیر هیچ دپارتمانی نیستید</p>
          <p className="mt-1 text-xs text-fg-muted">این داشبورد فقط برای مدیر یک واحد معنا دارد.</p>
          <Link href="/dashboard/projects" className="mt-4 inline-block rounded-full bg-pill px-4 py-2 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90">
            رفتن به پروژه‌ها
          </Link>
        </Card>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={['CEO', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'INTERNAL_MANAGER', 'DEPARTMENT_MANAGER']}>
      <DashboardHeader
        name={me.name}
        role={
          depts.length === 0 ? 'مدیر دپارتمان'
            : depts.length === 1 ? `مدیر دپارتمان ${depts[0].name}`
            : `مدیر ${depts.length} دپارتمان: ${depts.map((d: any) => d.name).join('، ')}`
        }
        actions={
          <Link href="/dashboard/dept/tasks" className="rounded-full bg-card px-4 py-2 text-xs font-medium text-fg-secondary shadow-flat transition-colors hover:text-fg">
            تسک‌های دپارتمان
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="grid grid-cols-2 gap-3 lg:col-span-12 lg:grid-cols-5">
          <StatTile index={0} label="پروژه" value={projects.length} hint="در این دپارتمان" href="/dashboard/projects" loading={loading} />
          <StatTile index={1} label="اعضای فعال" value={workload.length} hint="دارای تسک باز" loading={loading} />
          <StatTile index={2} label="تسک دیرکرد" value={counts.overdue} hint="از سررسید گذشته" tone={counts.overdue ? 'bad' : 'ok'} href="/dashboard/dept/tasks" loading={loading} />
          <StatTile index={3} label="معطل بررسی" value={counts.awaitingReview} hint={counts.stalledInReview ? `${counts.stalledInReview} مورد بیش از ۳ روز` : 'منتظر تایید یا کنترل کیفیت'} tone={counts.stalledInReview ? 'bad' : counts.awaitingReview ? 'warn' : 'ok'} href="/dashboard/approvals" loading={loading} />
          <StatTile index={4} label="نرخ تکمیل" value={`${completion}٪`} hint={`${counts.done} از ${counts.total} تسک`} tone={completion >= 60 ? 'ok' : completion >= 30 ? 'warn' : 'bad'} loading={loading} />
        </div>

        <Card className="lg:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-fg">توازن بار کاری</h3>
            <Badge tone="neutral">{workload.length} نفر</Badge>
          </div>
          {loading ? (
            <div className="space-y-2">{[0,1,2].map(i => <Skeleton key={i} className="h-11" />)}</div>
          ) : workload.length ? (
            <div className="space-y-2">
              {workload.map((w) => (
                <div key={w.name} className="flex items-center gap-3 rounded-tile bg-sunken px-3 py-2.5">
                  <Avatar name={w.name} size={28} />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg">{w.name}</span>
                  <div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-panel-strong sm:block">
                    <div className={`h-full rounded-full ${w.overdue ? 'bg-bad' : 'bg-brand'}`} style={{ width: `${(w.open / peak) * 100}%` }} />
                  </div>
                  <span className="tnum w-6 text-left text-[11px] text-fg-muted">{w.open}</span>
                  {w.overdue > 0 && <Badge tone="bad">{w.overdue}</Badge>}
                </div>
              ))}
            </div>
          ) : <p className="py-8 text-center text-xs text-fg-muted">کسی تسک بازی ندارد</p>}
        </Card>

        <InkCard className="lg:col-span-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">منتظر تایید</h3>
            <Link href="/dashboard/approvals" aria-label="همه تاییدات"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 transition-opacity hover:opacity-80">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
          </div>
          <p className="tnum text-3xl font-extrabold">{pendingTasks.length}</p>
          <p className="mt-1 text-xs text-ink-muted">در دپارتمان شما</p>
          {pendingTasks.slice(0, 2).map((t) => (
            <button key={t.id} onClick={() => approve(t.id)}
              className="mt-2 w-full cursor-pointer truncate rounded-full bg-white/10 px-3 py-2 text-[11px] font-medium text-ink-fg transition-opacity hover:opacity-80">
              تایید: {t.title}
            </button>
          ))}
        </InkCard>

        <Card className="lg:col-span-12">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-fg">نزدیک‌ترین سررسیدها</h3>
            <Link href="/dashboard/dept/tasks" className="text-[11px] text-brand-ink hover:text-brand">مشاهده همه</Link>
          </div>
          {loading ? (
            <div className="space-y-2">{[0,1,2].map(i => <Skeleton key={i} className="h-14" />)}</div>
          ) : urgent.length ? (
            <div className="space-y-2">
              {urgent.map((t) => <TaskRow key={t.id} task={t} userId={me.id} />)}
            </div>
          ) : <p className="py-8 text-center text-xs text-fg-muted">تسکی با سررسید وجود ندارد</p>}
        </Card>
      </div>
    </ProtectedRoute>
  );
}
