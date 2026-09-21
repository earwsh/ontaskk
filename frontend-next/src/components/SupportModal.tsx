'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useToast } from '@/components/Toast';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import { gregorianToShamsi } from '@/lib/date';
import api from '@/lib/api';

interface SupportModalProps {
  open: boolean;
  onClose: () => void;
}

const statusTone: Record<string, 'neutral' | 'warn' | 'ok' | 'bad'> = {
  OPEN: 'warn',
  IN_PROGRESS: 'neutral',
  RESOLVED: 'ok',
  CLOSED: 'neutral',
};

const statusLabel: Record<string, string> = {
  OPEN: 'در انتظار بررسی',
  IN_PROGRESS: 'در حال بررسی فنی',
  RESOLVED: 'حل‌شده',
  CLOSED: 'بسته شده',
};

export default function SupportModal({ open, onClose }: SupportModalProps) {
  const { showToast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'new' | 'my-tickets' | 'contact'>('new');
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('technical');
  const [priority, setPriority] = useState('NORMAL');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; description?: string }>({});
  const [myTickets, setMyTickets] = useState<any[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open && activeTab === 'my-tickets') {
      setLoadingTickets(true);
      api
        .get('/tickets')
        .then(({ data }) => setMyTickets(data))
        .catch(() => setMyTickets([]))
        .finally(() => setLoadingTickets(false));
    }
  }, [open, activeTab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: { title?: string; description?: string } = {};
    if (!title.trim()) {
      newErrors.title = 'لطفاً موضوع (عنوان) را وارد کنید.';
    }
    if (!description.trim()) {
      newErrors.description = 'لطفاً متن پیام یا شرح مشکل را وارد کنید.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      if (newErrors.title && newErrors.description) {
        showToast('لطفاً عنوان و متن پیام را وارد کنید.', 'error');
      } else if (newErrors.title) {
        showToast('موضوع پیام وارد نشده است.', 'error');
      } else {
        showToast('متن پیام وارد نشده است.', 'error');
      }
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const { data } = await api.post('/tickets', {
        title: title.trim(),
        description: description.trim(),
        department,
        priority,
      });

      showToast(`پیام شماره #${data.id} با موفقیت ثبت شد و برای مدیر فنی ارسال گردید.`);
      setTitle('');
      setDescription('');
      setActiveTab('my-tickets');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در ثبت پیام', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center p-3 sm:p-5 overflow-y-auto" dir="rtl">
          {/* Full-screen backdrop that darkens the entire page uniformly */}
          <motion.div
            key="island-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Floating Compact Notification-Style Island Container (h-fit, never stretched) */}
          <motion.div
            key="island-panel"
            initial={{ opacity: 0, y: -70, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.94 }}
            transition={{ type: 'spring', damping: 24, stiffness: 340, mass: 0.7 }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-full max-w-md h-fit rounded-[24px] border border-line bg-card p-4 sm:p-5 shadow-float my-2 sm:my-4"
          >
            {/* Top Grip Indicator */}
            <div className="flex justify-center pb-2">
              <span className="h-1 w-10 rounded-full bg-border opacity-70" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-on-soft shadow-inner">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 18v-6a9 9 0 0118 0v6M3 18a3 3 0 003 3h1a2 2 0 002-2v-3a2 2 0 00-2-2H4a1 1 0 00-1 1v3zm18 0a3 3 0 01-3 3h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3a1 1 0 011 1v3z" />
                  </svg>
                </span>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-fg">پشتیبانی و ثبت پیام</h2>
                  <p className="text-[11px] text-fg-muted">ارسال مستقیم به مدیر فنی</p>
                </div>
              </div>

              <button
                onClick={onClose}
                aria-label="بستن"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-sunken text-fg-muted transition-colors hover:text-fg"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="mt-3 flex gap-1 rounded-full bg-sunken p-1 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('new')}
                className={`flex-1 cursor-pointer rounded-full py-1.5 text-xs font-medium transition-all ${
                  activeTab === 'new' ? 'bg-pill text-pill-fg shadow-flat font-semibold' : 'text-fg-secondary hover:text-fg'
                }`}
              >
                ثبت پیام
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('my-tickets')}
                className={`flex-1 cursor-pointer rounded-full py-1.5 text-xs font-medium transition-all ${
                  activeTab === 'my-tickets' ? 'bg-pill text-pill-fg shadow-flat font-semibold' : 'text-fg-secondary hover:text-fg'
                }`}
              >
                پیام‌های من
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('contact')}
                className={`flex-1 cursor-pointer rounded-full py-1.5 text-xs font-medium transition-all ${
                  activeTab === 'contact' ? 'bg-pill text-pill-fg shadow-flat font-semibold' : 'text-fg-secondary hover:text-fg'
                }`}
              >
                تماس مستقیم
              </button>
            </div>

            {/* Content Area */}
            <div className="mt-3">
              {/* Tab 1: New Ticket Form */}
              {activeTab === 'new' && (
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-fg">
                      موضوع <span className="text-bad">*</span>
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
                      }}
                      placeholder="عنوان مشکل یا موضوع پیام شما…"
                      className={`w-full rounded-tile bg-sunken px-3.5 py-2 text-xs text-fg border outline-none transition-colors focus:bg-card placeholder:text-fg-muted ${
                        errors.title ? 'border-bad ring-1 ring-bad/30' : 'border-line focus:border-brand'
                      }`}
                    />
                    {errors.title && (
                      <p className="mt-1 text-[11px] font-semibold text-bad flex items-center gap-1">
                        <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        {errors.title}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-fg">واحد</label>
                      <select
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        className="w-full rounded-tile bg-sunken px-3 py-2 text-xs text-fg border border-line outline-none transition-colors focus:bg-card focus:border-brand"
                      >
                        <option value="technical">فنی و توسعه</option>
                        <option value="design">طراحی</option>
                        <option value="content">محتوا</option>
                        <option value="finance">مالی</option>
                        <option value="general">عمومی</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-fg">اولویت</label>
                      <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                        className="w-full rounded-tile bg-sunken px-3 py-2 text-xs text-fg border border-line outline-none transition-colors focus:bg-card focus:border-brand"
                      >
                        <option value="NORMAL">عادی</option>
                        <option value="HIGH">فوری</option>
                        <option value="CRITICAL">بحرانی</option>
                        <option value="LOW">کم</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-fg">
                      متن پیام یا شرح مشکل <span className="text-bad">*</span>
                    </label>
                    <textarea
                      rows={3}
                      value={description}
                      onChange={(e) => {
                        setDescription(e.target.value);
                        if (errors.description) setErrors((prev) => ({ ...prev, description: undefined }));
                      }}
                      placeholder="توضیحات و جزئیات پیام خود را اینجا بنویسید…"
                      className={`w-full resize-none rounded-tile bg-sunken p-3 text-xs text-fg border outline-none transition-colors focus:bg-card placeholder:text-fg-muted ${
                        errors.description ? 'border-bad ring-1 ring-bad/30' : 'border-line focus:border-brand'
                      }`}
                    />
                    {errors.description && (
                      <p className="mt-1 text-[11px] font-semibold text-bad flex items-center gap-1">
                        <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        {errors.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 cursor-pointer rounded-full bg-pill py-2.5 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {submitting ? 'در حال ارسال…' : 'ارسال به مدیر فنی'}
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="cursor-pointer rounded-full bg-sunken px-4 py-2.5 text-xs font-medium text-fg-secondary border border-line transition-colors hover:text-fg"
                    >
                      انصراف
                    </button>
                  </div>
                </form>
              )}

              {/* Tab 2: My Tickets List */}
              {activeTab === 'my-tickets' && (
                <div className="max-h-64 space-y-2 overflow-y-auto pr-0.5">
                  {loadingTickets ? (
                    <div className="space-y-2">
                      {[0, 1].map((i) => (
                        <Skeleton key={i} className="h-14 rounded-tile" />
                      ))}
                    </div>
                  ) : myTickets.length > 0 ? (
                    myTickets.map((t) => (
                      <div key={t.id} className="rounded-tile bg-sunken p-3 text-xs border border-line transition-colors hover:bg-hover">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-fg">{t.title}</span>
                          <Badge tone={statusTone[t.status] || 'neutral'}>
                            {statusLabel[t.status] || t.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-[11px] text-fg-secondary line-clamp-2 leading-relaxed">{t.description}</p>
                        {t.response && (
                          <div className="mt-2 rounded-lg bg-ok-soft/70 p-2 text-[11px] text-ok border border-ok/20">
                            <strong>پاسخ مدیر فنی:</strong> {t.response}
                          </div>
                        )}
                        <div className="mt-2 flex items-center justify-between text-[10px] text-fg-muted border-t border-line/50 pt-1">
                          <span className="font-mono">#{t.id}</span>
                          <span>{gregorianToShamsi(t.createdAt)}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-8 text-center text-xs text-fg-muted">
                      شما هنوز پیامی ثبت نکرده‌اید.
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Contact Channels (Eng. Ebrahimi & Eng. Mirsalehi) */}
              {activeTab === 'contact' && (
                <div className="space-y-3 py-1">
                  <p className="text-xs text-fg-secondary leading-relaxed">
                    جهت تماس تلفنی یا هماهنگی فوری، می‌توانید با شماره‌های زیر در ارتباط باشید:
                  </p>

                  <div className="space-y-2 pt-1">
                    <a
                      href="tel:09135280690"
                      className="flex items-center justify-between rounded-tile bg-sunken p-3 border border-line transition-colors hover:bg-card hover:border-brand/40 group"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-soft text-brand">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                        </span>
                        <div>
                          <div className="text-xs font-bold text-fg">مهندس ابراهیمی</div>
                          <div className="text-[10px] text-fg-muted">پشتیبانی و توسعه فنی</div>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-xs text-brand group-hover:underline" dir="ltr">
                        09135280690
                      </span>
                    </a>

                    <a
                      href="tel:09125695619"
                      className="flex items-center justify-between rounded-tile bg-sunken p-3 border border-line transition-colors hover:bg-card hover:border-brand/40 group"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-soft text-brand">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                        </span>
                        <div>
                          <div className="text-xs font-bold text-fg">مهندس میرصالحی</div>
                          <div className="text-[10px] text-fg-muted">پشتیبانی و مدیریت فنی</div>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-xs text-brand group-hover:underline" dir="ltr">
                        09125695619
                      </span>
                    </a>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
