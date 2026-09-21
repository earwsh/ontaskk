'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import { gregorianToShamsi, jalaliDateTime } from '@/lib/date';
import { categoryLabel } from '@/lib/rejectionCategories';
import { describeRequestError } from '@/lib/requestError';
import api from '@/lib/api';

type Summary = {
  doneTasks: number; awaitingReview: number; deliveredMinutes: number; reworkMinutes: number;
  reviews: number; reviewMinutes: number; usefulMinutes: number; volumeScore: number | null;
  measured: number; late: number; lateRate: number | null; unmeasured: number;
  punctualityScore: number | null; rejections: number; totalScore: number | null; note: string | null;
};
type Payload = {
  month: { key: string; label: string; partial: boolean };
  workingDays: number; capacityMinutes: number; generatedAt: string;
  person: { id: number; name: string };
  summary: Summary | null;
  delivered: { taskId: number; title: string; project: string; status: string; minutes: number; handedOn: string }[];
  lateItems: { taskId: number; title: string; project: { name: string }; due: string; finishedOn: string; daysLate: number; stillOpen: boolean }[];
  rejections: { taskId: number; title: string; project: string; at: string; stage: string; reason: string | null; categories: string[]; reworkMinutes: number | null; by: string | null }[];
  reviews: { taskId: number; title: string; project: string; stage: 'QC' | 'APPROVAL'; outcome: 'passed' | 'rejected'; at: string; taskMinutes: number; creditedMinutes: number }[];
};

const hours = (m: number) => Math.round((m / 60) * 10) / 10;
const scoreTone = (v: number | null) => (v === null ? 'neutral' : v >= 75 ? 'ok' : v >= 50 ? 'warn' : 'bad');
const STATUS: Record<string, string> = { DONE: 'تأیید شده', PENDING_QC: 'در صف کیفیت', PENDING_APPROVAL: 'در صف تأیید' };

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <Card padding="sm" className="print:break-inside-avoid print:shadow-none">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        <span className="tnum text-[11px] text-fg-muted">{count} مورد</span>
      </div>
      {count === 0 ? <p className="py-4 text-center text-[11px] text-fg-muted">موردی نیست</p> : children}
    </Card>
  );
}

