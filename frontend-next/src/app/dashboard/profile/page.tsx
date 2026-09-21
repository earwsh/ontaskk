'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Avatar from '@/components/ui/Avatar';
import Skeleton from '@/components/ui/Skeleton';
import { useToast } from '@/components/Toast';
import api from '@/lib/api';
import { roleLabel } from '@/lib/roles';
import { gregorianToShamsi, jalaliDate } from '@/lib/date';
import { setCachedUser, displayNameOf } from '@/lib/currentUser';
import PerformanceSummary from '@/components/profile/PerformanceSummary';

const field =
  'w-full rounded-tile bg-sunken px-3.5 py-2.5 text-sm text-fg outline-none transition-colors placeholder:text-fg-muted focus:bg-hover disabled:cursor-not-allowed disabled:text-fg-muted';

/** A value the organisation owns — shown, never editable here. */
function ReadOnly({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium text-fg-muted">{label}</label>
      <div className="rounded-tile bg-sunken px-3.5 py-2.5 text-sm text-fg-secondary">{value || '—'}</div>
    </div>
  );
}

export default function ProfilePage() {
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ displayName: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/users/me');
      setMe(data);
      setForm({ displayName: data.displayName || '', phone: data.phone || '' });
      setCachedUser(data);
    } catch {
      showToast('خطا در دریافت اطلاعات', 'error');
    }
    setLoading(false);
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const dirty = me && (
    (form.displayName || '') !== (me.displayName || '') ||
    (form.phone || '') !== (me.phone || '')
  );

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch('/users/me', form);
      setMe(data);
      setCachedUser(data);
      showToast('اطلاعات ذخیره شد', 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'خطا در ذخیره اطلاعات', 'error');
    }
    setSaving(false);
  };

  const pickPhoto = async (file: File) => {
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const { data } = await api.post('/users/me/avatar', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMe(data);
      setCachedUser(data);
      showToast('تصویر بارگذاری شد', 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'خطا در بارگذاری تصویر', 'error');
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removePhoto = async () => {
    setUploading(true);
    try {
      const { data } = await api.delete('/users/me/avatar');
      setMe(data);
      setCachedUser(data);
      showToast('تصویر حذف شد', 'success');
    } catch {
      showToast('خطا در حذف تصویر', 'error');
    }
    setUploading(false);
  };

  const changePassword = async () => {
    setPwError('');
    if (pw.newPassword.length < 8) return setPwError('رمز جدید باید حداقل ۸ کاراکتر باشد');
    if (pw.newPassword !== pw.confirm) return setPwError('تکرار رمز جدید یکسان نیست');
    setPwSaving(true);
    try {
      await api.post('/users/me/password', {
        currentPassword: pw.currentPassword,
        newPassword: pw.newPassword,
      });
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      showToast('رمز عبور تغییر کرد', 'success');
    } catch (err: any) {
      setPwError(err?.response?.data?.error || 'خطا در تغییر رمز');
    }
    setPwSaving(false);
  };

  if (loading) {
    return (
      <div className="space-y-3 py-5">
        <Skeleton className="h-32 w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    );
  }

  const name = me ? displayNameOf(me) : '';
  const departments: string[] = (me?.departmentMemberships || [])
    .map((m: any) => m.department?.name)
    .filter(Boolean);

  return (
    <ProtectedRoute>
      <div className="py-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-fg md:text-[32px] md:leading-none">پروفایل من</h1>
        <p className="mt-1.5 text-sm text-fg-muted">اطلاعات شخصی، تصویر و رمز عبور</p>
      </div>

      <div className="space-y-3">
        <Card>
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name={name} size={72} src={me?.avatarUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold text-fg">{name}</p>
              <p className="mt-0.5 truncate text-xs text-fg-muted">
                {me?.position || 'بدون سمت'} · {me?.email}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge tone="brand">{roleLabel(me?.role)}</Badge>
                {departments.map((d) => <Badge key={d} tone="neutral">{d}</Badge>)}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) pickPhoto(f); }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="cursor-pointer rounded-full bg-pill px-4 py-2 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {uploading ? '…' : me?.avatarUrl ? 'تغییر تصویر' : 'افزودن تصویر'}
              </button>
              {me?.avatarUrl && (
                <button
                  onClick={removePhoto}
                  disabled={uploading}
                  className="cursor-pointer rounded-full bg-bad-soft px-4 py-2 text-xs font-medium text-bad transition-opacity hover:opacity-80 disabled:opacity-40"
                >
                  حذف تصویر
                </button>
              )}
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card>
            <h2 className="text-sm font-semibold text-fg">اطلاعات من</h2>
            <p className="mt-1 text-[11px] text-fg-muted">این‌ها را خودتان تغییر می‌دهید.</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-fg-muted">نام نمایشی</label>
                <input
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  placeholder={`${me?.firstName ?? ''} ${me?.lastName ?? ''}`.trim()}
                  className={field}
                />
                <p className="mt-1 text-[10px] text-fg-muted">اگر خالی بماند، نام و نام خانوادگی نشان داده می‌شود.</p>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-fg-muted">شماره تماس</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="۰۹…"
                  className={`${field} tnum`}
                  dir="ltr"
                />
              </div>
              <button
                onClick={save}
                disabled={!dirty || saving}
                className="cursor-pointer rounded-full bg-pill px-5 py-2 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {saving ? 'در حال ذخیره…' : 'ذخیره'}
              </button>
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <h3 className="text-[11px] font-semibold text-fg-secondary">اطلاعات سازمانی</h3>
              <p className="mt-1 text-[10px] text-fg-muted">
                این‌ها را مدیر داخلی تغییر می‌دهد. اگر اشتباه است به او بگویید.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ReadOnly label="ایمیل (ورود به سامانه)" value={me?.email} />
                <ReadOnly label="سمت" value={me?.position} />
                <ReadOnly label="نقش" value={roleLabel(me?.role)} />
                <ReadOnly label="دپارتمان" value={departments.join('، ')} />
                <ReadOnly label="تاریخ شروع همکاری" value={me?.startDate ? gregorianToShamsi(me.startDate) : null} />
                <ReadOnly label="عضو از" value={jalaliDate(me?.createdAt)} />
              </div>
            </div>
          </Card>

          <div className="space-y-3">
            <Card>
              <h2 className="text-sm font-semibold text-fg">تغییر رمز عبور</h2>
              <p className="mt-1 text-[11px] text-fg-muted">
                رمز فعلی لازم است — تا کسی که پشت سیستم باز شما بنشیند نتواند حساب را بگیرد.
              </p>
              <div className="mt-4 space-y-3">
                <input
                  type="password"
                  value={pw.currentPassword}
                  onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
                  placeholder="رمز فعلی"
                  autoComplete="current-password"
                  className={field}
                />
                <input
                  type="password"
                  value={pw.newPassword}
                  onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
                  placeholder="رمز جدید (حداقل ۸ کاراکتر)"
                  autoComplete="new-password"
                  className={field}
                />
                <input
                  type="password"
                  value={pw.confirm}
                  onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
                  placeholder="تکرار رمز جدید"
                  autoComplete="new-password"
                  className={field}
                />
                {pwError && <p className="text-[11px] text-bad">{pwError}</p>}
                <button
                  onClick={changePassword}
                  disabled={pwSaving || !pw.currentPassword || !pw.newPassword}
                  className="cursor-pointer rounded-full bg-pill px-5 py-2 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {pwSaving ? 'در حال تغییر…' : 'تغییر رمز'}
                </button>
              </div>
            </Card>

            {me?.id && <PerformanceSummary userId={me.id} title="عملکرد من" />}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
