'use client';

import { useState, useEffect, useCallback } from 'react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { useToast } from '@/components/Toast';
import api from '@/lib/api';
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
  user: {
    id: number;
    firstName: string;
    lastName: string;
    displayName?: string | null;
    role: string;
    position?: string | null;
    avatarUrl?: string | null;
    nationalId?: string | null;
  };
  advances?: Array<{
    id: number;
    amount: number;
    reason?: string | null;
  }>;
}

interface PayrollPeriod {
  id: number;
  periodKey: string;
  title: string;
  status: 'DRAFT' | 'PROCESSING' | 'APPROVED' | 'PAID' | 'CLOSED';
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  payslips?: Payslip[];
  approvedBy?: {
    displayName?: string | null;
    firstName: string;
    lastName: string;
  } | null;
}

const MONTH_OPTIONS = [
  { key: '1405-07', label: 'مهر ۱۴۰۵' },
  { key: '1405-06', label: 'شهریور ۱۴۰۵' },
  { key: '1405-05', label: 'مرداد ۱۴۰۵' },
];

export default function PayrollSection() {
  const { showToast } = useToast();
  const [selectedMonth, setSelectedMonth] = useState('1405-07');
  const [activePeriod, setActivePeriod] = useState<PayrollPeriod | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);

  // Drawer state
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);

  const fetchPeriodData = useCallback(async (key: string) => {
    setLoading(true);
    try {
      const { data: periods } = await api.get('/finance/payroll/periods');
      const found = periods.find((p: any) => p.periodKey === key);
      if (found) {
        const { data: detail } = await api.get(`/finance/payroll/periods/${found.id}`);
        setActivePeriod(detail);
      } else {
        setActivePeriod(null);
      }
    } catch {
      showToast('خطا در دریافت اطلاعات دوره حقوق', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchPeriodData(selectedMonth);
  }, [selectedMonth, fetchPeriodData]);

  const handleGeneratePayroll = async () => {
    setGenerating(true);
    try {
      const { data } = await api.post('/finance/payroll/periods/generate', {
        periodKey: selectedMonth,
      });
      setActivePeriod(data);
      showToast('محاسبه هوشمند حقوق ماه با موفقیت بر اساس کارکرد تسک‌ها انجام شد', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در محاسبه حقوق', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleApprovePayroll = async () => {
    if (!activePeriod) return;
    if (!window.confirm(`آیا از تأیید نهایی دیسکت پرداخت حقوق «${activePeriod.title}» اطمینان دارید؟`)) return;

    setApproving(true);
    try {
      const { data } = await api.patch(`/finance/payroll/periods/${activePeriod.id}/approve`, {});
      setActivePeriod({ ...activePeriod, status: 'APPROVED' });
      showToast(`لیست پرداخت حقوق با مبلغ ${(activePeriod.totalNet / 10).toLocaleString('fa-IR')} تومان تایید شد.`, 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در تایید حقوق', 'error');
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top action toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-fg-secondary">دوره ماهانه:</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="rounded-tile bg-sunken px-3 py-1.5 text-xs text-fg font-bold focus:bg-hover outline-none"
          >
            {MONTH_OPTIONS.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
          {activePeriod && (
            <Badge tone={activePeriod.status === 'APPROVED' ? 'ok' : 'warn'}>
              {activePeriod.status === 'APPROVED' ? 'تأییدشده و نهایی' : 'پیش‌نویس و باز'}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleGeneratePayroll}
            disabled={generating}
            className="rounded-full bg-pill px-4 py-2 text-xs font-semibold text-pill-fg shadow-flat transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {generating ? 'در حال استخراج کارکرد تسک‌ها...' : activePeriod ? 'محاسبه مجدد کارکرد' : 'محاسبه حقوق ماه جاری'}
          </button>

          {activePeriod && activePeriod.status !== 'APPROVED' && (
            <button
              onClick={handleApprovePayroll}
              disabled={approving}
              className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-flat hover:bg-emerald-500 transition-colors disabled:opacity-50"
            >
              {approving ? 'در حال ثبت...' : 'تأیید نهایی لیست پرداخت'}
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      {activePeriod && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="p-4 border-r-4 border-r-primary">
            <div className="text-[11px] font-medium text-fg-secondary">مجموع ناخالص حقوق</div>
            <div className="text-xl font-extrabold text-fg font-mono mt-1">
              {activePeriod.totalGross.toLocaleString('fa-IR')} <span className="text-xs font-normal">تومان</span>
            </div>
          </Card>
          <Card className="p-4 border-r-4 border-r-amber-500">
            <div className="text-[11px] font-medium text-fg-secondary">مجموع کسورات و مساعده</div>
            <div className="text-xl font-extrabold text-amber-500 font-mono mt-1">
              {activePeriod.totalDeductions.toLocaleString('fa-IR')} <span className="text-xs font-normal">تومان</span>
            </div>
          </Card>
          <Card className="p-4 border-r-4 border-r-emerald-500">
            <div className="text-[11px] font-medium text-fg-secondary">خالص پرداختی نهایی (دیسکت بانک)</div>
            <div className="text-xl font-extrabold text-emerald-600 font-mono mt-1">
              {activePeriod.totalNet.toLocaleString('fa-IR')} <span className="text-xs font-normal">تومان</span>
            </div>
          </Card>
        </div>
      )}

      {/* Payslips Table */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-line bg-sunken text-fg-secondary font-medium">
                <th className="py-3 px-4">پرسنل</th>
                <th className="py-3 px-4">کارکرد تسک‌ها</th>
                <th className="py-3 px-4">پایه حقوق</th>
                <th className="py-3 px-4">اضافه‌کاری</th>
                <th className="py-3 px-4">کسر مساعده</th>
                <th className="py-3 px-4">خالص پرداختی</th>
                <th className="py-3 px-4 text-center">فیش و جزئیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-fg-secondary">در حال دریافت داده‌ها...</td>
                </tr>
              ) : !activePeriod || !activePeriod.payslips || activePeriod.payslips.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-fg-secondary">
                    برای دوره {selectedMonth} هنوز فیش حقوقی صادر نشده است. بر روی دکمه «محاسبه هوشمند حقوق این ماه» کلیک کنید.
                  </td>
                </tr>
              ) : (
                activePeriod.payslips.map((ps) => {
                  const fullName = [ps.user.firstName, ps.user.lastName].filter(Boolean).map((s: string) => s.trim()).join(' ') || ps.user.displayName || 'پرسنل';
                  const hours = Math.round((ps.workedMinutes / 60) * 10) / 10;
                  return (
                    <tr key={ps.id} className="hover:bg-hover transition-colors">
                      <td className="py-3 px-4 font-bold text-fg">
                        <div className="text-sm font-bold text-fg">{fullName}</div>
                        <div className="text-[11px] font-normal text-fg-secondary mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span>{ps.user.position || ps.user.role}</span>
                          <span className="text-fg-muted">•</span>
                          <span className="font-mono">
                            {ps.user.nationalId ? (
                              <span className="text-fg">کد پرسنلی (کد ملی): <span className="font-bold">{ps.user.nationalId}</span></span>
                            ) : (
                              <span className="text-fg-muted text-[10px]">کد پرسنلی: ثبت نشده</span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-fg font-mono">
                        <div>{hours.toLocaleString('fa-IR')} ساعت</div>
                        <div className="text-[10px] text-fg-muted">({ps.tasksCompleted.toLocaleString('fa-IR')} تسک تکمیل‌شده)</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-fg">
                        {ps.baseSalary.toLocaleString('fa-IR')}
                      </td>
                      <td className="py-3 px-4 font-mono text-emerald-600">
                        {ps.overtimeAmount > 0 ? `+${ps.overtimeAmount.toLocaleString('fa-IR')}` : '۰'}
                      </td>
                      <td className="py-3 px-4 font-mono text-rose-500">
                        {ps.advancesDeduction > 0 ? `-${ps.advancesDeduction.toLocaleString('fa-IR')}` : '۰'}
                      </td>
                      <td className="py-3 px-4 font-extrabold text-emerald-600 font-mono text-sm">
                        {ps.netPayable.toLocaleString('fa-IR')} <span className="text-[10px] font-normal text-fg-muted">تومان</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setSelectedPayslip(ps)}
                          className="rounded-lg bg-card border border-line px-3 py-1 text-xs font-medium text-fg hover:bg-hover shadow-flat transition-colors"
                        >
                          مشاهده فیش
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Payslip Modal Dialog & A5 Print View */}
      <PayslipModal
        payslip={selectedPayslip}
        onClose={() => setSelectedPayslip(null)}
        periodTitle={activePeriod?.title}
      />
    </div>
  );
}
