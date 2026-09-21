'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useChatSocket } from '@/context/SocketContext';
import { navIcons } from './nav/icons';
import { roleNav, qcLink, NavLink as NavLinkType } from './nav/navConfig';
import Avatar from './ui/Avatar';

interface SidebarProps {
  role: string;
  userName: string;
  avatarUrl?: string | null;
  onLogout: () => void;
  isDeptManager?: boolean;
  isQcReviewer?: boolean;
  /** Mobile drawer state — on desktop the sidebar is always in flow. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export default function Sidebar({
  role, userName, avatarUrl, onLogout, isDeptManager, isQcReviewer, mobileOpen, onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname();
  const { unreadTotal } = useChatSocket();
  const config = roleNav[role] || roleNav.EMPLOYEE;

  const visible = (link: NavLinkType) => {
    if (role === 'CEO' && link.href === '/dashboard/approvals' && !isDeptManager) return false;
    return true;
  };

  // Appended to the "my work" group so it sits with the user's own queues.
  const groups = config.groups.map((g) =>
    isQcReviewer && g.title === 'کار من' ? { ...g, links: [...g.links, qcLink] } : g
  );
  const allLinks = groups.flatMap((g) => g.links).filter(visible);

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    const hasChildren = allLinks.some((l) => l.href !== href && l.href.startsWith(href + '/'));
    if (hasChildren) return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <>
      {/* Scrim: only exists while the drawer is open on small screens. */}
      <div
        onClick={onCloseMobile}
        aria-hidden={!mobileOpen}
        className={[
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
      />

      <aside
        className={[
          'w-[264px] lg:hidden',
          'bg-card shadow-float',
          'rounded-l-panel',
          'flex flex-col',
          'fixed inset-y-0 right-0 z-50 h-full',
          'transition-transform duration-300 ease-out',
          mobileOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        <div className="flex items-center justify-between p-4 border-b border-line">
          <div className="flex items-center">
            <img
              src="/logo.png"
              alt="Taskon"
              className="logo-light-mode h-7 w-auto object-contain select-none"
            />
            <img
              src="/logo-white.png"
              alt="Taskon"
              className="logo-dark-mode h-7 w-auto object-contain select-none"
            />
          </div>
          <button
            onClick={onCloseMobile}
            aria-label="بستن منو"
            className="mr-auto flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-hover hover:text-fg lg:hidden"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-3">
          {groups.map((group, gi) => {
            const links = group.links.filter(visible);
            if (!links.length) return null;
            return (
              <div key={group.title || `g${gi}`}>
                {group.title && (
                  <p className="px-3 pb-1.5 text-[10px] font-semibold tracking-wide text-fg-muted/70">
                    {group.title}
                  </p>
                )}
                <div className="space-y-0.5">
                  {links.map((link) => {
                    const active = isActive(link.href);
                    const badge = link.href === '/dashboard/chat' && unreadTotal > 0 ? unreadTotal : 0;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={onCloseMobile}
                        className={[
                          'relative flex w-full items-center rounded-tile text-sm transition-colors duration-200',
                          'gap-3 px-3 py-2.5',
                          active
                            ? 'bg-pill font-medium text-pill-fg shadow-flat'
                            : 'text-fg-secondary hover:bg-hover hover:text-fg',
                        ].join(' ')}
                      >
                        <svg
                          className="h-[18px] w-[18px] shrink-0"
                          fill="none" viewBox="0 0 24 24" stroke="currentColor"
                          strokeWidth={active ? 2.3 : 1.9}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d={navIcons[link.icon]} />
                        </svg>
                        <span>{link.label}</span>
                        {badge > 0 && (
                          <span
                            className={[
                              'tnum flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold',
                              active ? 'bg-pill-fg text-pill' : 'bg-brand text-white',
                              'mr-auto',
                            ].join(' ')}
                          >
                            {badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="mt-auto p-3">
          <div className="flex items-center gap-2.5 rounded-tile bg-sunken p-2.5">
            <Avatar name={userName} size={32} src={avatarUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-fg">{userName}</p>
              <p className="truncate text-[10px] text-fg-muted">{config.title}</p>
            </div>
            <button
              onClick={onLogout}
              title="خروج"
              aria-label="خروج"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-bad-soft hover:text-bad"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={navIcons.logout} />
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
