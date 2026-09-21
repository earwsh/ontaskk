'use client';

import { useState, useMemo } from 'react';
import Card from '@/components/ui/Card';
import { useToast } from '@/components/Toast';

/**
 * Generates the snippet a site owner pastes into their page. It mirrors the
 * shape the sites already post to onsupp, so migrating a live form is a
 * one-line change: swap the endpoint URL.
 */
export default function ScriptPanel() {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [site, setSite] = useState('');
  const [formName, setFormName] = useState('');

  const endpoint = useMemo(() => {
    if (typeof window === 'undefined') return '/api/forms/submit';
    return `${window.location.origin}/api/forms/submit`;
  }, []);

  const snippet = useMemo(() => {
    const s = site.trim() || 'example.com';
    const f = formName.trim() || 'فرم تماس';
    return `<script>
document.addEventListener('submit', async function (e) {
  var form = e.target;
  if (!form.matches('form')) return;
  e.preventDefault();

  var fields = {};
  new FormData(form).forEach(function (value, key) { fields[key] = value; });

  try {
    var response = await fetch('${endpoint}', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site: '${s}',
        form_name: '${f}',
        page_url: window.location.href,
        fields: fields
      })
    });
    var result = await response.json();
    if (response.ok && result.success) {
      form.reset();
      alert('اطلاعات با موفقیت ارسال شد');
    } else {
      alert('خطا در ارسال اطلاعات');
    }
  } catch (err) {
    alert('خطا در ارتباط با سرور');
  }
});
</script>`;
  }, [site, formName, endpoint]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      showToast('اسکریپت کپی شد');
    } catch {
      showToast('کپی نشد — دستی انتخاب کنید', 'error');
    }
  };

  return (
    <Card className="mb-3" padding="sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 text-right"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">اسکریپت اتصال سایت</p>
          <p className="mt-0.5 text-[11px] text-fg-muted">این کد را در سایت قرار دهید تا فرم‌ها به تسکان بیایند</p>
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-fg-muted transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-fg-secondary">نام سایت</span>
              <input
                value={site}
                onChange={(e) => setSite(e.target.value)}
                placeholder="example.com"
                dir="ltr"
                className="w-full rounded-xl bg-sunken px-3 py-2 text-xs text-fg outline-none placeholder:text-fg-muted"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-fg-secondary">نام فرم</span>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="فرم تماس"
                className="w-full rounded-xl bg-sunken px-3 py-2 text-xs text-fg outline-none placeholder:text-fg-muted"
              />
            </label>
          </div>

          <div className="relative">
            <pre
              dir="ltr"
              className="max-h-72 overflow-auto rounded-xl bg-sunken p-3 text-[11px] leading-relaxed text-fg-secondary"
            >
              <code>{snippet}</code>
            </pre>
            <button
              onClick={copy}
              className="absolute left-2 top-2 rounded-full bg-pill px-3 py-1.5 text-[11px] font-medium text-pill-fg transition hover:opacity-90"
            >
              کپی
            </button>
          </div>

          <p className="text-[11px] leading-relaxed text-fg-muted">
            آدرس ارسال: <span dir="ltr" className="text-fg-secondary">{endpoint}</span>
            <br />
            این آدرس باز است و نیازی به کلید ندارد — دقیقاً مثل روش قبلی. برای جلوگیری از اسپم،
            حداکثر ۱۰ ارسال در دقیقه و ۱۲۰ ارسال در ساعت از هر IP پذیرفته می‌شود.
          </p>
        </div>
      )}
    </Card>
  );
}
