'use client';

import { useState, useEffect, useCallback } from 'react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { useToast } from '@/components/Toast';
import api from '@/lib/api';
import { gregorianToShamsi } from '@/lib/date';

interface Advance {
  id: number;
  userId: number;
  type?: 'ADVANCE' | 'LOAN' | 'PETTY_CASH';
  amount: number;
  reason?: string | null;
  installments?: number | null;
  attachmentUrl?: string | null;
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED' | 'RECOVERED';
  requestedAt: string;
  approvedAt?: string | null;
  recoveryPeriod?: string | null;
  rejectionReason?: string | null;
  user: {
    id: number;
    firstName: string;
    lastName: string;
    displayName?: string | null;
    role: string;
    avatarUrl?: string | null;
    nationalId?: string | null;
  };
  approvedBy?: {
    id: number;
    firstName: string;
    lastName: string;
    displayName?: string | null;
  } | null;
}

const typeLabels: Record<string, { label: string; color: string }> = {
  ADVANCE: { label: 'مساعده', color: 'bg-amber-500/10 text-amber-600 border border-amber-500/20' },
  LOAN: { label: 'وام', color: 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/20' },
  PETTY_CASH: { label: 'تنخواه', color: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' },
};

const statusMap: Record<string, { label: string; tone: 'warn' | 'ok' | 'bad' | 'neutral' }> = {
  PENDING: { label: 'در انتظار بررسی', tone: 'warn' },
  APPROVED: { label: 'تأیید شده', tone: 'ok' },
  PAID: { label: 'واریز شده', tone: 'ok' },
  REJECTED: { label: 'رد شده', tone: 'bad' },
  RECOVERED: { label: 'تسویه از حقوق', tone: 'neutral' },
};

export default function AdvancesSection() {
  const { showToast } = useToast();
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  // Request modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reqType, setReqType] = useState<'ADVANCE' | 'LOAN' | 'PETTY_CASH'>('ADVANCE');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [installments, setInstallments] = useState('1');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchAdvances = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (typeFilter !== 'ALL') params.append('type', typeFilter);
      const { data } = await api.get(`/finance/advances?${params.toString()}`);
      setAdvances(data || []);
    } catch {
      showToast('خطا در واکشی لیست درخواست‌های مالی', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, showToast]);

  useEffect(() => {
    fetchAdvances();
  }, [fetchAdvances]);

  const handleReview = async (id: number, newStatus: string) => {
    try {
      await api.patch(`/finance/advances/${id}/review`, { status: newStatus });
      showToast(newStatus === 'APPROVED' ? 'درخواست مساعده تأیید شد' : newStatus === 'PAID' ? 'مساعده پرداخت شد' : 'درخواست رد شد', 'success');
      fetchAdvances();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در ثبت تغییرات', 'error');
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount.replace(/,/g, ''));
    if (!numAmount || numAmount <= 0) {
      showToast('لطفاً مبلغ معتبری وارد کنید', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/finance/advances', {
        type: reqType,
        amount: numAmount,
        reason,
        installments: reqType === 'LOAN' ? (Number(installments) || 1) : 1,
        attachmentUrl: attachmentUrl.trim() || undefined,
      });
      showToast('درخواست مالی با موفقیت ثبت شد', 'success');
      setIsModalOpen(false);
      setAmount('');
      setReason('');
      setInstallments('1');
      setAttachmentUrl('');
      fetchAdvances();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در ثبت درخواست', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status filters */}
          {[['ALL', 'همه وضعیت‌ها'], ['PENDING', 'در انتظار'], ['APPROVED', 'تأییدشده'], ['PAID', 'پرداخت‌شده'], ['RECOVERED', 'تسویه‌شده']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setStatusFilter(val)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                statusFilter === val ? 'bg-pill text-pill-fg' : 'bg-card text-fg-secondary shadow-flat hover:text-fg'
              }`}
            >
              {label}
            </button>
          ))}

          <span className="text-line mx-1">|</span>

          {/* Type filters */}
          {[['ALL', 'همه انواع'], ['ADVANCE', 'مساعده'], ['LOAN', 'وام'], ['PETTY_CASH', 'تنخواه']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setTypeFilter(val)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                typeFilter === val ? 'bg-accent text-accent-fg font-bold' : 'bg-card text-fg-secondary shadow-flat hover:text-fg'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="rounded-full bg-pill px-4 py-2 text-xs font-bold text-pill-fg shadow-flat transition-opacity hover:opacity-90 cursor-pointer"
        >
          + ثبت درخواست جدید (مساعده / وام / تنخواه)
        </button>
      </div>

      {/* Table */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-line bg-sunken text-fg-secondary font-medium">
                <th className="py-3 px-4">پرسنل</th>
                <th className="py-3 px-4">نوع درخواست</th>
                <th className="py-3 px-4">مبلغ (تومان)</th>
                <th className="py-3 px-4">اقساط / پیوست</th>
                <th className="py-3 px-4">علت یا شرح</th>
                <th className="py-3 px-4">تاریخ درخواست</th>
                <th className="py-3 px-4">وضعیت</th>
                <th className="py-3 px-4 text-center">عملیات مدیریت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-fg-secondary">در حال دریافت داده‌ها...</td>
                </tr>
              ) : advances.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-fg-secondary">درخواستی در این بخش یافت نشد.</td>
                </tr>
              ) : (
                advances.map((adv) => {
                  const fullName = [adv.user.firstName, adv.user.lastName].filter(Boolean).map((s: string) => s.trim()).join(' ') || adv.user.displayName || 'کاربر';
                  const typeBadge = typeLabels[adv.type || 'ADVANCE'] || typeLabels.ADVANCE;
                  const st = statusMap[adv.status] || { label: adv.status, tone: 'neutral' };
                  return (
                    <tr key={adv.id} className="hover:bg-hover transition-colors">
                      <td className="py-3 px-4 font-bold text-fg">
                        <div>{fullName}</div>
                        <div className="text-[10px] font-normal text-fg-muted">
                          {adv.user.role} {adv.user.nationalId ? `• کد پرسنلی: ${adv.user.nationalId}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-bold ${typeBadge.color}`}>
                          {typeBadge.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-extrabold text-fg font-mono text-sm">
                        {adv.amount.toLocaleString('fa-IR')}
                      </td>
                      <td className="py-3 px-4 text-fg-secondary">
                        {adv.type === 'LOAN' && (
                          <span className="font-mono font-bold text-indigo-600">
                            {adv.installments ? `${adv.installments.toLocaleString('fa-IR')} قسط ماهانه` : '۱ قسط'}
                          </span>
                        )}
                        {adv.type === 'PETTY_CASH' && adv.attachmentUrl && (
                          <a
                            href={adv.attachmentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline text-[11px]"
                          >
                            مشاهده فاکتور
                          </a>
                        )}
                        {(!adv.type || adv.type === 'ADVANCE') && (
                          <span className="text-[11px] text-fg-muted">کسر از حقوق</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-fg-secondary max-w-xs truncate">
                        <div>{adv.reason || '—'}</div>
                        {adv.rejectionReason && (
                          <div className="text-[10px] text-rose-500 font-semibold mt-0.5">
                            علت رد: {adv.rejectionReason}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-fg-secondary font-mono text-[11px]">
                        {gregorianToShamsi(adv.requestedAt)}
                      </td>
                      <td className="py-3 px-4">
                        <Badge tone={st.tone as any}>{st.label}</Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {adv.status === 'PENDING' && (
                            <>
                              <button
                                onClick={() => handleReview(adv.id, 'APPROVED')}
                                className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-500 transition-colors cursor-pointer"
                              >
                                تأیید
                              </button>
                              <button
                                onClick={() => {
                                  const reason = window.prompt('علت رد درخواست (اختیاری):');
                                  if (reason !== null) {
                                    api.patch(`/finance/advances/${adv.id}/review`, { status: 'REJECTED', rejectionReason: reason })
                                      .then(() => {
                                        showToast('درخواست رد شد', 'success');
                                        fetchAdvances();
                                      })
                                      .catch((err: any) => showToast(err.response?.data?.error || 'خطا', 'error'));
                                  }
                                }}
                                className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-rose-500 transition-colors cursor-pointer"
                              >
                                رد
                              </button>
                            </>
                          )}
                          {adv.status === 'APPROVED' && (
                            <button
                              onClick={() => handleReview(adv.id, 'PAID')}
                              className="rounded-lg bg-pill px-2.5 py-1 text-[11px] font-bold text-pill-fg hover:opacity-90 shadow-flat transition-opacity cursor-pointer"
                            >
                              ثبت واریز
                            </button>
                          )}
                          {(adv.status === 'PAID' || adv.status === 'RECOVERED' || adv.status === 'REJECTED') && (
                            <span className="text-fg-muted text-[11px]">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-card border border-line p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="text-base font-extrabold text-fg">ثبت درخواست مالی جدید</h3>
                <p className="text-xs text-fg-muted mt-0.5">
                  مساعده، وام سازمانی یا تنخواه جهت بررسی در مدیریت مالی
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-full p-1 text-fg-muted hover:text-fg hover:bg-hover"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-fg mb-1.5">نوع درخواست *</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'ADVANCE', label: 'مساعده حقوق' },
                    { id: 'LOAN', label: 'وام سازمانی' },
                    { id: 'PETTY_CASH', label: 'تنخواه و خرید' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setReqType(t.id as any)}
                      className={`rounded-xl py-2 px-1 text-xs font-bold transition-all border cursor-pointer ${
                        reqType === t.id
                          ? 'bg-pill text-pill-fg border-pill shadow-flat'
                          : 'bg-sunken text-fg-secondary border-line hover:bg-hover hover:text-fg'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg mb-1">مبلغ درخواستی (تومان) *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: ۵,۰۰۰,۰۰۰"
                  value={Number(amount.replace(/,/g, '')).toLocaleString('fa-IR')}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/[^0-9]/g, '');
                    setAmount(clean);
                  }}
                  className="w-full rounded-tile bg-sunken px-3.5 py-2.5 text-xs text-fg focus:bg-hover outline-none font-mono"
                />
              </div>

              {reqType === 'LOAN' && (
                <div>
                  <label className="block text-xs font-semibold text-fg mb-1">تعداد اقساط ماهانه</label>
                  <select
                    value={installments}
                    onChange={(e) => setInstallments(e.target.value)}
                    className="w-full rounded-tile bg-sunken px-3.5 py-2.5 text-xs text-fg focus:bg-hover outline-none cursor-pointer"
                  >
                    <option value="1">۱ ماهه</option>
                    <option value="2">۲ ماهه</option>
                    <option value="3">۳ ماهه</option>
                    <option value="6">۶ ماهه</option>
                    <option value="12">۱۲ ماهه (یک‌ساله)</option>
                  </select>
                </div>
              )}

              {reqType === 'PETTY_CASH' && (
                <div>
                  <label className="block text-xs font-semibold text-fg mb-1">لینک فاکتور یا رسید (اختیاری)</label>
                  <input
                    type="text"
                    value={attachmentUrl}
                    onChange={(e) => setAttachmentUrl(e.target.value)}
                    placeholder="لینک فاکتور خرید در گوگل درایو یا کلود..."
                    className="w-full rounded-tile bg-sunken px-3.5 py-2.5 text-xs text-fg focus:bg-hover outline-none dir-ltr text-right font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-fg mb-1">علت / شرح درخواست *</label>
                <textarea
                  rows={3}
                  required
                  placeholder={
                    reqType === 'PETTY_CASH'
                      ? 'شرح اقلام خریداری‌شده یا هزینه انجام‌شده برای شرکت...'
                      : 'توضیح در مورد علت درخواست...'
                  }
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-tile bg-sunken px-3.5 py-2.5 text-xs text-fg focus:bg-hover outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-full bg-card border border-line px-4 py-2 text-xs font-medium text-fg-secondary hover:text-fg shadow-flat cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-full bg-pill px-5 py-2 text-xs font-bold text-pill-fg shadow-flat hover:opacity-90 disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'در حال ثبت...' : 'ارسال درخواست'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
