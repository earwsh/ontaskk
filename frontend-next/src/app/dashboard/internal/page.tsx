'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import Avatar from '@/components/ui/Avatar';
import StatTile from '@/components/bento/StatTile';
import DashboardHeader from '@/components/bento/DashboardHeader';
import InkCard from '@/components/bento/InkCard';
import PeopleGrid, { Person } from '@/components/bento/PeopleGrid';
import { daysTo, isOverdue } from '@/components/bento/TaskRow';
import api from '@/lib/api';
import { roleLabels } from '@/lib/roles';



const DAY = 86400000;

export default function HRDashboardPage() {
  const [me, setMe] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [userRes, deptRes, taskRes] = await Promise.all([
        api.get('/users'),
        api.get('/departments'),
        api.get('/tasks').catch(() => ({ data: [] })),
      ]);
      setUsers(userRes.data);
      setDepartments(deptRes.data);
      setTasks(taskRes.data);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      setMe(`${u.firstName || ''} ${u.lastName || ''}`.trim());
    } catch {}
    fetchAll();
  }, [fetchAll]);

  const byRole = useMemo(() => {
    const c: Record<string, number> = {};
    for (const u of users) c[u.role] = (c[u.role] || 0) + 1;
    return c;
  }, [users]);

  // Anyone who joined in the last 90 days — the group that still needs onboarding.
  const recentJoiners = useMemo(() => {
    const cutoff = Date.now() - 90 * DAY;
    return users
      .filter((u) => { const d = u.startDate || u.createdAt; return d && new Date(d).getTime() >= cutoff; })
      .sort((a, b) => new Date(b.startDate || b.createdAt).getTime() - new Date(a.startDate || a.createdAt).getTime());
  }, [users]);

  const unassigned = useMemo(() => users.filter((u) => !u.departmentMemberships?.length), [users]);

  const deptRows = useMemo(() => {
    const taskByDept: Record<number, { open: number; overdue: number }> = {};
    for (const t of tasks) {
      const id = t.project?.departmentId;
      if (!id || t.status === 'DONE') continue;
      const s = (taskByDept[id] ||= { open: 0, overdue: 0 });
      s.open++;
      if (isOverdue(t)) s.overdue++;
    }
    return departments.map((d) => ({
      id: d.id,
      name: d.name,
      members: d._count?.members ?? 0,
      manager: d.manager ? `${d.manager.firstName} ${d.manager.lastName}`.trim() : null,
      open: taskByDept[d.id]?.open ?? 0,
      overdue: taskByDept[d.id]?.overdue ?? 0,
    })).sort((a, b) => b.members - a.members);
  }, [departments, tasks]);

  const people: Person[] = useMemo(
    () => users.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), role: u.position || roleLabels[u.role] })),
    [users]
  );

  const peakMembers = Math.max(1, ...deptRows.map((d) => d.members));

  return (
    <ProtectedRoute allowedRoles={['INTERNAL_MANAGER']}>
      <DashboardHeader
        name={me}
        role="مدیر داخلی"
        actions={
          <Link href="/dashboard/users" className="flex items-center gap-2 rounded-full bg-pill px-4 py-2 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            کاربر جدید
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="grid grid-cols-2 gap-3 lg:col-span-12 lg:grid-cols-4">
          <StatTile index={0} label="کل کارکنان" value={users.length} hint="ثبت‌شده در سیستم" href="/dashboard/users" loading={loading} />
          <StatTile index={1} label="دپارتمان" value={departments.length} hint="واحد سازمانی" loading={loading} />
          <StatTile index={2} label="تازه‌وارد" value={recentJoiners.length} hint="۹۰ روز گذشته" tone={recentJoiners.length ? 'info' : 'neutral'} loading={loading} />
          <StatTile index={3} label="بدون دپارتمان" value={unassigned.length} hint={unassigned.length ? 'نیازمند تخصیص' : 'همه تخصیص یافته‌اند'} tone={unassigned.length ? 'warn' : 'ok'} href="/dashboard/users" loading={loading} />
        </div>

        <Card className="lg:col-span-8">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-fg">توزیع نیرو در دپارتمان‌ها</h3>
            <Link href="/dashboard/departments" className="text-[11px] text-brand-ink hover:text-brand">مدیریت واحدها</Link>
          </div>
          {loading ? (
            <div className="space-y-2">{[0,1,2,3].map(i => <Skeleton key={i} className="h-12" />)}</div>
          ) : deptRows.length ? (
            <div className="space-y-2">
              {deptRows.map((d) => (
                <div key={d.id} className="flex items-center gap-3 rounded-tile bg-sunken px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-fg">{d.name}</p>
                    <p className="truncate text-[10px] text-fg-muted">
                      {d.manager ? `مدیر: ${d.manager}` : 'بدون مدیر'}
                    </p>
                  </div>
                  <div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-panel-strong sm:block">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(d.members / peakMembers) * 100}%` }} />
                  </div>
                  <span className="tnum w-12 text-left text-[11px] text-fg-muted">{d.members} نفر</span>
                  {!d.manager && <Badge tone="warn">بدون مدیر</Badge>}
                  {d.overdue > 0 && <Badge tone="bad">{d.overdue} دیرکرد</Badge>}
                </div>
              ))}
            </div>
          ) : <p className="py-8 text-center text-xs text-fg-muted">دپارتمانی وجود ندارد</p>}
        </Card>

        <InkCard className="lg:col-span-4">
          <h3 className="mb-3 text-sm font-semibold">ترکیب نقش‌ها</h3>
          <div className="space-y-2">
            {Object.entries(byRole).sort((a, b) => b[1] - a[1]).map(([role, n]) => (
              <div key={role} className="flex items-center justify-between rounded-tile bg-white/10 px-3 py-2">
                <span className="text-[11px] text-ink-muted">{roleLabels[role] || role}</span>
                <span className="tnum text-sm font-bold">{n}</span>
              </div>
            ))}
            {!Object.keys(byRole).length && <p className="py-6 text-center text-xs text-ink-muted">داده‌ای نیست</p>}
          </div>
        </InkCard>

        <Card className="lg:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-fg">تیم سازمان</h3>
            <span className="tnum text-[11px] text-fg-muted">{users.length} نفر</span>
          </div>
          {loading ? (
            <div className="flex flex-wrap gap-2">{Array.from({length:10}).map((_,i)=><Skeleton key={i} className="h-11 w-11 rounded-full" />)}</div>
          ) : <PeopleGrid people={people} max={16} />}
        </Card>

        <Card className="lg:col-span-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-fg">تازه‌واردها</h3>
            <Badge tone={recentJoiners.length ? 'info' : 'neutral'}>{recentJoiners.length}</Badge>
          </div>
          {loading ? (
            <div className="space-y-2">{[0,1,2].map(i => <Skeleton key={i} className="h-12" />)}</div>
          ) : recentJoiners.length ? (
            <div className="space-y-2">
              {recentJoiners.slice(0, 5).map((u) => {
                const name = `${u.firstName} ${u.lastName}`.trim();
                const when = u.startDate || u.createdAt;
                const days = Math.max(0, Math.round((Date.now() - new Date(when).getTime()) / DAY));
                return (
                  <div key={u.id} className="flex items-center gap-3 rounded-tile bg-sunken px-3 py-2.5">
                    <Avatar name={name} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-fg">{name}</p>
                      <p className="truncate text-[10px] text-fg-muted">{u.position || roleLabels[u.role]}</p>
                    </div>
                    <span className="tnum shrink-0 text-[10px] text-fg-muted">{days} روز پیش</span>
                  </div>
                );
              })}
            </div>
          ) : <p className="py-8 text-center text-xs text-fg-muted">در ۹۰ روز گذشته کسی اضافه نشده</p>}
        </Card>
      </div>
    </ProtectedRoute>
  );
}
