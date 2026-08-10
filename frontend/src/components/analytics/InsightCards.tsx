'use client';

type SeverityItem = { severity?: string; title?: string; text: string };

interface InsightCardsProps {
  findings?: SeverityItem[];
  risks?: SeverityItem[];
  recommendations?: { title?: string; text: string }[];
}

const severityStyle = (severity?: string) => {
  if (severity === 'critical') return { border: 'border-red-500/20', bg: 'bg-red-500/5', text: 'text-red-400', icon: 'text-red-400' };
  if (severity === 'warning') return { border: 'border-amber-500/20', bg: 'bg-amber-500/5', text: 'text-amber-400', icon: 'text-amber-400' };
  return { border: 'border-green-500/20', bg: 'bg-green-500/5', text: 'text-green-400', icon: 'text-green-400' };
};

const severityDot = (severity?: string) => {
  if (severity === 'critical') return 'bg-red-400';
  if (severity === 'warning') return 'bg-amber-400';
  return 'bg-green-400';
};

export default function InsightCards({ findings = [], risks = [], recommendations = [] }: InsightCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <InsightColumn
        title="یافته‌ها"
        icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        iconColor="#22C55E"
        items={findings}
      />
      <InsightColumn
        title="ریسک‌ها"
        icon="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
        iconColor="#EF4444"
        items={risks}
      />
      <InsightColumn
        title="پیشنهادها"
        icon="M13 10V3L4 14h7v7l9-11h-7z"
        iconColor="#6366F1"
        items={recommendations.map((r) => ({ ...r, severity: 'info' as const }))}
        isRecommendation
      />
    </div>
  );
}

function InsightColumn({ title, icon, iconColor, items, isRecommendation = false }: {
  title: string;
  icon: string;
  iconColor: string;
  items: SeverityItem[];
  isRecommendation?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,38,0.6)] p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: iconColor }}>
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
        {title}
        {items.length > 0 && (
          <span className="rounded-lg bg-[rgba(255,255,255,0.05)] px-1.5 py-0.5 text-[10px] font-bold text-text-muted">{items.length}</span>
        )}
      </h3>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item, i) => {
            const style = isRecommendation
              ? { border: 'border-primary/20', bg: 'bg-primary/5', text: 'text-text-secondary', icon: 'text-primary' }
              : severityStyle(item.severity);
            return (
              <div key={i} className={`rounded-xl border ${style.border} ${style.bg} px-3.5 py-3`}>
                {item.title && <div className={`mb-1 text-xs font-semibold ${style.text}`}>{item.title}</div>}
                <div className="text-xs leading-relaxed text-text-secondary">{item.text}</div>
                {!isRecommendation && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${severityDot(item.severity)}`} />
                    <span className="text-[10px] text-text-muted">
                      {item.severity === 'critical' ? 'بحرانی' : item.severity === 'warning' ? 'هشدار' : 'مثبت'}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-8 text-center text-xs text-text-muted">موردی یافت نشد</div>
      )}
    </div>
  );
}
