'use client';

import { ReactNode } from 'react';

/** Oversized page title with actions, as the reference sets it above content. */
export default function PageHeading({
  title, subtitle, actions,
}: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-5 pt-2">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-bold tracking-tight text-fg md:text-[32px] md:leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
