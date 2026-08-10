'use client';

import { useEffect } from 'react';

const roleRoutes: Record<string, string> = {
  CEO: '/dashboard/ceo',
  HR_MANAGER: '/dashboard/hr',
  TECHNICAL_MANAGER: '/dashboard/tech',
  STRATEGY_MANAGER: '/dashboard/tech',
  DEPARTMENT_MANAGER: '/dashboard/dept',
  EMPLOYEE: '/dashboard/employee',
  CUSTOMER: '/dashboard/customer',
};

export default function DashboardPage() {
  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (!stored) {
        window.location.href = '/login';
        return;
      }
      const user = JSON.parse(stored);
      const route = roleRoutes[user.role] || '/dashboard/employee';
      window.location.href = route;
    } catch {
      window.location.href = '/login';
    }
  }, []);

  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex items-center gap-2 text-text-muted">
        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>در حال هدایت...</span>
      </div>
    </div>
  );
}
