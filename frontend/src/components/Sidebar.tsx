'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const analyticsIcon = 'M3 3v18h18';

const roleConfig: Record<string, { title: string; links: { label: string; href: string; icon: string }[] }> = {
  CEO: {
    title: 'مدیر عامل',
    links: [
      { label: 'داشبورد', href: '/dashboard/ceo', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { label: 'کاربران', href: '/dashboard/users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
      { label: 'پروژه‌ها', href: '/dashboard/projects', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
      { label: 'دپارتمان‌ها', href: '/dashboard/departments', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
      { label: 'تسک‌های من', href: '/dashboard/my-tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
      { label: 'تسک‌های سازمان', href: '/dashboard/tech/tasks', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
      { label: 'تایید تسک‌ها', href: '/dashboard/approvals', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
      { label: 'تحلیل', href: '/dashboard/analytics', icon: analyticsIcon },
    ],
  },
  HR_MANAGER: {
    title: 'مدیر منابع انسانی',
    links: [
      { label: 'داشبورد', href: '/dashboard/hr', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { label: 'کاربران', href: '/dashboard/users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
      { label: 'پروژه‌ها', href: '/dashboard/projects', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
      { label: 'تسک‌های من', href: '/dashboard/my-tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
      { label: 'تایید تسک‌ها', href: '/dashboard/approvals', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
      { label: 'حضور و غیاب', href: '/dashboard/hr/attendance', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
      { label: 'تحلیل', href: '/dashboard/analytics', icon: analyticsIcon },
    ],
  },
  TECHNICAL_MANAGER: {
    title: 'مدیر فنی',
    links: [
      { label: 'داشبورد', href: '/dashboard/tech', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { label: 'دپارتمان‌ها', href: '/dashboard/departments', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
      { label: 'پروژه‌ها', href: '/dashboard/projects', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
      { label: 'تسک‌های من', href: '/dashboard/my-tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
      { label: 'تسک‌های سازمان', href: '/dashboard/tech/tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
      { label: 'تایید تسک‌ها', href: '/dashboard/approvals', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
      { label: 'تحلیل', href: '/dashboard/analytics', icon: analyticsIcon },
    ],
  },
  STRATEGY_MANAGER: {
    title: 'مدیر استراتژی',
    links: [
      { label: 'داشبورد', href: '/dashboard/tech', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { label: 'دپارتمان‌ها', href: '/dashboard/departments', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
      { label: 'پروژه‌ها', href: '/dashboard/projects', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
      { label: 'تسک‌های من', href: '/dashboard/my-tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
      { label: 'تسک‌های سازمان', href: '/dashboard/tech/tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
      { label: 'تایید تسک‌ها', href: '/dashboard/approvals', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
      { label: 'تحلیل', href: '/dashboard/analytics', icon: analyticsIcon },
    ],
  },
  DEPARTMENT_MANAGER: {
    title: 'مدیر دپارتمان',
    links: [
      { label: 'داشبورد', href: '/dashboard/dept', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { label: 'پروژه‌ها', href: '/dashboard/projects', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
      { label: 'تسک‌های من', href: '/dashboard/my-tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
      { label: 'تسک‌های دپارتمان', href: '/dashboard/dept/tasks', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
      { label: 'تایید تسک‌ها', href: '/dashboard/approvals', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
      { label: 'تحلیل', href: '/dashboard/analytics', icon: analyticsIcon },
    ],
  },
  EMPLOYEE: {
    title: 'کارمند',
    links: [
      { label: 'داشبورد', href: '/dashboard/employee', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { label: 'پروژه‌ها و تسک‌های من', href: '/dashboard/projects', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
      { label: 'تسک‌های من', href: '/dashboard/my-tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
      { label: 'تحلیل من', href: '/dashboard/analytics', icon: analyticsIcon },
    ],
  },
  CUSTOMER: {
    title: 'مشتری',
    links: [
      { label: 'داشبورد', href: '/dashboard/customer', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { label: 'سفارشات', href: '/dashboard/customer/orders', icon: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z' },
      { label: 'تیکت‌ها', href: '/dashboard/customer/tickets', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
    ],
  },
};

export default function Sidebar({ role, onLogout, collapsed, isDeptManager }: { role: string; onLogout: () => void; collapsed: boolean; isDeptManager?: boolean }) {
  const pathname = usePathname();
  const config = roleConfig[role] || roleConfig.EMPLOYEE;

  const links = config.links.filter((link) => {
    if (role === 'CEO' && link.href === '/dashboard/approvals' && !isDeptManager) return false;
    return true;
  });

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    const hasChildren = links.some((l) => l.href !== href && l.href.startsWith(href + '/'));
    if (hasChildren) return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <aside
      className={[
        collapsed ? 'w-[72px]' : 'w-60',
        'mx-3 my-3 h-[calc(100vh-24px)] sticky top-3 self-start',
        'bg-sidebar',
        'border border-[rgba(255,255,255,0.06)]',
        'rounded-[20px]',
        'flex flex-col shrink-0',
        'transition-all duration-300 ease-out',
      ].join(' ')}
    >
      <div className={[
        'p-4 border-b border-[rgba(255,255,255,0.06)]',
        collapsed ? 'px-0 flex justify-center' : '',
      ].join(' ')}>
        {collapsed ? (
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <span className="text-white text-sm font-bold">O</span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
              <span className="text-white text-base font-bold">O</span>
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white">OnTask</h2>
              <p className="text-[11px] text-text-muted truncate">{config.title}</p>
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {links.map((link) => {
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              title={collapsed ? link.label : undefined}
              className={[
                'flex items-center w-full rounded-xl text-sm transition-all duration-200',
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-secondary hover:text-white hover:bg-card-hover',
              ].join(' ')}
            >
              <svg className={['w-4 h-4 shrink-0', active ? 'text-primary' : ''].join(' ')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={link.icon} />
              </svg>
              {!collapsed && (
                <span className="truncate">{link.label}</span>
              )}
              {!collapsed && active && (
                <div className="w-1 h-5 rounded-full bg-primary mr-auto shrink-0" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-[rgba(255,255,255,0.06)] mt-auto">
        <button
          onClick={onLogout}
          title={collapsed ? 'خروج' : undefined}
          className={[
            'flex items-center w-full rounded-xl text-sm transition-all duration-200 cursor-pointer',
            collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
            'text-text-muted hover:text-danger hover:bg-danger/5',
          ].join(' ')}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {!collapsed && 'خروج'}
        </button>
      </div>
    </aside>
  );
}
