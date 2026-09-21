'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import Avatar from '@/components/ui/Avatar';
import api from '@/lib/api';
import { roleLabels } from '@/lib/roles';

interface SetQcModalProps {
  open: boolean;
  projectId: number;
  projectName: string;
  currentQcId?: number | null;
  onClose: () => void;
  onSuccess: () => void;
}



export default function SetQcModal({ open, projectId, projectName, currentQcId, onClose, onSuccess }: SetQcModalProps) {
  const { showToast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [selected, setSelected] = useState<number | null>(currentQcId ?? null);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(currentQcId ?? null);
    setQuery('');
    setLoading(true);
    // Any employee may review, so the picker draws from the whole org.
    // `/users/directory` is used rather than `/users`: it is readable by every
    // role allowed to assign a reviewer, and carries no HR data.
    api.get('/users/directory')
      .then(({ data }) => setUsers(data))
      .catch(async () => {
        // Last resort so the dialog is never empty.
        try {
          const { data } = await api.get(`/projects/${projectId}`);
          setUsers((data.members || []).map((m: any) => m.user).filter((u: any) => u.role !== 'CUSTOMER'));
        } catch {}
      })
      .finally(() => setLoading(false));
  }, [open, projectId, currentQcId]);

  if (!open) return null;

  const visible = users.filter((u) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${u.firstName} ${u.lastName} ${u.email ?? ''}`.toLowerCase().includes(q);
  });

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.post(`/projects/${projectId}/qc`, { userId: selected });
      showToast('مسئول کنترل کیفیت تعیین شد');
      onSuccess();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا', 'error');
    } finally { setSaving(false); }
  };

  const clear = async () => {
    setSaving(true);
    try {
      await api.delete(`/projects/${projectId}/qc`);
      showToast('مسئول کنترل کیفیت برداشته شد');
      onSuccess();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="animate-scale-in w-full max-w-md rounded-card bg-card p-5 shadow-float">
        <h2 className="text-sm font-semibold text-fg">مسئول کنترل کیفیت</h2>
        <p className="mt-1 text-[11px] text-fg-muted">
          تسک‌های پروژه «{projectName}» پس از تکمیل، ابتدا برای بررسی به این فرد می‌رود.
        </p>

        <label className="relative mt-4 block">
          <span className="sr-only">جستجوی کاربر</span>
          <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجوی نام…"
            className="w-full rounded-tile bg-sunken py-2.5 pr-9 pl-3 text-sm text-fg outline-none placeholder:text-fg-muted" />
        </label>

        <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
          {loading ? (
            [0,1,2].map(i => <div key={i} className="h-12 animate-pulse rounded-tile bg-sunken" />)
          ) : visible.length ? visible.map((u) => {
            const name = `${u.firstName} ${u.lastName}`.trim();
            const on = selected === u.id;
            return (
              <button key={u.id} onClick={() => setSelected(u.id)}
                className={`flex w-full cursor-pointer items-center gap-2.5 rounded-tile px-3 py-2.5 text-right transition-colors ${
                  on ? 'bg-pill text-pill-fg' : 'bg-sunken text-fg-secondary hover:text-fg'
                }`}>
                <Avatar name={name} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{name}</span>
                  <span className={`block truncate text-[10px] ${on ? 'opacity-70' : 'text-fg-muted'}`}>
                    {u.position || roleLabels[u.role] || u.role}
                  </span>
                </span>
                {on && (
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          }) : <p className="py-6 text-center text-xs text-fg-muted">کاربری پیدا نشد</p>}
        </div>

        <div className="mt-5 flex items-center gap-2">
          <button onClick={save} disabled={!selected || saving || selected === currentQcId}
            className="flex-1 cursor-pointer rounded-full bg-pill py-2.5 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
            {saving ? 'در حال ذخیره…' : 'تعیین'}
          </button>
          {currentQcId && (
            <button onClick={clear} disabled={saving}
              className="cursor-pointer rounded-full bg-bad-soft px-4 py-2.5 text-xs font-medium text-bad transition-opacity hover:opacity-80 disabled:opacity-40">
              برداشتن
            </button>
          )}
          <button onClick={onClose}
            className="cursor-pointer rounded-full bg-sunken px-4 py-2.5 text-xs font-medium text-fg-secondary transition-colors hover:text-fg">
            انصراف
          </button>
        </div>

        {currentQcId && (
          <p className="mt-3 text-[10px] leading-relaxed text-fg-muted">
            با برداشتن مسئول، تسک‌هایی که الان منتظر کنترل کیفیت‌اند مستقیم به مرحله تایید مدیر می‌روند.
          </p>
        )}
      </div>
    </div>
  );
}
