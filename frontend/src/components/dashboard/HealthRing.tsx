'use client';

interface HealthRingProps {
  score: number;
  color: string;
  label: string;
  subtitle?: string;
  size?: number;
}

export default function HealthRing({ score, color, label, subtitle, size = 176 }: HealthRingProps) {
  const r = size * 0.3875;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (Math.min(Math.max(score, 0), 100) / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="h-full w-full -rotate-90" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
        <circle
          cx="80" cy="80" r={r} fill="none"
          stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-4xl font-bold text-white">{score}</span>
        <span className="mt-1 text-[11px] font-medium" style={{ color }}>{label}</span>
        {subtitle && <span className="mt-1 text-[10px] text-text-muted">{subtitle}</span>}
      </div>
    </div>
  );
}
