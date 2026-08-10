'use client';

import MiniStat from './MiniStat';
import SectionCard from './SectionCard';

export interface WorkloadMember {
  userId: number;
  name?: string;
  departmentName?: string | null;
  total: number;
}

interface WorkloadHealth {
  available?: boolean;
  memberCount?: number;
  meanLoad?: number;
  giniCoefficient?: number;
  overloadThreshold?: number;
  narrative?: string;
  overloaded?: WorkloadMember[];
  underloaded?: WorkloadMember[];
}

interface WorkloadPanelProps {
  health?: WorkloadHealth | null;
  title?: string;
}

const scaleIcon = 'M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z';

export default function WorkloadPanel({ health, title = 'توازن بار کاری' }: WorkloadPanelProps) {
  const unavailable = !health || health.available === false || !health.memberCount;

  return (
    <SectionCard title={title} icon={scaleIcon} iconColor="#6366F1" className="h-full">
      {unavailable ? (
        <div className="py-8 text-center text-xs text-text-muted">سرویس راست در دسترس نیست</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniStat label="اعضا" value={health.memberCount ?? 0} />
            <MiniStat label="میانگین بار" value={health.meanLoad ?? 0} />
            <MiniStat label="ضریب جینی" value={health.giniCoefficient ?? 0} />
            <MiniStat label="آستانه اضافه‌بار" value={health.overloadThreshold ?? 0} />
          </div>
          {health.narrative && (
            <div className="rounded-xl border border-[rgba(255,255,255,0.04)] bg-[rgba(255,255,255,0.02)] px-3.5 py-3 text-xs leading-relaxed text-text-secondary">
              {health.narrative}
            </div>
          )}
          {health.overloaded && health.overloaded.length > 0 && (
            <div>
              <div className="mb-2 text-xs text-text-muted">اعضای پرکار ({health.overloaded.length})</div>
              <div className="space-y-1.5">
                {health.overloaded.slice(0, 4).map((m) => (
                  <div key={m.userId} className="flex items-center justify-between rounded-lg border border-red-500/10 bg-red-500/5 px-3 py-2 text-xs">
                    <span className="text-text-secondary">{m.name} {m.departmentName && <span className="text-text-muted">• {m.departmentName}</span>}</span>
                    <span className="text-red-400">{m.total} دقیقه</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {health.underloaded && health.underloaded.length > 0 && (
            <div>
              <div className="mb-2 text-xs text-text-muted">اعضای کم‌بار ({health.underloaded.length})</div>
              <div className="space-y-1.5">
                {health.underloaded.slice(0, 4).map((m) => (
                  <div key={m.userId} className="flex items-center justify-between rounded-lg border border-green-500/10 bg-green-500/5 px-3 py-2 text-xs">
                    <span className="text-text-secondary">{m.name} {m.departmentName && <span className="text-text-muted">• {m.departmentName}</span>}</span>
                    <span className="text-green-400">{m.total} دقیقه</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
