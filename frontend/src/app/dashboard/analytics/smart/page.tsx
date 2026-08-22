'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import AnalyticsSkeleton from '@/components/analytics/AnalyticsSkeleton';
import InsightCards from '@/components/analytics/InsightCards';
import PredictionChart from '@/components/analytics/PredictionChart';
import HealthRing from '@/components/dashboard/HealthRing';
import MiniStat from '@/components/dashboard/MiniStat';
import ServiceBadge from '@/components/dashboard/ServiceBadge';

export default function AnalyticsSmartPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/analytics/smart')
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

  const score = data?.healthScore ?? 0;
  const level = data?.level || 'warning';
  const levelColor = level === 'good' ? '#22C55E' : level === 'warning' ? '#F59E0B' : '#EF4444';
  const levelLabel = level === 'good' ? 'سلامت خوب' : level === 'warning' ? 'نیاز به توجه' : 'وضعیت بحرانی';
  const computed = data?.computedBy || {};
  const team = data?.teamStatus || {};
  const snapshot = data?.snapshot || {};

  const findings = (data?.findings || []).map((f: any) => ({ severity: f.severity, text: f.text }));
  const risks = (data?.warnings || []).map((w: string) => ({ severity: 'warning', text: w }));
  const recommendations = (data?.recommendations || []).map((r: string) => ({ text: r }));

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">تحلیل هوشمند</h1>
          <p className="mt-1 text-sm text-text-muted">ارزیابی سلامت، ریسک و پیشنهادهای عملی در محدوده «{data?.scopeLabel}»</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ServiceBadge name="پایتون" ok={Boolean(computed.py ?? (data?.findings?.length || data?.projectStatuses?.length || data?.healthScore !== undefined))} />
          <ServiceBadge name="راست" ok={Boolean(computed.rs)} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,38,0.6)] p-6">
          <HealthRing score={score} color={levelColor} label={levelLabel} />
          <div className="mt-4 rounded-xl border border-[rgba(255,255,255,0.04)] bg-[rgba(255,255,255,0.02)] px-3.5 py-3 text-center text-xs leading-relaxed text-text-secondary">
            {snapshot.text || 'هنوز داده‌ای برای تحلیل وجود ندارد.'}
          </div>
        </div>

        <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,38,0.6)] p-5 lg:col-span-2">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
            <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            سلامت پروژه‌ها
          </h3>
          {data?.projectStatuses?.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {data.projectStatuses.map((p: any) => (
                <div key={p.projectId} className="rounded-xl bg-[rgba(22,27,38,0.6)] px-3.5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-xs font-medium text-white">{p.name}</span>
                    <span className={`shrink-0 text-[10px] font-medium ${p.status === 'critical' ? 'text-red-400' : p.status === 'warning' ? 'text-amber-400' : 'text-green-400'}`}>
                      {p.status === 'critical' ? 'بحرانی' : p.status === 'warning' ? 'نیاز به توجه' : 'سالم'}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${p.score || 0}%`, backgroundColor: (p.score || 0) >= 70 ? '#22C55E' : (p.score || 0) >= 40 ? '#F59E0B' : '#EF4444' }} />
                    </div>
                    <span className="w-8 shrink-0 text-left text-xs font-medium text-text-muted">{Math.round(p.score || 0)}</span>
                  </div>
                  {p.keyIssue && <div className="mt-1.5 text-[11px] text-text-muted">{p.keyIssue}</div>}
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-text-muted">پروژه‌ای وجود ندارد</div>
          )}

          <h3 className="mb-3 mt-6 flex items-center gap-2 text-sm font-semibold text-white">
            <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            وضعیت تیم
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniStat label="اعضا" value={team.memberCount ?? 0} />
            <MiniStat label="پرکار" value={team.overloaded ?? 0} color={(team.overloaded ?? 0) > 0 ? '#EF4444' : '#22C55E'} />
            <MiniStat label="کم‌بار" value={team.underloaded ?? 0} color={(team.underloaded ?? 0) > 0 ? '#F59E0B' : '#22C55E'} />
            <MiniStat label="ضریب جینی" value={team.giniCoefficient ?? 0} />
          </div>
          {data?.workloadNarrative && (
            <div className="mt-3 rounded-xl border border-[rgba(255,255,255,0.04)] bg-[rgba(255,255,255,0.02)] px-3.5 py-3 text-xs leading-relaxed text-text-secondary">
              {data.workloadNarrative}
            </div>
          )}
        </div>
      </div>

      <InsightCards findings={findings} risks={risks} recommendations={recommendations} />

      {data?.prediction && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Sprint Success Card */}
            <div className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-5 flex flex-col justify-between">
              <div>
                <span className="text-text-secondary text-xs block mb-1">احتمال موفقیت اسپرینت (پایتون 🐍)</span>
                <span className="text-2xl font-bold text-white font-mono">{data.prediction.sprintSuccessProbability}%</span>
              </div>
              <div className="mt-3">
                <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-500" 
                    style={{ 
                      width: `${data.prediction.sprintSuccessProbability}%`,
                      backgroundColor: data.prediction.sprintSuccessProbability > 75 ? '#22C55E' : data.prediction.sprintSuccessProbability > 45 ? '#F59E0B' : '#EF4444' 
                    }} 
                  />
                </div>
                <span className="text-[10px] text-text-muted mt-1.5 block">احتمال تحویل به موقع وظایف فعال بر اساس سرعت فعلی</span>
              </div>
            </div>

            {/* Estimated Completion Card */}
            <div className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-5 flex items-center justify-between">
              <div>
                <span className="text-text-secondary text-xs block mb-1">تاریخ اتمام تخمینی پروژه</span>
                <span className="text-sm font-semibold text-white mt-1 block">
                  {data.prediction.estimatedProjectCompletionDate 
                    ? new Date(data.prediction.estimatedProjectCompletionDate).toLocaleDateString('fa-IR', { dateStyle: 'long' })
                    : 'نامشخص'}
                </span>
                <span className="text-[10px] text-text-muted mt-1 block font-mono">براساس سرعت تکمیل و حجم کارهای باز</span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>

            {/* Recommended Speed Card */}
            <div className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-5 flex items-center justify-between">
              <div>
                <span className="text-text-secondary text-xs block mb-1">سرعت پردازش روزانه پیشنهادی</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-white font-mono">{data.prediction.recommendedDailyThroughput}</span>
                  <span className="text-[10px] text-text-muted">دقیقه / وزن در روز</span>
                </div>
                <span className="text-[10px] text-text-muted mt-1 block">حداقل سرعت تیمی مورد نیاز برای اتمام کارها در ۲ هفته</span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>
          </div>

          <PredictionChart prediction={data.prediction} />
        </div>
      )}
    </div>
  );
}
