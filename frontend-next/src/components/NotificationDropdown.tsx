'use client';

import { useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

/** Renamed from `Notification` so it never shadows the browser API. */
type AppNotification = {
  id: number;
  type: string;
  title: string;
  message: string | null;
  read: boolean;
  taskId: number | null;
  createdAt: string;
};

const typeMeta: Record<string, { icon: string; tone: string }> = {
  TASK_ASSIGNED:    { icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6', tone: 'bg-brand-soft text-brand-on-soft' },
  PENDING_APPROVAL: { icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', tone: 'bg-warn-soft text-warn' },
  PENDING_QC:       { icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', tone: 'bg-warn-soft text-warn' },
  QC_REJECTED:      { icon: 'M6 18L18 6M6 6l12 12', tone: 'bg-bad-soft text-bad' },
  QC_PASSED:        { icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', tone: 'bg-ok-soft text-ok' },
  TASK_APPROVED:    { icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', tone: 'bg-ok-soft text-ok' },
  REPORT_ADDED:     { icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', tone: 'bg-info-soft text-info' },
};
const fallbackMeta = { icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', tone: 'bg-sunken text-fg-muted' };

function timeAgo(dateStr: string): string {
  const minutes = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (minutes < 1) return 'لحظاتی پیش';
  if (minutes < 60) return `${minutes} دقیقه پیش`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ساعت پیش`;
  return `${Math.floor(hours / 24)} روز پیش`;
}

export default function NotificationDropdown() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef<number | null>(null);
  // One AudioContext for the lifetime of the component. Creating a new one per
  // chime leaks them, and browsers cap how many a page may hold — past the cap
  // the sound silently stops working.
  const audioRef = useRef<AudioContext | null>(null);

  const chime = useCallback(() => {
    try {
      if (!audioRef.current) {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return;
        audioRef.current = new Ctx();
      }
      const ctx = audioRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.3);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    } catch {}
  }, []);

  useEffect(() => () => { audioRef.current?.close().catch(() => {}); }, []);

  const authHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : null;
  };

  const fetchUnreadCount = useCallback(async () => {
    const headers = authHeaders();
    if (!headers) return;
    try {
      const res = await fetch('/api/notifications/unread-count', { headers });
      if (!res.ok) return;
      const { count } = await res.json();
      if (prevCountRef.current !== null && count > prevCountRef.current) {
        chime();
        if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted') {
          try { new window.Notification('اعلان جدید تسکان', { body: `${count} اعلان خوانده‌نشده دارید.`, icon: '/favicon.ico' }); } catch {}
        }
      }
      prevCountRef.current = count;
      setUnreadCount(count);
    } catch {}
  }, [chime]);

  useEffect(() => {
    fetchUnreadCount();
    const id = setInterval(fetchUnreadCount, 15000);
    return () => clearInterval(id);
  }, [fetchUnreadCount]);

  const fetchNotifications = useCallback(async () => {
    const headers = authHeaders();
    if (!headers) return;
    setLoading(true);
    try {
      const res = await fetch('/api/notifications', { headers });
      if (res.ok) setNotifications((await res.json()).notifications);
    } catch {} finally { setLoading(false); }
  }, []);

  const toggle = () => {
    setOpen((prev) => {
      if (!prev) {
        fetchNotifications();
        // Asking on a real click instead of on page load: browsers ignore (and
        // users resent) permission prompts that arrive unprompted.
        if ('Notification' in window && window.Notification.permission === 'default') {
          window.Notification.requestPermission().catch(() => {});
        }
      }
      return !prev;
    });
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const markRead = async (id: number) => {
    const headers = authHeaders();
    if (!headers) return;
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    setUnreadCount((c) => Math.max(0, c - 1));
    prevCountRef.current = Math.max(0, (prevCountRef.current ?? 1) - 1);
    try { await fetch(`/api/notifications/${id}/read`, { method: 'PATCH', headers }); } catch {}
  };

  const markAllRead = async () => {
    const headers = authHeaders();
    if (!headers) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    prevCountRef.current = 0;
    try { await fetch('/api/notifications/read-all', { method: 'PATCH', headers }); } catch {}
  };

  const openNotification = (n: AppNotification) => {
    if (!n.read) markRead(n.id);
    setOpen(false);
    if (n.taskId) router.push(`/dashboard/tasks/${n.taskId}`);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        aria-label={unreadCount > 0 ? `اعلان‌ها، ${unreadCount} خوانده‌نشده` : 'اعلان‌ها'}
        aria-expanded={open}
        title="اعلان‌ها"
        className={`relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ${
          open ? 'bg-pill text-pill-fg' : 'bg-card text-fg-secondary shadow-flat hover:text-fg'
        }`}
      >
        <motion.svg
          className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}
          animate={!reduceMotion && unreadCount > 0 ? { rotate: [0, -12, 10, -6, 4, 0] } : { rotate: 0 }}
          transition={{ duration: 0.7, repeat: unreadCount > 0 ? Infinity : 0, repeatDelay: 4 }}
          style={{ transformOrigin: 'top center' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </motion.svg>

        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key="badge"
              initial={reduceMotion ? { opacity: 0 } : { scale: 0, opacity: 0 }}
              animate={reduceMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 700, damping: 18 }}
              className="tnum absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-alert px-1 text-[10px] font-bold leading-none text-alert-fg"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.96 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 520, damping: 30 }}
            style={{ transformOrigin: 'top left' }}
            className="absolute left-0 top-[calc(100%+10px)] z-50 w-[min(92vw,22rem)] overflow-hidden rounded-card bg-card shadow-float"
          >
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-semibold text-fg">
                اعلان‌ها
                {unreadCount > 0 && <span className="tnum mr-1.5 text-[11px] font-normal text-fg-muted">({unreadCount} جدید)</span>}
              </span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="cursor-pointer rounded-full bg-sunken px-2.5 py-1 text-[11px] text-fg-secondary transition-colors hover:text-fg">
                  خواندن همه
                </button>
              )}
            </div>

            <div className="max-h-[22rem] overflow-y-auto px-1.5 pb-1.5">
              {loading && notifications.length === 0 ? (
                <div className="space-y-1.5 p-1.5">
                  {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-tile bg-sunken" />)}
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-fg-muted">
                  <svg className="mb-2 h-9 w-9 opacity-25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <span className="text-xs">اعلانی وجود ندارد</span>
                </div>
              ) : (
                notifications.map((n) => {
                  const m = typeMeta[n.type] || fallbackMeta;
                  return (
                    <div key={n.id} className={`group relative flex items-start gap-2.5 rounded-tile px-2.5 py-2.5 transition-colors hover:bg-sunken ${!n.read ? 'bg-sunken' : ''}`}>
                      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${m.tone}`}>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={m.icon} />
                        </svg>
                      </span>

                      <button onClick={() => openNotification(n)} className="min-w-0 flex-1 cursor-pointer text-right">
                        <div className="flex items-center gap-1.5">
                          {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-alert" />}
                          <span className={`truncate text-xs ${n.read ? 'font-normal text-fg-secondary' : 'font-semibold text-fg'}`}>{n.title}</span>
                        </div>
                        {n.message && <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-fg-muted">{n.message}</p>}
                        <p className="mt-1 text-[10px] text-fg-muted">{timeAgo(n.createdAt)}</p>
                      </button>

                      {/* Dismiss without navigating away from the current page */}
                      {!n.read && (
                        <button
                          onClick={(e) => { e.stopPropagation(); markRead(n.id); }}
                          title="علامت‌گذاری به‌عنوان خوانده‌شده"
                          aria-label={`خوانده‌شدن ${n.title}`}
                          className="mt-0.5 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-muted opacity-0 transition-all hover:bg-hover hover:text-fg focus:opacity-100 group-hover:opacity-100"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
