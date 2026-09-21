'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';

interface RailAction {
  label: string;
  icon: string;
  href?: string;
  onClick?: () => void;
}

/**
 * Slim utility rail down the side, as in the reference: quick jumps and
 * shortcuts, with the theme switch parked at the bottom.
 */
export default function IconRail({ role }: { role: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();

  const canCreate = ['CEO', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER'].includes(role);

  const actions: RailAction[] = [
    { label: 'بازگشت', icon: 'M9 5l7 7-7 7', onClick: () => router.back() },
    ...(canCreate
      ? [{ label: 'تسک جدید', icon: 'M12 4v16m8-8H4', href: '/dashboard/tasks/new' }]
      : []),
    { label: 'تسک‌های من', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', href: '/dashboard/my-tasks' },
    { label: 'پروژه‌ها', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z', href: '/dashboard/projects' },
    { label: 'تحلیل', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', href: '/dashboard/analytics' },
    { label: 'پیام‌رسان', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z', href: '/dashboard/chat' },
  ];

  const cls = (active: boolean) =>
    [
      'flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-200',
      active ? 'bg-pill text-pill-fg' : 'bg-card text-fg-muted shadow-flat hover:text-fg',
    ].join(' ');

  return (
    <aside className="sticky top-[72px] hidden h-[calc(100vh-72px)] shrink-0 flex-col items-center gap-2.5 py-3 lg:flex">
      {actions.map((a) =>
        a.href ? (
          <Link key={a.label} href={a.href} title={a.label} aria-label={a.label} className={cls(pathname.startsWith(a.href))}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
              <path strokeLinecap="round" strokeLinejoin="round" d={a.icon} />
            </svg>
          </Link>
        ) : (
          <button key={a.label} onClick={a.onClick} title={a.label} aria-label={a.label} className={`${cls(false)} cursor-pointer`}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
              <path strokeLinecap="round" strokeLinejoin="round" d={a.icon} />
            </svg>
          </button>
        )
      )}

      {/* Theme switch sits at the foot of the rail, as in the reference */}
      <div className="mt-auto flex flex-col items-center gap-1 rounded-full bg-card p-1 shadow-flat">
        <button
          onClick={() => theme !== 'dark' && toggle()}
          title="حالت تیره"
          aria-label="حالت تیره"
          aria-pressed={theme === 'dark'}
          className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-colors ${theme === 'dark' ? 'bg-pill text-pill-fg' : 'text-fg-muted hover:text-fg'}`}
        >
          <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        </button>
        <button
          onClick={() => theme !== 'light' && toggle()}
          title="حالت روشن"
          aria-label="حالت روشن"
          aria-pressed={theme === 'light'}
          className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-colors ${theme === 'light' ? 'bg-pill text-pill-fg' : 'text-fg-muted hover:text-fg'}`}
        >
          <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
