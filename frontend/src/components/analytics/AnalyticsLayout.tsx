'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const tabs = [
  { key: 'reports', label: 'گزارشات عمومی', roles: ['CEO', 'HR_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER'] },
  { key: 'visual', label: 'تحلیل بصری', roles: ['CEO', 'HR_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER'] },
  { key: 'technical', label: 'تحلیل فنی', roles: ['CEO', 'HR_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER'] },
  { key: 'scrum', label: 'اسکرام و ظرفیت', roles: ['CEO', 'HR_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER'] },
  { key: 'gantt', label: 'نمودار گانت', roles: ['CEO', 'HR_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER'] },
  { key: 'smart', label: 'تحلیل هوشمند', roles: ['CEO', 'HR_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER'] },
  { key: 'employee', label: 'تحلیل من', roles: ['EMPLOYEE'] },
];

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [userRole, setUserRole] = useState<string>('');

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      setUserRole(u.role || '');
    } catch {}
  }, []);

  const currentTab = pathname.split('/').pop() || '';

  const visibleTabs = tabs.filter((t) => t.roles.includes(userRole));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {visibleTabs.length > 1 && (
        <div className="mb-4 flex shrink-0 gap-1 overflow-x-auto rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,38,0.6)] p-1.5">
          {visibleTabs.map((tab) => {
            const isActive = currentTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => router.push(`/dashboard/analytics/${tab.key}`)}
                className={`cursor-pointer whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-primary text-white shadow-lg shadow-primary/20'
                    : 'text-text-muted hover:bg-[rgba(255,255,255,0.04)] hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
