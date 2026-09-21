'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';
import { useState } from 'react';
import { useChartColors } from '@/lib/chartColors';

interface StatusChartProps {
  data: { status: string; label: string; count: number; color: string }[];
  height?: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-tile bg-card px-3.5 py-2.5 text-xs shadow-float">
      <div className="font-medium text-fg text-sm mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: payload[0].payload.color }} />
        <span className="text-fg-muted">{payload[0].value} تسک</span>
      </div>
    </div>
  );
};

export default function StatusChart({ data, height = 280 }: StatusChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const c = useChartColors();

  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-fg-muted">
        <p className="text-sm">داده‌ای برای نمایش وجود ندارد</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
        <defs>
          {data.map((entry, index) => (
            <linearGradient key={index} id={`stat-grad-${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={entry.color} stopOpacity={0.9} />
              <stop offset="100%" stopColor={entry.color} stopOpacity={0.25} />
            </linearGradient>
          ))}
          <filter id="stat-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke={c.grid} vertical={false} />
        <XAxis
          dataKey="status"
          tick={{ fill: c.axis, fontSize: 11 }}
          axisLine={{ stroke: c.grid }}
          tickLine={false}
          interval={0}
        />
        <YAxis
          tick={{ fill: c.axis, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: c.grid }} />
        <Bar
          dataKey="count"
          radius={[6, 6, 0, 0]}
          barSize={40}
          onMouseEnter={(_, index) => setHoverIndex(index)}
          onMouseLeave={() => setHoverIndex(null)}
        >
          {data.map((entry, index) => (
            <Cell
              key={index}
              fill={`url(#stat-grad-${index})`}
              opacity={hoverIndex === null || hoverIndex === index ? 1 : 0.4}
              filter={hoverIndex === index ? 'url(#stat-glow)' : undefined}
              style={{ transition: 'opacity 0.2s ease' }}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
