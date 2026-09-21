'use client';

import { useEffect, useState, useCallback } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useToast } from '@/components/Toast';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import api from '@/lib/api';

interface Status {
  connected: boolean;
  configured: boolean;
  encryptionReady: boolean;
  email?: string;
  connectedAt?: string;
  quota?: { limit: number | null; usage: number | null; email: string | null } | null;
}

const gb = (n: number) => (n / 1024 ** 3).toFixed(1);

export default function StoragePage() {
  const { showToast } = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/storage/status');
      setStatus(data);
    } catch {
      // auth handled by the interceptor
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const connect = async () => {
    setBusy(true);
    try {
      const { data } = await api.get('/storage/google/auth-url');
      // Google's consent screen refuses to render inside an iframe, so this
      // must be a real window. Polling detects the close and refreshes state.
      const w = window.open(data.url, 'google-drive', 'width=520,height=680');
      const timer = setInterval(() => {
        if (w?.closed) { clearInterval(timer); setBusy(false); load(); }
      }, 800);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در شروع اتصال', 'error');
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('اتصال گوگل درایو قطع شود؟ فایل‌های آپلودشده در درایو باقی می‌مانند ولی لینک‌هایشان در برنامه از کار می‌افتد.')) return;
    setBusy(true);
    try {
      await api.delete('/storage/google');
      showToast('اتصال قطع شد');
      load();
    } catch {
      showToast('خطا در قطع اتصال', 'error');
    } finally {
      setBusy(false);
    }
  };

  const notReady = status && (!status.configured || !status.encryptionReady);

  return (
    <ProtectedRoute allowedRoles={['CEO', 'TECHNICAL_MANAGER']}>
      <div className="pt-3" />

      <Card className="mb-3" tint="warn">
        <h2 className="text-sm font-bold text-fg">این بخش هنوز فعال نیست</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-fg-secondary">
          همه‌چیز ساخته و آماده است و فقط منتظر کلیدهای گوگل می‌ماند. تا آن موقع فایل‌های تسک‌ها
          مثل قبل روی سرور ذخیره می‌شوند و چیزی از کار نمی‌افتد.
        </p>
      </Card>

      {loading ? (
        <Skeleton className="h-48 rounded-card" />
      ) : (
        <>
          <Card className="mb-3">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sunken">
                  <svg viewBox="0 0 48 48" className="h-6 w-6" aria-hidden>
                    <path fill="#1e88e5" d="M17 6l-14 24 7 12 14-24z" />
                    <path fill="#fbc02d" d="M31 6H17l14 24h14z" />
                    <path fill="#4caf50" d="M10 42h28l7-12H17z" />
                  </svg>
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-bold text-fg">گوگل درایو</h2>
                    <Badge tone={status?.connected ? 'ok' : 'neutral'}>
                      {status?.connected ? 'متصل' : 'متصل نیست'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">
                    {status?.connected
                      ? status.email || status.quota?.email || 'حساب متصل'
                      : 'یک حساب سازمانی وصل کنید تا فایل‌ها آنجا ذخیره شوند'}
                  </p>
                  {status?.connected && status.quota?.limit != null && status.quota.usage != null && (
                    <div className="mt-3 w-56">
                      <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
                        <div
                          className={`h-full rounded-full ${
                            status.quota.usage / status.quota.limit > 0.9 ? 'bg-bad' : 'bg-ok'
                          }`}
                          style={{ width: `${Math.min(100, (status.quota.usage / status.quota.limit) * 100)}%` }}
                        />
                      </div>
                      <p className="tnum mt-1.5 text-[11px] text-fg-muted">
                        {gb(status.quota.usage)} از {gb(status.quota.limit)} گیگابایت استفاده شده
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {status?.connected ? (
                <button
                  onClick={disconnect}
                  disabled={busy}
                  className="rounded-full bg-bad-soft px-4 py-2 text-xs font-medium text-bad transition hover:opacity-80 disabled:opacity-50"
                >
                  قطع اتصال
                </button>
              ) : (
                <button
                  onClick={connect}
                  disabled={busy || !!notReady}
                  className="rounded-full bg-pill px-4 py-2 text-xs font-medium text-pill-fg transition hover:opacity-90 disabled:opacity-40"
                >
                  {busy ? 'در حال اتصال…' : 'اتصال به گوگل درایو'}
                </button>
              )}
            </div>
          </Card>

          {notReady && (
            <Card className="mb-3" tint="warn">
              <h3 className="text-sm font-semibold text-fg">قبل از اتصال، سرور باید تنظیم شود</h3>
              <ol className="mt-3 space-y-2.5 text-xs leading-relaxed text-fg-secondary">
                <li>
                  <b className="text-fg">۱.</b> در <span dir="ltr">console.cloud.google.com</span> یک پروژه بسازید و
                  «Google Drive API» را فعال کنید.
                </li>
                <li>
                  <b className="text-fg">۲.</b> در بخش Credentials یک «OAuth client ID» از نوع Web application بسازید و
                  این آدرس را به‌عنوان Authorized redirect URI ثبت کنید:
                  <code dir="ltr" className="mt-1.5 block rounded-lg bg-sunken px-2.5 py-1.5 text-[11px] text-fg">
                    {typeof window !== 'undefined' ? `${window.location.origin}/api/storage/google/callback` : ''}
                  </code>
                </li>
                <li>
                  <b className="text-fg">۳.</b> این سه مقدار را در فایل <span dir="ltr">.env</span> بک‌اند بگذارید و سرویس را ری‌استارت کنید:
                  <code dir="ltr" className="mt-1.5 block whitespace-pre rounded-lg bg-sunken px-2.5 py-1.5 text-[11px] text-fg">
{`GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
ENCRYPTION_KEY=<حداقل ۳۲ کاراکتر تصادفی>`}
                  </code>
                </li>
              </ol>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                <Badge tone={status?.configured ? 'ok' : 'bad'}>
                  کلیدهای گوگل: {status?.configured ? 'تنظیم شده' : 'تنظیم نشده'}
                </Badge>
                <Badge tone={status?.encryptionReady ? 'ok' : 'bad'}>
                  کلید رمزنگاری: {status?.encryptionReady ? 'تنظیم شده' : 'تنظیم نشده'}
                </Badge>
              </div>
            </Card>
          )}

          <Card>
            <h3 className="text-sm font-semibold text-fg">چطور کار می‌کند</h3>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-fg-secondary">
              <li>• فایل از مرورگر مستقیم به گوگل می‌رود و از سرور تسکان عبور نمی‌کند، پس ویدیوهای سنگین دیسک سرور را پر نمی‌کنند.</li>
              <li>• برای هر پروژه یک پوشه و داخلش برای هر تسک یک پوشه ساخته می‌شود.</li>
              <li>• دسترسی برنامه محدود به فایل‌هایی است که خودش می‌سازد؛ بقیه محتوای آن حساب گوگل برایش قابل دیدن نیست.</li>
              <li>• توکن دسترسی به‌صورت رمزنگاری‌شده در دیتابیس نگهداری می‌شود.</li>
              <li className="text-warn">• اگر کاربران شما در ایران هستند، ممکن است برای باز کردن لینک درایو به VPN نیاز داشته باشند.</li>
            </ul>
          </Card>
        </>
      )}
    </ProtectedRoute>
  );
}
