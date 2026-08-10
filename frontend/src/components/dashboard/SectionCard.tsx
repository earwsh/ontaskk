'use client';

import Link from 'next/link';
import { ReactNode } from 'react';

interface SectionCardProps {
  title: string;
  icon: string;
  iconColor?: string;
  action?: { label: string; href: string };
  children: ReactNode;
  className?: string;
}

export default function SectionCard({ title, icon, iconColor = '#6366F1', action, children, className = '' }: SectionCardProps) {
  return (
    <div className={`rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,38,0.6)] p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: iconColor }}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
          {title}
        </h3>
        {action && (
          <Link href={action.href} className="text-xs text-primary transition-colors hover:text-primary-hover">{action.label}</Link>
        )}
      </div>
      {children}
    </div>
  );
}
