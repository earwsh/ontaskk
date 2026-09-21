'use client';

export interface BarPair {
  label: string;
  current: number;
  previous: number;
}

/**
 * Grouped columns comparing the current period against the one before it.
 * Colour carries the series; height carries the value.
 */
export default function BarChart({
  data, height = 150, currentLabel = 'این ماه', previousLabel = 'ماه گذشته',
}: { data: BarPair[]; height?: number; currentLabel?: string; previousLabel?: string }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.current, d.previous]));

  const totalCurrent = data.reduce((s, d) => s + d.current, 0);
  const totalPrevious = data.reduce((s, d) => s + d.previous, 0);
  const delta = totalPrevious ? Math.round(((totalCurrent - totalPrevious) / totalPrevious) * 100) : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <span className="flex items-center gap-1.5 text-[11px] text-fg-secondary">
          <span className="h-2.5 w-2.5 rounded-full bg-brand" />
          {currentLabel}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-fg-secondary">
          <span className="h-2.5 w-2.5 rounded-full bg-violet" />
          {previousLabel}
        </span>
        {delta !== null && (
          <span className={`tnum mr-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            delta >= 0 ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad'
          }`}>
            {delta >= 0 ? '+' : '−'}{Math.abs(delta)}٪ نسبت به دوره قبل
          </span>
        )}
      </div>

      <div className="flex items-end gap-2 md:gap-4" style={{ height: height + 24 }}>
        {data.map((d, i) => {
          const hc = Math.max(4, Math.round((d.current / max) * height));
          const hp = Math.max(4, Math.round((d.previous / max) * height));
          return (
            <div key={`${d.label}-${i}`} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
              <div className="flex w-full items-end justify-center gap-1">
                <div
                  className="w-1/2 max-w-[26px] rounded-t-lg bg-violet transition-all duration-500"
                  style={{ height: hp }}
                  title={`${previousLabel} — ${d.label}: ${d.previous}`}
                />
                <div
                  className="w-1/2 max-w-[26px] rounded-t-lg bg-brand transition-all duration-500"
                  style={{ height: hc }}
                  title={`${currentLabel} — ${d.label}: ${d.current}`}
                />
              </div>
              <span className="truncate text-[10px] text-fg-muted">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
