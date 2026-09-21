'use client';

interface HealthRingProps {
  score: number;
  color: string;
  label: string;
  subtitle?: string;
  size?: number;
}

// Ring geometry lives in viewBox units so the stroke keeps the same proportion
// of the box at every rendered size; only the type scales with `size`.
const VIEWBOX = 160;
const RADIUS = 62;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function HealthRing({ score, color, label, subtitle, size = 176 }: HealthRingProps) {
  const clamped = Math.min(Math.max(score, 0), 100);
  const offset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;
  const scale = size / VIEWBOX;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="h-full w-full -rotate-90" viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}>
        <circle cx="80" cy="80" r={RADIUS} fill="none" stroke="var(--line)" strokeWidth="10" />
        <circle
          cx="80" cy="80" r={RADIUS} fill="none"
          stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center leading-none">
        <span
          className="tnum font-bold text-fg"
          style={{ fontSize: Math.round(38 * scale) }}
        >
          {score}
        </span>
        <span
          className="mt-1 font-medium"
          style={{ color, fontSize: Math.max(9, Math.round(12 * scale)) }}
        >
          {label}
        </span>
        {subtitle && (
          <span className="mt-1 text-fg-muted" style={{ fontSize: Math.max(8, Math.round(10 * scale)) }}>
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
