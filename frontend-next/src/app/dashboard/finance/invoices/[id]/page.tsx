'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useToast } from '@/components/Toast';
import Skeleton from '@/components/ui/Skeleton';
import Badge from '@/components/ui/Badge';
import api from '@/lib/api';
import { gregorianToShamsi } from '@/lib/date';

interface InvoicePageProps {
  params: Promise<{ id: string }>;
}

const statusConfig: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }> = {
  DRAFT: { label: 'پیش‌نویس', tone: 'neutral' },
  ISSUED: { label: 'در انتظار پرداخت', tone: 'warn' },
  PAID: { label: 'پرداخت‌شده', tone: 'ok' },
  CANCELLED: { label: 'لغوشده', tone: 'bad' },
};

export default function InvoiceDetailPage({ params }: InvoicePageProps) {
  const resolvedParams = use(params);
  const invoiceId = resolvedParams.id;
  const router = useRouter();
  const { showToast } = useToast();
  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const fetchInvoice = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/invoices/${invoiceId}`);
      setInvoice(data);
    } catch {
      showToast('خطا در دریافت اطلاعات فاکتور', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoice();
  }, [invoiceId]);

  const handleStatusChange = async (newStatus: string) => {
    try {
      await api.patch(`/invoices/${invoiceId}/status`, { status: newStatus });
      showToast('وضعیت فاکتور به‌روزرسانی شد');
      fetchInvoice();
    } catch {
      showToast('خطا در تغییر وضعیت', 'error');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('آیا از حذف کامل این فاکتور اطمینان دارید؟ این عملیات قابل بازگشت نیست.')) return;
    setDeleting(true);
    try {
      await api.delete(`/invoices/${invoiceId}`);
      showToast('فاکتور با موفقیت حذف شد', 'success');
      router.push('/dashboard/finance');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در حذف فاکتور', 'error');
      setDeleting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-8 space-y-4">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-20">
        <p className="text-fg font-semibold text-base">فاکتور یافت نشد</p>
        <Link href="/dashboard/finance" className="text-brand text-xs mt-3 inline-block hover:underline">
          بازگشت به لیست فاکتورها
        </Link>
      </div>
    );
  }

  return (
    <ProtectedRoute allowedRoles={['CEO', 'INTERNAL_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER']}>
      {/* Top Action Bar (Hidden on print) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 pb-6 print:hidden max-w-4xl mx-auto">
        <Link
            href="/dashboard/finance"
            className="inline-flex items-center gap-2 text-xs font-semibold text-fg-secondary hover:text-fg transition-colors"
          >
            <svg className="w-4 h-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            <span>بازگشت به بخش مالی</span>
          </Link>

          <div className="flex items-center gap-3">
            {/* Quick status dropdown */}
            <div className="flex items-center gap-1.5 text-xs text-fg-secondary">
              <span>تغییر وضعیت:</span>
              <select
                value={invoice.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="cursor-pointer rounded-lg bg-card px-2.5 py-1.5 text-xs text-fg shadow-flat border border-line outline-none font-medium"
              >
                <option value="DRAFT">پیش‌نویس</option>
                <option value="ISSUED">در انتظار پرداخت</option>
                <option value="PAID">پرداخت‌شده</option>
                <option value="CANCELLED">لغوشده</option>
              </select>
            </div>

            {/* Print / PDF Button */}
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 rounded-full bg-pill px-4 py-2 text-xs font-semibold text-pill-fg shadow-md hover:opacity-90 transition cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24-1.076-.641-2.126-1.19-3.111C4.42 8.643 3 7.027 3 5.25 3 3.454 4.472 2 6.287 2c.866 0 1.696.34 2.308.948l1.405 1.393m0 0L12 6.25m0 0l2-2.009a3.256 3.256 0 012.308-.948C18.128 2 19.6 3.454 19.6 5.25c0 1.777-1.42 3.393-2.53 5.468a15.82 15.82 0 01-1.19 3.111m-7.16 0A12.02 12.02 0 0012 15c1.884 0 3.654-.42 5.24-1.171m-7.16 0l2.48 4.96a1.5 1.5 0 002.68 0l2.48-4.96" />
              </svg>
              <span>چاپ / خروجی PDF</span>
            </button>

            {/* Delete button */}
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 rounded-full bg-bad-soft text-bad hover:bg-bad/20 px-3.5 py-2 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
              title="حذف این فاکتور"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              <span>{deleting ? 'در حال حذف…' : 'حذف فاکتور'}</span>
            </button>
          </div>
        </div>

      {/* Official Invoice Sheet */}
      <div className="max-w-4xl mx-auto bg-card print:bg-white text-fg print:text-black rounded-2xl squircle border border-line print:border-none p-8 sm:p-12 print:p-0 shadow-card print:shadow-none mb-12 print:m-0 print:w-full print:max-w-full">
        {/* Invoice Header */}
        <div className="flex flex-wrap items-start justify-between gap-6 pb-6 border-b border-line print:border-neutral-300 print:flex-nowrap">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <img
                src="/logo.png"
                alt="Taskon"
                className="logo-light-mode h-10 w-auto object-contain print:h-9"
              />
              <img
                src="/logo-white.png"
                alt="Taskon"
                className="logo-dark-mode h-10 w-auto object-contain print:hidden"
              />
            </div>
            <p className="text-xs text-fg-muted print:text-neutral-600 font-medium">سامانه هوشمند مدیریت پروژه و تیم</p>
            <h1 className="text-xl font-bold text-fg print:text-black mt-3">{invoice.title}</h1>
          </div>

          <div className="text-left bg-sunken/60 print:bg-neutral-50 p-4 rounded-xl border border-line print:border-neutral-300 min-w-[220px]">
            <div className="text-xs text-fg-muted print:text-neutral-600 mb-1">شماره فاکتور:</div>
            <div className="text-base font-mono font-black text-fg print:text-black tracking-wider mb-2">
              {invoice.invoiceNumber}
            </div>
            <div className="flex items-center justify-between text-xs py-0.5">
              <span className="text-fg-muted print:text-neutral-600">تاریخ صدور فاکتور:</span>
              <span className="font-semibold text-fg print:text-black">{gregorianToShamsi(invoice.issueDate)}</span>
            </div>
            {invoice.dueDate && (
              <div className="flex items-center justify-between text-xs py-0.5 gap-2">
                <span className="text-fg-muted print:text-neutral-600">حداکثر مهلت پرداخت برای کارفرما:</span>
                <span className="font-semibold text-fg print:text-black">{gregorianToShamsi(invoice.dueDate)}</span>
              </div>
            )}
            <div className="mt-2 pt-2 border-t border-line/60 print:border-neutral-300 flex justify-between items-center">
              <span className="text-[11px] text-fg-muted print:text-neutral-600">وضعیت:</span>
              <span className="print:border print:border-neutral-400 print:px-2 print:py-0.5 print:rounded print:text-xs print:font-semibold print:text-black">
                <Badge tone={statusConfig[invoice.status]?.tone || 'neutral'}>
                  {statusConfig[invoice.status]?.label || invoice.status}
                </Badge>
              </span>
            </div>
          </div>
        </div>

        {/* Parties Information (Seller & Buyer) - Balanced & Compact */}
        <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-4 py-5 border-b border-line print:border-neutral-300 text-xs">
          {/* Seller */}
          <div className="p-4 rounded-xl bg-sunken/40 print:bg-neutral-50 border border-line print:border-neutral-300">
            <span className="font-bold text-fg print:text-black block mb-2 text-sm text-brand">اطلاعات مجری (فروشنده)</span>
            <div className="space-y-1.5 text-fg-secondary print:text-neutral-800 leading-relaxed">
              <div><span className="text-fg-muted print:text-neutral-600">نام مجری / مجموعه:</span> <span className="font-semibold text-fg print:text-black">{invoice.sellerName || 'تسکان (Task-On)'}</span></div>
              {invoice.sellerTaxId && <div><span className="text-fg-muted print:text-neutral-600">شناسه ملی / کد اقتصادی:</span> <span dir="ltr" className="font-mono">{invoice.sellerTaxId}</span></div>}
              {invoice.sellerPhone && <div><span className="text-fg-muted print:text-neutral-600">شماره تماس:</span> <span dir="ltr">{invoice.sellerPhone}</span></div>}
              {invoice.sellerAddress && <div><span className="text-fg-muted print:text-neutral-600">نشانی:</span> {invoice.sellerAddress}</div>}
              <div><span className="text-fg-muted print:text-neutral-600">صادرکننده:</span> {invoice.createdBy?.firstName} {invoice.createdBy?.lastName}</div>
            </div>
          </div>

          {/* Buyer */}
          <div className="p-4 rounded-xl bg-sunken/40 print:bg-neutral-50 border border-line print:border-neutral-300">
            <span className="font-bold text-fg print:text-black block mb-2 text-sm text-brand">اطلاعات کارفرما (خریدار)</span>
            <div className="space-y-1.5 text-fg-secondary print:text-neutral-800 leading-relaxed">
              <div><span className="text-fg-muted print:text-neutral-600">نام کارفرما:</span> <span className="font-semibold text-fg print:text-black">{invoice.clientName}</span></div>
              <div><span className="text-fg-muted print:text-neutral-600">پروژه:</span> {invoice.project?.name}</div>
              {invoice.clientTaxId && <div><span className="text-fg-muted print:text-neutral-600">شناسه ملی / کد اقتصادی:</span> <span dir="ltr" className="font-mono">{invoice.clientTaxId}</span></div>}
              {invoice.clientPhone && <div><span className="text-fg-muted print:text-neutral-600">شماره تماس:</span> <span dir="ltr">{invoice.clientPhone}</span></div>}
              {invoice.clientAddress && <div><span className="text-fg-muted print:text-neutral-600">آدرس:</span> {invoice.clientAddress}</div>}
            </div>
          </div>
        </div>

        {/* Invoice Line Items Table */}
        <div className="py-5">
          <div className="overflow-x-auto print:overflow-visible rounded-xl border border-line print:border-neutral-300">
            <table className="w-full text-right text-xs print:border-collapse">
              <thead className="bg-sunken print:bg-neutral-100 text-fg-muted print:text-black border-b border-line print:border-neutral-300">
                <tr>
                  <th className="py-3 px-3 w-10 text-center print:border print:border-neutral-300">#</th>
                  <th className="py-3 px-4 print:border print:border-neutral-300">شرح خدمات / کالا</th>
                  <th className="py-3 px-4 w-20 text-center print:border print:border-neutral-300">تعداد</th>
                  <th className="py-3 px-4 w-24 text-center print:border print:border-neutral-300">واحد</th>
                  <th className="py-3 px-4 w-36 text-left print:border print:border-neutral-300">مبلغ واحد (تومان)</th>
                  <th className="py-3 px-4 w-40 text-left print:border print:border-neutral-300">مبلغ کل (تومان)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line print:divide-neutral-300">
                {invoice.items?.map((it: any, idx: number) => (
                  <tr key={it.id || idx} className="hover:bg-hover/30 print:hover:bg-transparent">
                    <td className="py-2.5 px-3 text-center text-fg-muted print:text-neutral-600 font-mono print:border print:border-neutral-300">{idx + 1}</td>
                    <td className="py-2.5 px-4 font-medium text-fg print:text-black print:border print:border-neutral-300">{it.description}</td>
                    <td className="py-2.5 px-4 text-center tnum print:border print:border-neutral-300">{it.quantity}</td>
                    <td className="py-2.5 px-4 text-center text-fg-secondary print:text-neutral-700 print:border print:border-neutral-300">{it.unit || 'مورد'}</td>
                    <td className="py-2.5 px-4 text-left tnum print:border print:border-neutral-300">{it.unitPrice?.toLocaleString('fa-IR')}</td>
                    <td className="py-2.5 px-4 text-left font-semibold text-fg print:text-black tnum print:border print:border-neutral-300">
                      {it.totalPrice?.toLocaleString('fa-IR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Dedicated Bank Accounts & Cards Strip (Clean & Horizontal) */}
        <div className="py-3 px-4 mb-5 rounded-xl bg-sunken/40 print:bg-neutral-50 border border-line print:border-neutral-300 print-avoid-break">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-brand-soft text-brand print:bg-transparent print:text-neutral-800">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </span>
              <span className="font-bold text-fg print:text-black text-xs">اطلاعات حساب‌های بانکی و واریز (مجری):</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {Array.isArray(invoice.paymentAccounts) && invoice.paymentAccounts.length > 0 ? (
                invoice.paymentAccounts.map((acc: any, i: number) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 bg-card print:bg-white px-3 py-1.5 rounded-lg border border-line/70 print:border-neutral-300">
                    <span className="text-fg-muted print:text-neutral-600 text-[11px] font-medium whitespace-nowrap">
                      {acc.bankName || `حساب ${i + 1}`}
                      {acc.accountOwner ? ` (${acc.accountOwner})` : ''}:
                    </span>
                    {acc.cardNumber && (
                      <div className="flex items-center gap-1 bg-sunken/50 print:bg-transparent px-1.5 py-0.5 rounded">
                        <span className="text-[10px] text-fg-muted print:text-neutral-500">کارت:</span>
                        <span className="font-mono text-fg print:text-black font-semibold text-xs tracking-wider select-all" dir="ltr">
                          {acc.cardNumber}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(acc.cardNumber);
                            showToast(`شماره کارت ${acc.bankName || ''} کپی شد`);
                          }}
                          className="p-0.5 text-fg-muted hover:text-brand transition print:hidden cursor-pointer"
                          title="کپی شماره کارت"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    )}
                    {acc.iban && (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-fg-muted print:text-neutral-500">شبا:</span>
                        <span className="font-mono text-fg print:text-black font-semibold text-xs tracking-wider select-all" dir="ltr">
                          {acc.iban}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(acc.iban);
                            showToast(`شماره شبا ${acc.bankName || ''} کپی شد`);
                          }}
                          className="p-0.5 text-fg-muted hover:text-brand transition print:hidden cursor-pointer"
                          title="کپی شماره شبا"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <>
                  {/* Fallback to iban1 & iban2 */}
                  <div className="flex items-center gap-2 bg-card print:bg-white px-3 py-1.5 rounded-lg border border-line/70 print:border-neutral-300">
                    <span className="text-fg-muted print:text-neutral-600 text-[11px] font-medium whitespace-nowrap">بانک ملت:</span>
                    <span className="font-mono text-fg print:text-black font-semibold text-xs tracking-wider select-all" dir="ltr">
                      {invoice.iban1 || 'IR82 0120 0000 0000 1234 5678 90'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(invoice.iban1 || 'IR82 0120 0000 0000 1234 5678 90');
                        showToast('شماره شبا بانک ملت کپی شد');
                      }}
                      className="p-0.5 text-fg-muted hover:text-brand transition print:hidden cursor-pointer"
                      title="کپی شماره شبا"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>

                  <div className="flex items-center gap-2 bg-card print:bg-white px-3 py-1.5 rounded-lg border border-line/70 print:border-neutral-300">
                    <span className="text-fg-muted print:text-neutral-600 text-[11px] font-medium whitespace-nowrap">بانک سامان:</span>
                    <span className="font-mono text-fg print:text-black font-semibold text-xs tracking-wider select-all" dir="ltr">
                      {invoice.iban2 || 'IR56 0560 0000 0000 9876 5432 10'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(invoice.iban2 || 'IR56 0560 0000 0000 9876 5432 10');
                        showToast('شماره شبا بانک سامان کپی شد');
                      }}
                      className="p-0.5 text-fg-muted hover:text-brand transition print:hidden cursor-pointer"
                      title="کپی شماره شبا"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Calculations & Notes */}
        <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-6 py-4 border-t border-line print:border-neutral-300 text-xs print-avoid-break">
          <div>
            <span className="font-bold text-fg print:text-black block mb-2">یادداشت‌ها و شرایط پرداخت:</span>
            <div className="p-3.5 rounded-xl bg-sunken/40 print:bg-neutral-50 border border-line print:border-neutral-300 text-fg-secondary print:text-neutral-800 leading-relaxed whitespace-pre-line min-h-[90px]">
              {invoice.notes || 'تسویه این فاکتور حداکثر تا تاریخ سررسید مندرج معتبر است.'}
            </div>
          </div>

          <div className="space-y-2.5 bg-sunken/40 print:bg-neutral-50 p-4 rounded-xl border border-line print:border-neutral-300">
            <div className="flex justify-between text-fg-secondary print:text-neutral-700">
              <span>جمع اقلام (صورتحساب جاری):</span>
              <span className="font-semibold text-fg print:text-black tnum">{invoice.subtotal?.toLocaleString('fa-IR')} تومان</span>
            </div>

            {invoice.discount > 0 && (
              <div className="flex justify-between text-bad print:text-red-700">
                <span>تخفیف:</span>
                <span className="font-semibold tnum">- {invoice.discount?.toLocaleString('fa-IR')} تومان</span>
              </div>
            )}

            {invoice.taxRate > 0 && (
              <div className="flex justify-between text-fg-secondary print:text-neutral-700">
                <span>مالیات بر ارزش افزوده ({invoice.taxRate}٪):</span>
                <span className="font-semibold text-fg print:text-black tnum">+ {invoice.taxAmount?.toLocaleString('fa-IR')} تومان</span>
              </div>
            )}

            <div className="flex justify-between pt-2 border-t border-line/60 print:border-neutral-300 text-fg print:text-black font-semibold">
              <span>مبلغ صورتحساب جاری:</span>
              <span className="tnum">{invoice.totalAmount?.toLocaleString('fa-IR')} تومان</span>
            </div>

            {/* Debtor & Creditor lines if present */}
            {((invoice.previousDebt && invoice.previousDebt > 0) || (invoice.paidAmount && invoice.paidAmount > 0)) && (
              <div className="pt-2 border-t border-dashed border-line print:border-neutral-300 space-y-1.5 text-[11px]">
                {invoice.previousDebt > 0 && (
                  <div className="flex justify-between text-bad print:text-red-700">
                    <span>مانده بدهی قبلی (بدهکار):</span>
                    <span className="font-semibold tnum">+ {invoice.previousDebt?.toLocaleString('fa-IR')} تومان</span>
                  </div>
                )}
                {invoice.paidAmount > 0 && (
                  <div className="flex justify-between text-good print:text-green-700">
                    <span>پیش‌پرداخت / واریزی (بستانکار):</span>
                    <span className="font-semibold tnum">- {invoice.paidAmount?.toLocaleString('fa-IR')} تومان</span>
                  </div>
                )}
              </div>
            )}

            {/* Final Balance */}
            {(() => {
              const finalAmt = (invoice.finalAmount !== undefined && invoice.finalAmount !== null && invoice.finalAmount !== 0)
                ? invoice.finalAmount
                : (invoice.totalAmount + (invoice.previousDebt || 0) - (invoice.paidAmount || 0));
              return (
                <div className="flex justify-between pt-3 border-t border-line print:border-neutral-300 text-sm font-black text-fg print:text-black">
                  <span>
                    {finalAmt >= 0 ? 'مبلغ نهایی قابل پرداخت (صافی بدهکاری):' : 'مانده بستانکاری کارفرما:'}
                  </span>
                  <span className={`text-base tnum ${finalAmt > 0 ? 'text-brand print:text-black' : finalAmt < 0 ? 'text-good print:text-black' : 'text-fg print:text-black'}`}>
                    {Math.abs(finalAmt).toLocaleString('fa-IR')} تومان
                  </span>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-12 pt-14 text-center text-xs print-avoid-break">
          <div className="border-t border-dashed border-line print:border-neutral-400 pt-3">
            <span className="font-semibold text-fg-secondary print:text-neutral-800">مهر و امضای مجری</span>
          </div>
          <div className="border-t border-dashed border-line print:border-neutral-400 pt-3">
            <span className="font-semibold text-fg-secondary print:text-neutral-800">مهر و امضای کارفرما</span>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
