'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import StatusChart from '@/components/analytics/StatusChart';
import ProjectPieChart from '@/components/analytics/ProjectPieChart';
import ProgressCard from '@/components/analytics/ProgressCard';
import AnalyticsSkeleton from '@/components/analytics/AnalyticsSkeleton';
import InsightCards from '@/components/analytics/InsightCards';
import RankingsPanel from '@/components/analytics/RankingsPanel';
import ServiceBadge from '@/components/dashboard/ServiceBadge';
import WorkloadPanel from '@/components/dashboard/WorkloadPanel';

const COLORS = ['#6366F1', '#06B6D4', '#D97706', '#EF4444', '#22C55E', '#EC4899', '#8B5CF6', '#14B8A6'];

export default function AnalyticsTechnicalPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/analytics/technical')
      .then(({ data: d }) => setData(d))
      .catch(() => setError('خطا در دریافت داده‌ها'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <AnalyticsSkeleton />;

  if (error) {
    return (
      <div className="flex h-80 flex-col items-center justify-center gap-3 text-text-muted">
        <svg className="h-12 w-12 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <p className="text-sm">{error}</p>
        <button onClick={() => window.location.reload()} className="cursor-pointer rounded-xl bg-primary/10 px-4 py-2 text-xs font-medium text-primary transition-all duration-200 hover:bg-primary/20">تلاش مجدد</button>
      </div>
    );
  }

  const statusData = data ? [
    { status: 'انجام نشده', label: 'انجام نشده', count: data.todo, color: '#F59E0B' },
    { status: 'در حال انجام', label: 'در حال انجام', count: data.inProgress, color: '#3B82F6' },
    { status: 'منتظر تایید', label: 'منتظر تایید', count: data.pendingApproval, color: '#A855F7' },
    { status: 'تکمیل شده', label: 'تکمیل شده', count: data.done, color: '#22C55E' },
  ] : [];

  const pieData = data?.projectBreakdown?.map((p: any) => ({ projectName: p.projectName, total: p.total })) || [];
  const pieDataWithColors = pieData.map((p: any, i: number) => ({ ...p, color: COLORS[i % COLORS.length] }));
  const deptBarData = data?.deptBreakdown?.map((d: any) => ({ status: d.deptName, label: d.deptName, count: d.total, color: '#6366F1' })) || [];

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">تحلیل جامع فنی</h1>
          <p className="mt-1 text-sm text-text-muted">نمای کلی تسک‌ها، پروژه‌ها و دپارتمان‌ها در محدوده «{data?.scopeLabel}»</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ServiceBadge name="پایتون" ok={Boolean(data?.computedBy?.py || data?.computedBy === 'python' || data?.insights?.findings?.length || data?.rankings?.projects?.length || data?.counts?.total)} />
          <ServiceBadge name="راست" ok={Boolean(data?.workloadHealth?.memberCount)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ProgressCard label="کل تسک‌ها" value={data?.total || 0} color="#6366F1" subtitle={`${data?.deptBreakdown?.length || 0} دپارتمان`} />
        <ProgressCard label="تکمیل شده" value={data?.completionRate || 0} suffix="٪" color="#22C55E" subtitle={`${data?.done || 0} از ${data?.total || 0}`} trend={data?.completionRate >= 50 ? 'up' : 'down'} />
        <ProgressCard label="منتظر تایید" value={data?.pendingApprovals || 0} color="#A855F7" trend={data?.pendingApprovals > 0 ? 'up' : 'neutral'} />
        <ProgressCard label="پروژه‌ها" value={data?.projectBreakdown?.length || 0} color="#06B6D4" />
      </div>

      <InsightCards
        findings={data?.insights?.findings || []}
        risks={data?.insights?.risks || []}
        recommendations={data?.insights?.recommendations || []}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,38,0.6)] p-5">
          <h3 className="mb-4 text-sm font-semibold text-white">توزیع وضعیت</h3>
          <StatusChart data={statusData} />
        </div>

        {pieDataWithColors.length > 0 && (
          <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,38,0.6)] p-5">
            <h3 className="mb-4 text-sm font-semibold text-white">توزیع بر اساس پروژه</h3>
            <ProjectPieChart data={pieDataWithColors} />
          </div>
        )}
      </div>

      {deptBarData.length > 0 && (
        <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,38,0.6)] p-5">
          <h3 className="mb-4 text-sm font-semibold text-white">تعداد تسک بر اساس دپارتمان</h3>
          <StatusChart data={deptBarData} />
        </div>
      )}

      {data?.projectBreakdown?.length > 0 && (
        <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,38,0.6)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">پیشرفت پروژه‌ها</h3>
            <span className="text-xs text-text-muted">{data.projectBreakdown.filter((p: any) => p.completionRate >= 100).length} کامل</span>
          </div>
          <div className="space-y-2">
            {data.projectBreakdown.map((p: any) => (
              <div key={p.projectId} className="flex items-center gap-3 rounded-xl bg-[rgba(22,27,38,0.6)] px-4 py-3 transition-all duration-200 hover:bg-[rgba(30,37,52,0.6)]">
                <span className="flex-1 truncate text-sm text-white">{p.projectName}</span>
                <span className="shrink-0 text-xs text-text-muted">{p.total} تسک</span>
                <div className="h-2 w-28 shrink-0 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary to-indigo-400 transition-all duration-500" style={{ width: `${p.completionRate}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right text-xs text-text-muted">{p.completionRate}٪</span>
                <span className="shrink-0 text-xs text-green-400">{p.done} تکمیل</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RankingsPanel type="projects" items={data?.rankings?.projects || []} averages={data?.rankings?.averages} />
        <RankingsPanel type="members" items={data?.rankings?.members || []} averages={data?.rankings?.averages} />
      </div>

      {data?.workloadHealth?.memberCount ? (
        <WorkloadPanel health={data.workloadHealth} title="توازن بار کاری (راست)" />
      ) : (
        <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,38,0.6)] p-5 text-center text-xs text-text-muted">
          سرویس راست در دسترس نیست
        </div>
      )}
    </div>
  );
}
