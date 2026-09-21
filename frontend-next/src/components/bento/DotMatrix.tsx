'use client';

/**
 * Each dot is one unit of work; columns are periods. Reads as volume at a
 * glance without axes — the transactions visual from the reference.
 */
export default function DotMatrix({
  columns, max = 6,
}: { columns: { label: string; value: number }[]; max?: number }) {
  const peak = Math.max(1, ...columns.map((c) => c.value));

  return (
    <div className="flex items-end gap-1.5" dir="ltr">
      {columns.map((c, i) => {
        const dots = Math.max(1, Math.round((c.value / peak) * max));
        return (
          <div key={`${c.label}-${i}`} className="flex flex-col-reverse gap-1" title={`${c.label}: ${c.value}`}>
            {Array.from({ length: max }).map((_, d) => (
              <span
                key={d}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${d < dots ? 'bg-brand' : 'bg-transparent'}`}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
