'use client';

/** Small signed pill that sits beside a headline figure. */
export default function DeltaBadge({ value, suffix = '٪' }: { value: number; suffix?: string }) {
  const positive = value >= 0;
  return (
    <span className={`tnum inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
      positive ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad'
    }`}>
      {positive ? '+' : '−'}{Math.abs(value)}{suffix}
    </span>
  );
}
