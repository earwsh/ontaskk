'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useToast } from '@/components/Toast';
import Card from '@/components/ui/Card';
import api from '@/lib/api';
import { gregorianToShamsi } from '@/lib/date';
import ShamsiDatePicker from '@/components/ShamsiDatePicker';

interface InvoiceItem {
  id?: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  taskId?: number | null;
}

export const BILLING_MONTHS = [
  { value: '1405-07', year: 1405, month: 7, label: 'مهر ۱۴۰۵ (ماه جاری)' },
  { value: '1405-06', year: 1405, month: 6, label: 'شهریور ۱۴۰۵' },
  { value: '1405-05', year: 1405, month: 5, label: 'مرداد ۱۴۰۵' },
  { value: '1405-04', year: 1405, month: 4, label: 'تیر ۱۴۰۵' },
  { value: '1405-03', year: 1405, month: 3, label: 'خرداد ۱۴۰۵' },
  { value: '1405-02', year: 1405, month: 2, label: 'اردیبهشت ۱۴۰۵' },
  { value: '1405-01', year: 1405, month: 1, label: 'فروردین ۱۴۰۵' },
  { value: '1404-12', year: 1404, month: 12, label: 'اسفند ۱۴۰۴' },
  { value: 'ALL', year: 0, month: 0, label: 'همه ماه‌ها (کل بازه پروژه)' },
];

interface PaymentAccount {
  bankName: string;
  accountOwner: string;
  iban: string;
  cardNumber: string;
}

const fieldClass =
  'w-full rounded-tile bg-sunken px-3.5 py-2.5 text-xs text-fg outline-none transition-colors placeholder:text-fg-muted focus:bg-hover';

