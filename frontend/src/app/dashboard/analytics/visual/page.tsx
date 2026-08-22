'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import AnalyticsSkeleton from '@/components/analytics/AnalyticsSkeleton';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

export default function VisualAnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/analytics/reports')
      .then(({ data: d }) => setData(d))
      .catch(() => setError('خطا در دریافت داده‌های تحلیل بصری'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <AnalyticsSkeleton />;

  if (error) {
    return (
      <div className="flex h-80 flex-col items-center justify-center gap-3 text-text-muted">
        <p className="text-sm text-red-400">{error}</p>
        <button onClick={() => window.location.reload()} className="rounded-xl bg-primary/10 px-4 py-2 text-xs font-medium text-primary hover:bg-primary/20">
          تلاش مجدد
        </button>
      </div>
    );
  }

  const deptData = (data?.rankings?.departments || []).map((d: any) => ({
    name: d.name,
    totalWeight: d.totalWeight || d.total || 0,
    doneWeight: d.doneWeight || d.done || 0,
    rate: d.completionRate || 0,
  }));

  const projData = (data?.rankings?.projects || []).map((p: any) => ({
    name: p.name,
    spi: p.spi || 1.0,
    completionRate: p.completionRate || 0,
    overdue: p.overdue || 0,
  }));

  const memberData = (data?.rankings?.members || []).map((m: any) => ({
    name: m.name,
    activeWeight: m.activeWeight || m.total || 0,
    done: m.done || 0,
  }));

  const pieData = [
    { name: 'شاخص مطلوب (SPI ≥ 1)', value: projData.filter((p: any) => p.spi >= 1.0).length, color: '#22C55E' },
    { name: 'انحراف جزئی (0.8 ≤ SPI < 1)', value: projData.filter((p: any) => p.spi >= 0.8 && p.spi < 1.0).length, color: '#EAB308' },
    { name: 'بحرانی (SPI < 0.8)', value: projData.filter((p: any) => p.spi < 0.8).length, color: '#EF4444' },
  ].filter(d => d.value > 0);

  const forecastData = data?.prediction?.weeks || [];

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">داشبورد تحلیل بصری (Visual Analytics)</h1>
          <p className="mt-1 text-sm text-text-muted">نمایش گرافیکی شاخص‌های وزنی، سلامت پروژه‌ها و سرعت پیشرفت تیم</p>
        </div>
      </div>

      {/* Grid Chart 1: Department Workload & Completion */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,38,0.6)] p-5">
          <h2 className="mb-4 text-base font-semibold text-white">توزیع وزنی دپارتمان‌ها (ساعت-اولویت)</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} />
                <YAxis stroke="#94A3B8" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1E293B', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', color: '#FFF' }}
                />
                <Bar dataKey="totalWeight" name="وزن کل" fill="#6366F1" radius={[6, 6, 0, 0]} />
                <Bar dataKey="doneWeight" name="وزن انجام‌شده" fill="#22C55E" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Grid Chart 2: Project Health Status (SPI Distribution) */}
        <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,38,0.6)] p-5">
          <h2 className="mb-4 text-base font-semibold text-white">وضعیت سلامت زمانی پروژه‌ها (EVM / SPI)</h2>
          <div className="flex h-72 w-full items-center justify-center">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#1E293B', borderRadius: '12px', color: '#FFF' }} />
                  <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px', color: '#94A3B8' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-text-muted">داده‌ای برای سلامت پروژه‌ها ثبت نشده است</p>
            )}
          </div>
        </div>
      </div>

      {/* Grid Chart 3: Forecast Trend Area Chart */}
      <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,38,0.6)] p-5">
        <h2 className="mb-4 text-base font-semibold text-white">روند هفتگی ساخت در مقابل تکمیل تسک‌ها</h2>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={forecastData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#A855F7" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#A855F7" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorDone" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22C55E" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#22C55E" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="week" stroke="#94A3B8" fontSize={11} />
              <YAxis stroke="#94A3B8" fontSize={12} />
              <Tooltip contentStyle={{ backgroundColor: '#1E293B', borderRadius: '12px', color: '#FFF' }} />
              <Area type="monotone" dataKey="created" name="ایجادشده" stroke="#A855F7" fillOpacity={1} fill="url(#colorCreated)" />
              <Area type="monotone" dataKey="done" name="تکمیل‌شده" stroke="#22C55E" fillOpacity={1} fill="url(#colorDone)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Grid Chart 4: Member Active Workload Bar */}
      <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,38,0.6)] p-5">
        <h2 className="mb-4 text-base font-semibold text-white">سنگینی بار کاری فعال اعضای تیم (ساعت-اولویت)</h2>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={memberData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} />
              <YAxis stroke="#94A3B8" fontSize={12} />
              <Tooltip contentStyle={{ backgroundColor: '#1E293B', borderRadius: '12px', color: '#FFF' }} />
              <Bar dataKey="activeWeight" name="وزن کار فعال" fill="#F59E0B" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
