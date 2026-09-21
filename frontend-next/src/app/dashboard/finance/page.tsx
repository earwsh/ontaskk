'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useToast } from '@/components/Toast';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import api from '@/lib/api';
import { gregorianToShamsi } from '@/lib/date';
import PayrollSection from './components/PayrollSection';
import AdvancesSection from './components/AdvancesSection';
import ProfilesSection from './components/ProfilesSection';

interface Invoice {
  id: number;
  invoiceNumber: string;
  title: string;
  projectId: number;
  project: { id: number; name: string; client?: string | null };
  clientName: string;
  clientPhone?: string | null;
  issueDate: string;
  dueDate?: string | null;
  paidAt?: string | null;
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';
  subtotal: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  notes?: string | null;
  iban1?: string | null;
  iban2?: string | null;
  createdBy: { id: number; firstName: string; lastName: string };
  _count?: { items: number };
}

const statusConfig: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }> = {
  DRAFT: { label: 'پیش‌نویس', tone: 'neutral' },
  ISSUED: { label: 'در انتظار پرداخت', tone: 'warn' },
  PAID: { label: 'پرداخت‌شده', tone: 'ok' },
  CANCELLED: { label: 'لغوشده', tone: 'bad' },
};

export default function FinancePage() {
  const { showToast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<any>({ totalRevenue: 0, totalPending: 0, totalOverdue: 0, draftCount: 0, totalCount: 0 });
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Active Tab: 'invoices' | 'payroll' | 'advances' | 'profiles'
  const [activeTab, setActiveTab] = useState<'invoices' | 'payroll' | 'advances' | 'profiles'>('invoices');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [projectFilter, setProjectFilter] = useState('ALL');

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (projectFilter !== 'ALL') params.append('projectId', projectFilter);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (search.trim()) params.append('search', search.trim());

      const { data } = await api.get(`/invoices?${params.toString()}`);
      setInvoices(data.invoices || []);
      setSummary(data.summary || { totalRevenue: 0, totalPending: 0, totalOverdue: 0, draftCount: 0, totalCount: 0 });
    } catch {
      showToast('خطا در دریافت لیست فاکتورها', 'error');
    } finally {
      setLoading(false);
    }
  }, [projectFilter, statusFilter, search, showToast]);

  const fetchProjects = useCallback(async () => {
    try {
      const { data } = await api.get('/projects');
      setProjects(data || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Status quick update
  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await api.patch(`/invoices/${id}/status`, { status: newStatus });
      showToast('وضعیت فاکتور به‌روزرسانی شد');
      fetchInvoices();
    } catch {
      showToast('خطا در تغییر وضعیت فاکتور', 'error');
    }
  };

  // Delete invoice
  const handleDelete = async (id: number) => {
    if (!window.confirm('آیا از حذف کامل این فاکتور اطمینان دارید؟ این عملیات قابل بازگشت نیست.')) return;
    try {
      await api.delete(`/invoices/${id}`);
      showToast('فاکتور با موفقیت حذف شد', 'success');
      fetchInvoices();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در حذف فاکتور', 'error');
    }
  };

  return (
    <ProtectedRoute allowedRoles={['CEO', 'INTERNAL_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER']}>
      {/* Finance Navigation Tabs */}
      <div className="pt-2 pb-4">
        <div className="inline-flex items-center gap-1 rounded-full bg-card p-1 shadow-flat">
          {[
            { id: 'invoices', label: 'فاکتورهای کارفرما' },
            { id: 'payroll', label: 'حقوق و دستمزد' },
            { id: 'advances', label: 'مساعده و وام' },
            { id: 'profiles', label: 'تنظیمات حقوق و پرسنل' },
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
      </div>

      {activeTab === 'payroll' && <PayrollSection />}
      {activeTab === 'advances' && <AdvancesSection />}
      {activeTab === 'profiles' && <ProfilesSection />}

      {activeTab === 'invoices' && (
        <>
          {/* Top Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 pb-5">
            <div className="flex flex-wrap items-center gap-2">
              {/* Status filter pills */}
              {[
                ['ALL', 'همه وضعیت‌ها'],
                ['ISSUED', 'در انتظار پرداخت'],
            ['PAID', 'پرداخت‌شده'],
            ['DRAFT', 'پیش‌نویس'],
            ['CANCELLED', 'لغوشده'],
          ].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setStatusFilter(val)}
              className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === val ? 'bg-pill text-pill-fg' : 'bg-card text-fg-secondary shadow-flat hover:text-fg'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Project dropdown */}
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="cursor-pointer rounded-full bg-card px-3.5 py-1.5 text-xs text-fg-secondary shadow-flat outline-none"
          >
            <option value="ALL">همه پروژه‌ها</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Search */}
          <label className="relative block">
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-fg-muted">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="شماره، عنوان یا کارفرما…"
              className="w-44 rounded-full bg-card py-2 pr-9 pl-3 text-xs text-fg shadow-flat outline-none transition-all placeholder:text-fg-muted focus:w-60"
            />
          </label>

          {/* Create Invoice page link button */}
          <Link
            href="/dashboard/finance/new"
            className="flex cursor-pointer items-center gap-1.5 rounded-full bg-pill px-4 py-2 text-xs font-semibold text-pill-fg transition-opacity hover:opacity-90 shadow-flat"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span>صدور فاکتور جدید</span>
          </Link>
        </div>
      </div>

      {/* Financial KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card padding="md" tint="ok">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg-muted">مجموع وصول‌شده</span>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-ok-soft text-ok">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </span>
          </div>
          <div className="mt-3">
            <span className="tnum text-2xl font-black text-fg">{summary.totalRevenue?.toLocaleString('fa-IR') || '۰'}</span>
            <span className="mr-1 text-xs text-fg-muted">تومان</span>
          </div>
        </Card>

        <Card padding="md" tint="warn">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg-muted">در انتظار پرداخت</span>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-warn-soft text-warn">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
          </div>
          <div className="mt-3">
            <span className="tnum text-2xl font-black text-fg">{summary.totalPending?.toLocaleString('fa-IR') || '۰'}</span>
            <span className="mr-1 text-xs text-fg-muted">تومان</span>
          </div>
        </Card>

        <Card padding="md" tint="bad">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg-muted">مطالبات معوق (سررسیدگذشته)</span>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-bad-soft text-bad">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </span>
          </div>
          <div className="mt-3">
            <span className="tnum text-2xl font-black text-fg">{summary.totalOverdue?.toLocaleString('fa-IR') || '۰'}</span>
            <span className="mr-1 text-xs text-fg-muted">تومان</span>
          </div>
        </Card>

        <Card padding="md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg-muted">کل فاکتورها</span>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-sunken text-fg-muted">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </span>
          </div>
          <div className="mt-3">
            <span className="tnum text-2xl font-black text-fg">{summary.totalCount?.toLocaleString('fa-IR') || '۰'}</span>
            <span className="mr-1 text-xs text-fg-muted">فاکتور ({summary.draftCount} پیش‌نویس)</span>
          </div>
        </Card>
      </div>

      {/* Invoice List Table */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 rounded-card" />
          <Skeleton className="h-16 rounded-card" />
          <Skeleton className="h-16 rounded-card" />
          <Skeleton className="h-16 rounded-card" />
        </div>
      ) : invoices.length === 0 ? (
        <Card className="py-16 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl squircle bg-brand-soft flex items-center justify-center text-brand mb-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-fg">فاکتوری یافت نشد</p>
          <p className="mt-1 text-xs text-fg-muted mb-4">برای صدور اولین فاکتور مالی، روی دکمه زیر کلیک کنید.</p>
          <Link
            href="/dashboard/finance/new"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-pill text-xs font-semibold text-pill-fg hover:opacity-90 shadow-md transition"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span>صدور فاکتور جدید</span>
          </Link>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-2xl squircle border border-line bg-card shadow-card">
          <table className="w-full text-right text-xs">
            <thead className="bg-sunken/60 text-fg-muted border-b border-line">
              <tr>
                <th className="py-3 px-4 font-semibold">شماره فاکتور</th>
                <th className="py-3 px-4 font-semibold">عنوان و پروژه</th>
                <th className="py-3 px-4 font-semibold">کارفرما</th>
                <th className="py-3 px-4 font-semibold">تاریخ صدور فاکتور</th>
                <th className="py-3 px-4 font-semibold">حداکثر مهلت پرداخت</th>
                <th className="py-3 px-4 font-semibold">مبلغ نهایی</th>
                <th className="py-3 px-4 font-semibold">وضعیت</th>
                <th className="py-3 px-4 font-semibold text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {invoices.map((inv) => {
                const isOverdue = inv.status === 'ISSUED' && inv.dueDate && new Date(inv.dueDate) < new Date();
                return (
                  <tr key={inv.id} className="hover:bg-hover/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-fg">{inv.invoiceNumber}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-fg">{inv.title}</div>
                      <div className="text-[11px] text-fg-muted">{inv.project?.name}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-fg">{inv.clientName}</span>
                      {inv.clientPhone && <span className="block text-[11px] text-fg-muted" dir="ltr">{inv.clientPhone}</span>}
                    </td>
                    <td className="py-3 px-4 text-fg-secondary">
                      {gregorianToShamsi(inv.issueDate)}
                    </td>
                    <td className="py-3 px-4">
                      {inv.dueDate ? (
                        <span className={isOverdue ? 'text-bad font-semibold' : 'text-fg-secondary'}>
                          {gregorianToShamsi(inv.dueDate)} {isOverdue && '(معوق)'}
                        </span>
                      ) : (
                        <span className="text-fg-muted">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-bold text-fg">
                      <span className="tnum">{inv.totalAmount?.toLocaleString('fa-IR')}</span>
                      <span className="mr-1 text-[10px] text-fg-muted">تومان</span>
                    </td>
                    <td className="py-3 px-4">
                      <Badge tone={statusConfig[inv.status]?.tone || 'neutral'}>
                        {statusConfig[inv.status]?.label || inv.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* View / Print button */}
                        <Link
                          href={`/dashboard/finance/invoices/${inv.id}`}
                          className="p-1.5 rounded-lg text-fg-muted hover:text-brand hover:bg-hover transition-colors"
                          title="مشاهده و چاپ فاکتور"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24-1.076-.641-2.126-1.19-3.111C4.42 8.643 3 7.027 3 5.25 3 3.454 4.472 2 6.287 2c.866 0 1.696.34 2.308.948l1.405 1.393m0 0L12 6.25m0 0l2-2.009a3.256 3.256 0 012.308-.948C18.128 2 19.6 3.454 19.6 5.25c0 1.777-1.42 3.393-2.53 5.468a15.82 15.82 0 01-1.19 3.111m-7.16 0A12.02 12.02 0 0012 15c1.884 0 3.654-.42 5.24-1.171m-7.16 0l2.48 4.96a1.5 1.5 0 002.68 0l2.48-4.96" />
                          </svg>
                        </Link>

                        {/* Status toggle dropdown */}
                        <select
                          value={inv.status}
                          onChange={(e) => handleStatusChange(inv.id, e.target.value)}
                          className="cursor-pointer rounded-lg bg-sunken px-2 py-1 text-[11px] text-fg-secondary outline-none border border-line"
                        >
                          <option value="DRAFT">پیش‌نویس</option>
                          <option value="ISSUED">در انتظار پرداخت</option>
                          <option value="PAID">پرداخت‌شده</option>
                          <option value="CANCELLED">لغوشده</option>
                        </select>

                        {/* Delete button */}
                        <button
                          onClick={() => handleDelete(inv.id)}
                          className="p-1.5 rounded-lg text-fg-muted hover:text-bad hover:bg-bad-soft transition-colors cursor-pointer"
                          title="حذف فاکتور"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
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
    </ProtectedRoute>
  );
}
