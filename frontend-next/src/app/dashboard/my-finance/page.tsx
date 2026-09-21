'use client';

import { useState, useEffect, useCallback } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import { useToast } from '@/components/Toast';
import api from '@/lib/api';
import { gregorianToShamsi } from '@/lib/date';
import PayslipModal from '@/components/finance/PayslipModal';

interface Payslip {
  id: number;
  userId: number;
  status: string;
  workedMinutes: number;
  overtimeMinutes: number;
  tasksCompleted: number;
  baseSalary: number;
  overtimeAmount: number;
  bonusesAmount: number;
  advancesDeduction: number;
  penaltiesAmount: number;
  grossPayable: number;
  netPayable: number;
  bankIban?: string | null;
  notes?: string | null;
  payrollPeriod: {
    id: number;
    title: string;
    periodKey: string;
    status: string;
  };
  user?: {
    id: number;
    firstName: string;
    lastName: string;
    displayName?: string | null;
    role: string;
    position?: string | null;
    nationalId?: string | null;
  };
}

interface FinancialRequest {
  id: number;
  type: 'ADVANCE' | 'LOAN' | 'PETTY_CASH';
  amount: number;
  reason?: string | null;
  installments?: number | null;
  attachmentUrl?: string | null;
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED' | 'RECOVERED';
  requestedAt: string;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  recoveryPeriod?: string | null;
}

interface FinanceSummary {
  user?: {
    id: number;
    firstName: string;
    lastName: string;
    displayName?: string | null;
    role: string;
    position?: string | null;
    nationalId?: string | null;
  };
  financialProfile?: {
    baseSalary: number;
    hourlyRate?: number | null;
    bankIban?: string | null;
    bankCardNumber?: string | null;
    bankName?: string | null;
    maxAdvanceLimit?: number | null;
    notes?: string | null;
  };
  recentRequests?: FinancialRequest[];
  activeDeductionsTotal?: number;
}

const typeLabels: Record<string, { label: string; tone: 'warn' | 'info' | 'ok' }> = {
  ADVANCE: { label: 'مساعده حقوق', tone: 'warn' },
  LOAN: { label: 'وام سازمانی', tone: 'info' },
  PETTY_CASH: { label: 'تنخواه و خرید', tone: 'ok' },
};

const statusMap: Record<string, { label: string; tone: 'warn' | 'ok' | 'bad' | 'neutral' }> = {
  PENDING: { label: 'در انتظار بررسی', tone: 'warn' },
  APPROVED: { label: 'تأییدشده', tone: 'ok' },
  PAID: { label: 'واریزشده', tone: 'ok' },
  REJECTED: { label: 'ردشده', tone: 'bad' },
  RECOVERED: { label: 'تسویه در فیش', tone: 'neutral' },
};

