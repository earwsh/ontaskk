'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import NotificationDropdown from './NotificationDropdown';
import Avatar from './ui/Avatar';
import IconButton from './ui/IconButton';
import { useTheme } from '@/context/ThemeContext';

/** Page titles keyed by route, longest prefix wins. */
const pageTitles: [string, string][] = [
  ['/dashboard/analytics/employees', 'تحلیل کارمندان'],
  ['/dashboard/analytics', 'تحلیل'],
  ['/dashboard/tech/tasks', 'تسک‌های سازمان'],
  ['/dashboard/dept/tasks', 'تسک‌های دپارتمان'],
  ['/dashboard/internal/attendance', 'حضور و غیاب'],
  ['/dashboard/my-tasks', 'تسک‌های من'],
  ['/dashboard/approvals', 'تایید تسک‌ها'],
  ['/dashboard/departments', 'دپارتمان‌ها'],
  ['/dashboard/projects', 'پروژه‌ها'],
  ['/dashboard/webhooks', 'وب‌هوک‌ها'],
  ['/dashboard/users', 'کاربران'],
  ['/dashboard/chat', 'پیام‌رسان'],
];

const titleFor = (pathname: string) =>
  pageTitles.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? 'داشبورد';

interface HeaderProps {
  onToggleSidebar: () => void;
  onOpenMobileNav: () => void;
  userName: string;
  userRole?: string;
  onLogout: () => void;
}

export default function Header({ onToggleSidebar, onOpenMobileNav, userName, userRole, onLogout }: HeaderProps) {
  const [showProfile, setShowProfile] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  // Close on outside click and on Escape — the old menu did neither, because
  // it was never rendered at all.
  useEffect(() => {
    if (!showProfile) return;
    const onPointerDown = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setShowProfile(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowProfile(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showProfile]);

  useEffect(() => {
    setShowProfile(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-line bg-app/80 px-4 backdrop-blur-xl md:px-6">
      <IconButton onClick={onOpenMobileNav} label="باز کردن منو" className="lg:hidden">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </IconButton>

      <IconButton onClick={onToggleSidebar} label="تغییر وضعیت سایدبار" className="hidden lg:inline-flex">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </IconButton>

      <h1 className="truncate text-base font-semibold text-fg md:text-lg">{titleFor(pathname)}</h1>

      <div className="flex-1" />

      <IconButton onClick={toggle} label={theme === 'dark' ? 'حالت روشن' : 'حالت تیره'}>
        {theme === 'dark' ? (
          <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </IconButton>

      <NotificationDropdown />

      <div className="relative" ref={profileRef}>
        <button
          onClick={() => setShowProfile((v) => !v)}
          aria-expanded={showProfile}
          aria-haspopup="menu"
          className="flex cursor-pointer items-center gap-2.5 rounded-full py-1 pl-3 pr-1 transition-colors duration-200 hover:bg-hover"
        >
          <Avatar name={userName} size={32} />
          <div className="hidden min-w-0 text-right md:block">
            <p className="max-w-[120px] truncate text-sm font-medium text-fg">{userName}</p>
            {userRole && <p className="max-w-[120px] truncate text-[10px] text-fg-muted">{userRole}</p>}
          </div>
        </button>

        {showProfile && (
          <div
            role="menu"
            className="animate-scale-in absolute left-0 top-[calc(100%+8px)] z-50 w-56 origin-top-left overflow-hidden rounded-card bg-card p-1.5 shadow-float"
          >
            <div className="flex items-center gap-2.5 rounded-tile px-2.5 py-2.5">
              <Avatar name={userName} size={36} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-fg">{userName}</p>
                {userRole && <p className="truncate text-[11px] text-fg-muted">{userRole}</p>}
              </div>
            </div>

            <div className="my-1 h-px bg-line" />

            <Link
              href="/dashboard/my-tasks"
              role="menuitem"
              className="flex items-center gap-2.5 rounded-tile px-2.5 py-2 text-sm text-fg-secondary transition-colors hover:bg-hover hover:text-fg"
            >
              <svg className="h-4 w-4 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              تسک‌های من
            </Link>

            <button
              onClick={toggle}
              role="menuitem"
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-tile px-2.5 py-2 text-sm text-fg-secondary transition-colors hover:bg-hover hover:text-fg"
            >
              <svg className="h-4 w-4 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
              {theme === 'dark' ? 'حالت روشن' : 'حالت تیره'}
            </button>

            <div className="my-1 h-px bg-line" />

            <button
              onClick={onLogout}
              role="menuitem"
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-tile px-2.5 py-2 text-sm text-bad transition-colors hover:bg-bad/10"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              خروج از حساب
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
