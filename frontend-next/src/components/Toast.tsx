'use client';

import { useState, useCallback, createContext, useContext, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType>({ showToast: () => {} });
export const useToast = () => useContext(ToastContext);

const meta: Record<ToastType, { icon: string; ring: string; dot: string; bar: string }> = {
  success: { icon: 'M5 13l4 4L19 7', ring: 'bg-ok-soft text-ok', dot: 'bg-ok', bar: 'bg-ok' },
  error:   { icon: 'M6 18L18 6M6 6l12 12', ring: 'bg-bad-soft text-bad', dot: 'bg-bad', bar: 'bg-bad' },
  info:    { icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', ring: 'bg-info-soft text-info', dot: 'bg-info', bar: 'bg-info' },
};

/** Eight sparks fired outward from the icon when something succeeds. */
const SPARKS = Array.from({ length: 8 }, (_, i) => {
  const angle = (i / 8) * Math.PI * 2;
  return { x: Math.cos(angle) * 26, y: Math.sin(angle) * 26, delay: 0.1 + i * 0.012 };
});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // A counter in the component body resets on every render, so two toasts
  // could share an id and dismissing one would remove the wrong card.
  const nextId = useRef(0);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const reduceMotion = useReducedMotion();

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'success', duration = 3600) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev.slice(-3), { id, message, type, duration }]);
    timers.current[id] = setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      <div
        className="pointer-events-none fixed bottom-6 left-1/2 z-[100000] flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col-reverse items-center gap-2"
        role="status"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const m = meta[toast.type];

            // Squash-and-stretch: the card stretches tall as it rises, then
            // splats wide on landing before settling. That weight shift is
            // what reads as "a droplet", not the shape itself.
            const enter = reduceMotion
              ? { opacity: 1 }
              : {
                  opacity: 1,
                  y: 0,
                  scaleX: [0.55, 0.72, 1.14, 0.96, 1],
                  scaleY: [1.5, 1.3, 0.82, 1.05, 1],
                  borderRadius: ['999px', '72px', '26px', '19px', '20px'],
                };

            return (
              <motion.div
                key={toast.id}
                layout
                style={{ transformOrigin: 'bottom center' }}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 90, scaleX: 0.5, scaleY: 1.6, borderRadius: '999px' }}
                animate={enter}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 26, scaleX: 1.25, scaleY: 0.6, borderRadius: '999px' }}
                transition={reduceMotion ? { duration: 0.15 } : {
                  default: { type: 'spring', stiffness: 520, damping: 26, mass: 0.8 },
                  scaleX: { duration: 0.62, times: [0, 0.28, 0.52, 0.76, 1], ease: 'easeOut' },
                  scaleY: { duration: 0.62, times: [0, 0.28, 0.52, 0.76, 1], ease: 'easeOut' },
                  borderRadius: { duration: 0.62, times: [0, 0.28, 0.52, 0.76, 1], ease: 'easeOut' },
                  opacity: { duration: 0.18 },
                }}
                drag={reduceMotion ? false : 'x'}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.35}
                onDragEnd={(_, info) => { if (Math.abs(info.offset.x) > 90) dismiss(toast.id); }}
                className="pointer-events-auto relative w-full cursor-grab bg-card shadow-float active:cursor-grabbing"
              >
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${m.ring}`}>
                    {/* Sparks burst outward, then fall back — the celebratory beat */}
                    {!reduceMotion && toast.type === 'success' && SPARKS.map((s, i) => (
                      <motion.span
                        key={i}
                        className={`absolute h-1.5 w-1.5 rounded-full ${m.dot}`}
                        initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                        animate={{ x: s.x, y: s.y, opacity: [0, 1, 0], scale: [0, 1, 0.2] }}
                        transition={{ duration: 0.62, delay: s.delay, ease: 'easeOut' }}
                      />
                    ))}
                    <motion.span
                      className="flex items-center justify-center"
                      initial={reduceMotion ? false : { scale: 0.2, rotate: -30 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 700, damping: 14, delay: 0.14 }}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.6}>
                        <motion.path
                          strokeLinecap="round" strokeLinejoin="round" d={m.icon}
                          initial={reduceMotion ? false : { pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: 0.3, ease: 'easeOut', delay: 0.2 }}
                        />
                      </svg>
                    </motion.span>
                  </span>

                  <motion.p
                    className="min-w-0 flex-1 text-sm font-medium leading-snug text-fg"
                    initial={reduceMotion ? false : { opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.16, duration: 0.24 }}
                  >
                    {toast.message}
                  </motion.p>

                  <button
                    onClick={() => dismiss(toast.id)}
                    aria-label="بستن اعلان"
                    className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-hover hover:text-fg"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <span className="pointer-events-none absolute inset-x-3 bottom-1.5 h-0.5 overflow-hidden rounded-full">
                  <motion.span
                    className={`block h-full origin-right ${m.bar}`}
                    initial={{ scaleX: 1 }}
                    animate={{ scaleX: 0 }}
                    transition={{ duration: toast.duration / 1000, ease: 'linear', delay: 0.4 }}
                  />
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
