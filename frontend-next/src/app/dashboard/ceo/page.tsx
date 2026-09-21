'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import UserFormModal from '@/components/UserFormModal';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import PeopleGrid, { Person } from '@/components/bento/PeopleGrid';
import CardHead from '@/components/bento/CardHead';
import PeriodChip from '@/components/bento/PeriodChip';
import DeltaBadge from '@/components/bento/DeltaBadge';
import InkCard from '@/components/bento/InkCard';
import BarChart, { BarPair } from '@/components/bento/BarChart';
import AreaWave, { WavePoint } from '@/components/bento/AreaWave';
import api from '@/lib/api';
import { NEEDS_ATTENTION, PROJECT_STATUS_ORDER, statusMeta, type ProjectRisk } from '@/lib/projectStatus';

const faMonth = (iso: string) => {
  try { return new Date(iso).toLocaleDateString('fa-IR', { month: 'short' }); } catch { return ''; }
};
const faDate = (iso?: string | null) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('fa-IR', { month: 'long', day: 'numeric' }); } catch { return '—'; }
};

// The risk label comes from the shared endpoint, not from a local map: the
// two used to disagree about the same project on two screens.

const filterIcon = 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4';

export default function CEOPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [period, setPeriod] = useState('week');
  const [stats, setStats] = useState({ users: 0, departments: 0, projects: 0 });
  const [people, setPeople] = useState<Person[]>([]);
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [smart, setSmart] = useState<any>(null);
  const [reports, setReports] = useState<any>(null);
  const [me, setMe] = useState('');
  const [projects, setProjects] = useState<any[]>([]);
  const [risks, setRisks] = useState<ProjectRisk[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [usersRes, deptsRes, projectsRes, reportsRes, smartRes, tasksRes, riskRes] = await Promise.all([
        api.get('/users'), api.get('/departments'), api.get('/projects'),
        api.get('/analytics/reports'), api.get('/analytics/smart'), api.get('/tasks'),
        api.get('/analytics/project-status').catch(() => ({ data: { projects: [] } })),
      ]);
      setStats({ users: usersRes.data.length, departments: deptsRes.data.length, projects: projectsRes.data.length });
      setProjects(projectsRes.data);
      setRisks(riskRes.data.projects);
      setPeople(usersRes.data.map((u: any) => ({
        id: u.id,
        name: (u.displayName || `${u.firstName} ${u.lastName}`).trim(),
        role: u.position,
        avatarUrl: u.avatarUrl,
      })));
      setReports(reportsRes.data);
      setSmart(smartRes.data);
      setPendingTasks(tasksRes.data.filter((t: any) => t.status === 'PENDING_APPROVAL'));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      setMe(`${u.firstName || ''} ${u.lastName || ''}`.trim());
    } catch {}
    fetchAll();
  }, [fetchAll]);

  const handleCreateUser = async (data: any) => {
    try { await api.post('/users', data); setModalOpen(false); await fetchAll(); }
    catch (err: any) { alert(err.response?.data?.error || 'خطا'); }
  };

  const handleApprove = async (taskId: number) => {
    setPendingTasks((prev) => prev.filter((t) => t.id !== taskId));
    try { await api.patch(`/tasks/${taskId}/status`, { status: 'DONE' }); } catch {}
    fetchAll();
  };

  const counts = reports?.counts || {};
  const total = counts.total ?? 0;
  const done = counts.done ?? 0;
  const overdue = counts.overdue ?? 0;
  const completionRate = Math.round(counts.completionRate ?? 0);
  const prediction = smart?.prediction;

  const riskProjects = useMemo(() => {
    const byId = new Map(projects.map((p: any) => [p.id, p.name]));
    return [...risks]
      .sort((a, b) => PROJECT_STATUS_ORDER.indexOf(a.status) - PROJECT_STATUS_ORDER.indexOf(b.status))
      .map((r) => ({ ...r, projectName: byId.get(r.projectId) ?? `پروژه ${r.projectId}` }));
  }, [risks, projects]);
  const atRisk = risks.filter((r) => NEEDS_ATTENTION.includes(r.status)).length;

  // Split the weekly series into two equal windows so the chart compares the
  // current period against the one immediately before it.
  const span = period === 'week' ? 4 : period === 'month' ? 6 : 8;
  const bars: BarPair[] = useMemo(() => {
    const weeks = (prediction?.weeks || []) as any[];
    const window = weeks.slice(-span * 2);
    const previous = window.slice(0, span);
    const current = window.slice(span);
    return current.map((w: any, i: number) => ({
      label: `هفته ${i + 1}`,
      current: w.done ?? 0,
      previous: previous[i]?.done ?? 0,
    }));
  }, [prediction, span]);

  // Weekly creation volume as a continuous series; weeks in the same month
  // repeat their name, so the label carries the week ordinal too.
  const wave: WavePoint[] = useMemo(() => {
    const weeks = (prediction?.weeks || []) as any[];
    return weeks.slice(-14).map((w: any, i: number) => ({
      label: `${faMonth(w.week)} • هفته ${i + 1}`,
      value: w.created ?? 0,
    }));
  }, [prediction]);

  const openTasks = total - done;
  const sprintProb = prediction?.sprintSuccessProbability ?? 0;

  return (
    <ProtectedRoute allowedRoles={['CEO']}>
      {/* Big display greeting, as the reference leads with */}
      <div className="flex flex-wrap items-center justify-between gap-3 py-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-fg md:text-[34px] md:leading-none">
          خوش آمدی، {me || 'مدیر'}
        </h1>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/analytics" className="flex items-center gap-2 rounded-full bg-card px-4 py-2 text-xs font-medium text-fg-secondary shadow-flat transition-colors hover:text-fg">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            تحلیل
          </Link>
          <button onClick={() => setModalOpen(true)} className="flex cursor-pointer items-center gap-2 rounded-full bg-pill px-4 py-2 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            کاربر جدید
          </button>
        </div>
      </div>

      {/* ── Bento grid ── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">

        {/* Throughput — the hero card */}
        <Card className="lg:col-span-7">
          <CardHead
            title="روند تکمیل تسک‌ها"
            chip={<PeriodChip value={period} onChange={setPeriod} />}
            action={
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sunken text-fg-muted">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={filterIcon} />
                </svg>
              </span>
            }
          />
          {loading ? (
            <Skeleton className="h-[196px]" />
          ) : (
            <>
              <div className="mb-4 flex items-baseline gap-3">
                <span className="tnum text-4xl font-extrabold tracking-tight text-fg md:text-5xl">{done}</span>
                <span className="text-sm text-fg-muted">تسک تکمیل‌شده</span>
                {completionRate > 0 && <DeltaBadge value={completionRate} />}
              </div>
              {bars.length ? <BarChart data={bars} /> : <p className="py-12 text-center text-xs text-fg-muted">داده‌ای برای این بازه نیست</p>}
            </>
          )}
        </Card>

        {/* Health + forecast */}
        <Card className="lg:col-span-5">
          <CardHead title="سلامت سازمان" chip={<PeriodChip value={period} onChange={setPeriod} />} />
          {loading ? <Skeleton className="h-[196px]" /> : (
            <>
              <p className="text-xs text-fg-muted">امتیاز کلی</p>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="tnum text-4xl font-extrabold tracking-tight text-fg md:text-5xl">{smart?.healthScore ?? 0}</span>
                <DeltaBadge value={sprintProb - 50} />
              </div>

              <div className="mt-5 space-y-3">
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[11px]">
                    <span className="text-fg-muted">نرخ تکمیل</span>
                    <span className="tnum font-medium text-fg">{completionRate}٪</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-sunken">
                    <div className="h-full rounded-full bg-ok transition-all duration-700" style={{ width: `${completionRate}%` }} />
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[11px]">
                    <span className="text-fg-muted">احتمال موفقیت اسپرینت</span>
                    <span className="tnum font-medium text-fg">{sprintProb}٪</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-sunken">
                    <div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${sprintProb}%` }} />
                  </div>
                </div>
              </div>

              <p className="mt-4 text-[11px] leading-relaxed text-fg-muted">
                {prediction?.text || smart?.snapshot?.text}
              </p>
            </>
          )}
        </Card>

        {/* Three headline figures */}
        <Card padding="sm" tint={overdue ? 'bad' : 'ok'} className="lg:col-span-2">
          <div className="flex items-start justify-between">
            {loading ? <Skeleton className="h-9 w-14" /> : <span className="tnum text-3xl font-extrabold text-fg">{overdue}</span>}
            {!loading && overdue > 0 && <DeltaBadge value={-Math.round((overdue / Math.max(total, 1)) * 100)} />}
          </div>
          <div className="mt-4 flex items-end justify-between">
            <p className="text-xs text-fg-secondary">تسک دیرکرد</p>
            <Link href="/dashboard/tech/tasks" aria-label="مشاهده تسک‌های دیرکرد" className="flex h-7 w-7 items-center justify-center rounded-full bg-sunken text-fg-muted transition-colors hover:text-fg">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
          </div>
        </Card>

        <Card padding="sm" tint="brand" className="lg:col-span-2">
          <div className="flex items-start justify-between">
            {loading ? <Skeleton className="h-9 w-14" /> : <span className="tnum text-3xl font-extrabold text-fg">{openTasks}</span>}
            {!loading && <DeltaBadge value={completionRate} />}
          </div>
          <div className="mt-4 flex items-end justify-between">
            <p className="text-xs text-fg-secondary">تسک باز</p>
            <Link href="/dashboard/tech/tasks" aria-label="مشاهده تسک‌های باز" className="flex h-7 w-7 items-center justify-center rounded-full bg-sunken text-fg-muted transition-colors hover:text-fg">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
          </div>
        </Card>

        {/* Team — faces, given the room to actually be seen */}
        <Card tint="info" className="lg:col-span-5">
          <CardHead
            title="تیم"
            action={<Link href="/dashboard/users" className="text-[11px] text-brand-ink hover:text-brand">مدیریت کاربران</Link>}
          />
          {loading ? (
            <div className="flex flex-wrap gap-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11 w-11 rounded-full" />)}</div>
          ) : (
            <PeopleGrid people={people} max={14} />
          )}
          <p className="mt-4 text-xs text-fg-muted">
            <span className="tnum font-semibold text-fg">{stats.users}</span> نفر در{' '}
            <span className="tnum font-semibold text-fg">{stats.departments}</span> دپارتمان
          </p>
        </Card>

        {/* Approvals — inverted for emphasis */}
        <InkCard className="lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <Link href="/dashboard/approvals" aria-label="همه تاییدات" className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-ink-fg transition-opacity hover:opacity-80">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
          </div>
          <p className="tnum text-3xl font-extrabold">{pendingTasks.length}</p>
          <p className="mt-1 text-xs text-ink-muted">منتظر تایید شما</p>
          {pendingTasks[0] && (
            <button
              onClick={() => handleApprove(pendingTasks[0].id)}
              className="mt-4 w-full cursor-pointer truncate rounded-full bg-white px-3 py-2 text-[11px] font-medium text-ink transition-opacity hover:opacity-90"
            >
              تایید: {pendingTasks[0].title}
            </button>
          )}
        </InkCard>

        {/* Volume */}
        <Card className="lg:col-span-5">
          <CardHead
            title="حجم تسک‌های ایجادشده"
            action={<span className="tnum rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-on-soft">{total}</span>}
          />
          {loading ? <Skeleton className="h-[120px]" /> : (
            <>
              <AreaWave points={wave} height={120} unit="تسک" />
              <p className="mt-3 text-[11px] text-fg-muted">
                در مجموع {total} تسک ثبت شده؛ {done} مورد تکمیل و {openTasks} مورد در جریان است.
              </p>
            </>
          )}
        </Card>

        {/* Project risk */}
        <Card className="lg:col-span-7">
          <CardHead
            title="ریسک پروژه‌ها"
            action={<Link href="/dashboard/projects" className="text-[11px] text-brand-ink hover:text-brand">مشاهده همه</Link>}
          />
          {loading ? (
            <div className="space-y-2">{[0,1,2].map(i => <Skeleton key={i} className="h-11" />)}</div>
          ) : riskProjects.length ? (
            <div className="space-y-2">
              {riskProjects.slice(0, 4).map((p: any) => (
                <div key={p.projectId} className="flex items-center gap-3 rounded-tile bg-sunken px-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg">{p.projectName}</span>
                  <div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-panel-strong sm:block">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(p.completionRate || 0)}%` }} />
                  </div>
                  <span className="tnum w-9 text-left text-[11px] text-fg-muted">{Math.round(p.completionRate || 0)}٪</span>
                  <Badge tone={statusMeta(p.status).tone}><span title={p.headline}>{p.statusLabel}</span></Badge>
                </div>
              ))}
            </div>
          ) : <p className="py-8 text-center text-xs text-fg-muted">پروژه‌ای وجود ندارد</p>}
        </Card>

        {/* Warnings */}
        <Card className="lg:col-span-8">
          <CardHead
            title="هشدارها"
            action={<span className="tnum rounded-full bg-bad-soft px-2 py-0.5 text-[11px] font-semibold text-bad">{smart?.warnings?.length ?? 0}</span>}
          />
          {loading ? (
            <div className="space-y-2">{[0,1,2].map(i => <Skeleton key={i} className="h-10" />)}</div>
          ) : smart?.warnings?.length ? (
            <div className="grid gap-2 md:grid-cols-2">
              {smart.warnings.slice(0, 4).map((w: string, i: number) => (
                <div key={i} className="flex items-start gap-2.5 rounded-tile bg-sunken px-3 py-2.5">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                  <p className="text-[11px] leading-relaxed text-fg-secondary">{w}</p>
                </div>
              ))}
            </div>
          ) : <p className="py-8 text-center text-xs text-fg-muted">هشدار فعالی نیست</p>}
        </Card>

        {/* Forecast — inverted */}
        <InkCard className="lg:col-span-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">پیش‌بینی پایان</h3>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px]">{stats.projects} پروژه</span>
          </div>
          {loading ? <Skeleton className="h-16 bg-white/10" /> : (
            <>
              <p className="text-2xl font-extrabold">{faDate(prediction?.estimatedProjectCompletionDate)}</p>
              <p className="mt-1 text-xs text-ink-muted">با روند فعلی تیم</p>
              <div className="mt-4 flex items-center justify-between rounded-tile bg-white/10 px-3 py-2.5">
                <span className="text-[11px] text-ink-muted">توان لازم روزانه</span>
                <span className="tnum text-sm font-bold">{prediction?.recommendedDailyThroughput ?? 0} تسک</span>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-tile bg-white/10 px-3 py-2.5">
                <span className="text-[11px] text-ink-muted">پروژه پرریسک</span>
                <span className="tnum text-sm font-bold">{atRisk}</span>
              </div>
            </>
          )}
        </InkCard>
      </div>

      <UserFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSubmit={handleCreateUser} mode="create" />
    </ProtectedRoute>
  );
}
