'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import Card from '@/components/ui/Card';
import DashboardHeader from '@/components/bento/DashboardHeader';

export default function CustomerPage() {
  const [name, setName] = useState('');

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      setName(`${u.firstName || ''} ${u.lastName || ''}`.trim());
    } catch {}
  }, []);

  // The customer-facing features are not built yet. Rather than show three
  // zeroed counters that look like real data, this states the situation and
  // points at the one thing that does work today.
  const planned = [
    { title: 'پیگیری سفارش‌ها', desc: 'مشاهده وضعیت و تاریخچه سفارش‌های ثبت‌شده', icon: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z' },
    { title: 'تیکت پشتیبانی', desc: 'ثبت درخواست و پیگیری پاسخ تیم پشتیبانی', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
    { title: 'گزارش پیشرفت پروژه', desc: 'مشاهده درصد پیشرفت پروژه‌های مربوط به شما', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  ];

  return (
    <ProtectedRoute allowedRoles={['CUSTOMER']}>
      <DashboardHeader name={name} role="پنل مشتری" />

      <Card padding="lg" className="mb-3">
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand-on-soft">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </span>
          <h2 className="text-base font-semibold text-fg">این بخش هنوز فعال نشده است</h2>
          <p className="max-w-md text-sm leading-relaxed text-fg-secondary">
            قابلیت‌های مخصوص مشتریان در حال ساخت است. تا آن زمان می‌توانید از طریق پیام‌رسان با تیم در ارتباط باشید.
          </p>
          <Link href="/dashboard/chat"
            className="mt-2 rounded-full bg-pill px-5 py-2.5 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90">
            رفتن به پیام‌رسان
          </Link>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {planned.map((p) => (
          <Card key={p.title}>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sunken text-fg-muted">
              <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
                <path strokeLinecap="round" strokeLinejoin="round" d={p.icon} />
              </svg>
            </span>
            <h3 className="mt-3 text-sm font-semibold text-fg">{p.title}</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">{p.desc}</p>
            <span className="mt-3 inline-block rounded-full bg-sunken px-2.5 py-1 text-[10px] font-medium text-fg-secondary">به‌زودی</span>
          </Card>
        ))}
      </div>
    </ProtectedRoute>
  );
}
