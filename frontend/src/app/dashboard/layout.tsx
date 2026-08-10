'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { ToastProvider } from '@/components/Toast';
import api from '@/lib/api';

const roleLabels: Record<string, string> = {
  CEO: 'مدیر عامل',
  HR_MANAGER: 'مدیر منابع انسانی',
  TECHNICAL_MANAGER: 'مدیر فنی',
  STRATEGY_MANAGER: 'مدیر استراتژی',
  DEPARTMENT_MANAGER: 'مدیر دپارتمان',
  EMPLOYEE: 'کارمند',
  CUSTOMER: 'مشتری',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<{ id: number; role: string; firstName: string; lastName: string } | null>(null);
  const [isDeptManager, setIsDeptManager] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      const token = localStorage.getItem('token');
      if (!stored || !token) {
        window.location.href = '/login';
        return;
      }
      setUser(JSON.parse(stored));
    } catch {
      window.location.href = '/login';
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    api.get('/departments')
      .then(({ data }) => {
        setIsDeptManager(data.some((d: { managerId: number | null }) => d.managerId === user.id));
      })
      .catch(() => {});
  }, [user]);

  if (!user) return null;

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  return (
    <div className="flex min-h-screen bg-surface" dir="rtl">
      <Sidebar role={user.role} onLogout={handleLogout} collapsed={sidebarCollapsed} isDeptManager={isDeptManager} />
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <Header onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)} userName={user.firstName} userRole={roleLabels[user.role] || ''} />
        <main className="flex-1 p-6 md:p-8 animate-fade-in">
          <ToastProvider>{children}</ToastProvider>
        </main>
      </div>
    </div>
  );
}
