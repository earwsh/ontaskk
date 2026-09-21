'use client';

import Link from 'next/link';
import { ReactNode } from 'react';

interface RoundButtonProps {
  label: string;
  icon: string;
  onClick?: () => void;
  href?: string;
  solid?: boolean;
  children?: ReactNode;
}

/** The small circular panel controls of the reference. */
export default function RoundButton({ label, icon, onClick, href, solid = false }: RoundButtonProps) {
  const cls = [
    'flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-200',
    solid ? 'bg-pill text-pill-fg hover:opacity-90' : 'bg-card text-fg-muted shadow-flat hover:text-fg',
  ].join(' ');

  const glyph = (
    <svg className="h-[17px] w-[17px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
    </svg>
  );

  if (href) {
    return <Link href={href} title={label} aria-label={label} className={cls}>{glyph}</Link>;
  }
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={`${cls} cursor-pointer`}>
      {glyph}
    </button>
  );
}
