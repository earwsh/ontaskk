'use client';

import { ReactNode } from 'react';

/** Black card — used sparingly so it reads as emphasis among the white ones. */
export default function InkCard({
  children, className = '', padding = 'md', squircle = false,
}: { children: ReactNode; className?: string; padding?: 'sm' | 'md'; squircle?: boolean }) {
  return (
    <div className={`${squircle ? 'squircle-card' : 'rounded-card'} bg-ink ${padding === 'sm' ? 'p-4' : 'p-5'} text-ink-fg ${className}`}>
      {children}
    </div>
  );
}

