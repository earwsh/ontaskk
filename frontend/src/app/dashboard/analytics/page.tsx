'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AnalyticsRedirectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (!stored) {
      router.push('/login');
      return;
    }
    const u = JSON.parse(stored);
    setLoading(false);
    const role = u.role;
    if (role === 'EMPLOYEE') {
      router.push('/dashboard/analytics/employee');
    } else {
      router.push('/dashboard/analytics/reports');
    }
  }, [router]);

  if (loading) return null;

  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex items-center gap-2 text-text-muted">
        <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>در حال هدایت...</span>
      </div>
    </div>
  );
}
