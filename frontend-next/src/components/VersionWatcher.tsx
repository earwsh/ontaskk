'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

/** Baked in at build time; the server reports its own via /build-info. */
const MY_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';

const POLL_MS = 3 * 60 * 1000;
const DISMISS_KEY = 'version-notice-dismissed';

/**
 * Tells the user when a newer deploy is live, without ever reloading on its
 * own — a forced refresh would discard whatever they were in the middle of
 * typing. They choose when.
 */
export default function VersionWatcher() {
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const reduceMotion = useReducedMotion();
  const checking = useRef(false);

  const check = useCallback(async () => {
    if (checking.current || MY_VERSION === 'dev') return;
    checking.current = true;
    try {
      const res = await fetch('/build-info', { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
      if (!res.ok) return;
      const { version } = await res.json();
      if (!version || version === 'dev' || version === MY_VERSION) return;
      // Respect a dismissal, but only for that specific version.
      if (sessionStorage.getItem(DISMISS_KEY) === version) return;
      setNewVersion(version);
    } catch {
      // Offline or a blip — try again on the next tick.
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    // Check straight away: someone opening a tab they left yesterday should be
    // told now, not after the first interval elapses.
    check();
    const id = setInterval(check, POLL_MS);
    // Returning to the tab is the likeliest moment to have missed a deploy.
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [check]);

  const dismiss = () => {
    if (newVersion) { try { sessionStorage.setItem(DISMISS_KEY, newVersion); } catch {} }
    setNewVersion(null);
  };

  const refresh = () => {
    setReloading(true);
    window.location.reload();
  };

  return (
    <AnimatePresence>
      {newVersion && (
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -28, scale: 0.94 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -20, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 480, damping: 30 }}
          role="status"
          aria-live="polite"
          className="fixed left-1/2 top-4 z-[110] w-[min(92vw,26rem)] -translate-x-1/2 rounded-card bg-card p-4 shadow-float"
        >
          <div className="flex items-start gap-3">
            <motion.span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-on-soft"
              animate={reduceMotion ? {} : { rotate: [0, 12, -8, 0] }}
              transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 3 }}
            >
              <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </motion.span>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">نسخه جدید تسکان منتشر شد</p>
              <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">
                برای دیدن تغییرات صفحه را تازه کنید. کار نیمه‌تمام شما از بین نمی‌رود — هر وقت آماده بودید بزنید.
              </p>

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={refresh}
                  disabled={reloading}
                  className="cursor-pointer rounded-full bg-pill px-4 py-1.5 text-[11px] font-medium text-pill-fg transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {reloading ? 'در حال تازه‌سازی…' : 'به‌روزرسانی'}
                </button>
                <button
                  onClick={dismiss}
                  className="cursor-pointer rounded-full bg-sunken px-4 py-1.5 text-[11px] font-medium text-fg-secondary transition-colors hover:text-fg"
                >
                  بعداً
                </button>
              </div>
            </div>

            <button
              onClick={dismiss}
              aria-label="بستن"
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-hover hover:text-fg"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
