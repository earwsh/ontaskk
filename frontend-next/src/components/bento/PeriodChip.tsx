'use client';

const options = [
  { value: 'week', label: 'هفته' },
  { value: 'month', label: 'ماه' },
  { value: 'quarter', label: 'فصل' },
];

/** The "Week ▾" selector that heads each card in the reference. */
export default function PeriodChip({
  value, onChange, dark = false,
}: { value: string; onChange: (v: string) => void; dark?: boolean }) {
  return (
    <div className={`relative inline-flex items-center rounded-full ${dark ? 'bg-white/10' : 'bg-sunken'}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="بازه زمانی"
        className={`cursor-pointer appearance-none rounded-full bg-transparent py-1.5 pl-7 pr-3 text-[11px] font-medium outline-none ${
          dark ? 'text-ink-fg' : 'text-fg-secondary'
        }`}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <svg className={`pointer-events-none absolute left-2 h-3 w-3 ${dark ? 'text-ink-muted' : 'text-fg-muted'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}
