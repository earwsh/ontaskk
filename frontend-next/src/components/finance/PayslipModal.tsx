'use client';

import { useState } from 'react';
import { gregorianToShamsi } from '@/lib/date';

export interface PayslipData {
  id: number;
  userId: number;
  status?: string;
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
  payrollPeriod?: {
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
  advances?: Array<{
    id: number;
    amount: number;
    reason?: string | null;
    type?: string;
  }>;
}

interface PayslipModalProps {
  payslip: PayslipData | null;
  onClose: () => void;
  periodTitle?: string;
  userFallback?: {
    firstName?: string;
    lastName?: string;
    displayName?: string | null;
    role?: string;
    position?: string | null;
    nationalId?: string | null;
    bankIban?: string | null;
  };
}

/**
 * تبدیل اعداد به حروف فارسی برای نگارش مبالغ رسمی در اسناد مالی
 */
function numberToPersianWords(num: number): string {
  if (!num || num === 0) return 'صفر';
  if (num < 0) return 'منفی ' + numberToPersianWords(-num);

  const units = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
  const teens = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
  const tens = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
  const hundreds = ['', 'یکصد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
  const scales = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون'];

  function convertChunk(n: number): string {
    const parts: string[] = [];
    const c = Math.floor(n / 100);
    const remainder = n % 100;
    if (c > 0) parts.push(hundreds[c]);
    if (remainder >= 10 && remainder <= 19) {
      parts.push(teens[remainder - 10]);
    } else {
      const t = Math.floor(remainder / 10);
      const u = remainder % 10;
      if (t > 0) parts.push(tens[t]);
      if (u > 0) parts.push(units[u]);
    }
    return parts.join(' و ');
  }

  const chunks: string[] = [];
  let scaleIndex = 0;
  let remaining = Math.floor(num);

  while (remaining > 0) {
    const chunk = remaining % 1000;
    if (chunk > 0) {
      const chunkText = convertChunk(chunk);
      const scaleText = scales[scaleIndex];
      chunks.unshift(scaleText ? `${chunkText} ${scaleText}` : chunkText);
    }
    remaining = Math.floor(remaining / 1000);
    scaleIndex++;
  }

  return chunks.join(' و ');
}

export default function PayslipModal({
  payslip,
  onClose,
  periodTitle,
  userFallback,
}: PayslipModalProps) {
  if (!payslip) return null;

  const u = payslip.user || userFallback;
  const fullName =
    [u?.firstName, u?.lastName].filter(Boolean).map((s) => s!.trim()).join(' ') ||
    u?.displayName ||
    'پرسنل';
  const nationalId = u?.nationalId || 'ثبت نشده';
  const iban = payslip.bankIban || userFallback?.bankIban || 'ثبت نشده';
  const title = payslip.payrollPeriod?.title || periodTitle || 'فیش حقوقی ماهانه';
  const periodKey = payslip.payrollPeriod?.periodKey || '1405';
  const hours = Math.round((payslip.workedMinutes / 60) * 10) / 10;
  const overtimeHours = Math.round((payslip.overtimeMinutes / 60) * 10) / 10;
  const todayShamsi = gregorianToShamsi(new Date().toISOString());
  const netInWords = numberToPersianWords(payslip.netPayable);

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* استایل اختصاصی پرینت در ابعاد استاندارد A4 عمودی */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          @page {
            size: A4 portrait !important;
            margin: 10mm 12mm !important;
          }
          html, body {
            background: #ffffff !important;
            color: #0f172a !important;
            font-size: 9.5pt !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          body * {
            visibility: hidden !important;
          }
          #printable-payslip, #printable-payslip * {
            visibility: visible !important;
          }
          #printable-payslip {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 186mm !important;
            box-sizing: border-box !important;
            margin: 0 auto !important;
            padding: 8mm 10mm !important;
            border: 1.5px solid #1e293b !important;
            border-radius: 4px !important;
            background: #ffffff !important;
            box-shadow: none !important;
            font-family: inherit !important;
            color: #0f172a !important;
          }
          .no-print-in-slip {
            display: none !important;
          }
        }
      `,
        }}
      />

      {/* اوورلی مودال در صفحه نمایش */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto print:p-0 print:bg-white">
        <div className="w-full max-w-4xl rounded-2xl squircle bg-card border border-line p-5 sm:p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 print:border-none print:shadow-none print:p-0 print:m-0 max-h-[92vh] flex flex-col justify-between overflow-hidden">
          
          {/* هدر بالایی کنترل‌های مودال (فقط در نمایشگر) */}
          <div className="flex items-center justify-between border-b border-line pb-3 no-print-in-slip">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V5.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                </svg>
              </span>
              <div>
                <h3 className="text-sm font-bold text-fg">فیش رسمی حقوق و دستمزد (ابعاد استاندارد A4)</h3>
                <p className="text-[11px] text-fg-muted">{title} • {fullName}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="cursor-pointer inline-flex items-center gap-1.5 rounded-full bg-pill px-4 py-1.5 text-xs font-bold text-pill-fg shadow-flat hover:opacity-90 transition-opacity"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H7v4a2 2 0 002 2z" />
                </svg>
                <span>چاپ A4</span>
              </button>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-fg-muted hover:text-fg hover:bg-hover cursor-pointer transition-colors"
                title="بستن"
              >
                ✕
              </button>
            </div>
          </div>

          {/* بدنه رسمی فیش قابل چاپ در استاندارد A4 */}
          <div className="overflow-y-auto pr-1">
            <div
              id="printable-payslip"
              className="bg-card text-fg rounded-xl border-2 border-line/80 p-5 sm:p-7 space-y-4 print:border print:p-0 print:border-slate-800"
            >
              {/* ۱. سربرگ اداری رسمی (کاملاً بدون لوگو، متمرکز بر عنوان سازمانی و مشخصات سند) */}
              <div className="border-b-2 border-fg/20 pb-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-right">
                <div>
                  <div className="text-xs font-black text-fg tracking-wide">جمهوری اسلامی ایران</div>
                  <div className="text-sm font-extrabold text-fg mt-0.5">شرکت فناوری تسک‌آن</div>
                  <div className="text-[10px] text-fg-muted font-mono mt-0.5">
                    شناسه سند: <span className="font-bold text-fg">FIN-PS-{periodKey}</span>
                  </div>
                </div>

                <div className="text-center">
                  <h1 className="text-base sm:text-lg font-black text-fg tracking-tight">
                    فیش حقوق و مزایای ماهانه پرسنل
                  </h1>
                  <div className="inline-block rounded-md bg-sunken px-3 py-0.5 text-xs font-bold text-brand mt-1 border border-line">
                    دوره محاسباتی: {title}
                  </div>
                </div>

                <div className="text-left text-xs text-fg-muted font-mono leading-relaxed">
                  <div>شماره پیگیری: <strong className="text-fg">PS-{periodKey}-{payslip.userId}</strong></div>
                  <div>تاریخ صدور: <strong className="text-fg">{todayShamsi}</strong></div>
                  <div className="text-[11px] text-ok font-semibold">وضعیت: تسویه‌شده و قطعی</div>
                </div>
              </div>

              {/* ۲. جدول مشخصات شناسنامه‌ای و بانکی پرسنل (بدون فیلد سمت) */}
              <div className="rounded-lg border border-line bg-sunken/50 p-3 sm:p-3.5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-line/60">
                  <div className="sm:pr-1">
                    <span className="text-[11px] text-fg-muted block">نام و نام خانوادگی پرسنل:</span>
                    <strong className="text-sm text-fg font-black mt-0.5 block">{fullName}</strong>
                  </div>
                  <div className="pt-2 sm:pt-0 sm:px-3">
                    <span className="text-[11px] text-fg-muted block">شماره پرسنلی (کد ملی):</span>
                    <strong className="font-mono text-sm text-fg font-bold mt-0.5 block tracking-wider">
                      {nationalId}
                    </strong>
                  </div>
                  <div className="pt-2 sm:pt-0 sm:pl-1">
                    <span className="text-[11px] text-fg-muted block">شماره شبا واریز پایا:</span>
                    <span className="font-mono text-xs text-fg dir-ltr block truncate font-semibold mt-0.5">
                      {iban}
                    </span>
                  </div>
                </div>
              </div>

              {/* ۳. خلاصه کارکرد و حضور و غیاب ماهانه بر مبنای وظایف محوله */}
              <div className="rounded-lg border border-line/80 bg-sunken/30 px-3.5 py-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 text-fg-secondary">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-brand"></span>
                    <span className="font-bold text-fg">کارکرد استاندارد:</span>
                    <span className="font-mono font-bold text-fg">{hours.toLocaleString('fa-IR')} ساعت</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-ok"></span>
                    <span className="font-bold text-fg">اضافه‌کاری مصوب:</span>
                    <span className="font-mono font-bold text-ok">
                      {overtimeHours > 0 ? `${overtimeHours.toLocaleString('fa-IR')} ساعت` : 'فاقد اضافه‌کاری'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-fg-muted"></span>
                    <span className="font-bold text-fg">تعداد وظایف / تسک‌های تکمیل‌شده:</span>
                    <span className="font-mono font-bold text-fg">{payslip.tasksCompleted.toLocaleString('fa-IR')} مورد</span>
                  </div>
                </div>
              </div>

              {/* ۴. جدول دو ستونه رسمی تفکیک دریافتی‌ها و کسورات */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* ستون حقوق و مزایا (بستانکار) */}
                <div className="rounded-lg border border-line overflow-hidden flex flex-col justify-between">
                  <div>
                    <div className="bg-sunken px-3.5 py-2 font-bold text-ok text-xs border-b border-line flex items-center justify-between">
                      <span className="font-black">شرح حقوق، مزایا و مطالبات</span>
                      <span className="text-[10px] font-normal text-fg-muted">مبلغ (تومان)</span>
                    </div>
                    <table className="w-full divide-y divide-line/60">
                      <tbody className="divide-y divide-line/60">
                        <tr className="hover:bg-hover/40 transition-colors">
                          <td className="py-2.5 px-3.5 text-fg-secondary">حقوق پایه ماهانه (۳۰ روزه)</td>
                          <td className="py-2.5 px-3.5 text-left font-mono font-bold text-fg">
                            {payslip.baseSalary.toLocaleString('fa-IR')}
                          </td>
                        </tr>
                        <tr className="hover:bg-hover/40 transition-colors">
                          <td className="py-2.5 px-3.5 text-fg-secondary">
                            اضافه‌کاری تایید شده{' '}
                            {overtimeHours > 0 && (
                              <span className="text-[10px] text-fg-muted font-mono">
                                ({overtimeHours.toLocaleString('fa-IR')} س)
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3.5 text-left font-mono font-bold text-ok">
                            {payslip.overtimeAmount > 0
                              ? `+${payslip.overtimeAmount.toLocaleString('fa-IR')}`
                              : '۰'}
                          </td>
                        </tr>
                        <tr className="hover:bg-hover/40 transition-colors">
                          <td className="py-2.5 px-3.5 text-fg-secondary">پاداش، کارانه و مزایای انگیزشی</td>
                          <td className="py-2.5 px-3.5 text-left font-mono font-bold text-ok">
                            {payslip.bonusesAmount > 0
                              ? `+${payslip.bonusesAmount.toLocaleString('fa-IR')}`
                              : '۰'}
                          </td>
                        </tr>
                        <tr className="hover:bg-hover/40 transition-colors">
                          <td className="py-2.5 px-3.5 text-fg-secondary">بن خواروبار و مسکن (مصوب)</td>
                          <td className="py-2.5 px-3.5 text-left font-mono text-fg-muted">۰</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-sunken/80 px-3.5 py-2.5 border-t-2 border-line flex justify-between font-black text-xs">
                    <span>جمع کل ناخالص پرداختی:</span>
                    <span className="font-mono text-fg">{payslip.grossPayable.toLocaleString('fa-IR')} تومان</span>
                  </div>
                </div>

                {/* ستون کسورات و اقساط (بدهکار) */}
                <div className="rounded-lg border border-line overflow-hidden flex flex-col justify-between">
                  <div>
                    <div className="bg-sunken px-3.5 py-2 font-bold text-bad text-xs border-b border-line flex items-center justify-between">
                      <span className="font-black">شرح کسورات قانونی و تعهدات</span>
                      <span className="text-[10px] font-normal text-fg-muted">مبلغ (تومان)</span>
                    </div>
                    <table className="w-full divide-y divide-line/60">
                      <tbody className="divide-y divide-line/60">
                        <tr className="hover:bg-hover/40 transition-colors">
                          <td className="py-2.5 px-3.5 text-fg-secondary">کسر مساعده دریافتی ماه جاری</td>
                          <td className="py-2.5 px-3.5 text-left font-mono font-bold text-bad">
                            {payslip.advancesDeduction > 0
                              ? `-${payslip.advancesDeduction.toLocaleString('fa-IR')}`
                              : '۰'}
                          </td>
                        </tr>
                        <tr className="hover:bg-hover/40 transition-colors">
                          <td className="py-2.5 px-3.5 text-fg-secondary">کسورات انضباطی / تأخیرات</td>
                          <td className="py-2.5 px-3.5 text-left font-mono font-bold text-bad">
                            {payslip.penaltiesAmount > 0
                              ? `-${payslip.penaltiesAmount.toLocaleString('fa-IR')}`
                              : '۰'}
                          </td>
                        </tr>
                        <tr className="hover:bg-hover/40 transition-colors">
                          <td className="py-2.5 px-3.5 text-fg-secondary">اقساط وام و تسهیلات رفاهی</td>
                          <td className="py-2.5 px-3.5 text-left font-mono text-fg-muted">۰</td>
                        </tr>
                        <tr className="hover:bg-hover/40 transition-colors">
                          <td className="py-2.5 px-3.5 text-fg-secondary">حق بیمه تامین اجتماعی / مالیات</td>
                          <td className="py-2.5 px-3.5 text-left font-mono text-fg-muted">۰</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-sunken/80 px-3.5 py-2.5 border-t-2 border-line flex justify-between font-black text-xs">
                    <span>جمع کل کسورات:</span>
                    <span className="font-mono text-bad">
                      {(payslip.advancesDeduction + payslip.penaltiesAmount).toLocaleString('fa-IR')} تومان
                    </span>
                  </div>
                </div>
              </div>

              {/* ۵. بنر رسمی خالص دریافتی (به عدد و به حروف فارسی) */}
              <div className="rounded-xl border-2 border-ok/40 bg-ok-soft/50 p-4 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-extrabold text-fg block">مبلغ خالص قابل پرداخت (واریز پایا):</span>
                    <span className="text-[11px] text-fg-muted font-mono mt-0.5 block">
                      به شماره شبا: <strong className="text-fg">{iban}</strong>
                    </span>
                  </div>
                  <div className="text-left">
                    <span className="tnum font-mono text-2xl font-black text-ok">
                      {payslip.netPayable.toLocaleString('fa-IR')}
                    </span>{' '}
                    <span className="text-xs font-bold text-fg">تومان</span>
                  </div>
                </div>

                <div className="border-t border-ok/20 pt-2 text-[11px] text-fg-secondary flex items-baseline gap-1">
                  <span className="font-bold text-fg">مبلغ به حروف:</span>
                  <span className="font-bold text-fg-secondary">{netInWords} تومان تمام</span>
                </div>
              </div>

              {/* ۶. یادداشت و تبصره اداری */}
              <div className="rounded-md bg-sunken/40 border border-line px-3 py-1.5 text-[10px] text-fg-muted leading-relaxed">
                <strong>توضیحات:</strong> این فیش بر مبنای کارکرد ثبت‌شده و تأییدشده در سامانه مدیریت تسک‌آن صادر گردیده و مبلغ خالص به حساب بانکی مقصد واریز خواهد شد.
              </div>

              {/* ۷. جایگاه سه‌گانه تأییدات، مهر و امضاهای رسمی اداری */}
              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-dashed border-fg/20 text-center text-[11px] text-fg-secondary mt-3">
                <div className="space-y-10">
                  <div className="font-bold text-fg">امور مالی و حسابداری</div>
                  <div className="h-10 border-b border-dotted border-fg/30 w-32 mx-auto"></div>
                </div>
                <div className="space-y-10">
                  <div className="font-bold text-fg">مدیریت / تایید کننده نهایی</div>
                  <div className="h-10 border-b border-dotted border-fg/30 w-32 mx-auto"></div>
                </div>
                <div className="space-y-10">
                  <div className="font-bold text-fg">امضا و اثر انگشت پرسنل</div>
                  <div className="h-10 border-b border-dotted border-fg/30 w-32 mx-auto"></div>
                </div>
              </div>
            </div>
          </div>

          {/* فوتر دکمه‌های کنترل مودال (فقط در نمایشگر) */}
          <div className="flex items-center justify-between pt-3 border-t border-line no-print-in-slip">
            <button
              onClick={handlePrint}
              className="flex cursor-pointer items-center gap-2 rounded-full bg-pill px-6 py-2 text-xs font-bold text-pill-fg shadow-flat hover:opacity-90 transition-opacity"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24-1.076-.64-2.122-1.182-3.111A9.972 9.972 0 0112 3a9.972 9.972 0 016.462 7.718c-.542.989-.942 2.035-1.182 3.111M6.72 13.829A10.024 10.024 0 0012 18a10.024 10.024 0 005.28-4.171M6.72 13.829H3m14.28 0h3.72M9 14h6" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H7v4a2 2 0 002 2z" />
              </svg>
              <span>چاپ فیش رسمی (A4)</span>
            </button>

            <button
              onClick={onClose}
              className="cursor-pointer rounded-full bg-card border border-line px-6 py-2 text-xs font-medium text-fg-secondary hover:text-fg shadow-flat"
            >
              بستن
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
