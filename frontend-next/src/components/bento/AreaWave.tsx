'use client';

import { useId, useState } from 'react';

export interface WavePoint {
  label: string;
  value: number;
}

/**
 * Smooth area chart.
 *
 * Points are joined with Catmull-Rom segments converted to cubic béziers, so
 * the line reads as one continuous wave instead of a polyline. The control
 * points are clamped to the plot band so a spike between two low values can
 * never bow the curve below the baseline.
 */
function smoothPath(pts: { x: number; y: number }[], top: number, bottom: number): string {
  if (pts.length < 2) return '';
  const clamp = (v: number) => Math.min(bottom, Math.max(top, v));
  let d = `M ${pts[0].x} ${pts[0].y}`;

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;

    // Catmull-Rom (tension 0.5) → cubic bézier control points
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = clamp(p1.y + (p2.y - p0.y) / 6);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = clamp(p2.y - (p3.y - p1.y) / 6);

    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

const W = 100;
const H = 40;
const PAD = 3;

export default function AreaWave({
  points, height = 120, unit = '',
}: { points: WavePoint[]; height?: number; unit?: string }) {
  const gid = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2) {
    return <p className="py-10 text-center text-xs text-fg-muted">داده کافی برای نمودار نیست</p>;
  }

  const max = Math.max(...points.map((p) => p.value));
  const min = Math.min(...points.map((p) => p.value));
  const span = max - min || 1;

  const pts = points.map((p, i) => ({
    x: (i / (points.length - 1)) * W,
    y: PAD + (1 - (p.value - min) / span) * (H - PAD * 2),
  }));

  const line = smoothPath(pts, PAD, H - PAD);
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  const active = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height }}
        role="img"
        aria-label={`روند ${unit}`}
      >
        <defs>
          <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={area} fill={`url(#fill-${gid})`} />
        <path
          d={line}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {hover !== null && (
          <line
            x1={pts[hover].x} y1={PAD} x2={pts[hover].x} y2={H}
            stroke="var(--line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Full-height hit areas keep the hover target comfortable */}
        {pts.map((p, i) => (
          <rect
            key={i}
            x={p.x - W / (points.length * 2)}
            y={0}
            width={W / points.length}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>

      {/* Markers sit outside the stretched SVG so they stay perfect circles */}
      {pts.map((p, i) => {
        const isActive = hover === i;
        const isLast = i === pts.length - 1;
        if (!isActive && !isLast) return null;
        return (
          <span
            key={i}
            className={`pointer-events-none absolute rounded-full bg-brand transition-all duration-150 ${isActive ? 'h-2.5 w-2.5' : 'h-2 w-2'}`}
            style={{
              left: `${p.x}%`,
              top: (p.y / H) * height,
              transform: 'translate(-50%, -50%)',
              boxShadow: '0 0 0 3px var(--card)',
            }}
          />
        );
      })}

      {active && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-tile bg-pill px-2.5 py-1.5 text-center shadow-float"
          style={{ left: `${pts[hover!].x}%`, top: (pts[hover!].y / H) * height - 8 }}
        >
          <div className="tnum text-xs font-bold text-pill-fg">{active.value}{unit && ` ${unit}`}</div>
          <div className="text-[10px] text-pill-fg/70">{active.label}</div>
        </div>
      )}

      <div className="mt-2 flex justify-between text-[10px] text-fg-muted">
        <span>{points[0].label}</span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}
