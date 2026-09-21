'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useChatSocket } from '@/context/SocketContext';
import { roleNav, qcLink, NavLink as NavLinkType } from './navConfig';
import { navIcons } from './icons';
import NotificationDropdown from '../NotificationDropdown';
import Avatar from '../ui/Avatar';
import SupportModal from '../SupportModal';

/**
 * Horizontal primary navigation, mirrored for RTL: brand on the right,
 * links in the middle, actions on the left.
 *
 * Persian labels are far wider than the English ones in the reference, so
 * anything past `INLINE_LIMIT` collapses into a "more" menu instead of
 * wrapping or overflowing the bar.
 */
const INLINE_LIMIT = 6;

interface TopNavProps {
  role: string;
  userName: string;
  userRole: string;
  avatarUrl?: string | null;
  isDeptManager?: boolean;
  isQcReviewer?: boolean;
  onLogout: () => void;
  onOpenMobileNav: () => void;
}

export default function TopNav({ role, userName, userRole, avatarUrl, isDeptManager, isQcReviewer, onLogout, onOpenMobileNav }: TopNavProps) {
  const pathname = usePathname();
  const { unreadTotal } = useChatSocket();
  const config = roleNav[role] || roleNav.EMPLOYEE;

  const [moreOpen, setMoreOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const visible = (link: NavLinkType) =>
    !(role === 'CEO' && link.href === '/dashboard/approvals' && !isDeptManager);

  const links = [
    ...config.groups.flatMap((g) => g.links).filter(visible),
    // Surfaced only for users who actually review a project.
    ...(isQcReviewer ? [qcLink] : []),
  ];
  const inline = links.slice(0, INLINE_LIMIT);
  const overflow = links.slice(INLINE_LIMIT);

  const isActive = (href: string) => {
    const hasChildren = links.some((l) => l.href !== href && l.href.startsWith(href + '/'));
    if (hasChildren) return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  };

  const overflowActive = overflow.some((l) => isActive(l.href));

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMoreOpen(false); setProfileOpen(false); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => { setMoreOpen(false); setProfileOpen(false); }, [pathname]);

  const pillClass = (active: boolean) =>
    [
      'relative flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm transition-colors duration-200',
      active ? 'bg-pill font-medium text-pill-fg' : 'text-fg-secondary hover:bg-hover hover:text-fg',
    ].join(' ');

  return (
    <header className="sticky top-0 z-30 h-[72px] shrink-0 bg-app/80 backdrop-blur-xl border-b border-line/50">
      <div className="flex h-full w-full items-center gap-3 px-2 md:px-3">
      {/* Brand logo */}
      <Link href="/dashboard" className="flex shrink-0 items-center px-1">
        <img
          src="/logo.png"
          alt="Taskon"
          className="logo-light-mode h-7 md:h-8 w-auto object-contain select-none transition-transform duration-200 hover:scale-105"
        />
        <img
          src="/logo-white.png"
          alt="Taskon"
          className="logo-dark-mode h-7 md:h-8 w-auto object-contain select-none transition-transform duration-200 hover:scale-105"
        />
      </Link>

      <button
        onClick={onOpenMobileNav}
        aria-label="باز کردن منو"
        className="mr-auto flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-sunken text-fg-muted transition-colors hover:text-fg lg:hidden"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <nav className="mx-auto hidden items-center gap-1 lg:flex">
        {inline.map((link) => {
          const active = isActive(link.href);
          const badge = link.href === '/dashboard/chat' ? unreadTotal : 0;
          return (
            <Link key={link.href} href={link.href} className={pillClass(active)}>
              {link.label}
              {link.soon && (
                <span className={`rounded-full px-1.5 py-px text-[9px] font-semibold ${active ? 'bg-pill-fg/20 text-pill-fg' : 'bg-sunken text-fg-muted'}`}>
                  بزودی
                </span>
              )}
              {badge > 0 && (
                <span className={`tnum flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${active ? 'bg-pill-fg text-pill' : 'bg-brand text-white'}`}>
                  {badge}
                </span>
              )}
            </Link>
          );
        })}

        {overflow.length > 0 && (
          <div className="relative" ref={moreRef}>
            <button
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              className={`${pillClass(overflowActive)} cursor-pointer`}
            >
              بیشتر
              <svg className={`h-3.5 w-3.5 transition-transform duration-200 ${moreOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {moreOpen && (
              <div className="animate-scale-in absolute right-0 top-[calc(100%+8px)] z-50 w-56 origin-top-right rounded-card bg-card p-1.5 shadow-float">
                {overflow.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-2.5 rounded-tile px-2.5 py-2 text-sm transition-colors ${
                      isActive(link.href) ? 'bg-pill text-pill-fg' : 'text-fg-secondary hover:bg-hover hover:text-fg'
                    }`}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={navIcons[link.icon]} />
                    </svg>
                    {link.label}
                    {link.soon && (
                      <span className="mr-auto rounded-full bg-sunken px-1.5 py-px text-[9px] font-semibold text-fg-muted">بزودی</span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Actions — left side in RTL */}
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setSupportOpen(true)}
          aria-label="پشتیبانی و تیکت"
          title="پشتیبانی و تیکت"
          className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-card text-fg-secondary shadow-flat transition-colors hover:text-fg"
        >
          <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 18v-6a9 9 0 0118 0v6M3 18a3 3 0 003 3h1a2 2 0 002-2v-3a2 2 0 00-2-2H4a1 1 0 00-1 1v3zm18 0a3 3 0 01-3 3h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3a1 1 0 011 1v3z" />
          </svg>
        </button>

        <Link
          href="/dashboard/chat"
          aria-label="پیام‌رسان"
          title="پیام‌رسان"
          className="relative flex h-10 w-10 items-center justify-center rounded-full bg-card text-fg-secondary shadow-flat transition-colors hover:text-fg"
        >
          <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          {unreadTotal > 0 && (
            <span className="absolute -left-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-coral ring-2 ring-app" />
          )}
        </Link>

        <NotificationDropdown />

        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen((v) => !v)}
            aria-expanded={profileOpen}
            aria-haspopup="menu"
            aria-label="حساب کاربری"
            className="block cursor-pointer rounded-full transition-transform duration-200 hover:scale-105"
          >
            <Avatar name={userName} size={40} ringed src={avatarUrl} />
          </button>

          {profileOpen && (
            <div role="menu" className="animate-scale-in absolute left-0 top-[calc(100%+10px)] z-50 w-60 origin-top-left rounded-card bg-card p-1.5 shadow-float">
              <div className="flex items-center gap-2.5 rounded-tile px-2.5 py-2.5">
                <Avatar name={userName} size={38} src={avatarUrl} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-fg">{userName}</p>
                  <p className="truncate text-[11px] text-fg-muted">{userRole}</p>
                </div>
              </div>
              <div className="my-1 h-px bg-line" />
              <Link href="/dashboard/profile" role="menuitem" className="flex items-center gap-2.5 rounded-tile px-2.5 py-2 text-sm text-fg-secondary transition-colors hover:bg-hover hover:text-fg">
                <svg className="h-4 w-4 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                پروفایل من
              </Link>
              <Link href="/dashboard/my-tasks" role="menuitem" className="flex items-center gap-2.5 rounded-tile px-2.5 py-2 text-sm text-fg-secondary transition-colors hover:bg-hover hover:text-fg">
                <svg className="h-4 w-4 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={navIcons.myTasks} />
                </svg>
                تسک‌های من
              </Link>
              <div className="my-1 h-px bg-line" />
              <button onClick={onLogout} role="menuitem" className="flex w-full cursor-pointer items-center gap-2.5 rounded-tile px-2.5 py-2 text-sm text-bad transition-colors hover:bg-bad-soft">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={navIcons.logout} />
                </svg>
                خروج از حساب
              </button>
            </div>
          )}
        </div>
      </div>
      </div>
      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
    </header>
  );
}
