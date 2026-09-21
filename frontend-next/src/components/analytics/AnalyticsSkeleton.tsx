'use client';

import Skeleton from '@/components/ui/Skeleton';

export default function AnalyticsSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-card" />)}
      </div>
      <Skeleton className="h-40 rounded-card" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-72 rounded-card" />)}
      </div>
      <Skeleton className="h-72 rounded-card" />
    </div>
  );
}
