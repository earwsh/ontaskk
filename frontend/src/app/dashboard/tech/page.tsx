'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import PendingApprovalsPanel from '@/components/dashboard/PendingApprovalsPanel';
import ProjectRiskList from '@/components/dashboard/ProjectRiskList';
import WorkloadPanel from '@/components/dashboard/WorkloadPanel';
import api from '@/lib/api';
import Link from 'next/link';

export default function TechPage() {
  const [stats, setStats] = useState({ projects: 0, departments: 0, tasks: 0, pendingApprovals: 0 });
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [reports, setReports] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [projectsRes, deptsRes, reportsRes, tasksRes] = await Promise.all([
          api.get('/projects'),
          api.get('/departments'),
          api.get('/analytics/reports'),
          api.get('/tasks'),
        ]);
        const counts = reportsRes.data.counts || {};
        setStats({
          projects: projectsRes.data.length,
          departments: deptsRes.data.length,
          tasks: counts.total || 0,
          pendingApprovals: counts.pending || 0,
        });
        setReports(reportsRes.data);
        setPendingTasks(tasksRes.data.filter((t: any) => t.status === 'PENDING_APPROVAL'));
      } catch {}
      setLoading(false);
    };
    fetchAll();
  }, []);

  const handleApprove = async (taskId: number) => {
    try {
      await api.patch(`/tasks/${taskId}/status`, { status: 'DONE' });
      window.location.reload();
    } catch {}
  };

  return (
    <ProtectedRoute allowedRoles={['TECHNICAL_MANAGER', 'STRATEGY_MANAGER']}>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">داشبورد فنی</h1>
          <p className="text-text-muted text-sm mt-1">مدیریت پروژه‌ها و دپارتمان‌های فنی</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link href="/dashboard/projects"
            className="group relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:scale-[1.02] block"
            style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(99,102,241,0.05) 100%)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <div className="flex items-center gap-2 text-xs font-medium text-text-muted mb-2">
              <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span>پروژه‌ها</span>
            </div>
            <div className="text-3xl font-bold text-white">{loading ? '-' : stats.projects}</div>
            <div className="mt-1 text-xs text-text-muted">پروژه فعال</div>
          </Link>

          <Link href="/dashboard/departments"
            className="relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:scale-[1.02] block"
            style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.15) 0%, rgba(6,182,212,0.05) 100%)', border: '1px solid rgba(6,182,212,0.2)' }}>
            <div className="flex items-center gap-2 text-xs font-medium text-text-muted mb-2">
              <svg className="w-4 h-4 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <span>دپارتمان‌ها</span>
            </div>
            <div className="text-3xl font-bold text-white">{loading ? '-' : stats.departments}</div>
            <div className="mt-1 text-xs text-text-muted">دپارتمان فنی</div>
          </Link>

          <div className="relative overflow-hidden rounded-2xl p-5 transition-all duration-300"
            style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(245,158,11,0.05) 100%)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <div className="flex items-center gap-2 text-xs font-medium text-text-muted mb-2">
              <svg className="w-4 h-4 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <span>کل تسک‌ها</span>
            </div>
            <div className="text-3xl font-bold text-white">{loading ? '-' : stats.tasks}</div>
            <div className="mt-1 text-xs text-text-muted">در کل سازمان</div>
          </div>

          <Link href="/dashboard/approvals"
            className="relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:scale-[1.02] block"
            style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(168,85,247,0.05) 100%)', border: '1px solid rgba(168,85,247,0.2)' }}>
            <div className="flex items-center gap-2 text-xs font-medium text-text-muted mb-2">
              <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>منتظر تایید</span>
            </div>
            <div className="text-3xl font-bold text-white">{loading ? '-' : stats.pendingApprovals}</div>
            <div className="mt-1 text-xs text-text-muted">نیاز به بررسی</div>
          </Link>
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
              <Link href="/dashboard/departments"
                className="flex items-center gap-3 rounded-xl bg-[rgba(99,102,241,0.08)] border border-[rgba(99,102,241,0.15)] px-4 py-3.5 text-sm font-medium text-primary hover:bg-[rgba(99,102,241,0.15)] transition-all">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                دپارتمان‌ها
              </Link>
              <Link href="/dashboard/projects"
                className="flex items-center gap-3 rounded-xl bg-[rgba(6,182,212,0.08)] border border-[rgba(6,182,212,0.15)] px-4 py-3.5 text-sm font-medium text-secondary hover:bg-[rgba(6,182,212,0.15)] transition-all">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                پروژه‌ها
              </Link>
              <Link href="/dashboard/tech/tasks"
                className="flex items-center gap-3 rounded-xl bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.15)] px-4 py-3.5 text-sm font-medium text-success hover:bg-[rgba(34,197,94,0.15)] transition-all">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                تسک‌های سازمان
              </Link>
              <Link href="/dashboard/analytics/reports"
                className="flex items-center gap-3 rounded-xl bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.15)] px-4 py-3.5 text-sm font-medium text-warning hover:bg-[rgba(245,158,11,0.15)] transition-all">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                تحلیل عمومی
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
      </div>
    </ProtectedRoute>
  );
}
