'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { todayShamsi, jalaliDateTime } from '@/lib/date';
import { describeRequestError } from '@/lib/requestError';
import { useToast } from '@/components/Toast';
import api from '@/lib/api';

/** Only these two roles generate scorecards; the API enforces the same. */
const SCORECARD_ROLES = ['CEO', 'TECHNICAL_MANAGER'];

const MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

type Person = {
  id: number; name: string;
  doneTasks: number; awaitingReview: number; deliveredMinutes: number; reworkMinutes: number;
  reviews: number; reviewMinutes: number; usefulMinutes: number;
  volumeScore: number | null;
  measured: number; late: number; lateRate: number | null; unmeasured: number;
  punctualityScore: number | null;
  rejections: number;
  totalScore: number | null;
  note: string | null;
};
type Payload = {
  month: { key: string; label: string; start: string; end: string; partial: boolean };
  workingDays: number; minutesPerDay: number; capacityMinutes: number;
  method: {
    weights: { volume: number; punctuality: number; quality: number }; minSample: number;
    reviewTime: { QC: { share: number; min: number; max: number }; APPROVAL: { share: number; min: number; max: number } };
  };
  generatedAt: string;
  people: Person[];
};

const hours = (m: number) => Math.round((m / 60) * 10) / 10;
const scoreTone = (v: number | null) => (v === null ? 'neutral' : v >= 75 ? 'ok' : v >= 50 ? 'warn' : 'bad');

/** The last twelve Jalali months, newest first, from today's Jalali date. */
function recentMonths(): { key: string; label: string }[] {
  const [jy0, jm0] = todayShamsi().split(/[\/-]/).map((x) => Number(x));
  const out: { key: string; label: string }[] = [];
  let jy = jy0!, jm = jm0!;
  for (let i = 0; i < 12; i += 1) {
    out.push({ key: `${jy}-${String(jm).padStart(2, '0')}`, label: `${MONTHS[jm - 1]} ${jy}` });
    jm -= 1;
    if (jm === 0) { jm = 12; jy -= 1; }
  }
  return out;
}