export default function PersonScorecardPage() {
  const params = useParams();
  const search = useSearchParams();
  const userId = params.userId as string;
  const month = search.get('month') || '';
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null); setError(null);
    api.get(`/analytics/scorecard/${userId}${month ? `?month=${month}` : ''}`)
      .then(({ data }) => setData(data))
      .catch((err) => setError(describeRequestError(err, 'تولید کارنامه')));
  }, [userId, month]);

  const s = data?.summary;

  return (
    <ProtectedRoute allowedRoles={['CEO', 'TECHNICAL_MANAGER']}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <Link href="/dashboard/analytics/scorecard" className="text-xs text-fg-secondary transition-colors hover:text-fg">
            ← بازگشت به کارنامهٔ همه
          </Link>
          {data && (
            <button onClick={() => window.print()}
              className="cursor-pointer rounded-full bg-pill px-4 py-2 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90">
              چاپ / ذخیره PDF
            </button>
          )}
        </div>

        {error ? (
          <Card className="py-12 text-center"><p className="text-sm text-bad">{error}</p></Card>
        ) : !data ? (
          <div className="space-y-3"><Skeleton className="h-28 rounded-card" /><Skeleton className="h-64 rounded-card" /></div>
        ) : (
          <>
            <Card padding="sm" className="print:shadow-none">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-xl font-extrabold text-fg">کارنامهٔ {data.person.name}</h1>
                  <p className="tnum mt-1 text-[11px] text-fg-muted">
                    {data.month.label}{data.month.partial ? ' (ماه هنوز تمام نشده)' : ''} · {data.workingDays} روز کاری ·
                    ظرفیت {hours(data.capacityMinutes)} ساعت · تولید در {jalaliDateTime(data.generatedAt)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-fg-muted">امتیاز کل</p>
                  <Badge tone={scoreTone(s?.totalScore ?? null)}>
                    <span className="tnum px-1 text-lg font-bold">{s?.totalScore ?? '—'}</span>
                  </Badge>
                </div>
              </div>
              {s?.note && <p className="mt-2 text-[11px] text-fg-muted">{s.note}</p>}
            </Card>

            {!s ? (
              <Card className="py-12 text-center"><p className="text-sm text-fg-muted">در این ماه برای این نفر فعالیتی ثبت نشده است</p></Card>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[
                    { label: 'حجم کار', value: s.volumeScore ?? '—', hint: `${hours(s.usefulMinutes)} ساعت مفید` },
                    { label: 'وقت‌شناسی', value: s.punctualityScore ?? '—', hint: `${s.late} تأخیر از ${s.measured} سنجیده` },
                    { label: 'تسک تحویل‌شده', value: s.doneTasks, hint: s.awaitingReview ? `${s.awaitingReview} در صف تأیید` : 'همه تأیید شده' },
                    { label: 'بررسی انجام‌شده', value: s.reviews, hint: `${hours(s.reviewMinutes)} ساعت` },
                  ].map((k) => (
                    <Card key={k.label} padding="sm" className="print:shadow-none">
                      <p className="text-[11px] text-fg-secondary">{k.label}</p>
                      <p className="tnum mt-1 text-2xl font-bold text-fg">{k.value}</p>
                      <p className="mt-1 text-[10px] text-fg-muted">{k.hint}</p>
                    </Card>
                  ))}
                </div>

                <Card padding="sm" className="print:shadow-none">
                  <h2 className="mb-2 text-sm font-semibold text-fg">ساعت مفید از کجا آمده</h2>
                  <div className="tnum space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-fg-secondary">تسک‌های تحویل‌شده</span><span className="text-fg">{hours(s.deliveredMinutes)} ساعت</span></div>
                    <div className="flex justify-between"><span className="text-fg-secondary">منهای زمان اصلاح</span><span className="text-bad">−{hours(s.reworkMinutes)} ساعت</span></div>
                    <div className="flex justify-between"><span className="text-fg-secondary">به‌علاوهٔ زمان بررسی</span><span className="text-ok">+{hours(s.reviewMinutes)} ساعت</span></div>
                    <div className="flex justify-between border-t border-line pt-1 font-semibold"><span className="text-fg">ساعت مفید</span><span className="text-fg">{hours(s.usefulMinutes)} از {hours(data.capacityMinutes)} ساعت ظرفیت</span></div>
                  </div>
                </Card>
              </>
            )}

            <Section title="تسک‌های دیر" count={data.lateItems.length}>
              <div className="space-y-1">
                {data.lateItems.map((i, k) => (
                  <div key={k} className="flex flex-wrap items-center gap-2 rounded-tile bg-sunken px-3 py-2 text-[11px]">
                    <span className="tnum w-12 shrink-0 font-bold text-bad">{i.daysLate} روز</span>
                    <Link href={`/dashboard/tasks/${i.taskId}`} className="min-w-0 flex-1 truncate text-fg hover:text-brand-ink">{i.title}</Link>
                    <span className="text-fg-muted">{i.project.name}</span>
                    <span className="tnum text-fg-muted">سررسید {gregorianToShamsi(i.due)} · {i.stillOpen ? 'هنوز باز' : `تحویل ${gregorianToShamsi(i.finishedOn)}`}</span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="ردهای کیفیت" count={data.rejections.length}>
              <div className="space-y-1">
                {data.rejections.map((r, k) => (
                  <div key={k} className="rounded-tile bg-sunken px-3 py-2 text-[11px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/dashboard/tasks/${r.taskId}`} className="min-w-0 flex-1 truncate text-fg hover:text-brand-ink">{r.title}</Link>
                      {r.categories.map((c) => <Badge key={c} tone="bad">{categoryLabel(c)}</Badge>)}
                      {r.reworkMinutes != null && <span className="tnum text-fg-muted">{r.reworkMinutes} دقیقه اصلاح</span>}
                      <span className="tnum text-fg-muted">{jalaliDateTime(r.at)}</span>
                    </div>
                    {r.reason && r.reason.replace(/[^\p{L}\p{N}]/gu, '').length >= 5 && (
                      <p className="mt-1 text-fg-secondary">{r.reason}</p>
                    )}
                  </div>
                ))}
              </div>
            </Section>

            <Section title="بررسی‌هایی که انجام داده" count={data.reviews.length}>
              <div className="space-y-1">
                {data.reviews.map((r, k) => (
                  <div key={k} className="flex flex-wrap items-center gap-2 rounded-tile bg-sunken px-3 py-2 text-[11px]">
                    <Badge tone={r.outcome === 'passed' ? 'ok' : 'bad'}>{r.outcome === 'passed' ? 'تأیید' : 'رد'}</Badge>
                    <span className="text-fg-muted">{r.stage === 'QC' ? 'کیفیت' : 'تأیید نهایی'}</span>
                    <Link href={`/dashboard/tasks/${r.taskId}`} className="min-w-0 flex-1 truncate text-fg hover:text-brand-ink">{r.title}</Link>
                    <span className="tnum text-ok">+{r.creditedMinutes} دقیقه</span>
                    <span className="tnum text-fg-muted">{jalaliDateTime(r.at)}</span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="تسک‌های تحویل‌شده" count={data.delivered.length}>
              <div className="space-y-1">
                {data.delivered.map((d) => (
                  <div key={d.taskId} className="flex flex-wrap items-center gap-2 rounded-tile bg-sunken px-3 py-2 text-[11px]">
                    <Link href={`/dashboard/tasks/${d.taskId}`} className="min-w-0 flex-1 truncate text-fg hover:text-brand-ink">{d.title}</Link>
                    <span className="text-fg-muted">{d.project}</span>
                    <Badge tone={d.status === 'DONE' ? 'ok' : 'warn'}>{STATUS[d.status] ?? d.status}</Badge>
                    <span className="tnum text-fg-muted">{d.minutes} دقیقه · {gregorianToShamsi(d.handedOn)}</span>
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
