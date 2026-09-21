'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import TopNav from '@/components/nav/TopNav';
import IconRail from '@/components/nav/IconRail';
import { ToastProvider } from '@/components/Toast';
import VersionWatcher from '@/components/VersionWatcher';
import api from '@/lib/api';

import { SocketProvider } from '@/context/SocketContext';
import { roleLabels } from '@/lib/roles';
import {
  getCachedUser, refreshCurrentUser, displayNameOf, USER_UPDATED, type CurrentUser,
} from '@/lib/currentUser';



export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isDeptManager, setIsDeptManager] = useState(false);
  const [isQcReviewer, setIsQcReviewer] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const stored = getCachedUser();
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!stored || !token) {
      window.location.href = '/login';
      return;
    }
    setUser(stored);
    // The cache was written at login and can be stale by now.
    refreshCurrentUser().then((fresh) => { if (fresh) setUser(fresh); });

    const onUpdate = (e: Event) => setUser((e as CustomEvent<CurrentUser>).detail);
    window.addEventListener(USER_UPDATED, onUpdate);
    return () => window.removeEventListener(USER_UPDATED, onUpdate);
  }, []);

  useEffect(() => {
    if (!user) return;
    api.get('/departments')
      .then(({ data }) => {
        setIsDeptManager(data.some((d: { managerId: number | null }) => d.managerId === user.id));
      })
      .catch(() => {});
    // The QC entry only makes sense for someone who actually reviews a project.
    api.get('/projects')
      .then(({ data }) => {
        setIsQcReviewer(data.some((p: { qcId?: number | null; qc?: { id: number } | null }) =>
          (p.qcId ?? p.qc?.id) === user.id));
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileNavOpen]);

  if (!user) return null;

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  const fullName = displayNameOf(user);
  const roleLabel = roleLabels[user.role] || '';

  return (
    <SocketProvider>
      {/* Cards sit straight on the page ground — no outer island. Nothing here
          may clip or create a scroll context, or the sticky bar stops working. */}
      <div className="min-h-screen bg-app print:bg-white print:min-h-0 print:p-0 print:m-0" dir="rtl">
        <div className="print:hidden sticky top-0 z-30">
          <VersionWatcher />
          <TopNav
            role={user.role}
            userName={fullName}
            avatarUrl={user.avatarUrl}
            userRole={roleLabel}
            isDeptManager={isDeptManager}
            isQcReviewer={isQcReviewer}
            onLogout={handleLogout}
            onOpenMobileNav={() => setMobileNavOpen(true)}
          />

          {/* Primary nav is the top bar now; the sidebar survives only as the
              small-screen drawer, where a horizontal bar cannot fit. */}
          <Sidebar
            role={user.role}
            userName={fullName}
            avatarUrl={user.avatarUrl}
            onLogout={handleLogout}
            isDeptManager={isDeptManager}
            isQcReviewer={isQcReviewer}
            mobileOpen={mobileNavOpen}
            onCloseMobile={() => setMobileNavOpen(false)}
          />
        </div>

        <div className="flex w-full gap-3 px-2 md:px-4 print:block print:p-0 print:m-0">
          <div className="print:hidden">
            <IconRail role={user.role} />
          </div>
          <main className="animate-fade-in min-w-0 flex-1 pb-8 print:p-0 print:m-0 print:w-full print:block">
            <ToastProvider>{children}</ToastProvider>
          </main>
        </div>
      </div>
    </SocketProvider>
  );
}
