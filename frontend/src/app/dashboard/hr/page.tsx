'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import StatusChart from '@/components/analytics/StatusChart';
import WorkloadPanel from '@/components/dashboard/WorkloadPanel';
import api from '@/lib/api';
import Link from 'next/link';

const roleLabel: Record<string, string> = {
  CEO: 'مدیر عامل',
  HR_MANAGER: 'مدیر منابع انسانی',
  TECHNICAL_MANAGER: 'مدیر فنی',
  STRATEGY_MANAGER: 'مدیر استراتژی',
  DEPARTMENT_MANAGER: 'مدیر دپارتمان',
  EMPLOYEE: 'کارمند',
  CUSTOMER: 'مشتری',
};

const roleColor: Record<string, string> = {
  CEO: '#6366F1',
  HR_MANAGER: '#EC4899',
  TECHNICAL_MANAGER: '#06B6D4',
  STRATEGY_MANAGER: '#8B5CF6',
  DEPARTMENT_MANAGER: '#F59E0B',
  EMPLOYEE: '#22C55E',
  CUSTOMER: '#94A3B8',
};

export default function HRPage() {
  const [stats, setStats] = useState({ users: 0, departments: 0, projects: 0, roles: 0 });
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  const [reports, setReports] = useState<any>(null);
  const [roleDist, setRoleDist] = useState<any[]>([]);
  const [deptCounts, setDeptCounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [usersRes, deptsRes, projectsRes, reportsRes] = await Promise.all([
          api.get('/users'),
          api.get('/departments'),
          api.get('/projects'),
          api.get('/analytics/reports'),
        ]);
        const users: any[] = usersRes.data;
        const depts: any[] = deptsRes.data;

        const roles = new Set(users.map((u: any) => u.role));
        setStats({
          users: users.length,
          departments: depts.length,
          projects: projectsRes.data.length,
          roles: roles.size,
        });
        setRoleDist(
          Array.from(roles).map((r) => ({
            status: roleLabel[r] || String(r),
            label: roleLabel[r] || String(r),
            count: users.filter((u: any) => u.role === r).length,
            color: roleColor[r] || '#6366F1',
          }))
        );
        setDeptCounts(
          depts
            .map((d: any) => ({
              id: d.id,
              name: d.name,
              count: users.filter((u: any) =>
                (u.departmentMemberships || []).some((m: any) => m.departmentId === d.id || m.department?.id === d.id)
              ).length,
            }))
            .sort((a: any, b: any) => b.count - a.count)
        );
        setReports(reportsRes.data);
        setRecentUsers(users.slice(-4).reverse());
      } catch {}
      setLoading(false);
    };
    fetchAll();
  }, []);

  const maxDeptCount = Math.max(...deptCounts.map((d: any) => d.count), 1);

  return (
    <ProtectedRoute allowedRoles={['HR_MANAGER']}>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">داشبورد منابع انسانی</h1>
          <p className="text-text-muted text-sm mt-1">مدیریت پرسنل و سازمان</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link href="/dashboard/users"
            className="group relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:scale-[1.02] block"
            style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(99,102,241,0.05) 100%)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <div className="flex items-center gap-2 text-xs font-medium text-text-muted mb-2">
              <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span>پرسنل</span>
            </div>
            <div className="text-3xl font-bold text-white">{loading ? '-' : stats.users}</div>
            <div className="mt-1 text-xs text-text-muted">کارمند فعال</div>
          </Link>

          <div className="relative overflow-hidden rounded-2xl p-5 transition-all duration-300"
            style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.15) 0%, rgba(6,182,212,0.05) 100%)', border: '1px solid rgba(6,182,212,0.2)' }}>
            <div className="flex items-center gap-2 text-xs font-medium text-text-muted mb-2">
              <svg className="w-4 h-4 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <span>دپارتمان‌ها</span>
            </div>
            <div className="text-3xl font-bold text-white">{loading ? '-' : stats.departments}</div>
            <div className="mt-1 text-xs text-text-muted">دپارتمان</div>
          </div>

          <Link href="/dashboard/projects"
            className="relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:scale-[1.02] block"
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

          <div className="relative overflow-hidden rounded-2xl p-5 transition-all duration-300"
            style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.15) 0%, rgba(34,197,94,0.05) 100%)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div className="flex items-center gap-2 text-xs font-medium text-text-muted mb-2">
              <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>نقش‌ها</span>
            </div>
            <div className="text-3xl font-bold text-white">{loading ? '-' : stats.roles}</div>
            <div className="mt-1 text-xs text-text-muted">نقش سازمانی</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <WorkloadPanel health={reports?.workloadHealth} title="توازن بار کارکنان" />

          <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,38,0.6)] p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
              <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              توزیع نقش‌ها
            </h3>
            <StatusChart data={roleDist} height={260} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,38,0.6)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <svg className="w-4 h-4 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                پرسنل هر دپارتمان
              </h3>
              <Link href="/dashboard/departments" className="text-xs text-primary hover:text-primary-hover transition-colors">مشاهده همه</Link>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-12 animate-pulse rounded-xl bg-[rgba(255,255,255,0.04)]" />)}
              </div>
            ) : deptCounts.length > 0 ? (
              <div className="space-y-3">
                {deptCounts.map((d: any) => (
                  <div key={d.id} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 truncate text-xs text-white">{d.name}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                      <div className="h-full rounded-full bg-gradient-to-l from-primary to-indigo-400 transition-all duration-500" style={{ width: `${(d.count / maxDeptCount) * 100}%` }} />
                    </div>
                    <span className="w-6 shrink-0 text-left text-xs font-medium text-text-muted">{d.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-text-muted">
                <p className="text-xs">هیچ دپارتمانی وجود ندارد</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,38,0.6)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                آخرین کاربران
              </h3>
              <Link href="/dashboard/users" className="text-xs text-primary hover:text-primary-hover transition-colors">مشاهده همه</Link>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-12 animate-pulse rounded-xl bg-[rgba(255,255,255,0.04)]" />)}
              </div>
            ) : recentUsers.length > 0 ? (
              <div className="space-y-2">
                {recentUsers.map((u: any) => (
                  <div key={u.id} className="flex items-center gap-3 rounded-xl bg-[rgba(22,27,38,0.6)] px-4 py-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0">
                      {u.firstName?.[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">{u.firstName} {u.lastName}</p>
                      <p className="text-xs text-text-muted truncate">{u.email}</p>
                    </div>
                    <span className="shrink-0 text-xs px-2 py-1 rounded-lg bg-[rgba(255,255,255,0.04)] text-text-muted">{roleLabel[u.role] || u.role}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-text-muted">
                <svg className="w-10 h-10 mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <p className="text-xs">هیچ کاربری وجود ندارد</p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,38,0.6)] p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            دسترسی سریع
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Link href="/dashboard/users"
              className="flex items-center gap-3 rounded-xl bg-[rgba(99,102,241,0.08)] border border-[rgba(99,102,241,0.15)] px-4 py-3.5 text-sm font-medium text-primary hover:bg-[rgba(99,102,241,0.15)] transition-all">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              افزودن کاربر
            </Link>
            <Link href="/dashboard/projects"
              className="flex items-center gap-3 rounded-xl bg-[rgba(6,182,212,0.08)] border border-[rgba(6,182,212,0.15)] px-4 py-3.5 text-sm font-medium text-secondary hover:bg-[rgba(6,182,212,0.15)] transition-all">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              پروژه‌ها
            </Link>
            <Link href="/dashboard/analytics"
              className="flex items-center gap-3 rounded-xl bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.15)] px-4 py-3.5 text-sm font-medium text-warning hover:bg-[rgba(245,158,11,0.15)] transition-all">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              تحلیل
            </Link>
            <Link href="/dashboard/departments"
              className="flex items-center gap-3 rounded-xl bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.15)] px-4 py-3.5 text-sm font-medium text-success hover:bg-[rgba(34,197,94,0.15)] transition-all">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              دپارتمان‌ها
            </Link>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
