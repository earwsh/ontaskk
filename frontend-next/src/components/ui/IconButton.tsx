'use client';

import { ReactNode } from 'react';

interface IconButtonProps {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  size?: 'sm' | 'md';
  active?: boolean;
  className?: string;
}

const sizeMap = { sm: 'h-8 w-8', md: 'h-9 w-9' };

/** Round action button — the small circular controls of the v2 language. */
export default function IconButton({
  children, onClick, label, size = 'md', active = false, className = '',
}: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={[
        sizeMap[size],
        'relative inline-flex cursor-pointer items-center justify-center rounded-full transition-colors duration-200',
        active ? 'bg-pill text-pill-fg' : 'bg-sunken text-fg-muted hover:bg-hover hover:text-fg',
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
    </button>
  );
}
