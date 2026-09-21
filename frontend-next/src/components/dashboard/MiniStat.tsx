'use client';

interface MiniStatProps {
  label: string;
  value: string | number;
  color?: string;
}

export default function MiniStat({ label, value, color }: MiniStatProps) {
  return (
    <div className="rounded-lg bg-sunken px-2 py-2">
      <div className="mb-1 text-[10px] text-fg-muted">{label}</div>
      <div className="tnum text-sm font-bold text-fg" style={color ? { color } : undefined}>{value}</div>
    </div>
  );
}
