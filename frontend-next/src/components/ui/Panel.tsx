'use client';

import { ReactNode } from 'react';

interface PanelProps {
  title: string;
  /** Circular controls rendered at the far edge of the panel header. */
  actions?: ReactNode;
  /** Sits between the title and the actions — an avatar stack, a filter, etc. */
  centre?: ReactNode;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

/**
 * The tinted island that groups white cards — the outer shell of the
 * reference layout. The faint top-down wash keeps a large expanse of
 * flat colour from looking like dead space.
 */
export default function Panel({ title, subtitle, actions, centre, children, className = '' }: PanelProps) {
  return (
    <section
      className={`rounded-panel p-5 md:p-6 ${className}`}
      style={{ background: 'linear-gradient(180deg, var(--panel-top) 0%, var(--panel) 100%)' }}
    >
      <div className="mb-5 flex items-center gap-4">
        <div className="min-w-0 shrink-0">
          <h2 className="text-base font-semibold tracking-tight text-fg">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p>}
        </div>
        {centre && <div className="mx-auto min-w-0">{centre}</div>}
        {actions && <div className={`flex items-center gap-2 ${centre ? '' : 'mr-auto'}`}>{actions}</div>}
      </div>
      {children}
    </section>
  );
}
