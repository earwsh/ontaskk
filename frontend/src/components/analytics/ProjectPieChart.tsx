'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useState } from 'react';

interface ProjectPieChartProps {
  data: { projectName: string; total: number; color?: string }[];
  height?: number;
}

const DEFAULT_COLORS = ['#6366F1', '#06B6D4', '#D97706', '#EF4444', '#22C55E', '#EC4899', '#8B5CF6', '#14B8A6'];

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      className="rounded-xl border border-[rgba(255,255,255,0.08)] px-3.5 py-2.5 text-xs shadow-lg backdrop-blur-xl"
      style={{ background: 'rgba(18,22,33,0.95)' }}
    >
      <div className="font-medium text-white text-sm mb-1">{d.projectName}</div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
        <span className="text-text-muted">{d.total} تسک</span>
      </div>
    </div>
  );
};

export default function ProjectPieChart({ data, height = 300 }: ProjectPieChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-text-muted">
        <p className="text-sm">داده‌ای برای نمایش وجود ندارد</p>
      </div>
    );
  }

  const dataWithColors = data.map((d, i) => ({
    ...d,
    color: d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  }));

  const total = dataWithColors.reduce((sum, d) => sum + d.total, 0);

  return (
    <div className="flex flex-col items-center">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <defs>
            <filter id="pie-glow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <Pie
            data={dataWithColors}
            cx="50%"
            cy="50%"
            outerRadius={hoverIndex !== null ? 105 : 95}
            innerRadius={55}
            dataKey="total"
            nameKey="projectName"
            animationBegin={0}
            animationDuration={800}
            animationEasing="ease-out"
            onMouseEnter={(_, index) => setHoverIndex(index)}
            onMouseLeave={() => setHoverIndex(null)}
            style={{ transition: 'all 0.3s ease' }}
          >
            {dataWithColors.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.color}
                opacity={hoverIndex === null || hoverIndex === index ? 0.9 : 0.3}
                stroke={hoverIndex === index ? entry.color : 'transparent'}
                strokeWidth={hoverIndex === index ? 2 : 0}
                filter={hoverIndex === index ? 'url(#pie-glow)' : undefined}
                style={{ transition: 'all 0.3s ease' }}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 px-4 -mt-2" dir="ltr">
        {dataWithColors.map((entry, index) => (
          <div
            key={index}
            className="flex items-center gap-1.5 text-xs cursor-pointer transition-opacity duration-200"
            style={{ opacity: hoverIndex === null || hoverIndex === index ? 1 : 0.4 }}
            onMouseEnter={() => setHoverIndex(index)}
            onMouseLeave={() => setHoverIndex(null)}
          >
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="text-text-muted truncate max-w-[120px]">{entry.projectName}</span>
            <span className="text-text-secondary font-medium">{((entry.total / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
