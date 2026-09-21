'use client';

import { ReactNode } from 'react';

/** Card header: title on one side, a period chip / icon action on the other. */
export default function CardHead({
  title, chip, action, dark = false,
}: { title: string; chip?: ReactNode; action?: ReactNode; dark?: boolean }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h3 className={`text-sm font-semibold ${dark ? 'text-ink-fg' : 'text-fg'}`}>{title}</h3>
      <div className="flex items-center gap-2">{chip}{action}</div>
    </div>
  );
}