export default function ScorecardPage() {
  const { showToast } = useToast();
  const months = useMemo(recentMonths, []);
  const [month, setMonth] = useState(months[0]!.key);
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);

  // Generated on request, never on page load: a scorecard is something a
  // manager asks for, and each request reflects what is on record right then.
  const generate = async () => {
    setBusy(true);
    try {
      const { data } = await api.get(`/analytics/scorecard?month=${month}`);
      setData(data);
    } catch (err) {
      showToast(describeRequestError(err, 'تولید کارنامه'), 'error');
    } finally { setBusy(false); }
  };

  return (
    <ProtectedRoute allowedRoles={SCORECARD_ROLES}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-end gap-2 pb-1">
          <div className="flex items-center gap-2">
            <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="ماه"
              className="h-9 rounded-full bg-card px-4 text-xs text-fg shadow-flat outline-none">
              {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <button onClick={generate} disabled={busy}
              className="cursor-pointer rounded-full bg-pill px-4 py-2 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90 disabled:opacity-50">
              {busy ? 'در حال تولید…' : 'تولید کارنامه'}
            </button>
          </div>
        </div>

        {!data ? (
          <Card className="py-16 text-center">
            <p className="text-sm text-fg-muted">ماه را انتخاب کنید و «تولید کارنامه» را بزنید.</p>
          </Card>
        ) : (
          <>
            <Card padding="sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-fg">
                    کارنامهٔ {data.month.label}
                    {data.month.partial && <Badge tone="warn"><span className="mr-1">ماه هنوز تمام نشده</span></Badge>}
                  </p>
                  <p className="tnum mt-1 text-[11px] text-fg-muted">
                    {data.workingDays} روز کاری{data.month.partial ? ' تا امروز' : ''} · ظرفیت هر نفر {hours(data.capacityMinutes)} ساعت ·
                    تولید در {jalaliDateTime(data.generatedAt)}
                  </p>
                </div>
              </div>
            </Card>

            <Card padding="sm" tint="info">
              <p className="text-xs font-semibold text-fg">روش محاسبه</p>
              <ul className="mt-1.5 list-inside list-disc space-y-1 text-[11px] leading-relaxed text-fg-secondary">
                <li>
                  <b>حجم کار ({data.method.weights.volume}٪):</b> ساعت مفید تقسیم بر ظرفیت؛ حداکثر ۱۰۰. ساعت مفید = زمان برآوردشدهٔ
                  تسک‌های تحویل‌شده در این ماه − زمان اصلاح + زمان بررسی. تحویل یعنی لحظه‌ای که کار برای بررسی فرستاده شد، پس
                  تسکی که هنوز در صف تأیید است هم حساب می‌شود.
                </li>
                <li>
                  <b>زمان بررسی:</b> هر بررسی کیفیت {Math.round(data.method.reviewTime.QC.share * 100)}٪ برآورد تسک
                  (بین {data.method.reviewTime.QC.min} و {data.method.reviewTime.QC.max} دقیقه) و هر تأیید نهایی{' '}
                  {Math.round(data.method.reviewTime.APPROVAL.share * 100)}٪ (بین {data.method.reviewTime.APPROVAL.min} و{' '}
                  {data.method.reviewTime.APPROVAL.max} دقیقه) به حساب بررسی‌کننده گذاشته می‌شود؛ رد هم یک بررسی است.
                </li>
                <li>
                  <b>وقت‌شناسی ({data.method.weights.punctuality}٪):</b> ۱۰۰ منهای نرخ تأخیرِ تسک‌هایی که سررسیدشان در این ماه بوده؛
                  همان قاعدهٔ صفحهٔ نرخ تأخیر.
                </li>
                <li>
                  <b>کیفیت ({data.method.weights.quality}٪):</b> هنوز وزن ندارد، چون ردهای ثبت‌شده از یک بررسی‌کننده و چند روز است.
                  تعداد رد فقط برای اطلاع نمایش داده می‌شود.
                </li>
                <li>
                  کمتر از {data.method.minSample} تسکِ سنجیده‌شده ⇐ امتیاز کل داده نمی‌شود، چون یک یا دو تسک کل عدد را عوض می‌کند.
                </li>
                <li>ظرفیت برای همه یکسان فرض شده؛ مرخصی و روزهای غیبت در اپ ثبت نمی‌شود.</li>
              </ul>
            </Card>

            <Card padding="sm">
              {data.people.length === 0 ? (
                <p className="py-10 text-center text-xs text-fg-muted">در این ماه فعالیتی ثبت نشده است</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-fg-muted">
                        <th className="px-2 py-2 text-right font-medium">نفر</th>
                        <th className="px-2 py-2 text-center font-medium">امتیاز کل</th>
                        <th className="px-2 py-2 text-center font-medium">حجم کار</th>
                        <th className="px-2 py-2 text-center font-medium">ساعت مفید</th>
                        <th className="px-2 py-2 text-center font-medium">بررسی</th>
                        <th className="px-2 py-2 text-center font-medium">تسک تحویل‌شده</th>
                        <th className="px-2 py-2 text-center font-medium">وقت‌شناسی</th>
                        <th className="px-2 py-2 text-center font-medium">تأخیر / سنجیده</th>
                        <th className="px-2 py-2 text-center font-medium">رد کیفیت</th>
                        <th className="px-2 py-2 text-center font-medium">زمان اصلاح</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.people.map((p) => (
                        <tr key={p.id} className="border-t border-line align-top">
                          <td className="px-2 py-2.5">
                            <Link href={`/dashboard/analytics/scorecard/${p.id}?month=${data.month.key}`}
                              className="font-medium text-fg underline decoration-line underline-offset-4 transition-colors hover:text-brand-ink">
                              {p.name}
                            </Link>
                            {p.note && <div className="mt-0.5 max-w-[16rem] text-[10px] leading-relaxed text-fg-muted">{p.note}</div>}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <Badge tone={scoreTone(p.totalScore)}>
                              <span className="tnum text-xs font-bold">{p.totalScore ?? '—'}</span>
                            </Badge>
                          </td>
                          <td className="tnum px-2 py-2.5 text-center text-fg">{p.volumeScore ?? '—'}</td>
                          <td className="tnum px-2 py-2.5 text-center text-fg-secondary">
                            {hours(p.usefulMinutes)}
                            {p.reworkMinutes > 0 && <div className="text-[10px] text-bad">−{hours(p.reworkMinutes)} اصلاح</div>}
                            {p.reviewMinutes > 0 && <div className="text-[10px] text-ok">+{hours(p.reviewMinutes)} بررسی</div>}
                          </td>
                          <td className="tnum px-2 py-2.5 text-center text-fg-secondary">{p.reviews || '—'}</td>
                          <td className="tnum px-2 py-2.5 text-center text-fg-secondary">
                            {p.doneTasks}
                            {p.awaitingReview > 0 && <div className="text-[10px] text-fg-muted">{p.awaitingReview} در صف تأیید</div>}
                          </td>
                          <td className="tnum px-2 py-2.5 text-center text-fg">{p.punctualityScore ?? '—'}</td>
                          <td className="tnum px-2 py-2.5 text-center text-fg-secondary">
                            {p.late} / {p.measured}
                            {p.unmeasured > 0 && <div className="text-[10px] text-fg-muted">{p.unmeasured} سنجیده‌نشده</div>}
                          </td>
                          <td className="tnum px-2 py-2.5 text-center text-fg-secondary">{p.rejections || '—'}</td>
                          <td className="tnum px-2 py-2.5 text-center text-fg-secondary">{p.reworkMinutes ? `${p.reworkMinutes} دقیقه` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