export default function NewInvoicePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [projects, setProjects] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  // Month selector for task fetching
  const [billingMonth, setBillingMonth] = useState('1405-07');

  // Smart breakdown state (Python NLP & Pattern clustering)
  const [smartModalOpen, setSmartModalOpen] = useState(false);
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartResult, setSmartResult] = useState<{
    project: any;
    totalTasksAnalyzed: number;
    deliverables: any[];
    rawTasks: any[];
    computedBy: string;
    selectedMonth?: string | null;
  } | null>(null);
  const [smartTab, setSmartTab] = useState<'deliverables' | 'rawTasks'>('deliverables');
  const [selectedDeliverables, setSelectedDeliverables] = useState<Record<string, boolean>>({});
  const [deliverablePrices, setDeliverablePrices] = useState<Record<string, number>>({});
  const [deliverableQuantities, setDeliverableQuantities] = useState<Record<string, number>>({});
  const [expandedDeliverable, setExpandedDeliverable] = useState<string | null>(null);
  const [selectedRawTasks, setSelectedRawTasks] = useState<Record<number, boolean>>({});
  const [rawTaskPrices, setRawTaskPrices] = useState<Record<number, number>>({});

  // Form State
  const [form, setForm] = useState({
    title: '',
    projectId: '',
    // Seller Info (Customizable)
    sellerName: 'تسکان (Task-On)',
    sellerPhone: '۰۲۱-۸۸۸۸۸۸۸۸',
    sellerAddress: 'تهران، پارک فناوری / دفتر مرکزی',
    sellerTaxId: '',
    // Client Info (Customizable)
    clientName: '',
    clientPhone: '',
    clientAddress: '',
    clientTaxId: '',
    issueDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    status: 'ISSUED',
    discount: 0,
    taxRate: 0,
    previousDebt: 0, // مانده بدهی قبلی (بدهکار)
    paidAmount: 0,   // پیش‌پرداخت / واریزی (بستانکار)
    currency: 'تومان',
    notes: '',
  });

  // Customizable Payment Accounts (Bank, IBAN, Card)
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([
    {
      bankName: 'بانک ملت',
      accountOwner: 'شرکت داده‌پردازان تسکان',
      iban: 'IR82 0120 0000 0000 1234 5678 90',
      cardNumber: '6104-3378-1234-5678',
    },
    {
      bankName: 'بانک سامان',
      accountOwner: 'شرکت داده‌پردازان تسکان',
      iban: 'IR56 0560 0000 0000 9876 5432 10',
      cardNumber: '6219-8610-9876-5432',
    },
  ]);

  const [items, setItems] = useState<InvoiceItem[]>([
    { description: '', quantity: 1, unit: 'مورد', unitPrice: 0, totalPrice: 0 },
  ]);

  useEffect(() => {
    api.get('/projects')
      .then(({ data }) => setProjects(data || []))
      .catch(() => {});
  }, []);

  // Handle project selection to autofill client
  const handleProjectSelect = (projId: string) => {
    const selected = projects.find((p) => String(p.id) === projId);
    setForm((prev) => ({
      ...prev,
      projectId: projId,
      clientName: selected?.client || prev.clientName || '',
    }));
  };

  // Payment accounts manipulation
  const addPaymentAccount = () => {
    setPaymentAccounts((prev) => [
      ...prev,
      {
        bankName: '',
        accountOwner: form.sellerName || 'شرکت داده‌پردازان تسکان',
        iban: '',
        cardNumber: '',
      },
    ]);
  };

  const updatePaymentAccount = (index: number, field: keyof PaymentAccount, value: string) => {
    setPaymentAccounts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const removePaymentAccount = (index: number) => {
    if (paymentAccounts.length <= 1) return;
    setPaymentAccounts((prev) => prev.filter((_, i) => i !== index));
  };

  // Smart breakdown fetch (Python NLP & Pattern clustering)
  const handleOpenSmartBreakdown = async () => {
    if (!form.projectId) {
      showToast('لطفاً ابتدا یک پروژه را انتخاب کنید', 'error');
      return;
    }
    setSmartLoading(true);
    try {
      const chosenMonth = BILLING_MONTHS.find((m) => m.value === billingMonth);
      const queryParams = new URLSearchParams();
      if (chosenMonth && chosenMonth.value !== 'ALL') {
        queryParams.append('year', String(chosenMonth.year));
        queryParams.append('month', String(chosenMonth.month));
      }

      const { data } = await api.get(`/invoices/smart-breakdown/${form.projectId}?${queryParams.toString()}`);
      if (!data.totalTasksAnalyzed || data.totalTasksAnalyzed === 0) {
        showToast(
          chosenMonth && chosenMonth.value !== 'ALL'
            ? `هیچ تسک تکمیل‌شده‌ای در ${chosenMonth.label} برای این پروژه یافت نشد`
            : 'هیچ تسک تکمیل‌شده‌ای برای این پروژه یافت نشد',
          'info'
        );
        return;
      }
      setSmartResult(data);

      const delivSel: Record<string, boolean> = {};
      const delivPrices: Record<string, number> = {};
      const delivQty: Record<string, number> = {};
      (data.deliverables || []).forEach((d: any) => {
        delivSel[d.key] = true;
        delivPrices[d.key] = 0;
        delivQty[d.key] = d.suggestedQuantity || d.count || 1;
      });
      setSelectedDeliverables(delivSel);
      setDeliverablePrices(delivPrices);
      setDeliverableQuantities(delivQty);

      const rawSel: Record<number, boolean> = {};
      const rawPrices: Record<number, number> = {};
      (data.rawTasks || []).forEach((t: any) => {
        rawSel[t.id] = false;
        rawPrices[t.id] = 0;
      });
      setSelectedRawTasks(rawSel);
      setRawTaskPrices(rawPrices);

      setSmartModalOpen(true);
    } catch {
      showToast('خطا در تحلیل هوشمند تسک‌ها', 'error');
    } finally {
      setSmartLoading(false);
    }
  };

  const handleApplySmartItems = () => {
    if (!smartResult) return;

    if (smartTab === 'deliverables') {
      const chosen = (smartResult.deliverables || []).filter((d: any) => selectedDeliverables[d.key]);
      if (chosen.length === 0) {
        showToast('حداقل یک خدمت را انتخاب کنید', 'error');
        return;
      }
      const newItems: InvoiceItem[] = chosen.map((d: any) => {
        const q = deliverableQuantities[d.key] || d.suggestedQuantity || d.count || 1;
        const p = deliverablePrices[d.key] || 0;
        return {
          description: `${d.title} (${d.description})`,
          quantity: q,
          unit: d.unit || 'مورد',
          unitPrice: p,
          totalPrice: Math.round(q * p),
        };
      });
      setItems(newItems);
      showToast(`${newItems.length} خدمت تجمیعی به فاکتور منتقل شد`);
    } else {
      const chosenRaw = (smartResult.rawTasks || []).filter((t: any) => selectedRawTasks[t.id]);
      if (chosenRaw.length === 0) {
        showToast('حداقل یک تسک را انتخاب کنید', 'error');
        return;
      }
      const newItems: InvoiceItem[] = chosenRaw.map((t: any) => {
        const q = t.hours || 1;
        const p = rawTaskPrices[t.id] || 0;
        return {
          taskId: t.id,
          description: `انجام تسک: ${t.title}`,
          quantity: q,
          unit: 'نفر-ساعت',
          unitPrice: p,
          totalPrice: Math.round(q * p),
        };
      });
      setItems(newItems);
      showToast(`${newItems.length} تسک به فاکتور منتقل شد`);
    }
    setSmartModalOpen(false);
  };

  // Fetch done tasks for selected project
  const handleSuggestTasks = async () => {
    if (!form.projectId) {
      showToast('لطفاً ابتدا یک پروژه را انتخاب کنید', 'error');
      return;
    }
    setSuggesting(true);
    try {
      const chosenMonth = BILLING_MONTHS.find((m) => m.value === billingMonth);
      const queryParams = new URLSearchParams();
      if (chosenMonth && chosenMonth.value !== 'ALL') {
        queryParams.append('year', String(chosenMonth.year));
        queryParams.append('month', String(chosenMonth.month));
      }

      const { data } = await api.get(`/invoices/suggest-items/${form.projectId}?${queryParams.toString()}`);
      if (data.suggestedItems?.length) {
        setItems(data.suggestedItems);
        showToast(
          `${data.suggestedItems.length} تسک انجام‌شده مربوط به ${data.selectedMonth || 'پروژه'} به اقلام فاکتور اضافه شدند`
        );
      } else {
        showToast(
          chosenMonth && chosenMonth.value !== 'ALL'
            ? `تسکی با وضعیت تکمیل‌شده در ${chosenMonth.label} یافت نشد`
            : 'تسکی با وضعیت تکمیل‌شده در این پروژه یافت نشد',
          'info'
        );
      }
    } catch {
      showToast('خطا در واکشی تسک‌های پروژه', 'error');
    } finally {
      setSuggesting(false);
    }
  };

  // Items manipulation
  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      const item = { ...next[index], [field]: value };
      if (field === 'quantity' || field === 'unitPrice') {
        const q = parseFloat(String(field === 'quantity' ? value : item.quantity)) || 0;
        const p = parseFloat(String(field === 'unitPrice' ? value : item.unitPrice)) || 0;
        item.totalPrice = Math.round(q * p);
      }
      next[index] = item;
      return next;
    });
  };

  const addItem = () => {
    setItems((prev) => [...prev, { description: '', quantity: 1, unit: 'مورد', unitPrice: 0, totalPrice: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Calculations
  const calculatedSubtotal = useMemo(() => {
    return items.reduce((acc, it) => acc + (it.totalPrice || 0), 0);
  }, [items]);

  const calculatedTaxAmount = useMemo(() => {
    const taxable = Math.max(0, calculatedSubtotal - (form.discount || 0));
    return Math.round((taxable * (form.taxRate || 0)) / 100);
  }, [calculatedSubtotal, form.discount, form.taxRate]);

  // Current invoice total
  const calculatedCurrentTotal = useMemo(() => {
    return Math.max(0, calculatedSubtotal - (form.discount || 0) + calculatedTaxAmount);
  }, [calculatedSubtotal, form.discount, calculatedTaxAmount]);

  // Debtor and Creditor final balance
  const calculatedFinalAmount = useMemo(() => {
    const prevDebt = Math.max(0, form.previousDebt || 0);
    const paid = Math.max(0, form.paidAmount || 0);
    return calculatedCurrentTotal + prevDebt - paid;
  }, [calculatedCurrentTotal, form.previousDebt, form.paidAmount]);

  // Submit invoice
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.projectId || !form.clientName) {
      showToast('لطفاً عنوان فاکتور، پروژه و نام کارفرما را وارد کنید', 'error');
      return;
    }
    if (items.some((it) => !it.description.trim())) {
      showToast('شرح تمام ردیف‌های فاکتور باید وارد شود', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...form,
        paymentAccounts,
        iban1: paymentAccounts[0]?.iban || '',
        iban2: paymentAccounts[1]?.iban || '',
        items: items.filter((it) => it.description.trim()),
      };
      const { data } = await api.post('/invoices', payload);
      showToast('فاکتور با موفقیت صادر شد');
      router.push(`/dashboard/finance/invoices/${data.id}`);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در صدور فاکتور', 'error');
      setSubmitting(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['CEO', 'INTERNAL_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER']}>
      <div className="w-full space-y-4 pb-16" dir="rtl">
        {/* Page Header */}
        <div className="py-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-fg md:text-[32px] md:leading-none">
              صدور فاکتور جدید
            </h1>
            <p className="mt-1.5 text-sm text-fg-muted">
              تنظیم مشخصات قرارداد، اطلاعات مجری و کارفرما، تفکیک اقلام و تراز مالی
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/finance"
              className="cursor-pointer rounded-full bg-card px-4 py-2 text-xs font-medium text-fg-secondary transition-colors hover:text-fg border border-line shadow-flat"
            >
              بازگشت
            </Link>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex cursor-pointer items-center gap-1.5 rounded-full bg-pill px-5 py-2 text-xs font-semibold text-pill-fg transition-opacity hover:opacity-90 shadow-flat disabled:opacity-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <span>{submitting ? 'در حال صدور…' : 'صدور فاکتور'}</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. General Details & Dates */}
          <Card padding="lg">
            <h2 className="mb-4 text-sm font-semibold text-fg">مشخصات اصلی فاکتور و زمان‌بندی</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-fg-secondary">عنوان فاکتور *</label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="مثال: تسویه فاز ۱ توسعه نرم‌افزار، خدمات سئو…"
                  className={fieldClass}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-fg-secondary">پروژه مرتبط *</label>
                <select
                  required
                  value={form.projectId}
                  onChange={(e) => handleProjectSelect(e.target.value)}
                  className={`${fieldClass} cursor-pointer`}
                >
                  <option value="">انتخاب پروژه…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.client ? `(${p.client})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-fg-secondary">تاریخ صدور فاکتور (شمسی) *</label>
                <ShamsiDatePicker
                  value={form.issueDate}
                  onChange={(date) => setForm({ ...form, issueDate: date })}
                  placeholder="انتخاب تاریخ صدور فاکتور"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-fg-secondary">حداکثر مهلت پرداخت برای کارفرما (شمسی)</label>
                <ShamsiDatePicker
                  value={form.dueDate}
                  onChange={(date) => setForm({ ...form, dueDate: date })}
                  placeholder="انتخاب مهلت پرداخت (اختیاری)"
                />
              </div>
            </div>
          </Card>

          {/* 2. Parties Information (Seller & Buyer) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Seller */}
            <Card padding="lg">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-fg">اطلاعات مجری (فروشنده)</h2>
                <span className="text-[11px] text-fg-muted">قابل ویرایش</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-fg-secondary">نام مجموعه / شرکت مجری</label>
                  <input
                    value={form.sellerName}
                    onChange={(e) => setForm({ ...form, sellerName: e.target.value })}
                    placeholder="تسکان (Task-On)"
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-fg-secondary">شماره تماس مجری</label>
                  <input
                    value={form.sellerPhone}
                    onChange={(e) => setForm({ ...form, sellerPhone: e.target.value })}
                    placeholder="۰۲۱-۸۸۸۸۸۸۸۸"
                    dir="ltr"
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-fg-secondary">شناسه ملی / کد اقتصادی</label>
                  <input
                    value={form.sellerTaxId}
                    onChange={(e) => setForm({ ...form, sellerTaxId: e.target.value })}
                    placeholder="شناسه اقتصادی مجری"
                    dir="ltr"
                    className={`${fieldClass} font-mono`}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-fg-secondary">نشانی و آدرس مجری</label>
                  <input
                    value={form.sellerAddress}
                    onChange={(e) => setForm({ ...form, sellerAddress: e.target.value })}
                    placeholder="آدرس پستی دفتر مجری"
                    className={fieldClass}
                  />
                </div>
              </div>
            </Card>

            {/* Buyer */}
            <Card padding="lg">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-fg">اطلاعات کارفرما (خریدار)</h2>
                <span className="text-[11px] text-fg-muted">قابل ویرایش</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-fg-secondary">نام کارفرما / خریدار *</label>
                  <input
                    required
                    value={form.clientName}
                    onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                    placeholder="نام شخص حقیقی یا حقوقی کارفرما"
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-fg-secondary">شماره تماس کارفرما</label>
                  <input
                    value={form.clientPhone}
                    onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
                    placeholder="۰۹۱۲۳۴۵۶۷۸۹"
                    dir="ltr"
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-fg-secondary">شناسه ملی / کد اقتصادی</label>
                  <input
                    value={form.clientTaxId}
                    onChange={(e) => setForm({ ...form, clientTaxId: e.target.value })}
                    placeholder="شناسه اقتصادی کارفرما"
                    dir="ltr"
                    className={`${fieldClass} font-mono`}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-fg-secondary">نشانی و آدرس کارفرما</label>
                  <input
                    value={form.clientAddress}
                    onChange={(e) => setForm({ ...form, clientAddress: e.target.value })}
                    placeholder="آدرس پستی کارفرما"
                    className={fieldClass}
                  />
                </div>
              </div>
            </Card>
          </div>

          {/* 3. Items & Deliverables */}
          <Card padding="lg">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-fg">اقلام و خدمات فاکتور</h2>
                <div className="flex items-center gap-1.5 rounded-full bg-sunken px-3 py-1">
                  <span className="text-[11px] text-fg-muted font-medium">ماه تسک‌ها:</span>
                  <select
                    value={billingMonth}
                    onChange={(e) => setBillingMonth(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-fg outline-none cursor-pointer"
                  >
                    {BILLING_MONTHS.map((m) => (
                      <option key={m.value} value={m.value} className="bg-card text-fg">
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenSmartBreakdown}
                  disabled={smartLoading || !form.projectId}
                  className="flex cursor-pointer items-center gap-1.5 rounded-full bg-card px-3.5 py-1.5 text-xs font-medium text-fg shadow-flat hover:bg-hover transition-colors border border-line disabled:opacity-50"
                  title="تحلیل هوشمند تسک‌های تکمیل‌شده با الگوریتم پایتون"
                >
                  <svg className="w-3.5 h-3.5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                  <span>{smartLoading ? 'در حال تحلیل…' : 'تفکیک هوشمند تسک‌ها (پایتون)'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSuggestTasks}
                  disabled={suggesting || !form.projectId}
                  className="flex cursor-pointer items-center gap-1.5 rounded-full bg-card px-3.5 py-1.5 text-xs font-medium text-fg-secondary hover:text-fg shadow-flat hover:bg-hover transition-colors border border-line disabled:opacity-50"
                  title="واکشی مستقیم تسک‌های ماه انتخابی"
                >
                  <svg className="w-3.5 h-3.5 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  <span>{suggesting ? 'در حال واکشی…' : 'درج ساده تسک‌های این ماه'}</span>
                </button>
              </div>
            </div>

            {/* Items Table */}
            <div className="overflow-hidden rounded-tile border border-line bg-card">
              <table className="w-full text-right text-xs">
                <thead className="bg-sunken text-fg-muted">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-4">شرح خدمات / کالا</th>
                    <th className="py-2.5 px-4 w-28 text-center">تعداد</th>
                    <th className="py-2.5 px-4 w-28 text-center">واحد</th>
                    <th className="py-2.5 px-4 w-40 text-left">قیمت واحد (تومان)</th>
                    <th className="py-2.5 px-4 w-40 text-left">جمع کل (تومان)</th>
                    <th className="py-2.5 px-3 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((it, idx) => (
                    <tr key={idx} className="hover:bg-hover/30 transition">
                      <td className="py-2 px-3 text-center text-fg-muted font-mono">{idx + 1}</td>
                      <td className="py-2 px-4">
                        <input
                          required
                          value={it.description}
                          onChange={(e) => updateItem(idx, 'description', e.target.value)}
                          placeholder="شرح کار یا خدمات انجام شده…"
                          className="w-full rounded-tile bg-sunken px-3 py-1.5 text-xs text-fg outline-none focus:bg-hover transition-colors"
                        />
                      </td>
                      <td className="py-2 px-4">
                        <input
                          type="number"
                          step="any"
                          min="0.01"
                          value={it.quantity}
                          onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                          className="w-full rounded-tile bg-sunken px-2.5 py-1.5 text-xs text-center text-fg outline-none focus:bg-hover transition-colors"
                        />
                      </td>
                      <td className="py-2 px-4">
                        <input
                          value={it.unit}
                          onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                          placeholder="مورد، ساعت…"
                          className="w-full rounded-tile bg-sunken px-2.5 py-1.5 text-xs text-center text-fg outline-none focus:bg-hover transition-colors"
                        />
                      </td>
                      <td className="py-2 px-4">
                        <input
                          type="number"
                          min="0"
                          value={it.unitPrice || ''}
                          placeholder="۰"
                          onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)}
                          className="w-full rounded-tile bg-sunken px-3 py-1.5 text-xs text-left text-fg outline-none focus:bg-hover transition-colors tnum font-mono"
                          dir="ltr"
                        />
                      </td>
                      <td className="py-2 px-4 font-bold text-fg">
                        <span className="tnum text-xs">{(it.totalPrice || 0).toLocaleString('fa-IR')}</span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          disabled={items.length <= 1}
                          className="text-fg-muted hover:text-bad disabled:opacity-20 cursor-pointer p-1 transition"
                          title="حذف این ردیف"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex justify-start">
              <button
                type="button"
                onClick={addItem}
                className="flex cursor-pointer items-center gap-1.5 rounded-full bg-sunken px-4 py-2 text-xs font-medium text-fg-secondary hover:text-fg transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span>افزودن ردیف خدمات جدید</span>
              </button>
            </div>
          </Card>

          {/* 4. Payment Accounts & Cards */}
          <Card padding="lg">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-fg">اطلاعات حساب‌های بانکی و کارت‌های واریز</h2>
                <p className="mt-0.5 text-xs text-fg-muted">جهت تسویه و واریز وجه توسط کارفرما</p>
              </div>

              <button
                type="button"
                onClick={addPaymentAccount}
                className="flex cursor-pointer items-center gap-1.5 rounded-full bg-sunken px-3.5 py-1.5 text-xs font-medium text-fg-secondary hover:text-fg transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span>افزودن حساب / کارت جدید</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {paymentAccounts.map((acc, index) => (
                <div key={index} className="rounded-tile bg-sunken/60 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-fg">حساب بانکی #{index + 1}</span>
                    {paymentAccounts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePaymentAccount(index)}
                        className="text-fg-muted hover:text-bad p-1 transition cursor-pointer"
                        title="حذف این حساب"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-fg-secondary">نام بانک</label>
                      <input
                        value={acc.bankName}
                        onChange={(e) => updatePaymentAccount(index, 'bankName', e.target.value)}
                        placeholder="مثال: بانک ملت"
                        className="w-full rounded-tile bg-card px-3 py-2 text-xs text-fg outline-none focus:bg-hover transition-colors"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-fg-secondary">صاحب حساب</label>
                      <input
                        value={acc.accountOwner}
                        onChange={(e) => updatePaymentAccount(index, 'accountOwner', e.target.value)}
                        placeholder="نام صاحب حساب"
                        className="w-full rounded-tile bg-card px-3 py-2 text-xs text-fg outline-none focus:bg-hover transition-colors"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-fg-secondary">شماره کارت (۱۶ رقمی)</label>
                      <input
                        value={acc.cardNumber}
                        onChange={(e) => updatePaymentAccount(index, 'cardNumber', e.target.value)}
                        placeholder="6104-3378-XXXX-XXXX"
                        dir="ltr"
                        className="w-full rounded-tile bg-card px-3 py-2 text-xs text-fg font-mono outline-none focus:bg-hover transition-colors"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-fg-secondary">شماره شبا (IBAN)</label>
                      <input
                        value={acc.iban}
                        onChange={(e) => updatePaymentAccount(index, 'iban', e.target.value)}
                        placeholder="IR82 0120 0000 0000 1234 5678 90"
                        dir="ltr"
                        className="w-full rounded-tile bg-card px-3 py-2 text-xs text-fg font-mono outline-none focus:bg-hover transition-colors"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* 5. Notes & Financial Calculations */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <Card padding="lg" className="lg:col-span-7">
              <h2 className="mb-4 text-sm font-semibold text-fg">یادداشت‌ها و شرایط پرداخت</h2>
              <p className="mb-2 text-xs text-fg-muted">شرایط تسویه، شماره پیگیری، مهلت‌های پرداخت یا توضیحات اضافی برای کارفرما</p>
              <textarea
                rows={6}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="تسویه حساب این فاکتور حداکثر تا مهلت مقرر الزامی است…"
                className={fieldClass}
              />
            </Card>

            <Card padding="lg" className="lg:col-span-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-fg">محاسبات مالی و تراز تسویه</h2>
                <span className="text-[11px] text-fg-muted">تراز بدهکار و بستانکار</span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center text-fg-secondary">
                  <span>جمع اقلام (صورتحساب جاری):</span>
                  <span className="font-semibold text-fg tnum">{calculatedSubtotal.toLocaleString('fa-IR')} تومان</span>
                </div>

                <div className="flex items-center justify-between gap-3 pt-2 border-t border-line/60">
                  <span className="text-fg-secondary">تخفیف (تومان):</span>
                  <input
                    type="number"
                    min="0"
                    value={form.discount || ''}
                    placeholder="۰"
                    onChange={(e) => setForm({ ...form, discount: parseFloat(e.target.value) || 0 })}
                    className="w-32 rounded-tile bg-sunken px-2.5 py-1.5 text-left text-xs tnum font-semibold outline-none focus:bg-hover"
                    dir="ltr"
                  />
                </div>

                <div className="flex items-center justify-between gap-3 pt-2 border-t border-line/60">
                  <span className="text-fg-secondary">مالیات ارزش افزوده:</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={form.taxRate || ''}
                      placeholder="۰"
                      onChange={(e) => setForm({ ...form, taxRate: parseFloat(e.target.value) || 0 })}
                      className="w-14 rounded-tile bg-sunken px-2 py-1.5 text-center text-xs tnum font-semibold outline-none focus:bg-hover"
                    />
                    <span>٪</span>
                    <span className="text-fg-muted mr-1 tnum">({calculatedTaxAmount.toLocaleString('fa-IR')} تومان)</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2.5 border-t border-line/60 text-fg font-semibold">
                  <span>مبلغ صورتحساب جاری:</span>
                  <span className="tnum">{calculatedCurrentTotal.toLocaleString('fa-IR')} تومان</span>
                </div>

                {/* Debtor & Creditor section */}
                <div className="pt-3 border-t border-dashed border-line space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-fg-secondary block">مانده بدهی قبلی (بدهکار):</span>
                      <span className="text-[10px] text-fg-muted block">مطالبات تسویه‌نشده دوره‌های قبل</span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={form.previousDebt || ''}
                      placeholder="۰"
                      onChange={(e) => setForm({ ...form, previousDebt: parseFloat(e.target.value) || 0 })}
                      className="w-32 rounded-tile bg-sunken px-2.5 py-1.5 text-left text-xs tnum font-semibold text-bad outline-none focus:bg-hover"
                      dir="ltr"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-line/40">
                    <div>
                      <span className="text-fg-secondary block">پیش‌پرداخت / واریزی‌ها (بستانکار):</span>
                      <span className="text-[10px] text-fg-muted block">مبالغ پرداخت‌شده قبلی کارفرما</span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={form.paidAmount || ''}
                      placeholder="۰"
                      onChange={(e) => setForm({ ...form, paidAmount: parseFloat(e.target.value) || 0 })}
                      className="w-32 rounded-tile bg-sunken px-2.5 py-1.5 text-left text-xs tnum font-semibold text-good outline-none focus:bg-hover"
                      dir="ltr"
                    />
                  </div>
                </div>

                {/* Final Net Payable / Balance */}
                <div className="flex justify-between items-center pt-3.5 border-t border-line text-sm font-bold text-fg">
                  <div>
                    <span>
                      {calculatedFinalAmount >= 0 ? 'مبلغ نهایی قابل پرداخت:' : 'مانده بستانکاری کارفرما:'}
                    </span>
                    <span className="block text-[10px] font-normal text-fg-muted">
                      {calculatedFinalAmount > 0
                        ? 'مانده بدهکار نهایی کارفرما'
                        : calculatedFinalAmount < 0
                        ? 'کارفرما بستانکار است'
                        : 'تسویه کامل'}
                    </span>
                  </div>
                  <span className={`text-base tnum ${calculatedFinalAmount > 0 ? 'text-brand' : calculatedFinalAmount < 0 ? 'text-good' : 'text-fg'}`}>
                    {Math.abs(calculatedFinalAmount).toLocaleString('fa-IR')} تومان
                  </span>
                </div>
              </div>
            </Card>
          </div>

          {/* Bottom Submit Action */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => router.push('/dashboard/finance')}
              className="cursor-pointer rounded-full bg-card px-5 py-2.5 text-xs font-medium text-fg-secondary transition-colors hover:text-fg border border-line shadow-flat"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex cursor-pointer items-center gap-2 rounded-full bg-pill px-7 py-2.5 text-xs font-semibold text-pill-fg transition-opacity hover:opacity-90 disabled:opacity-50 shadow-flat"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <span>{submitting ? 'در حال صدور فاکتور…' : 'صدور فاکتور'}</span>
            </button>
          </div>
        </form>

        {/* Smart Breakdown Modal (Python NLP Deliverables) */}
        {smartModalOpen && smartResult && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4" dir="rtl">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSmartModalOpen(false)} />
            <div className="relative bg-card border border-line rounded-[20px] w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
              {/* Modal Header */}
              <div className="sticky top-0 bg-card border-b border-line px-6 py-4 flex items-center justify-between rounded-t-[20px] z-10">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="p-1 rounded-lg bg-brand-soft text-brand">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                    </span>
                    <h3 className="text-base font-semibold text-fg">تحلیل هوشمند و تفکیک تسک‌های پروژه</h3>
                    {smartResult.selectedMonth && (
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-brand-soft text-brand font-semibold">
                        دوره: {smartResult.selectedMonth}
                      </span>
                    )}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand/10 text-brand font-mono font-medium">
                      {smartResult.computedBy}
                    </span>
                  </div>
                  <p className="text-xs text-fg-muted mt-1">
                    مجموع <span className="font-bold text-fg tnum">{smartResult.totalTasksAnalyzed} تسک</span> تکمیل‌شده
                    {smartResult.selectedMonth ? ` در بازه «${smartResult.selectedMonth}» ` : ' '}
                    در پروژه <span className="font-semibold text-fg">«{smartResult.project?.name}»</span> بر اساس نوع خدمت (Deliverable) خوشه‌بندی شدند.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSmartModalOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-hover transition-colors cursor-pointer"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Mode Switcher Tabs */}
              <div className="flex border-b border-line px-6 pt-3 bg-sunken/20 gap-4 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setSmartTab('deliverables')}
                  className={`pb-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                    smartTab === 'deliverables' ? 'border-brand text-brand' : 'border-transparent text-fg-muted hover:text-fg'
                  }`}
                >
                  <span>اقلام تجمیعی و خروجی خدمات</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-sunken text-[10px] font-mono">
                    {smartResult.deliverables?.length || 0}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSmartTab('rawTasks')}
                  className={`pb-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                    smartTab === 'rawTasks' ? 'border-brand text-brand' : 'border-transparent text-fg-muted hover:text-fg'
                  }`}
                >
                  <span>انتخاب تکی تسک‌ها</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-sunken text-[10px] font-mono">
                    {smartResult.rawTasks?.length || 0}
                  </span>
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto flex-1 space-y-4">
                {smartTab === 'deliverables' ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-fg-muted pb-1">
                      <span>خدمات مورد نظر را علامت بزنید و در صورت تمایل نرخ پایه را مشخص کنید:</span>
                      <button
                        type="button"
                        onClick={() => {
                          const allSelected = Object.values(selectedDeliverables).every(Boolean);
                          const next: Record<string, boolean> = {};
                          (smartResult.deliverables || []).forEach((d: any) => {
                            next[d.key] = !allSelected;
                          });
                          setSelectedDeliverables(next);
                        }}
                        className="text-brand hover:underline cursor-pointer"
                      >
                        {Object.values(selectedDeliverables).every(Boolean) ? 'عدم انتخاب همه' : 'انتخاب همه'}
                      </button>
                    </div>

                    {smartResult.deliverables?.map((d: any) => {
                      const isSelected = !!selectedDeliverables[d.key];
                      const isExpanded = expandedDeliverable === d.key;
                      const price = deliverablePrices[d.key] || 0;
                      const qty = deliverableQuantities[d.key] || d.suggestedQuantity || d.count || 1;

                      return (
                        <div
                          key={d.key}
                          className={`rounded-xl border transition-all ${
                            isSelected ? 'bg-card border-brand/50 shadow-sm' : 'bg-sunken/40 border-line opacity-70'
                          }`}
                        >
                          <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3 flex-1 min-w-[240px]">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) =>
                                  setSelectedDeliverables((prev) => ({ ...prev, [d.key]: e.target.checked }))
                                }
                                className="w-4 h-4 rounded text-brand focus:ring-brand accent-brand cursor-pointer"
                              />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-fg">{d.title}</span>
                                  <span className="px-2 py-0.5 rounded-full bg-brand-soft text-[10px] text-brand font-medium">
                                    {d.count} تسک
                                  </span>
                                </div>
                                <p className="text-[11px] text-fg-muted mt-0.5 line-clamp-1">{d.description}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-fg-secondary">تعداد:</span>
                                <input
                                  type="number"
                                  min="0.1"
                                  step="any"
                                  disabled={!isSelected}
                                  value={qty}
                                  onChange={(e) =>
                                    setDeliverableQuantities((prev) => ({
                                      ...prev,
                                      [d.key]: parseFloat(e.target.value) || 0,
                                    }))
                                  }
                                  className="w-16 px-2 py-1 bg-sunken border border-line rounded-lg text-xs text-center text-fg tnum focus:outline-none focus:border-brand disabled:opacity-50"
                                />
                                <span className="text-[11px] text-fg-muted">{d.unit}</span>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-fg-secondary">قیمت واحد:</span>
                                <input
                                  type="number"
                                  min="0"
                                  disabled={!isSelected}
                                  value={price || ''}
                                  placeholder="۰"
                                  onChange={(e) =>
                                    setDeliverablePrices((prev) => ({
                                      ...prev,
                                      [d.key]: parseFloat(e.target.value) || 0,
                                    }))
                                  }
                                  className="w-24 px-2 py-1 bg-sunken border border-line rounded-lg text-xs text-left text-fg tnum focus:outline-none focus:border-brand disabled:opacity-50"
                                />
                                <span className="text-[10px] text-fg-muted">تومان</span>
                              </div>

                              <button
                                type="button"
                                onClick={() => setExpandedDeliverable(isExpanded ? null : d.key)}
                                className="p-1 text-fg-muted hover:text-fg rounded-lg transition cursor-pointer"
                                title="مشاهده تسک‌های زیرمجموعه"
                              >
                                <svg
                                  className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="px-4 pb-3 pt-2 border-t border-line/60 bg-sunken/30 text-xs">
                              <span className="text-[10px] font-semibold text-fg-secondary block mb-1.5">
                                تسک‌های تکمیل‌شده شامل شده در این خدمت:
                              </span>
                              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                {d.tasks?.map((t: any) => (
                                  <div
                                    key={t.id}
                                    className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-card border border-line/50 text-[11px]"
                                  >
                                    <span className="text-fg font-medium">{t.title}</span>
                                    <div className="flex items-center gap-2 text-fg-muted text-[10px]">
                                      {t.deadline && (
                                        <span>سررسید: {gregorianToShamsi(t.deadline)}</span>
                                      )}
                                      <span className="font-semibold text-fg-secondary tnum bg-sunken px-1.5 py-0.5 rounded">
                                        {t.hours > 0 ? `${t.hours} ساعت` : '—'}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-fg-muted pb-1">
                      <span>انتخاب مستقیم تسک‌های انجام‌شده:</span>
                      <button
                        type="button"
                        onClick={() => {
                          const allSelected = Object.values(selectedRawTasks).every(Boolean);
                          const next: Record<number, boolean> = {};
                          (smartResult.rawTasks || []).forEach((t: any) => {
                            next[t.id] = !allSelected;
                          });
                          setSelectedRawTasks(next);
                        }}
                        className="text-brand hover:underline cursor-pointer"
                      >
                        {Object.values(selectedRawTasks).every(Boolean) ? 'عدم انتخاب همه' : 'انتخاب همه'}
                      </button>
                    </div>

                    <div className="border border-line rounded-xl overflow-hidden bg-card">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-sunken text-fg-muted">
                          <tr>
                            <th className="py-2.5 px-3 w-8 text-center"></th>
                            <th className="py-2.5 px-3">عنوان تسک</th>
                            <th className="py-2.5 px-3 w-32 text-center">تاریخ سررسید (شمسی)</th>
                            <th className="py-2.5 px-3 w-24 text-center">زمان (ساعت)</th>
                            <th className="py-2.5 px-3 w-36 text-left">مبلغ واحد (تومان)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {smartResult.rawTasks?.map((t: any) => {
                            const isSel = !!selectedRawTasks[t.id];
                            return (
                              <tr key={t.id} className={isSel ? 'bg-brand/5' : ''}>
                                <td className="py-2 px-3 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isSel}
                                    onChange={(e) =>
                                      setSelectedRawTasks((prev) => ({ ...prev, [t.id]: e.target.checked }))
                                    }
                                    className="w-3.5 h-3.5 rounded text-brand focus:ring-brand accent-brand cursor-pointer"
                                  />
                                </td>
                                <td className="py-2 px-3 font-medium text-fg">{t.title}</td>
                                <td className="py-2 px-3 text-center text-fg-muted text-[11px]">
                                  {t.deadline ? gregorianToShamsi(t.deadline) : '—'}
                                </td>
                                <td className="py-2 px-3 text-center tnum text-fg-secondary">{t.hours}</td>
                                <td className="py-2 px-3">
                                  <input
                                    type="number"
                                    min="0"
                                    disabled={!isSel}
                                    value={rawTaskPrices[t.id] || ''}
                                    placeholder="۰"
                                    onChange={(e) =>
                                      setRawTaskPrices((prev) => ({
                                        ...prev,
                                        [t.id]: parseFloat(e.target.value) || 0,
                                      }))
                                    }
                                    className="w-full px-2.5 py-1.5 bg-card border border-line rounded-lg text-xs text-left tnum focus:outline-none focus:border-brand disabled:opacity-50"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-line bg-card flex items-center justify-between gap-3">
                <span className="text-xs text-fg-muted">
                  {smartTab === 'deliverables'
                    ? `${Object.values(selectedDeliverables).filter(Boolean).length} خدمت تجمیعی انتخاب شده`
                    : `${Object.values(selectedRawTasks).filter(Boolean).length} تسک تکی انتخاب شده`}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSmartModalOpen(false)}
                    className="px-4 py-2 bg-card text-fg-secondary hover:text-fg rounded-full font-medium transition-colors border border-line shadow-flat text-xs cursor-pointer"
                  >
                    انصراف
                  </button>
                  <button
                    type="button"
                    onClick={handleApplySmartItems}
                    className="px-5 py-2 bg-pill hover:opacity-90 disabled:opacity-40 text-pill-fg rounded-full font-semibold transition-opacity shadow-flat text-xs cursor-pointer"
                  >
                    انتقال موارد انتخابی به فاکتور
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
