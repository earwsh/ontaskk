'use client';

import SectionCard from './SectionCard';

interface WarningsPanelProps {
  warnings: string[];
  title?: string;
  limit?: number;
}

const warningIcon = 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z';

export default function WarningsPanel({ warnings, title = 'هشدارها', limit = 5 }: WarningsPanelProps) {
  const shown = warnings.slice(0, limit);

  return (
    <SectionCard title={title} icon={warningIcon} iconColor="#EF4444" className="h-full">
      {shown.length > 0 ? (
        <div className="space-y-2">
          {shown.map((text, i) => (
            <div key={i} className="flex items-start gap-2.5 rounded-xl border border-red-500/10 bg-red-500/5 px-3.5 py-3">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={warningIcon} />
              </svg>
              <p className="text-xs leading-relaxed text-text-secondary">{text}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-text-muted">
          <svg className="mb-2 h-10 w-10 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs">هشدار فعالی وجود ندارد</p>
        </div>
      )}
    </SectionCard>
  );
}
