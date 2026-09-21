'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useToast } from '@/components/Toast';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import CardHead from '@/components/bento/CardHead';
import TaskRow, { daysTo, isOverdue } from '@/components/bento/TaskRow';
import api from '@/lib/api';
import { gregorianToShamsi, jalaliDate } from '@/lib/date';
import Link from 'next/link';

const groups = [
  { key: 'overdue', label: 'دیرکرد', tone: 'bad' as const },
  { key: 'today', label: 'امروز', tone: 'warn' as const },
  { key: 'tomorrow', label: 'فردا', tone: 'info' as const },
  { key: 'week', label: 'این هفته', tone: 'info' as const },
  { key: 'future', label: 'آینده', tone: 'neutral' as const },
  { key: 'noDeadline', label: 'بدون سررسید', tone: 'neutral' as const },
];

function groupOf(task: { deadline: string | null; status?: string; submittedForReviewAt?: string | null }): string {
  const d = daysTo(task.deadline);
  if (d === null) return 'noDeadline';
  if (isOverdue(task)) return 'overdue';
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d <= 7) return 'week';
  return 'future';
}

export default function MyTasksPage() {
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [query, setQuery] = useState('');
  const [userId, setUserId] = useState<number>(0);

  const fetchTasks = useCallback(() => {
    api.get('/tasks/my')
      .then(({ data }) => setTasks(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) setUserId(JSON.parse(stored).id);
    } catch {}
    fetchTasks();
  }, [fetchTasks]);

  const handleToggle = async (task: any, next: boolean) => {
    // Reflect the tick immediately; the refetch reconciles counts.
    setTasks((prev) => prev.map((t) => t.id !== task.id ? t : {
      ...t,
      assignees: t.assignees?.map((a: any) =>
        (a.userId === userId || a.user?.id === userId) ? { ...a, isCompleted: next } : a),
    }));
    try {
      const res = await api.patch(`/tasks/${task.id}/assignee-complete`, { isCompleted: next });
      showToast(res.data?.message || (next ? 'تیک انجام شما ثبت شد' : 'وضعیت برداشته شد'));
      fetchTasks();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا', 'error');
      fetchTasks();
    }
  };

  const handleDelete = async (task: any) => {
    if (!confirm(`آیا از حذف تسک «${task.title}» اطمینان دارید؟`)) return;
    try {
      await api.delete(`/tasks/${task.id}`);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      showToast('تسک با موفقیت حذف شد');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در حذف', 'error');
    }
  };

  const matches = useCallback(
    (t: any) => {
      const q = query.trim();
      if (!q) return true;
      return `${t.title} ${t.project?.name ?? ''}`.toLowerCase().includes(q.toLowerCase());
    },
    [query]
  );

  const active = useMemo(() => tasks.filter((t) => t.status !== 'DONE' && matches(t)), [tasks, matches]);
  const history = useMemo(() => tasks.filter((t) => t.status === 'DONE' && matches(t)), [tasks, matches]);

  const grouped = useMemo(() => {
    const out: Record<string, any[]> = Object.fromEntries(groups.map((g) => [g.key, []]));
    for (const t of active) out[groupOf(t)]?.push(t);
    return out;
  }, [active]);

  const allActive = tasks.filter((t) => t.status !== 'DONE');
  const stats = {
    overdue: allActive.filter((t) => groupOf(t) === 'overdue').length,
    today: allActive.filter((t) => groupOf(t) === 'today').length,
    week: allActive.filter((t) => ['tomorrow', 'week'].includes(groupOf(t))).length,
    done: tasks.filter((t) => t.status === 'DONE').length,
  };

  const kpis = [
    { label: 'دیرکرد', value: stats.overdue, hint: 'از سررسید گذشته', tone: stats.overdue ? 'bad' : 'ok' },
    { label: 'امروز', value: stats.today, hint: 'سررسید امروز', tone: stats.today ? 'warn' : 'ok' },
    { label: 'هفت روز آینده', value: stats.week, hint: 'در پیش است', tone: 'neutral' },
    { label: 'تکمیل‌شده', value: stats.done, hint: 'در تاریخچه', tone: 'ok' },
  ] as const;

  const toneClass = (t: string) =>
    t === 'bad' ? 'bg-bad-soft text-bad' : t === 'warn' ? 'bg-warn-soft text-warn'
      : t === 'ok' ? 'bg-ok-soft text-ok' : 'bg-sunken text-fg-secondary';

  return (
    <ProtectedRoute allowedRoles={['CEO', 'INTERNAL_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER', 'EMPLOYEE']}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-end gap-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <label className="relative">
            <span className="sr-only">جستجو در تسک‌ها</span>
            <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="جستجو…"
              className="w-44 rounded-full bg-card py-2 pr-9 pl-3 text-xs text-fg shadow-flat outline-none transition-all placeholder:text-fg-muted focus:w-56"
            />
          </label>
          <Link href="/dashboard/tasks/new" className="flex items-center gap-2 rounded-full bg-pill px-4 py-2 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            تسک جدید
          </Link>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} padding="sm">
            <div className="flex items-start justify-between">
              {loading ? <Skeleton className="h-8 w-12" /> : <span className="tnum text-3xl font-extrabold text-fg">{k.value}</span>}
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${toneClass(k.tone)}`}>{k.label}</span>
            </div>
            <p className="mt-3 text-[11px] text-fg-muted">{k.hint}</p>
          </Card>
        ))}
      </div>

      {/* Segmented tabs */}
      <div className="mb-3 inline-flex items-center gap-1 rounded-full bg-card p-1 shadow-flat">
        {([['active', 'فعال', allActive.length], ['history', 'تاریخچه', stats.done]] as const).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`cursor-pointer rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
              tab === key ? 'bg-pill text-pill-fg' : 'text-fg-secondary hover:text-fg'
            }`}
          >
            {label}
            {count > 0 && <span className="tnum mr-1.5 opacity-70">({count})</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-card" />)}
        </div>
      ) : tab === 'active' ? (
        active.length ? (
          <div className="space-y-3">
            {groups.map((g) => {
              const list = grouped[g.key];
              if (!list?.length) return null;
              return (
                <Card key={g.key}>
                  <CardHead
                    title={g.label}
                    action={<Badge tone={g.tone}>{list.length} تسک</Badge>}
                  />
                  <div className="space-y-2">
                    {list.map((t) => (
                      <TaskRow key={t.id} task={t} userId={userId} onToggle={handleToggle} onDelete={handleDelete} />
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="py-16 text-center">
            <p className="text-sm text-fg-muted">
              {query ? 'تسکی با این جستجو پیدا نشد' : 'هیچ تسک فعالی وجود ندارد'}
            </p>
          </Card>
        )
      ) : history.length ? (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {['عنوان', 'پروژه', 'سررسید', 'تکمیل در', 'تایید کننده'].map((h) => (
                    <th key={h} className="whitespace-nowrap px-5 py-3.5 text-right text-[11px] font-medium text-fg-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((task) => (
                  <tr key={task.id} className="transition-colors hover:bg-sunken">
                    <td className="px-5 py-3">
                      <Link href={`/dashboard/tasks/${task.id}`} className="text-sm text-fg transition-colors hover:text-brand-ink">
                        {task.title}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-fg-muted">{task.project?.name || '—'}</td>
                    <td className="tnum whitespace-nowrap px-5 py-3 text-xs text-fg-muted">{task.deadline ? gregorianToShamsi(task.deadline) : '—'}</td>
                    <td className="tnum whitespace-nowrap px-5 py-3 text-xs text-fg-muted">{jalaliDate(task.approvedAt)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-fg-muted">
                      {task.approvedBy ? `${task.approvedBy.firstName} ${task.approvedBy.lastName}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="py-16 text-center">
          <p className="text-sm text-fg-muted">{query ? 'موردی پیدا نشد' : 'هنوز تسکی تکمیل نشده'}</p>
        </Card>
      )}
    </ProtectedRoute>
  );
}
