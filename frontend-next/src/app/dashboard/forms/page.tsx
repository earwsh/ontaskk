'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useToast } from '@/components/Toast';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import { gregorianToShamsi, jalaliDateTime } from '@/lib/date';
import api from '@/lib/api';
import ScriptPanel from './ScriptPanel';

interface Submission {
  id: number;
  site: string;
  formName: string;
  pageUrl: string | null;
  fields: Record<string, string>;
  ip: string | null;
  read: boolean;
  archived: boolean;
  createdAt: string;
}

/** Relative time in Persian — submissions are read newest-first. */
function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'همین الان';
  if (mins < 60) return `${mins} دقیقه پیش`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ساعت پیش`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} روز پیش`;
  return gregorianToShamsi(iso);
}

/**
 * Submitted values are untrusted text from a public endpoint. React escapes
 * them, but a link must still be checked: only http(s) may become an <a>.
 */
function isSafeHttp(url: string | null): url is string {
  if (!url) return false;
  try {
    const p = new URL(url).protocol;
    return p === 'http:' || p === 'https:';
  } catch {
    return false;
  }
}

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const isPhone = (v: string) => /^[+\d][\d\s-]{6,19}$/.test(v.trim());

export default function FormsPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [site, setSite] = useState<string>('');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/forms/submissions', {
        params: { archived: showArchived ? 'true' : 'false', ...(site ? { site } : {}) },
      });
      setItems(res.data);
    } catch {
      // auth handled by the interceptor
    } finally {
      setLoading(false);
    }
  }, [showArchived, site]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const sites = useMemo(() => {
    const set = new Map<string, number>();
    for (const i of items) set.set(i.site, (set.get(i.site) ?? 0) + 1);
    return [...set.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      i.formName.toLowerCase().includes(q) ||
      i.site.toLowerCase().includes(q) ||
      Object.values(i.fields || {}).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [items, query]);

  const unread = items.filter((i) => !i.read).length;

  const patch = async (id: number, data: Partial<Pick<Submission, 'read' | 'archived'>>) => {
    setBusyId(id);
    try {
      await api.patch(`/forms/submissions/${id}`, data);
      if (data.archived !== undefined) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        showToast(data.archived ? 'به بایگانی منتقل شد' : 'از بایگانی خارج شد');
      } else {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...data } : i)));
      }
    } catch {
      showToast('خطا در بروزرسانی', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: number) => {
    setBusyId(id);
    try {
      await api.delete(`/forms/submissions/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
      showToast('حذف شد');
    } catch {
      showToast('خطا در حذف', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const markAllRead = async () => {
    try {
      await api.patch('/forms/submissions/read-all');
      setItems((prev) => prev.map((i) => ({ ...i, read: true })));
      showToast('همه خوانده شد');
    } catch {
      showToast('خطا در بروزرسانی', 'error');
    }
  };

  const toggleOpen = (item: Submission) => {
    setOpenId((cur) => (cur === item.id ? null : item.id));
    if (!item.read) patch(item.id, { read: true });
  };

  return (
    <ProtectedRoute allowedRoles={['CEO', 'TECHNICAL_MANAGER', 'INTERNAL_MANAGER']}>
      {unread > 0 && (
        <div className="flex justify-end pt-3 pb-2">
          <button
            onClick={markAllRead}
            className="rounded-full bg-sunken px-4 py-2 text-xs font-medium text-fg-secondary transition hover:text-fg"
          >
            علامت‌گذاری همه به‌عنوان خوانده‌شده
          </button>
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'خوانده‌نشده', value: unread, tone: unread ? 'bad' : 'ok', hint: 'فرم‌های جدید' },
          { label: 'کل فرم‌ها', value: items.length, hint: showArchived ? 'در بایگانی' : 'در صندوق' },
          { label: 'سایت‌ها', value: sites.length, hint: 'منابع فعال' },
          {
            label: 'امروز',
            value: items.filter((i) => Date.now() - new Date(i.createdAt).getTime() < 86400000).length,
            hint: '۲۴ ساعت گذشته',
          },
        ].map((k) => (
          <Card key={k.label} padding="sm">
            <div className="flex items-start justify-between">
              {loading ? <Skeleton className="h-8 w-12" /> : <span className="tnum text-3xl font-extrabold text-fg">{k.value}</span>}
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                k.tone === 'bad' ? 'bg-bad-soft text-bad' : k.tone === 'ok' ? 'bg-ok-soft text-ok' : 'bg-sunken text-fg-secondary'
              }`}>{k.label}</span>
            </div>
            <p className="mt-3 text-[11px] text-fg-muted">{k.hint}</p>
          </Card>
        ))}
      </div>

      <ScriptPanel />

      <Card className="mb-3" padding="sm">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجو در نام، سایت یا محتوای فرم…"
            className="min-w-[200px] flex-1 rounded-full bg-sunken px-4 py-2 text-xs text-fg outline-none placeholder:text-fg-muted"
          />
          <button
            onClick={() => setSite('')}
            className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
              site === '' ? 'bg-pill text-pill-fg' : 'bg-sunken text-fg-secondary hover:text-fg'
            }`}
          >
            همه سایت‌ها
          </button>
          {sites.map(([s, n]) => (
            <button
              key={s}
              onClick={() => setSite(s)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
                site === s ? 'bg-pill text-pill-fg' : 'bg-sunken text-fg-secondary hover:text-fg'
              }`}
            >
              {s} <span className="tnum opacity-60">{n}</span>
            </button>
          ))}
          <button
            onClick={() => setShowArchived((v) => !v)}
            className={`mr-auto rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
              showArchived ? 'bg-pill text-pill-fg' : 'bg-sunken text-fg-secondary hover:text-fg'
            }`}
          >
            {showArchived ? 'نمایش صندوق' : 'نمایش بایگانی'}
          </button>
        </div>
      </Card>

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-card" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="py-16 text-center">
          <p className="text-sm font-semibold text-fg">
            {showArchived ? 'بایگانی خالی است' : 'هنوز فرمی دریافت نشده'}
          </p>
          <p className="mt-1.5 text-xs text-fg-muted">
            {showArchived ? '' : 'اسکریپت بالا را در سایت خود قرار دهید تا ارسال‌ها اینجا نمایش داده شوند'}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            const open = openId === item.id;
            const entries = Object.entries(item.fields || {});
            return (
              <Card key={item.id} padding="none" className={item.read ? '' : 'ring-1 ring-brand/40'}>
                <button
                  onClick={() => toggleOpen(item)}
                  className="flex w-full items-center gap-3 p-4 text-right"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${item.read ? 'bg-transparent' : 'bg-brand'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`truncate text-sm ${item.read ? 'font-medium text-fg-secondary' : 'font-bold text-fg'}`}>
                        {item.formName}
                      </span>
                      <Badge tone="neutral">{item.site}</Badge>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-fg-muted">
                      {entries.slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' — ') || 'بدون محتوا'}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-fg-muted">{ago(item.createdAt)}</span>
                  <svg
                    className={`h-4 w-4 shrink-0 text-fg-muted transition-transform ${open ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {open && (
                  <div className="border-t border-line px-4 pb-4 pt-3">
                    <dl className="grid gap-2 sm:grid-cols-2">
                      {entries.map(([k, v]) => (
                        <div key={k} className="rounded-xl bg-sunken px-3 py-2">
                          <dt className="text-[10px] font-medium text-fg-muted">{k}</dt>
                          <dd className="mt-0.5 break-words text-xs text-fg">
                            {isEmail(v) ? (
                              <a className="text-brand-ink underline" href={`mailto:${v}`}>{v}</a>
                            ) : isPhone(v) ? (
                              <a className="text-brand-ink underline" dir="ltr" href={`tel:${v.replace(/[\s-]/g, '')}`}>{v}</a>
                            ) : (
                              v || '—'
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                      {isSafeHttp(item.pageUrl) && (
                        <a
                          href={item.pageUrl}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="rounded-full bg-sunken px-3 py-1.5 font-medium text-fg-secondary transition hover:text-fg"
                        >
                          صفحهٔ فرم ↗
                        </a>
                      )}
                      <button
                        disabled={busyId === item.id}
                        onClick={() => patch(item.id, { read: !item.read })}
                        className="rounded-full bg-sunken px-3 py-1.5 font-medium text-fg-secondary transition hover:text-fg disabled:opacity-50"
                      >
                        {item.read ? 'خوانده‌نشده' : 'خوانده شد'}
                      </button>
                      <button
                        disabled={busyId === item.id}
                        onClick={() => patch(item.id, { archived: !item.archived })}
                        className="rounded-full bg-sunken px-3 py-1.5 font-medium text-fg-secondary transition hover:text-fg disabled:opacity-50"
                      >
                        {item.archived ? 'خروج از بایگانی' : 'بایگانی'}
                      </button>
                      <button
                        disabled={busyId === item.id}
                        onClick={() => remove(item.id)}
                        className="rounded-full bg-bad-soft px-3 py-1.5 font-medium text-bad transition hover:opacity-80 disabled:opacity-50"
                      >
                        حذف
                      </button>
                      <span className="mr-auto text-fg-muted" dir="ltr">
                        {item.ip || ''} · {jalaliDateTime(item.createdAt)}
                      </span>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </ProtectedRoute>
  );
}
