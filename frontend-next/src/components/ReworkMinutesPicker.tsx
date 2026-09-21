'use client';

import { REWORK_PRESETS } from '@/lib/rejectionCategories';

/**
 * How long the reviewer thinks the fix will take.
 *
 * Presets first because the answer is almost always one of them, and a
 * required free-text number field at the end of a rejection form is exactly
 * the kind of friction that produced "." in the reason field.
 */
export default function ReworkMinutesPicker({ value, onChange }: {
  value: number | '';
  onChange: (v: number | '') => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {REWORK_PRESETS.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`cursor-pointer rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${
            value === m ? 'bg-pill text-pill-fg' : 'bg-sunken text-fg-secondary hover:text-fg'
          }`}
        >
          {m} دقیقه
        </button>
      ))}
      <input
        type="number"
        min={1}
        max={480}
        value={value}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}
        placeholder="یا عدد دلخواه"
        aria-label="زمان اصلاح به دقیقه"
        className="h-8 w-28 rounded-full bg-sunken px-3 text-[11px] text-fg outline-none placeholder:text-fg-muted"
      />
    </div>
  );
}
