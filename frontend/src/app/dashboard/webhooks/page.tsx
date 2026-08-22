'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';

interface Webhook {
  id: number;
  name: string;
  targetUrl: string;
  secret: string | null;
  events: string;
  isActive: boolean;
  createdAt: string;
  createdBy: {
    id: number;
    firstName: string;
    lastName: string;
  };
}

const AVAILABLE_EVENTS = [
  { id: '*', label: 'همه رویدادها (*)' },
  { id: 'chat.message_created', label: 'ارسال پیام جدید در چت (chat.message_created)' },
  { id: 'task.assigned', label: 'محول شدن تسک به کاربر (task.assigned)' },
  { id: 'task.completed', label: 'تکمیل شدن تسک (task.completed)' },
  { id: 'task.approved', label: 'تایید تسک (task.approved)' },
];

export default function WebhooksPage() {
  const { showToast } = useToast();
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['*']);
  const [saving, setSaving] = useState(false);

  const fetchWebhooks = async () => {
    try {
      const { data } = await api.get('/webhooks');
      setWebhooks(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !targetUrl.trim()) return;

    setSaving(true);
    try {
      await api.post('/webhooks', {
        name: name.trim(),
        targetUrl: targetUrl.trim(),
        secret: secret.trim() || undefined,
        events: selectedEvents.includes('*') ? '*' : selectedEvents.join(','),
      });
      showToast('وب‌هوک با موفقیت ایجاد شد');
      setShowModal(false);
      setName('');
      setTargetUrl('');
      setSecret('');
      setSelectedEvents(['*']);
      fetchWebhooks();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در ثبت وب‌هوک', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (webhook: Webhook) => {
    try {
      await api.patch(`/webhooks/${webhook.id}`, { isActive: !webhook.isActive });
      setWebhooks((prev) =>
        prev.map((w) => (w.id === webhook.id ? { ...w, isActive: !w.isActive } : w))
      );
      showToast('وضعیت وب‌هوک به‌روزرسانی شد');
    } catch (err: any) {
      showToast('خطا در تغییر وضعیت وب‌هوک', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('آیا از حذف این وب‌هوک اطمینان دارید؟')) return;
    try {
      await api.delete(`/webhooks/${id}`);
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
      showToast('وب‌هوک با موفقیت حذف شد');
    } catch (err: any) {
      showToast('خطا در حذف وب‌هوک', 'error');
    }
  };

  const handleTestWebhook = async (id: number) => {
    setTestingId(id);
    try {
      const { data } = await api.post(`/webhooks/${id}/test`);
      if (data.success) {
        showToast(`پاسخ موفق دریافت شد: ${data.statusCode} ${data.statusText}`);
      }
    } catch (err: any) {
      showToast(`خطا در ارسال پیام آزمایشی: ${err.response?.data?.error || err.message}`, 'error');
    } finally {
      setTestingId(null);
    }
  };

  const toggleEvent = (eventId: string) => {
    if (eventId === '*') {
      setSelectedEvents(['*']);
      return;
    }

    let next = selectedEvents.filter((e) => e !== '*');
    if (next.includes(eventId)) {
      next = next.filter((e) => e !== eventId);
    } else {
      next.push(eventId);
    }

    if (next.length === 0) next = ['*'];
    setSelectedEvents(next);
  };

  return (
    <ProtectedRoute allowedRoles={['TECHNICAL_MANAGER']}>
      <div className="space-y-6 animate-fade-in" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">مدیریت وب‌هوک‌ها و یکپارچه‌سازی</h1>
            <p className="text-xs text-text-muted mt-1">
              ارسال خودکار و لحظه‌ای پیام‌ها و رویدادهای سیستم به سرورها و ربات‌های خارجی
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shadow-md cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            تعریف وب‌هوک جدید
          </button>
        </div>

        {/* Webhook Cards List */}
        {loading ? (
          <div className="p-12 text-center text-text-muted text-sm">در حال بارگذاری وب‌هوک‌ها...</div>
        ) : webhooks.length === 0 ? (
          <div className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-12 text-center flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-white">هنوز وب‌هوکی تعریف نشده است</h3>
            <p className="text-xs text-text-muted max-w-md">
              با ایجاد وب‌هوک می‌توانید رویدادهای پیام‌رسان و تسک‌ها را به ربات‌های تلگرام، بله، ایتا، اسلک یا سیستم CRM خود متصل کنید.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-xs font-medium"
            >
              افزودن اولین وب‌هوک
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {webhooks.map((w) => (
              <div
                key={w.id}
                className="bg-card border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] rounded-[20px] p-5 space-y-4 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      w.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-500/10 text-zinc-400'
                    }`}>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">{w.name}</h3>
                      <p className="text-[11px] text-text-muted truncate max-w-xs font-mono">{w.targetUrl}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleActive(w)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                      w.isActive
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                    }`}
                  >
                    {w.isActive ? 'فعال' : 'غیرفعال'}
                  </button>
                </div>

                <div className="p-3 bg-[rgba(22,27,38,0.5)] rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between text-text-secondary">
                    <span>رویدادهای گوش‌به‌زنگ:</span>
                    <span className="font-mono text-[11px] text-primary">{w.events}</span>
                  </div>
                  {w.secret && (
                    <div className="flex items-center justify-between text-text-secondary">
                      <span>کلید امنیتی (HMAC):</span>
                      <span className="font-mono text-[10px] text-text-muted truncate max-w-[160px]">
                        {w.secret.substring(0, 8)}...
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[rgba(255,255,255,0.04)]">
                  <span className="text-[10px] text-text-muted">
                    ایجاد توسط {w.createdBy?.firstName} {w.createdBy?.lastName}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleTestWebhook(w.id)}
                      disabled={testingId === w.id}
                      className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs font-medium transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                    >
                      {testingId === w.id ? (
                        <span>در حال تست...</span>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          تست ارسال
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(w.id)}
                      className="p-1.5 text-text-muted hover:text-danger rounded-lg hover:bg-danger/10 transition-all"
                      title="حذف وب‌هوک"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Webhook Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-card border border-[rgba(255,255,255,0.08)] rounded-[24px] w-full max-w-lg overflow-hidden shadow-2xl animate-scale-in">
              <div className="px-6 py-4 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
                <h3 className="text-base font-bold text-white">افزودن وب‌هوک جدید</h3>
                <button onClick={() => setShowModal(false)} className="text-text-muted hover:text-white">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleCreateWebhook} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">نام وب‌هوک *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مثال: ربات اعلان تلگرام"
                    className="w-full px-4 py-2.5 bg-[rgba(22,27,38,0.6)] border border-[rgba(255,255,255,0.08)] rounded-xl text-xs text-white placeholder-text-muted focus:outline-none focus:border-primary/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">آدرس سرور مقصد (Target URL) *</label>
                  <input
                    type="url"
                    required
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    placeholder="https://your-server.com/api/webhook"
                    className="w-full px-4 py-2.5 bg-[rgba(22,27,38,0.6)] border border-[rgba(255,255,255,0.08)] rounded-xl text-xs text-white placeholder-text-muted focus:outline-none focus:border-primary/50 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">کلید امضای امنیتی (اختیاری)</label>
                  <input
                    type="text"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder="در صورت خالی بودن، خودکار تولید می‌شود"
                    className="w-full px-4 py-2.5 bg-[rgba(22,27,38,0.6)] border border-[rgba(255,255,255,0.08)] rounded-xl text-xs text-white placeholder-text-muted focus:outline-none focus:border-primary/50 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-2">رویدادهای مورد نظر</label>
                  <div className="space-y-1.5">
                    {AVAILABLE_EVENTS.map((ev) => {
                      const selected = selectedEvents.includes(ev.id);
                      return (
                        <div
                          key={ev.id}
                          onClick={() => toggleEvent(ev.id)}
                          className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                            selected
                              ? 'bg-primary/10 border-primary text-white'
                              : 'bg-[rgba(22,27,38,0.4)] border-[rgba(255,255,255,0.04)] text-text-secondary hover:text-white'
                          }`}
                        >
                          <span className="text-xs">{ev.label}</span>
                          <div className={`w-4 h-4 rounded-md border flex items-center justify-center ${selected ? 'bg-primary border-primary' : 'border-zinc-600'}`}>
                            {selected && (
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-3 pt-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer"
                  >
                    {saving ? 'در حال ثبت...' : 'ذخیره وب‌هوک'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-5 py-2.5 bg-card-hover text-text-secondary hover:text-white rounded-xl text-xs font-medium transition-all"
                  >
                    انصراف
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
