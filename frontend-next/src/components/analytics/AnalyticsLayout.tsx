'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import ServiceBadge from '@/components/dashboard/ServiceBadge';

const MANAGERS = ['CEO', 'INTERNAL_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER'];

const tabs = [
  { key: 'delivery', label: 'تحویل', roles: MANAGERS },
  { key: 'employees', label: 'تحلیل کارمندان', roles: MANAGERS },
  { key: 'daily-rate', label: 'نرخ روزانه', roles: MANAGERS },
  { key: 'capacity', label: 'ظرفیت روزانه', roles: MANAGERS },
  { key: 'lateness', label: 'نرخ تأخیر', roles: MANAGERS },
  // Generated only by the two roles that decide on it; the API enforces this too.
  { key: 'scorecard', label: 'کارنامهٔ ماهانه', roles: ['CEO', 'TECHNICAL_MANAGER'] },
  { key: 'rejections', label: 'ردهای کیفیت', roles: MANAGERS },
  { key: 'employee', label: 'تحلیل من', roles: ['EMPLOYEE'] },
];

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [userRole, setUserRole] = useState('');
  const [services, setServices] = useState<{ py: boolean; rs: boolean } | null>(null);

  useEffect(() => {
    try { setUserRole(JSON.parse(localStorage.getItem('user') || '{}').role || ''); } catch {}
    // One dedicated probe for the whole section, instead of each page
    // inferring service health from the shape of its own payload.
    api.get('/analytics/health-check')
      .then(({ data }) => setServices(data))
      .catch(() => setServices({ py: false, rs: false }));
  }, []);

  const current = pathname.split('/').pop() || '';
  const visible = tabs.filter((t) => t.roles.includes(userRole));

  return (
    <>
      {services ? (
        <div className="flex justify-end gap-2 pt-3 pb-2">
          <ServiceBadge name="پایتون" ok={services.py} />
          <ServiceBadge name="راست" ok={services.rs} />
        </div>
      ) : (
        <div className="pt-3" />
      )}

      {visible.length > 1 && (
        <div className="mb-3 flex gap-1 overflow-x-auto rounded-full bg-card p-1 shadow-flat">
          {visible.map((tab) => (
            <Link
              key={tab.key}
              href={`/dashboard/analytics/${tab.key}`}
              className={`cursor-pointer whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                current === tab.key ? 'bg-pill text-pill-fg' : 'text-fg-secondary hover:text-fg'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      )}

      <div className="animate-fade-in">{children}</div>
    </>
  );
}
