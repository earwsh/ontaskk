'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import ProgressCard from '@/components/analytics/ProgressCard';
import AnalyticsSkeleton from '@/components/analytics/AnalyticsSkeleton';
import InsightCards from '@/components/analytics/InsightCards';
import RankingsPanel from '@/components/analytics/RankingsPanel';
import PredictionChart from '@/components/analytics/PredictionChart';
import ProjectRiskList from '@/components/dashboard/ProjectRiskList';
import ServiceBadge from '@/components/dashboard/ServiceBadge';
import WorkloadPanel from '@/components/dashboard/WorkloadPanel';

export default function AnalyticsReportsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/analytics/reports')
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

  const counts = data?.counts || {};
  const computed = data?.computedBy || {};
  const health = data?.workloadHealth;
  const projAgg = data?.projectAggregate;

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">گزارشات سازمان</h1>
          <p className="mt-1 text-sm text-text-muted">تحلیل آماری، رتبه‌بندی و پیش‌بینی در محدوده «{data?.scopeLabel}»</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ServiceBadge name="پایتون" ok={Boolean(computed.py ?? (data?.insights?.findings?.length || data?.rankings?.projects?.length || counts.total !== undefined))} />
          <ServiceBadge name="راست" ok={Boolean(computed.rs)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ProgressCard label="کل تسک‌ها" value={counts.total || 0} color="#6366F1" subtitle="در محدوده فعلی" />
        <ProgressCard label="نرخ تکمیل" value={counts.completionRate || 0} suffix="٪" color="#22C55E" subtitle={`${counts.done || 0} از ${counts.total || 0}`} trend={(counts.completionRate || 0) >= 50 ? 'up' : 'down'} />
        <ProgressCard label="دیرکرد" value={counts.overdue || 0} color="#EF4444" trend={(counts.overdue || 0) > 0 ? 'down' : 'neutral'} />
        <ProgressCard label="منتظر تایید" value={counts.pending || 0} color="#A855F7" trend={(counts.pending || 0) > 0 ? 'up' : 'neutral'} />
      </div>

      <InsightCards
        findings={data?.insights?.findings || []}
        risks={data?.insights?.risks || []}
        recommendations={data?.insights?.recommendations || []}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <RankingsPanel type="departments" items={data?.rankings?.departments || []} averages={data?.rankings?.averages} />
        <RankingsPanel type="projects" items={data?.rankings?.projects || []} averages={data?.rankings?.averages} />
        <RankingsPanel type="members" items={data?.rankings?.members || []} averages={data?.rankings?.averages} />
      </div>

      {data?.prediction && <PredictionChart prediction={data.prediction} />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <WorkloadPanel health={health} />
        <ProjectRiskList projects={projAgg?.projects || []} />
      </div>
    </div>
  );
}
