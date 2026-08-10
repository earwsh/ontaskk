'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import AnalyticsSkeleton from '@/components/analytics/AnalyticsSkeleton';
import { useToast } from '@/components/Toast';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

interface MetricBoxProps {
  label: string;
  value: string | number;
  unit?: string;
  icon: React.ReactNode;
  bg: string;
}

function MetricBox({ label, value, unit, icon, bg }: MetricBoxProps) {
  return (
    <div className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-5 flex items-center justify-between">
      <div>
        <span className="text-text-secondary text-xs block mb-1">{label}</span>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-white tracking-tight">{value}</span>
          {unit && <span className="text-xs text-text-muted">{unit}</span>}
        </div>
      </div>
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${bg} shrink-0`}>
        {icon}
      </div>
    </div>
  );
}

export default function ScrumPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const { showToast } = useToast();

  const fetchScrumData = async (projId: string) => {
    setLoading(true);
    try {
      const url = projId ? `/analytics/scrum?projectId=${projId}` : '/analytics/scrum';
      const { data: scrum } = await api.get(url);
      setData(scrum);
    } catch (err) {
      setError('خطا در دریافت اطلاعات آماری اسکرام');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get('/projects')
      .then(({ data: projs }) => setProjects(projs))
      .catch(() => {});
    
    fetchScrumData(selectedProjectId);
  }, [selectedProjectId]);

  if (loading) return <AnalyticsSkeleton />;

  if (error || !data) {
    return (
      <div className="flex h-80 flex-col items-center justify-center gap-3 text-text-muted">
        <svg className="h-12 w-12 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <p className="text-sm">{error}</p>
        <button onClick={() => fetchScrumData(selectedProjectId)} className="cursor-pointer rounded-xl bg-primary/10 px-4 py-2 text-xs font-medium text-primary transition-all duration-200 hover:bg-primary/20">تلاش مجدد</button>
      </div>
    );
  }

  const { metrics, capacity, velocity, bottlenecks, burndown } = data;

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">اسکرام و ظرفیت کاری</h1>
          <p className="mt-1 text-sm text-text-muted">تحلیل سرعت تیم، زمان‌های چرخه، توزیع ظرفیت هفتگی و بار کاری</p>
        </div>
        <div>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-4 py-2 bg-[rgba(22,27,38,0.6)] border border-[rgba(255,255,255,0.08)] rounded-xl text-white outline-none text-sm cursor-pointer min-w-[200px]"
          >
            <option value="">همه پروژه‌ها</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricBox
          label="زمان چرخه متوسط (Cycle Time)"
          value={metrics.avgCycleTimeDays}
          unit=" روز"
          bg="bg-blue-500/10 text-blue-400"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <MetricBox
          label="زمان پاسخ‌دهی متوسط (Lead Time)"
          value={metrics.avgLeadTimeDays}
          unit=" روز"
          bg="bg-cyan-500/10 text-cyan-400"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5H19M19 5V11M19 5L11 13L7 9L2 14" />
            </svg>
          }
        />
        <MetricBox
          label="کارهای تکمیل شده"
          value={metrics.completedCount}
          unit=" تسک"
          bg="bg-green-500/10 text-green-400"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <MetricBox
          label="تسک‌های فعال (جاری)"
          value={metrics.activeCount}
          unit=" تسک"
          bg="bg-yellow-500/10 text-yellow-400"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-5 flex flex-col">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white">نمودار Burndown اسپریت</h3>
            <p className="text-xs text-text-muted mt-0.5">روند سوختن کارهای باقی‌مانده (دقیقه/وزن) در مقابل برنامه ایده‌آل</p>
          </div>
          <div className="h-[280px] w-full text-xs font-sans">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={burndown} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="dayLabel" stroke="#94A3B8" />
                <YAxis stroke="#94A3B8" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(22, 27, 38, 0.95)', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '12px' }}
                  labelStyle={{ color: '#fff' }}
                />
                <Legend verticalAlign="top" height={36} />
                <Line name="باقی‌مانده ایده‌آل (وزن)" type="monotone" dataKey="ideal" stroke="rgba(99, 102, 241, 0.4)" strokeDasharray="5 5" strokeWidth={2} dot={false} />
                <Line name="باقی‌مانده واقعی (وزن)" type="monotone" dataKey="actual" stroke="#22C55E" strokeWidth={3} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-5 flex flex-col">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white">سرعت تکمیل تسک‌ها (Velocity)</h3>
            <p className="text-xs text-text-muted mt-0.5">مجموع وزن تسک‌های تکمیل و تایید شده در طول هفته‌های اخیر</p>
          </div>
          <div className="h-[280px] w-full text-xs font-sans">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={velocity} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="weekLabel" stroke="#94A3B8" />
                <YAxis stroke="#94A3B8" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(22, 27, 38, 0.95)', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '12px' }}
                  labelStyle={{ color: '#fff' }}
                />
                <Legend verticalAlign="top" height={36} />
                <Bar name="وزن کار تایید شده (دقیقه)" dataKey="completedWeight" fill="url(#velocityColor)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <svg width={0} height={0}>
              <defs>
                <linearGradient id="velocityColor" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366F1" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#818CF8" stopOpacity={0.2}/>
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white">تخصیص ظرفیت هفتگی انجام‌دهندگان</h3>
            <p className="text-xs text-text-muted mt-0.5">بار کاری هفتگی بر اساس قانون ۲۴۰۰ وزن کاری در هفته (۵ روز * ۴۸۰ دقیقه)</p>
          </div>
          <div className="space-y-3.5">
            {capacity.map((c: any) => {
              const pct = c.utilization;
              const isOver = c.isOverloaded;
              const barColor = isOver
                ? 'from-red-500 to-rose-400'
                : pct > 80
                ? 'from-yellow-500 to-amber-400'
                : 'from-primary to-indigo-400';
              
              return (
                <div key={c.userId} className="bg-[rgba(22,27,38,0.6)] rounded-xl px-4 py-3 border border-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.06)] transition-all">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{c.name}</span>
                      <span className="text-[10px] bg-white/5 border border-white/10 px-2 py-0.5 rounded text-text-muted">{c.role === 'EMPLOYEE' ? 'کارمند' : 'مدیر'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-text-secondary">{c.activeTasksCount} تسک فعال</span>
                      <span className="text-xs font-mono text-white">{c.allocatedWeight} / {c.capacity} وزن</span>
                      <span className={`text-xs font-bold ${isOver ? 'text-red-400 animate-pulse' : 'text-text-muted'}`}>{pct}%</span>
                    </div>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden relative">
                    <div className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-700`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                  {isOver && (
                    <div className="flex items-center gap-1 mt-1.5 text-[10px] text-red-400">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      <span>کاربر دچار سرریز ظرفیت کاری است! بار کاری را بازبینی کنید.</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-4 bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white">گلوگاه‌های بار کاری</h3>
            <p className="text-xs text-text-muted mt-0.5">بیشترین حجم کارهای معلق بر حسب افراد انجام‌دهنده</p>
          </div>
          <div className="space-y-3">
            {bottlenecks.map((b: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-[rgba(22,27,38,0.6)] border border-[rgba(255,255,255,0.02)]">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-white block truncate">{b.name}</span>
                  <span className="text-xs text-text-muted">{b.activeTasks} تسک در جریان</span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono font-medium block text-white">{b.allocatedWeight} دقیقه</span>
                  <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded font-bold mt-1 ${
                    b.severity === 'HIGH'
                      ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                      : b.severity === 'MEDIUM'
                      ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                      : 'bg-white/5 text-text-muted'
                  }`}>
                    {b.severity === 'HIGH' ? 'فشار کاری بالا' : b.severity === 'MEDIUM' ? 'متوسط' : 'عادی'}
                  </span>
                </div>
              </div>
            ))}
            {bottlenecks.length === 0 && (
              <p className="text-text-muted text-xs text-center py-6">گلوگاهی ثبت نشده است</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
