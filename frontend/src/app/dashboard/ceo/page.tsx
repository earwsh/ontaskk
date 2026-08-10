'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import UserFormModal from '@/components/UserFormModal';
import HealthRing from '@/components/dashboard/HealthRing';
import PendingApprovalsPanel from '@/components/dashboard/PendingApprovalsPanel';
import ProjectRiskList from '@/components/dashboard/ProjectRiskList';
import WarningsPanel from '@/components/dashboard/WarningsPanel';
import WorkloadPanel from '@/components/dashboard/WorkloadPanel';
import api from '@/lib/api';
import Link from 'next/link';

export default function CEOPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [stats, setStats] = useState({ users: 0, departments: 0, projects: 0, tasks: 0 });
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [smart, setSmart] = useState<any>(null);
  const [reports, setReports] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [usersRes, deptsRes, projectsRes, reportsRes, smartRes, tasksRes] = await Promise.all([
          api.get('/users'),
          api.get('/departments'),
          api.get('/projects'),
          api.get('/analytics/reports'),
          api.get('/analytics/smart'),
          api.get('/tasks'),
        ]);
        setStats({
          users: usersRes.data.length,
          departments: deptsRes.data.length,
          projects: projectsRes.data.length,
          tasks: reportsRes.data.counts?.total || 0,
        });
        setReports(reportsRes.data);
        setSmart(smartRes.data);
        setPendingTasks(tasksRes.data.filter((t: any) => t.status === 'PENDING_APPROVAL'));
      } catch {}
      setLoading(false);
    };
    fetchAll();
  }, []);

  const handleCreateUser = async (data: any) => {
    try {
      await api.post('/users', data);
      setModalOpen(false);
      window.location.reload();
    } catch (err: any) {
      alert(err.response?.data?.error || 'خطا');
    }
  };

  const handleApprove = async (taskId: number) => {
    try {
      await api.patch(`/tasks/${taskId}/status`, { status: 'DONE' });
      window.location.reload();
    } catch {}
  };

  const level = smart?.level || 'warning';
  const levelColor = level === 'good' ? '#22C55E' : level === 'warning' ? '#F59E0B' : '#EF4444';
  const levelLabel = level === 'good' ? 'سلامت خوب' : level === 'warning' ? 'نیاز به توجه' : 'وضعیت بحرانی';
  const snapshot = smart?.snapshot || {};

  return (
    <ProtectedRoute allowedRoles={['CEO']}>
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">داشبورد مدیریت</h1>
            <p className="text-text-muted text-sm mt-1">مدیر عامل</p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-medium transition-all duration-200 cursor-pointer active:scale-[0.98]"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            کاربر جدید
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link href="/dashboard/users"
            className="group relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:scale-[1.02] block"
            style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(99,102,241,0.05) 100%)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <div className="flex items-center gap-2 text-xs font-medium text-text-muted mb-2">
              <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span>کارمندان</span>
            </div>
            <div className="text-3xl font-bold text-white">{loading ? '-' : stats.users}</div>
            <div className="mt-1 text-xs text-text-muted">مشاهده همه کارمندان</div>
          </Link>

          <div
            className="relative overflow-hidden rounded-2xl p-5 transition-all duration-300"
            style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.15) 0%, rgba(6,182,212,0.05) 100%)', border: '1px solid rgba(6,182,212,0.2)' }}>
            <div className="flex items-center gap-2 text-xs font-medium text-text-muted mb-2">
              <svg className="w-4 h-4 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <span>دپارتمان‌ها</span>
            </div>
            <div className="text-3xl font-bold text-white">{loading ? '-' : stats.departments}</div>
            <div className="mt-1 text-xs text-text-muted">دپارتمان فعال</div>
          </div>

          <Link href="/dashboard/projects"
            className="group relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:scale-[1.02] block"
            style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(245,158,11,0.05) 100%)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <div className="flex items-center gap-2 text-xs font-medium text-text-muted mb-2">
              <svg className="w-4 h-4 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span>پروژه‌ها</span>
            </div>
            <div className="text-3xl font-bold text-white">{loading ? '-' : stats.projects}</div>
            <div className="mt-1 text-xs text-text-muted">پروژه فعال</div>
          </Link>

          <div
            className="relative overflow-hidden rounded-2xl p-5 transition-all duration-300"
            style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.15) 0%, rgba(34,197,94,0.05) 100%)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div className="flex items-center gap-2 text-xs font-medium text-text-muted mb-2">
              <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <span>کل تسک‌ها</span>
            </div>
            <div className="text-3xl font-bold text-white">{loading ? '-' : stats.tasks}</div>
            <div className="mt-1 text-xs text-text-muted">در کل سازمان</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex flex-col items-center justify-center rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,38,0.6)] p-6">
            {loading ? (
              <div className="h-44 w-44 animate-pulse rounded-full bg-[rgba(255,255,255,0.04)]" />
            ) : (
              <HealthRing score={smart?.healthScore ?? 0} color={levelColor} label={levelLabel} />
            )}
            <div className="mt-4 rounded-xl border border-[rgba(255,255,255,0.04)] bg-[rgba(255,255,255,0.02)] px-3.5 py-3 text-center text-xs leading-relaxed text-text-secondary">
              {snapshot.text || 'هنوز داده‌ای برای تحلیل وجود ندارد.'}
            </div>
            <Link href="/dashboard/analytics" className="mt-4 text-xs font-medium text-primary transition-colors hover:text-primary-hover">
              مشاهده تحلیل کامل ←
            </Link>
          </div>

          <div className="lg:col-span-2">
            <WarningsPanel warnings={smart?.warnings || []} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ProjectRiskList projects={reports?.projectAggregate?.projects || []} />
          <WorkloadPanel health={reports?.workloadHealth} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-12 animate-pulse rounded-xl bg-[rgba(255,255,255,0.04)]" />)}
            </div>
          ) : (
            <PendingApprovalsPanel tasks={pendingTasks} onApprove={handleApprove} />
          )}

          <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,38,0.6)] p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              دسترسی سریع
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Link href="/dashboard/users"
                className="flex items-center gap-3 rounded-xl bg-[rgba(99,102,241,0.08)] border border-[rgba(99,102,241,0.15)] px-4 py-3.5 text-sm font-medium text-primary hover:bg-[rgba(99,102,241,0.15)] transition-all">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                مدیریت کاربران
              </Link>
              <Link href="/dashboard/projects"
                className="flex items-center gap-3 rounded-xl bg-[rgba(6,182,212,0.08)] border border-[rgba(6,182,212,0.15)] px-4 py-3.5 text-sm font-medium text-secondary hover:bg-[rgba(6,182,212,0.15)] transition-all">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                پروژه‌ها
              </Link>
              <Link href="/dashboard/departments"
                className="flex items-center gap-3 rounded-xl bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.15)] px-4 py-3.5 text-sm font-medium text-success hover:bg-[rgba(34,197,94,0.15)] transition-all">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                دپارتمان‌ها
              </Link>
              <Link href="/dashboard/analytics/reports"
                className="flex items-center gap-3 rounded-xl bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.15)] px-4 py-3.5 text-sm font-medium text-warning hover:bg-[rgba(245,158,11,0.15)] transition-all">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                گزارشات آماری
              </Link>
              <Link href="/dashboard/analytics/scrum"
                className="flex items-center gap-3 rounded-xl bg-[rgba(168,85,247,0.08)] border border-[rgba(168,85,247,0.15)] px-4 py-3.5 text-sm font-medium text-purple-400 hover:bg-[rgba(168,85,247,0.15)] transition-all">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                اسکرام و ظرفیت
              </Link>
              <Link href="/dashboard/analytics/gantt"
                className="flex items-center gap-3 rounded-xl bg-[rgba(236,72,153,0.08)] border border-[rgba(236,72,153,0.15)] px-4 py-3.5 text-sm font-medium text-pink-400 hover:bg-[rgba(236,72,153,0.15)] transition-all">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                تایم‌لاین گانت
              </Link>
            </div>
          </div>
        </div>

        <UserFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSubmit={handleCreateUser} mode="create" />
      </div>
    </ProtectedRoute>
  );
}