export default function MyFinancePage() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'payslips' | 'requests' | 'bankInfo'>('payslips');

  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [requests, setRequests] = useState<FinancialRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Drawer state for viewing a specific payslip
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);

  // New Request Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reqType, setReqType] = useState<'ADVANCE' | 'LOAN' | 'PETTY_CASH'>('ADVANCE');
  const [reqAmount, setReqAmount] = useState('');
  const [reqReason, setReqReason] = useState('');
  const [reqInstallments, setReqInstallments] = useState('1');
  const [reqAttachment, setReqAttachment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchFinanceData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, payslipsRes, requestsRes] = await Promise.all([
        api.get('/finance/my-summary').catch(() => ({ data: null })),
        api.get('/finance/payroll/my-payslips').catch(() => ({ data: [] })),
        api.get('/finance/advances').catch(() => ({ data: [] })),
      ]);

      setSummary(summaryRes.data);
      setPayslips(payslipsRes.data || []);
      setRequests(requestsRes.data || []);
    } catch {
      showToast('خطا در دریافت اطلاعات مالی', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchFinanceData();
  }, [fetchFinanceData]);

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(reqAmount.replace(/,/g, ''));
    if (!numAmount || numAmount <= 0) {
      showToast('لطفاً مبلغ معتبری وارد کنید', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/finance/advances', {
        type: reqType,
        amount: numAmount,
        reason: reqReason.trim() || undefined,
        installments: reqType === 'LOAN' ? (Number(reqInstallments) || 1) : 1,
        attachmentUrl: reqAttachment.trim() || undefined,
      });

      showToast('درخواست مالی با موفقیت ثبت شد', 'success');
      setIsModalOpen(false);
      setReqAmount('');
      setReqReason('');
      setReqInstallments('1');
      setReqAttachment('');
      fetchFinanceData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در ثبت درخواست', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const latestPayslip = payslips[0];
  const pendingRequestsCount = requests.filter((r) => r.status === 'PENDING').length;
  const maxAdvance = summary?.financialProfile?.maxAdvanceLimit || 5000000;

  return (
    <ProtectedRoute>
      {/* Top Header & Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 pb-4">
        <div className="inline-flex items-center gap-1 rounded-full bg-card p-1 shadow-flat">
          {[
            { id: 'payslips', label: 'فیش‌های حقوقی' },
            { id: 'requests', label: 'مساعده، وام و تنخواه' },
            { id: 'bankInfo', label: 'مشخصات بانکی و قرارداد' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`cursor-pointer whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'bg-pill text-pill-fg'
                  : 'text-fg-secondary hover:text-fg'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex cursor-pointer items-center gap-1.5 rounded-full bg-pill px-4 py-2 text-xs font-semibold text-pill-fg transition-opacity hover:opacity-90 shadow-flat"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span>ثبت درخواست مالی</span>
        </button>
      </div>

      {/* KPI Cards — Standard Task-On Bento Design */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card padding="md" tint="ok">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg-muted">آخرین خالص دریافتی</span>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-ok-soft text-ok">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </span>
          </div>
          <div className="mt-3">
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : latestPayslip ? (
              <>
                <span className="tnum text-2xl font-black text-fg">{latestPayslip.netPayable.toLocaleString('fa-IR')}</span>
                <span className="mr-1 text-xs text-fg-muted">تومان</span>
              </>
            ) : (
              <span className="text-sm font-semibold text-fg-muted">صادر نشده</span>
            )}
          </div>
          <p className="mt-2 text-[11px] text-fg-muted">
            {latestPayslip ? latestPayslip.payrollPeriod?.title : 'فیش حقوقی ماهانه'}
          </p>
        </Card>

        <Card padding="md" tint="warn">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg-muted">سقف مجاز مساعده</span>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-warn-soft text-warn">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
          </div>
          <div className="mt-3">
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <span className="tnum text-2xl font-black text-fg">{maxAdvance.toLocaleString('fa-IR')}</span>
                <span className="mr-1 text-xs text-fg-muted">تومان</span>
              </>
            )}
          </div>
          <p className="mt-2 text-[11px] text-fg-muted">در هر ماه کاری</p>
        </Card>

        <Card padding="md" tint="info">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg-muted">درخواست‌های در انتظار</span>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-info-soft text-info">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </span>
          </div>
          <div className="mt-3">
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <span className="tnum text-2xl font-black text-fg">{pendingRequestsCount.toLocaleString('fa-IR')}</span>
                <span className="mr-1 text-xs text-fg-muted">درخواست</span>
              </>
            )}
          </div>
          <p className="mt-2 text-[11px] text-fg-muted">در کارتابل بررسی مدیریت</p>
        </Card>

        <Card padding="md" tint="brand">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg-muted">شماره شبا واریز (پایا)</span>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
              </svg>
            </span>
          </div>
          <div className="mt-3">
            {loading ? (
              <Skeleton className="h-8 w-36" />
            ) : (
              <span className="font-mono text-xs font-extrabold text-fg dir-ltr block truncate">
                {summary?.financialProfile?.bankIban || 'ثبت نشده'}
              </span>
            )}
          </div>
          <p className="mt-2 text-[11px] text-fg-muted">
            {summary?.financialProfile?.bankName ? `بانک ${summary.financialProfile.bankName}` : 'حساب فعال حقوق'}
          </p>
        </Card>
      </div>

      {/* Tab 1: فیش‌های حقوقی من */}
      {activeTab === 'payslips' && (
        <>
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 rounded-2xl squircle" />
              ))}
            </div>
          ) : payslips.length === 0 ? (
            <Card className="py-16 text-center">
              <div className="mx-auto w-12 h-12 rounded-2xl squircle bg-brand-soft flex items-center justify-center text-brand mb-3">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V5.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-fg">فیش حقوقی صادر نشده است</p>
              <p className="mt-1 text-xs text-fg-muted">پس از محاسبه و تأیید نهایی حقوق هر ماه توسط مدیریت، فیش شما در این بخش در دسترس خواهد بود.</p>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-2xl squircle border border-line bg-card shadow-card">
              <table className="w-full text-right text-xs">
                <thead className="bg-sunken/60 text-fg-muted border-b border-line">
                  <tr>
                    <th className="py-3 px-4 font-semibold">دوره حقوقی</th>
                    <th className="py-3 px-4 font-semibold">کارکرد تسک‌ها</th>
                    <th className="py-3 px-4 font-semibold">پایه حقوق</th>
                    <th className="py-3 px-4 font-semibold">اضافه‌کاری</th>
                    <th className="py-3 px-4 font-semibold">کسر مساعده / اقساط</th>
                    <th className="py-3 px-4 font-semibold">خالص دریافتی</th>
                    <th className="py-3 px-4 font-semibold text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {payslips.map((ps) => {
                    const hours = Math.round((ps.workedMinutes / 60) * 10) / 10;
                    return (
                      <tr key={ps.id} className="hover:bg-hover/60 transition-colors">
                        <td className="py-3 px-4 font-bold text-fg">
                          <div>{ps.payrollPeriod?.title || 'دوره حقوق'}</div>
                          <div className="text-[11px] text-fg-muted font-mono">{ps.payrollPeriod?.periodKey}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-fg">
                          <div>{hours.toLocaleString('fa-IR')} ساعت</div>
                          <div className="text-[10px] text-fg-muted">({ps.tasksCompleted.toLocaleString('fa-IR')} تسک)</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-fg">
                          <span className="tnum">{ps.baseSalary.toLocaleString('fa-IR')}</span>
                        </td>
                        <td className="py-3 px-4 font-mono text-ok font-semibold">
                          {ps.overtimeAmount > 0 ? `+${ps.overtimeAmount.toLocaleString('fa-IR')}` : '۰'}
                        </td>
                        <td className="py-3 px-4 font-mono text-bad font-semibold">
                          {ps.advancesDeduction > 0 ? `-${ps.advancesDeduction.toLocaleString('fa-IR')}` : '۰'}
                        </td>
                        <td className="py-3 px-4 font-extrabold text-fg text-sm">
                          <span className="tnum text-ok">{ps.netPayable.toLocaleString('fa-IR')}</span>{' '}
                          <span className="text-[10px] font-normal text-fg-muted">تومان</span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => setSelectedPayslip(ps)}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-card border border-line px-3 py-1.5 text-xs font-semibold text-fg hover:bg-hover shadow-flat transition-colors"
                          >
                            مشاهده فیش
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Tab 2: درخواست‌های مالی (مساعده / وام / تنخواه) */}
      {activeTab === 'requests' && (
        <>
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 rounded-2xl squircle" />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <Card className="py-16 text-center">
              <div className="mx-auto w-12 h-12 rounded-2xl squircle bg-brand-soft flex items-center justify-center text-brand mb-3">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-fg">درخواستی ثبت نشده است</p>
              <p className="mt-1 text-xs text-fg-muted mb-4">برای ثبت درخواست جدید مساعده، وام یا تنخواه روی دکمه زیر کلیک کنید.</p>
              <button
                onClick={() => setIsModalOpen(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 px-5 py-2.5 rounded-full bg-pill text-xs font-semibold text-pill-fg hover:opacity-90 shadow-flat transition"
              >
                <span>ثبت درخواست مالی جدید</span>
              </button>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-2xl squircle border border-line bg-card shadow-card">
              <table className="w-full text-right text-xs">
                <thead className="bg-sunken/60 text-fg-muted border-b border-line">
                  <tr>
                    <th className="py-3 px-4 font-semibold">نوع درخواست</th>
                    <th className="py-3 px-4 font-semibold">مبلغ (تومان)</th>
                    <th className="py-3 px-4 font-semibold">اقساط / پیوست</th>
                    <th className="py-3 px-4 font-semibold">علت یا شرح</th>
                    <th className="py-3 px-4 font-semibold">تاریخ ثبت</th>
                    <th className="py-3 px-4 font-semibold">وضعیت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {requests.map((req) => {
                    const t = typeLabels[req.type] || typeLabels.ADVANCE;
                    const st = statusMap[req.status] || { label: req.status, tone: 'neutral' };
                    return (
                      <tr key={req.id} className="hover:bg-hover/60 transition-colors">
                        <td className="py-3 px-4">
                          <Badge tone={t.tone}>{t.label}</Badge>
                        </td>
                        <td className="py-3 px-4 font-extrabold text-fg text-sm">
                          <span className="tnum">{req.amount.toLocaleString('fa-IR')}</span>
                        </td>
                        <td className="py-3 px-4 text-fg-secondary">
                          {req.type === 'LOAN' && (
                            <span className="font-semibold text-info">
                              {req.installments ? `${req.installments.toLocaleString('fa-IR')} قسط ماهانه` : '۱ قسط'}
                            </span>
                          )}
                          {req.type === 'PETTY_CASH' && req.attachmentUrl && (
                            <a
                              href={req.attachmentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-brand hover:underline text-[11px]"
                            >
                              مشاهده رسید
                            </a>
                          )}
                          {req.type === 'ADVANCE' && (
                            <span className="text-[11px] text-fg-muted">کسر از حقوق</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-fg max-w-xs truncate">
                          <div>{req.reason || '—'}</div>
                          {req.rejectionReason && (
                            <div className="text-[10px] text-bad font-semibold mt-0.5">
                              علت رد: {req.rejectionReason}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-fg-secondary font-mono text-[11px]">
                          {gregorianToShamsi(req.requestedAt)}
                        </td>
                        <td className="py-3 px-4">
                          <Badge tone={st.tone as any}>{st.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Tab 3: مشخصات بانکی و قرارداد */}
      {activeTab === 'bankInfo' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card padding="md" className="space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <span className="text-sm font-semibold text-fg">حساب واریز حقوق و مزایا</span>
              <Badge tone="ok">فعال</Badge>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-medium text-fg-muted block mb-1">شماره شبا (IBAN)</label>
                <div className="rounded-tile bg-sunken px-3.5 py-2.5 font-mono text-fg dir-ltr text-right font-bold select-all">
                  {summary?.financialProfile?.bankIban || 'ثبت نشده در سیستم'}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-fg-muted block mb-1">نام بانک</label>
                  <div className="rounded-tile bg-sunken px-3.5 py-2.5 font-medium text-fg">
                    {summary?.financialProfile?.bankName || 'ثبت نشده'}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-fg-muted block mb-1">شماره کارت</label>
                  <div className="rounded-tile bg-sunken px-3.5 py-2.5 font-mono text-fg dir-ltr text-right">
                    {summary?.financialProfile?.bankCardNumber || 'ثبت نشده'}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card padding="md" className="space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <span className="text-sm font-semibold text-fg">مشخصات پرسنلی و شرایط مالی</span>
              <Badge tone="neutral">{summary?.user?.role || 'پرسنل'}</Badge>
            </div>
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-fg-muted block mb-1">شماره پرسنلی (کد ملی)</label>
                  <div className="rounded-tile bg-sunken px-3.5 py-2.5 font-mono font-bold text-fg">
                    {summary?.user?.nationalId || 'ثبت نشده'}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-fg-muted block mb-1">سمت سازمانی</label>
                  <div className="rounded-tile bg-sunken px-3.5 py-2.5 font-medium text-fg">
                    {summary?.user?.position || summary?.user?.role || '—'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-fg-muted block mb-1">پایه حقوق ماهانه مصوب</label>
                  <div className="rounded-tile bg-sunken px-3.5 py-2.5 font-mono font-extrabold text-fg">
                    {summary?.financialProfile?.baseSalary
                      ? `${summary.financialProfile.baseSalary.toLocaleString('fa-IR')} تومان`
                      : '۱۵,۰۰۰,۰۰۰ تومان'}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-fg-muted block mb-1">سقف مجاز مساعده ماهانه</label>
                  <div className="rounded-tile bg-sunken px-3.5 py-2.5 font-mono font-extrabold text-warn">
                    {maxAdvance.toLocaleString('fa-IR')} تومان
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-sunken p-3 text-[11px] text-fg-muted">
                در صورت نیاز به تغییر شماره حساب یا شبا، لطفاً موضوع را به امور مالی یا مدیر داخلی اطلاع دهید.
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Modal: ثبت درخواست مالی */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl squircle bg-card border border-line p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="text-base font-bold text-fg">ثبت درخواست مالی جدید</h3>
                <p className="text-xs text-fg-muted mt-0.5">درخواست شما در کارتابل مدیریت مالی بررسی خواهد شد.</p>
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
                      className={`cursor-pointer rounded-xl py-2 px-1 text-xs font-bold transition-all border ${
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
                  value={Number(reqAmount.replace(/,/g, '')).toLocaleString('fa-IR')}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/[^0-9]/g, '');
                    setReqAmount(clean);
                  }}
                  className="w-full rounded-tile bg-sunken px-3.5 py-2.5 text-xs text-fg focus:bg-hover outline-none font-mono"
                />
                {reqType === 'ADVANCE' && (
                  <p className="text-[10px] text-fg-muted mt-1">
                    سقف مجاز مساعده برای شما: {maxAdvance.toLocaleString('fa-IR')} تومان است.
                  </p>
                )}
              </div>

              {reqType === 'LOAN' && (
                <div>
                  <label className="block text-xs font-semibold text-fg mb-1">تعداد اقساط ماهانه</label>
                  <select
                    value={reqInstallments}
                    onChange={(e) => setReqInstallments(e.target.value)}
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
                  <label className="block text-xs font-semibold text-fg mb-1">لینک فاکتور یا رسید خرید (اختیاری)</label>
                  <input
                    type="text"
                    value={reqAttachment}
                    onChange={(e) => setReqAttachment(e.target.value)}
                    placeholder="لینک گوگل درایو یا فضای ذخیره‌سازی..."
                    className="w-full rounded-tile bg-sunken px-3.5 py-2.5 text-xs text-fg focus:bg-hover outline-none dir-ltr text-right font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-fg mb-1">علت یا شرح درخواست *</label>
                <textarea
                  rows={3}
                  required
                  placeholder={
                    reqType === 'PETTY_CASH'
                      ? 'شرح اقلام خریداری‌شده یا هزینه انجام‌شده برای شرکت...'
                      : 'علت نیاز به مساعده یا وام...'
                  }
                  value={reqReason}
                  onChange={(e) => setReqReason(e.target.value)}
                  className="w-full rounded-tile bg-sunken px-3.5 py-2.5 text-xs text-fg focus:bg-hover outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="cursor-pointer rounded-full bg-card border border-line px-4 py-2 text-xs font-medium text-fg-secondary hover:text-fg shadow-flat"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="cursor-pointer rounded-full bg-pill px-5 py-2 text-xs font-bold text-pill-fg shadow-flat hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? 'در حال ثبت...' : 'ارسال درخواست'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: فیش رسمی حقوقی و استاندارد چاپ A5 */}
      <PayslipModal
        payslip={selectedPayslip}
        onClose={() => setSelectedPayslip(null)}
        userFallback={
          summary?.user
            ? {
                ...summary.user,
                bankIban: summary.financialProfile?.bankIban,
              }
            : undefined
        }
      />
    </ProtectedRoute>
  );
}
