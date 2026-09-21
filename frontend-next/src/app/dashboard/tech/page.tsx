'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from 'recharts';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useToast } from '@/components/Toast';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import Avatar from '@/components/ui/Avatar';
import StatTile from '@/components/bento/StatTile';
import DashboardHeader from '@/components/bento/DashboardHeader';
import InkCard from '@/components/bento/InkCard';
import { isOverdue } from '@/components/bento/TaskRow';
import { useChartColors } from '@/lib/chartColors';
import { gregorianToShamsi } from '@/lib/date';
import api from '@/lib/api';

const hours = (m: number) => Math.round((m / 60) * 10) / 10;

function DailyTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-tile bg-card px-3 py-2 text-xs shadow-float">
      <div className="mb-1 font-semibold text-fg">
        {p.fullDate} {p.weekend && <span className="mr-1 text-[10px] text-fg-muted">(تعطیل)</span>}
      </div>
      <div className="tnum text-brand font-medium">{p.done} تسک تکمیل‌شده</div>
      <div className="tnum text-fg-muted">{p.hours} ساعت برآورد کار</div>
    </div>
  );
}

export default function TechDashboardPage() {
  const { showToast } = useToast();
  const c = useChartColors();
  const [me, setMe] = useState({ name: '', role: '' });
  const [dailyData, setDailyData] = useState<any>(null);
  const [latenessData, setLatenessData] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [dailyRes, lateRes, taskRes] = await Promise.all([
        api.get('/analytics/daily-rate?days=14').catch(() => ({ data: null })),
        api.get('/analytics/lateness?days=30').catch(() => ({ data: null })),
        api.get('/tasks').catch(() => ({ data: [] })),
      ]);
      setDailyData(dailyRes.data);
      setLatenessData(lateRes.data);
      setTasks(taskRes.data || []);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      setMe({
        name: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
        role: u.role === 'STRATEGY_MANAGER' ? 'مدیر استراتژی' : 'مدیر فنی',
      });
    } catch {}
    fetchAll();
  }, [fetchAll]);

  const approve = async (taskId: number) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: 'DONE' } : t)));
    try {
      await api.patch(`/tasks/${taskId}/status`, { status: 'DONE' });
      showToast('تسک با موفقیت تأیید شد');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در تایید تسک', 'error');
    }
    fetchAll();
  };

  // KPI Metrics
  const activeTasks = useMemo(() => tasks.filter((t) => t.status !== 'DONE'), [tasks]);
  const pendingTasks = useMemo(() => tasks.filter((t) => t.status === 'PENDING_APPROVAL'), [tasks]);
  const completionRate = tasks.length
    ? Math.round((tasks.filter((t) => t.status === 'DONE').length / tasks.length) * 100)
    : 0;

  const totalLateTasks = latenessData?.totals?.late ?? 0;
  const totalMeasured = latenessData?.totals?.measured ?? 0;
  const overallLateRate = totalMeasured ? Math.round((totalLateTasks / totalMeasured) * 100) : 0;
  const openOverdue = latenessData?.totals?.openOverdue ?? activeTasks.filter((t) => isOverdue(t)).length;

  const dailyVelocity = dailyData?.totals?.donePerWorkingDay ?? 0;
  const dailyWorkHours = hours(dailyData?.totals?.minutesPerWorkingDay ?? 0);

  // Daily chart data
  const chartPoints = useMemo(() => {
    return (dailyData?.series ?? []).map((p: any) => ({
      ...p,
      shamsiDate: gregorianToShamsi(p.day).slice(5),
      fullDate: gregorianToShamsi(p.day),
      hours: hours(p.minutes),
    }));
  }, [dailyData]);

  // Lateness rankings
  const latePeople = useMemo(() => {
    return (latenessData?.people ?? [])
      .filter((p: any) => p.measured > 0)
      .slice(0, 5);
  }, [latenessData]);

  // Most delayed tasks
  const criticalLateItems = useMemo(() => {
    return (latenessData?.lateItems ?? []).slice(0, 4);
  }, [latenessData]);

  return (
    <ProtectedRoute allowedRoles={['TECHNICAL_MANAGER', 'STRATEGY_MANAGER']}>
      <DashboardHeader
        name={me.name}
        role={me.role}
        actions={
          <>
            <Link
              href="/dashboard/tech/tasks"
              className="rounded-full bg-card px-4 py-2 text-xs font-medium text-fg-secondary shadow-flat transition-colors hover:text-fg"
            >
              تسک‌های سازمان
            </Link>
            <Link
              href="/dashboard/tasks/new"
              className="flex items-center gap-2 rounded-full bg-pill px-4 py-2 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              تسک جدید
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* Row 1: KPI Stat Tiles */}
        <div className="grid grid-cols-2 gap-3 lg:col-span-12 lg:grid-cols-5">
          <StatTile
            index={0}
            label="نرخ روزانه"
            value={`${dailyVelocity} تسک`}
            hint={`${dailyWorkHours} ساعت در روز کاری`}
            tone={dailyVelocity >= 3 ? 'ok' : 'info'}
            href="/dashboard/analytics/daily-rate"
            loading={loading}
            squircle
            className="squircle-tile"
          />
          <StatTile
            index={1}
            label="نرخ تأخیر تیم"
            value={`${overallLateRate}٪`}
            hint={`${totalLateTasks} از ${totalMeasured} تسک مهلت‌دار`}
            tone={overallLateRate <= 20 ? 'ok' : overallLateRate <= 35 ? 'warn' : 'bad'}
            href="/dashboard/analytics/lateness"
            loading={loading}
            squircle
            className="squircle-tile"
          />
          <StatTile
            index={2}
            label="معوقه باز"
            value={openOverdue}
            hint="از سررسید گذشته و باز"
            tone={openOverdue ? 'bad' : 'ok'}
            href="/dashboard/tech/tasks"
            loading={loading}
            squircle
            className="squircle-tile"
          />
          <StatTile
            index={3}
            label="معطل تصمیم شما"
            value={pendingTasks.length}
            hint="منتظر تایید یا کنترل کیفیت"
            tone={pendingTasks.length > 5 ? 'bad' : pendingTasks.length > 0 ? 'warn' : 'ok'}
            href="/dashboard/approvals"
            loading={loading}
            squircle
            className="squircle-tile"
          />
          <StatTile
            index={4}
            label="نرخ تکمیل کل"
            value={`${completionRate}٪`}
            hint={`${tasks.length - activeTasks.length} از ${tasks.length} تسک کل`}
            tone={completionRate >= 60 ? 'ok' : completionRate >= 35 ? 'warn' : 'bad'}
            href="/dashboard/analytics"
            loading={loading}
            squircle
            className="squircle-tile"
          />
        </div>

        {/* Row 2: Daily Rate Trend (8 cols) & Quick Approvals InkCard (4 cols) */}
        <Card className="lg:col-span-8 flex flex-col justify-between" squircle>
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-fg">روند نرخ تحویل روزانه</h3>
                <p className="mt-0.5 text-[11px] text-fg-muted">تسک‌های تکمیل‌شده در ۱۴ روز اخیر (تفکیک روز کاری و تعطیل)</p>
              </div>
              <Link
                href="/dashboard/analytics/daily-rate"
                className="rounded-full bg-sunken px-3 py-1 text-[11px] font-medium text-brand-ink hover:text-brand transition-colors"
              >
                تحلیل جامع نرخ روزانه ←
              </Link>
            </div>

            {loading ? (
              <Skeleton className="h-[150px]" />
            ) : chartPoints.length > 0 ? (
              <div className="h-[150px] w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartPoints} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                    <XAxis
                      dataKey="shamsiDate"
                      tick={{ fill: c.axis, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: c.axis, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<DailyTooltip />} />
                    <Bar dataKey="done" radius={[6, 6, 0, 0]}>
                      {chartPoints.map((entry: any, index: number) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.weekend ? c.grid : c.brand}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-12 text-center text-xs text-fg-muted">داده کافی برای نرخ روزانه ثبت نشده است</p>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[11px] text-fg-muted">
            <div className="flex items-center gap-4">
              <span>کل تسک‌های تحویل‌شده در بازه: <strong className="tnum text-fg">{dailyData?.totals?.done ?? 0}</strong></span>
              <span>ساعات کار تخمینی: <strong className="tnum text-fg">{hours(dailyData?.totals?.minutes ?? 0)} ساعت</strong></span>
            </div>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-brand" /> روز کاری
              <span className="mr-2 h-2 w-2 rounded-full bg-fg-muted/40" /> روز تعطیل
            </span>
          </div>
        </Card>

        <InkCard className="lg:col-span-4 flex flex-col justify-between" squircle>
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink-fg">معطل تأیید شما</h3>
              <Link
                href="/dashboard/approvals"
                aria-label="مشاهده کارتابل تاییدات"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 transition-opacity hover:opacity-80"
              >
                <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
            </div>

            <div className="flex items-baseline gap-2">
              <p className="tnum text-3xl font-extrabold text-white">{pendingTasks.length}</p>
              <span className="text-xs text-ink-muted">تسک در انتظار اقدام</span>
            </div>

            {/* Quick action list */}
            <div className="mt-4 space-y-2">
              {pendingTasks.slice(0, 2).map((t) => {
                const assignee = t.assignees?.[0]?.user;
                const name = assignee ? `${assignee.firstName} ${assignee.lastName}`.trim() : 'بدون مسئول';
                return (
                  <div key={t.id} className="rounded-xl bg-white/5 p-2.5 transition-colors hover:bg-white/10">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-white">{t.title}</span>
                      <button
                        onClick={() => approve(t.id)}
                        className="cursor-pointer shrink-0 rounded-full bg-brand px-2.5 py-1 text-[10px] font-semibold text-white transition-opacity hover:opacity-90"
                      >
                        تأیید سریع
                      </button>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-ink-muted">
                      <Avatar name={name} size={14} src={assignee?.avatarUrl} />
                      <span>{name}</span>
                      {t.project?.name && <span>· {t.project.name}</span>}
                    </div>
                  </div>
                );
              })}
              {pendingTasks.length === 0 && (
                <div className="py-6 text-center text-xs text-ink-muted">
                  هیچ تسکی معطل تصمیم یا تأیید شما نیست ✓
                </div>
              )}
            </div>
          </div>

          <Link
            href="/dashboard/approvals"
            className="mt-4 block w-full rounded-full bg-white/10 py-2 text-center text-xs font-medium text-white transition-colors hover:bg-white/20"
          >
            مشاهده تمام تاییدات ({pendingTasks.length})
          </Link>
        </InkCard>

        {/* Row 3: Team Lateness Breakdown (7 cols) & Critical Delayed Tasks (5 cols) */}
        <Card className="lg:col-span-7 flex flex-col justify-between" squircle>
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-fg">نرخ تأخیر اعضای تیم</h3>
                <p className="mt-0.5 text-[11px] text-fg-muted">پایش نیروهای فنی با بیشترین میزان تأخیر (۳۰ روز اخیر)</p>
              </div>
              <Link
                href="/dashboard/analytics/lateness"
                className="text-[11px] font-medium text-brand-ink hover:text-brand transition-colors"
              >
                مشاهده گزارش کامل تأخیرات ←
              </Link>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : latePeople.length > 0 ? (
              <div className="space-y-2">
                {latePeople.map((person: any) => {
                  const rate = person.lateRate ?? 0;
                  return (
                    <div
                      key={person.id}
                      className="flex items-center gap-3 rounded-tile bg-sunken px-3.5 py-2.5 transition-colors hover:bg-hover"
                    >
                      <Avatar name={person.name} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="truncate text-xs font-medium text-fg">{person.name}</span>
                          <span className="tnum text-[11px] font-semibold text-fg">{rate}٪ تأخیر</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[10px] text-fg-muted">
                          <span>{person.late} تأخیر از {person.measured} تسک</span>
                          <span>میانگین {person.avgLateDays} روز دیرکرد</span>
                        </div>
                      </div>
                      {person.openOverdue > 0 && (
                        <Badge tone="bad" className="shrink-0 text-[10px]">
                          {person.openOverdue} معوقه باز
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-8 text-center text-xs text-fg-muted">هیچ تأخیری در بازه اخیر ثبت نشده است</p>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[11px] text-fg-muted">
            <span>میانگین کل تأخیر تیم: <strong className="tnum text-fg">{overallLateRate}٪</strong></span>
            <span>مجموع روزهای تأخیر: <strong className="tnum text-fg">{latenessData?.totals?.lateDays ?? 0} روز</strong></span>
          </div>
        </Card>

        <Card className="lg:col-span-5 flex flex-col justify-between" squircle>
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-fg">بحرانی‌ترین تسک‌های دارای تأخیر</h3>
                <p className="mt-0.5 text-[11px] text-fg-muted">تسک‌های با بالاترین روز عقب‌افتادگی</p>
              </div>
              <Badge tone={criticalLateItems.length ? 'bad' : 'ok'}>
                {criticalLateItems.length} مورد بحرانی
              </Badge>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : criticalLateItems.length > 0 ? (
              <div className="space-y-2">
                {criticalLateItems.map((item: any) => (
                  <Link
                    key={item.taskId}
                    href={`/dashboard/tasks/${item.taskId}`}
                    className="block rounded-tile bg-sunken p-2.5 transition-colors hover:bg-hover"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate text-xs font-medium text-fg">{item.title}</span>
                      <Badge tone="bad" className="shrink-0 text-[10px]">
                        {item.daysLate} روز تأخیر
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-fg-muted">
                      <span>مسئول: {item.employee?.name || 'نامشخص'}</span>
                      {item.project?.name && <span>پروژه: {item.project.name}</span>}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-xs text-fg-muted">تسک بحرانی دارای دیرکرد وجود ندارد</p>
            )}
          </div>

          <div className="mt-4 border-t border-line pt-3 text-center">
            <Link
              href="/dashboard/tech/tasks"
              className="text-xs font-medium text-brand-ink hover:text-brand transition-colors"
            >
              مشاهده همه تسک‌های دارای دیرکرد در تسک‌های سازمان ←
            </Link>
          </div>
        </Card>
      </div>
    </ProtectedRoute>
  );
}

