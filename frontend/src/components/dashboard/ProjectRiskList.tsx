'use client';

import Link from 'next/link';
import SectionCard from './SectionCard';

export interface RiskProject {
  projectId: number;
  projectName: string;
  risk?: string;
  completionRate: number;
  total?: number;
  done?: number;
  reason?: string;
}

interface ProjectRiskListProps {
  projects: RiskProject[];
  title?: string;
  limit?: number;
}

const projectIcon = 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z';

const riskStyle = (risk?: string) => {
  if (risk === 'critical') return { badge: 'bg-red-500/10 text-red-400', bar: '#EF4444', label: 'بحرانی' };
  if (risk === 'warning') return { badge: 'bg-amber-500/10 text-amber-400', bar: '#F59E0B', label: 'نیاز به توجه' };
  return { badge: 'bg-green-500/10 text-green-400', bar: '#22C55E', label: 'سالم' };
};

export default function ProjectRiskList({ projects, title = 'ریسک پروژه‌ها', limit = 8 }: ProjectRiskListProps) {
  const shown = projects.slice(0, limit);
  const riskCount = projects.filter((p) => p.risk === 'critical').length;

  return (
    <SectionCard
      title={title}
      icon={projectIcon}
      iconColor="#06B6D4"
      action={{ label: 'مشاهده همه', href: '/dashboard/projects' }}
      className="h-full"
    >
      {shown.length > 0 ? (
        <div className="space-y-2">
          {shown.map((p) => {
            const st = riskStyle(p.risk);
            const rate = Math.round(p.completionRate || 0);
            return (
              <Link key={p.projectId} href={`/dashboard/projects/${p.projectId}`}
                className="block rounded-xl bg-[rgba(22,27,38,0.6)] px-3.5 py-2.5 transition-all duration-200 hover:bg-[rgba(30,37,52,0.6)]">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-xs text-white">{p.projectName}</span>
                  <span className={`shrink-0 rounded-lg px-1.5 py-0.5 text-[10px] font-medium ${st.badge}`}>{st.label}</span>
                  <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${rate}%`, backgroundColor: st.bar }} />
                  </div>
                  <span className="w-8 shrink-0 text-right text-xs text-text-muted">{rate}٪</span>
                </div>
                {(p.total !== undefined || p.reason) && (
                  <div className="mt-1 pr-0 text-[11px] text-text-muted">
                    {p.total !== undefined && `${p.done ?? 0} از ${p.total} تکمیل`}
                    {p.reason && <span> • {p.reason}</span>}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="py-8 text-center text-xs text-text-muted">پروژه‌ای وجود ندارد</div>
      )}
      {riskCount > 0 && shown.length > 0 && (
        <div className="mt-3 rounded-xl border border-red-500/10 bg-red-500/5 px-3.5 py-2.5 text-[11px] text-red-400">
          {riskCount} پروژه در وضعیت بحرانی — نیاز به مداخله فوری
        </div>
      )}
    </SectionCard>
  );
}
