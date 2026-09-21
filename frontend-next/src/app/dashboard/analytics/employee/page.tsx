'use client';

import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import StatusChart from '@/components/analytics/StatusChart';
import ProjectPieChart from '@/components/analytics/ProjectPieChart';
import ProgressCard from '@/components/analytics/ProgressCard';
import AnalyticsSkeleton from '@/components/analytics/AnalyticsSkeleton';

const COLORS = ['#6366F1', '#06B6D4', '#D97706', '#EF4444', '#22C55E', '#EC4899', '#8B5CF6', '#14B8A6'];

export default function AnalyticsEmployeePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/analytics/me')
      .then(({ data: d }) => setData(d))
      .catch(() => setError('خطا در دریافت داده‌ها'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <AnalyticsSkeleton />;

  if (error) {
    return (
      <div className="flex h-80 flex-col items-center justify-center gap-3 text-fg-muted">
        <svg className="h-12 w-12 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <p className="text-sm">{error}</p>
        <button onClick={() => window.location.reload()} className="cursor-pointer rounded-xl bg-primary/10 px-4 py-2 text-xs font-medium text-brand-ink transition-all duration-200 hover:bg-primary/20">تلاش مجدد</button>
      </div>
    );
  }

  const statusData = data ? [
    { status: 'انجام نشده', label: 'انجام نشده', count: data.todo, color: '#F59E0B' },
    { status: 'در حال انجام', label: 'در حال انجام', count: data.inProgress, color: '#3B82F6' },
    { status: 'منتظر تایید', label: 'منتظر تایید', count: data.pendingApproval, color: '#A855F7' },
    { status: 'تکمیل شده', label: 'تکمیل شده', count: data.done, color: '#22C55E' },
  ] : [];

  const pieData = data?.projectBreakdown?.map((p: any) => ({
    projectName: p.projectName,
    total: p.total,
  })) || [];

  const pieDataWithColors = pieData.map((p: any, i: number) => ({
    ...p,
    color: COLORS[i % COLORS.length],
  }));

  return (
    <ProtectedRoute allowedRoles={['EMPLOYEE']}>
      <div className="space-y-3">
        <p className="text-xs text-fg-muted">روند عملکرد و وضعیت تسک‌های شما</p>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <ProgressCard
            label="کل تسک‌ها"
            value={data?.total || 0}
            icon={
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            }
            tone="brand"
          />
          <ProgressCard label="در حال انجام" value={data?.inProgress || 0} tone="info" />
          <ProgressCard label="منتظر تایید" value={data?.pendingApproval || 0} tone="violet" trend={data?.pendingApproval > 0 ? 'up' : 'neutral'} />
          <ProgressCard
            label="تکمیل شده"
            value={data?.completionRate || 0}
            suffix="%"
            tone="ok"
            subtitle={`${data?.done || 0} از ${data?.total || 0}`}
            trend={data?.completionRate >= 50 ? 'up' : 'down'}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-card shadow-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-fg">توزیع وضعیت</h3>
            <StatusChart data={statusData} />
          </div>

          {pieDataWithColors.length > 0 && (
            <div className="rounded-2xl bg-card shadow-card p-5">
              <h3 className="mb-4 text-sm font-semibold text-fg">توزیع بر اساس پروژه</h3>
              <ProjectPieChart data={pieDataWithColors} />
            </div>
          )}
        </div>

        {data?.projectBreakdown?.length > 0 && (
          <div className="rounded-2xl bg-card shadow-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-fg">پیشرفت بر اساس پروژه</h3>
            <div className="space-y-2">
              {data.projectBreakdown.map((p: any) => (
                <div key={p.projectId} className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 transition-all duration-200 hover:bg-card-hover">
                  <span className="flex-1 truncate text-sm text-fg">{p.projectName}</span>
                  <div className="h-2 w-40 shrink-0 overflow-hidden rounded-full bg-hover">
                    <div className="h-full rounded-full bg-gradient-to-r from-primary to-indigo-400 transition-all duration-500" style={{ width: `${p.completionRate}%` }} />
                  </div>
                  <span className="w-12 shrink-0 text-left text-xs text-fg-muted">{p.completionRate}%</span>
                  <span className="shrink-0 text-xs text-ok">({p.done}/{p.total})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(!data?.projectBreakdown || data.projectBreakdown.length === 0) && (
          <div className="flex flex-col items-center justify-center rounded-2xl bg-card shadow-card px-6 py-12">
            <svg className="mb-3 h-16 w-16 text-fg-muted opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <p className="text-sm text-fg-muted">هنوز تسکی به شما اختصاص داده نشده</p>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
