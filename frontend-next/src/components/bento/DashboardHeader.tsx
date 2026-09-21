'use client';

import { ReactNode } from 'react';

/** Header row shared by role dashboards — titles removed, generous bottom spacing for cards. */
export default function DashboardHeader({
  actions,
}: { name?: string; role?: string; actions?: ReactNode }) {
  if (!actions) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 pt-3 pb-6">
      {actions}
    </div>
  );
}
