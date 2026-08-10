'use client';

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

interface PredictionChartProps {
  prediction: {
    weeks?: { week: string; created: number; done: number }[];
    forecast?: { week: string; projectedDone: number }[];
    totalDone?: number;
    totalOpen?: number;
    text?: string;
  } | null;
  height?: number;
}

const formatWeek = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' });
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.08)] px-3.5 py-2.5 text-xs shadow-lg backdrop-blur-xl" style={{ background: 'rgba(18,22,33,0.95)' }}>
      <div className="mb-1 font-medium text-white">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
          <span className="text-text-muted">{p.name}: {p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function PredictionChart({ prediction, height = 280 }: PredictionChartProps) {
  if (!prediction) {
    return <div className="py-10 text-center text-xs text-text-muted">پیش‌بینی در دسترس نیست</div>;
  }

  const weeks = prediction.weeks || [];
  const forecast = prediction.forecast || [];
  const lastDone = weeks.length > 0 ? weeks[weeks.length - 1] : null;

  const data: { week: string; 'ایجاد شده': number; 'تکمیل شده': number; 'پیش‌بینی'?: number }[] = weeks.map((w, i) => {
    const fc = forecast.find((f) => new Date(f.week).getTime() === new Date(w.week).getTime());
    return {
      week: formatWeek(w.week),
      'ایجاد شده': w.created,
      'تکمیل شده': w.done,
      ...(fc ? { 'پیش‌بینی': fc.projectedDone } : {}),
    };
  });

  forecast.forEach((f) => {
    const exists = data.some((d) => d.week === formatWeek(f.week));
    if (!exists) data.push({ week: formatWeek(f.week), 'ایجاد شده': 0, 'تکمیل شده': 0, 'پیش‌بینی': f.projectedDone });
  });

  const hasData = weeks.some((w) => w.created > 0 || w.done > 0);
  const hasForecast = forecast.length > 0;

  return (
    <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,38,0.6)] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          روند و پیش‌بینی تکمیل (۹۰ روز اخیر)
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-text-muted">
          {prediction.totalDone !== undefined && (
            <span className="rounded-lg bg-[rgba(255,255,255,0.04)] px-2 py-1">تکمیل شده: {prediction.totalDone}</span>
          )}
          {prediction.totalOpen !== undefined && (
            <span className="rounded-lg bg-[rgba(255,255,255,0.04)] px-2 py-1">باز: {prediction.totalOpen}</span>
          )}
        </div>
      </div>

      {hasData || hasForecast ? (
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
            <defs>
              <linearGradient id="pred-created" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366F1" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#6366F1" stopOpacity={0.2} />
              </linearGradient>
              <linearGradient id="pred-done" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22C55E" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#22C55E" stopOpacity={0.2} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="week" tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={{ stroke: 'rgba(255,255,255,0.06)' }} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Bar dataKey="ایجاد شده" fill="url(#pred-created)" radius={[4, 4, 0, 0]} barSize={12} />
            <Bar dataKey="تکمیل شده" fill="url(#pred-done)" radius={[4, 4, 0, 0]} barSize={12} />
            {hasForecast && (
              <Line type="monotone" dataKey="پیش‌بینی" stroke="#A855F7" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3, fill: '#A855F7' }} activeDot={{ r: 5 }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <div className="py-10 text-center text-xs text-text-muted">داده‌ای برای رسم روند وجود ندارد</div>
      )}

      {prediction.text && (
        <div className="mt-4 rounded-xl border border-[rgba(255,255,255,0.04)] bg-[rgba(255,255,255,0.02)] px-3.5 py-3 text-xs leading-relaxed text-text-secondary">
          {prediction.text}
        </div>
      )}
    </div>
  );
}
