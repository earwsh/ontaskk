'use client';

export type RankType = 'departments' | 'projects' | 'members';

interface RankItem {
  name: string;
  total: number;
  completionRate: number;
  reason?: string;
  deviation?: number;
  status?: string;
  loadStatus?: string;
  tier?: string;
  managerName?: string | null;
  departmentName?: string | null;
  healthScore?: number;
  overdue?: number;
  pending?: number;
}

const titles: Record<RankType, string> = {
  departments: 'رتبه‌بندی دپارتمان‌ها',
  projects: 'رتبه‌بندی پروژه‌ها',
  members: 'رتبه‌بندی اعضا',
};

const statusColor = (status?: string) => {
  if (status === 'critical' || status === 'overloaded') return { text: 'text-red-400', badge: 'bg-red-500/10' };
  if (status === 'warning' || status === 'underloaded') return { text: 'text-amber-400', badge: 'bg-amber-500/10' };
  return { text: 'text-green-400', badge: 'bg-green-500/10' };
};

const statusLabel = (item: RankItem, type: RankType) => {
  if (type === 'projects') {
    if (item.status === 'critical') return 'بحرانی';
    if (item.status === 'warning') return 'نیاز به توجه';
    return 'سالم';
  }
  if (type === 'members') {
    if (item.loadStatus === 'overloaded') return 'پرحجم';
    if (item.loadStatus === 'underloaded') return 'کم‌حجم';
    return item.tier || 'متعادل';
  }
  return '';
};

const rateColor = (rate: number) => (rate >= 75 ? '#22C55E' : rate >= 50 ? '#F59E0B' : '#EF4444');

export default function RankingsPanel({ type, items, limit = 8, averages }: {
  type: RankType;
  items: RankItem[];
  limit?: number;
  averages?: Record<string, number> | null;
}) {
  const shown = items.slice(0, limit);
  return (
    <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,38,0.6)] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{titles[type]}</h3>
        <span className="text-xs text-text-muted">{items.length} مورد</span>
      </div>
      {averages && type === 'departments' && averages.departmentCompletionRate !== undefined && (
        <div className="mb-3 flex flex-wrap gap-2 text-[10px] text-text-muted">
          <span className="rounded-lg bg-[rgba(255,255,255,0.04)] px-2 py-1">میانگین تکمیل: {averages.departmentCompletionRate}٪</span>
        </div>
      )}
      {shown.length > 0 ? (
        <div className="space-y-2">
          {shown.map((item, i) => {
            const st = statusColor(type === 'projects' ? item.status : item.loadStatus);
            const label = statusLabel(item, type);
            return (
              <div key={`${type}-${i}`} className="rounded-xl bg-[rgba(22,27,38,0.6)] px-4 py-3 transition-all duration-200 hover:bg-[rgba(30,37,52,0.6)]">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.04)] text-xs font-medium text-text-muted">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-white">{item.name}</span>
                      {label && (
                        <span className={`shrink-0 rounded-lg px-1.5 py-0.5 text-[10px] font-medium ${st.badge} ${st.text}`}>{label}</span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-text-muted">
                      {item.managerName && <span>مدیر: {item.managerName}</span>}
                      {item.departmentName && item.departmentName !== '—' && <span>{item.departmentName}</span>}
                      <span>{item.total} تسک</span>
                      {item.overdue !== undefined && item.overdue > 0 && <span className="text-red-400">{item.overdue} دیرکرد</span>}
                      {item.pending !== undefined && item.pending > 0 && <span className="text-amber-400">{item.pending} در انتظار تایید</span>}
                      {item.deviation !== undefined && (
                        <span className={item.deviation >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {item.deviation > 0 ? `+${item.deviation}٪` : `${item.deviation}٪`} نسبت به میانگین
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                      <div className="h-full rounded-full transition-all duration-500" style={{
                        width: `${item.completionRate}%`,
                        backgroundColor: rateColor(item.completionRate),
                      }} />
                    </div>
                    <span className="w-9 shrink-0 text-left text-xs font-medium" style={{ color: rateColor(item.completionRate) }}>
                      {item.completionRate}٪
                    </span>
                  </div>
                </div>
                {item.reason && <div className="mt-1.5 pr-9 text-[11px] leading-relaxed text-text-muted">{item.reason}</div>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-8 text-center text-xs text-text-muted">داده‌ای برای نمایش وجود ندارد</div>
      )}
    </div>
  );
}
