'use client';

interface MiniStatProps {
  label: string;
  value: string | number;
  color?: string;
}

export default function MiniStat({ label, value, color = '#FFFFFF' }: MiniStatProps) {
  return (
    <div className="rounded-lg bg-[rgba(255,255,255,0.02)] px-2 py-2">
      <div className="mb-1 text-[10px] text-text-muted">{label}</div>
      <div className="text-sm font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
