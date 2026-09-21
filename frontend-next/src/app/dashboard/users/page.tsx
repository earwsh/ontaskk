'use client';

import Link from 'next/link';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { gregorianToShamsi, jalaliDate } from '@/lib/date';
import ProtectedRoute from '@/components/ProtectedRoute';
import UserFormModal from '@/components/UserFormModal';
import { useToast } from '@/components/Toast';
import Card from '@/components/ui/Card';
import Badge, { BadgeTone } from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import Avatar from '@/components/ui/Avatar';
import { daysTo, isOverdue } from '@/components/bento/TaskRow';
import api from '@/lib/api';
import { roleLabels, roleOrder } from '@/lib/roles';

interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  role: string;
  position: string | null;
  avatarUrl: string | null;
  nationalId: string | null;
  departmentMemberships: { department: { id: number; name: string } }[];
  phone: string | null;
  birthDate: string | null;
  startDate: string | null;
  createdAt: string;
}

const roleTones: Record<string, BadgeTone> = {
  CEO: 'violet',
  TECHNICAL_MANAGER: 'info',
  INTERNAL_MANAGER: 'info',
  STRATEGY_MANAGER: 'violet',
  DEPARTMENT_MANAGER: 'warn',
  EMPLOYEE: 'ok',
  CUSTOMER: 'neutral',
};

// Labels come from the shared map; only the badge colour lives here.
const roleMeta: Record<string, { label: string; tone: BadgeTone }> = Object.fromEntries(
  roleOrder.map((r) => [r, { label: roleLabels[r], tone: roleTones[r] || 'neutral' }])
);

const MANAGER_ROLES = ['CEO', 'INTERNAL_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER'];

/** The start date is a calendar date; falling back to createdAt is an instant. */
const joinedOn = (u: { startDate?: string | null; createdAt?: string | null }) =>
  u.startDate ? gregorianToShamsi(u.startDate) : jalaliDate(u.createdAt);

interface UserLoad { open: number; overdue: number }

export default function UsersPage() {
  const { showToast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loadById, setLoadById] = useState<Record<number, UserLoad>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [deptFilter, setDeptFilter] = useState<number | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editingUser, setEditingUser] = useState<any>(null);

  const fetchAll = useCallback(async () => {
    try {
      // Task volume per person is not on the users endpoint, so it is rolled
      // up here from the task list the current role is allowed to see.
      const [userRes, taskRes] = await Promise.all([
        api.get('/users'),
        api.get('/tasks').catch(() => ({ data: [] })),
      ]);
      setUsers(userRes.data);

      const acc: Record<number, UserLoad> = {};
      for (const t of taskRes.data as any[]) {
        if (t.status === 'DONE') continue;
        const late = isOverdue(t);
        for (const a of t.assignees || []) {
          const uid = a.userId ?? a.user?.id;
          if (!uid) continue;
          const l = (acc[uid] ||= { open: 0, overdue: 0 });
          l.open++;
          if (late) l.overdue++;
        }
      }
      setLoadById(acc);
    } catch {
      // auth handled by the interceptor
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => { setEditingUser(null); setEditingUserId(null); setModalMode('create'); setModalOpen(true); };

  const openEdit = (user: User) => {
    setEditingUserId(user.id);
    setEditingUser({
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName || '',
      email: user.email,
      role: user.role,
      position: user.position || '',
      nationalId: user.nationalId || '',
      departmentIds: user.departmentMemberships?.map((m) => m.department.id) || [],
      phone: user.phone || '',
      birthDate: user.birthDate ? user.birthDate.split('T')[0] : '',
      startDate: user.startDate ? user.startDate.split('T')[0] : '',
    });
    setModalMode('edit');
    setModalOpen(true);
  };

  const handleSubmit = async (data: any) => {
    try {
      if (modalMode === 'create') await api.post('/users', data);
      else if (editingUserId) await api.put(`/users/${editingUserId}`, data);
      setModalOpen(false);
      setEditingUserId(null);
      fetchAll();
      showToast(modalMode === 'create' ? 'کاربر ساخته شد' : 'تغییرات ذخیره شد');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا', 'error');
    }
  };

  const handleDelete = async (user: User) => {
    if (!confirm(`آیا از حذف «${user.firstName} ${user.lastName}» اطمینان دارید؟`)) return;
    try {
      await api.delete(`/users/${user.id}`);
      fetchAll();
      showToast('کاربر حذف شد');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در حذف', 'error');
    }
  };

  const departments = useMemo(() => {
    const map = new Map<number, string>();
    for (const u of users) for (const m of u.departmentMemberships || []) map.set(m.department.id, m.department.name);
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  }, [users]);

  const roleCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const u of users) c[u.role] = (c[u.role] || 0) + 1;
    return c;
  }, [users]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (deptFilter !== null && !u.departmentMemberships?.some((m) => m.department.id === deptFilter)) return false;
      if (!q) return true;
      return `${u.firstName} ${u.lastName} ${u.email} ${u.position ?? ''}`.toLowerCase().includes(q);
    });
  }, [users, query, roleFilter, deptFilter]);

  const totals = useMemo(() => ({
    all: users.length,
    managers: users.filter((u) => MANAGER_ROLES.includes(u.role)).length,
    employees: users.filter((u) => u.role === 'EMPLOYEE').length,
    unassigned: users.filter((u) => !u.departmentMemberships?.length).length,
  }), [users]);

  const filterCount = (roleFilter ? 1 : 0) + (deptFilter !== null ? 1 : 0) + (query ? 1 : 0);
  const chip = (on: boolean) =>
    `cursor-pointer whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
      on ? 'bg-pill text-pill-fg' : 'bg-card text-fg-secondary shadow-flat hover:text-fg'
    }`;

  return (
    <ProtectedRoute allowedRoles={['CEO', 'INTERNAL_MANAGER']}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-end gap-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <label className="relative">
            <span className="sr-only">جستجو در کاربران</span>
            <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="نام، ایمیل یا سمت…"
              className="w-52 rounded-full bg-card py-2 pr-9 pl-3 text-xs text-fg shadow-flat outline-none transition-all placeholder:text-fg-muted focus:w-64" />
          </label>
          <button onClick={openCreate}
            className="flex cursor-pointer items-center gap-2 rounded-full bg-pill px-4 py-2 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            کاربر جدید
          </button>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'کل کاربران', value: totals.all, hint: 'ثبت‌شده در سیستم' },
          { label: 'مدیران', value: totals.managers, hint: 'با نقش مدیریتی' },
          { label: 'کارمندان', value: totals.employees, hint: 'نقش کارمند' },
          { label: 'بدون دپارتمان', value: totals.unassigned, hint: totals.unassigned ? 'نیازمند تخصیص' : 'همه تخصیص یافته‌اند', tone: totals.unassigned ? 'warn' : 'ok' },
        ].map((k) => (
          <Card key={k.label} padding="sm">
            <div className="flex items-start justify-between">
              {loading ? <Skeleton className="h-8 w-12" /> : <span className="tnum text-3xl font-extrabold text-fg">{k.value}</span>}
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                k.tone === 'warn' ? 'bg-warn-soft text-warn' : k.tone === 'ok' ? 'bg-ok-soft text-ok' : 'bg-sunken text-fg-secondary'
              }`}>{k.label}</span>
            </div>
            <p className="mt-3 text-[11px] text-fg-muted">{k.hint}</p>
          </Card>
        ))}
      </div>

      <Card padding="sm" className="mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setRoleFilter(null)} className={chip(roleFilter === null)}>همه نقش‌ها</button>
          {Object.entries(roleMeta).map(([key, meta]) =>
            roleCounts[key] ? (
              <button key={key} onClick={() => setRoleFilter(roleFilter === key ? null : key)} className={chip(roleFilter === key)}>
                {meta.label}<span className="tnum mr-1.5 opacity-60">({roleCounts[key]})</span>
              </button>
            ) : null
          )}

          <span className="mx-1 h-5 w-px bg-line" />

          <select value={deptFilter ?? ''} onChange={(e) => setDeptFilter(e.target.value ? +e.target.value : null)}
            aria-label="دپارتمان"
            className="cursor-pointer rounded-full bg-card px-3.5 py-1.5 text-xs text-fg-secondary shadow-flat outline-none">
            <option value="">همه دپارتمان‌ها</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          {filterCount > 0 && (
            <button onClick={() => { setQuery(''); setRoleFilter(null); setDeptFilter(null); }}
              className="mr-auto cursor-pointer rounded-full bg-bad-soft px-3.5 py-1.5 text-xs font-medium text-bad transition-opacity hover:opacity-80">
              پاک کردن {filterCount} فیلتر
            </button>
          )}
        </div>
      </Card>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-44 rounded-card" />)}
        </div>
      ) : visible.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((u) => {
            const name = `${u.firstName} ${u.lastName}`.trim();
            const meta = roleMeta[u.role] || { label: u.role, tone: 'neutral' as BadgeTone };
            const load = loadById[u.id] || { open: 0, overdue: 0 };
            const depts = u.departmentMemberships || [];

            return (
              <Card key={u.id} className="group flex h-full flex-col">
                <div className="flex items-start gap-3">
                  <Link href={`/dashboard/profile/${u.id}`} aria-label={`پروفایل ${name}`}>
                    <Avatar name={name} size={44} src={u.avatarUrl} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/dashboard/profile/${u.id}`} className="block">
                      <h3 className="truncate text-sm font-bold text-fg transition-colors hover:text-brand-ink">{name}</h3>
                    </Link>
                    <p className="truncate text-[11px] text-fg-muted" dir="ltr">{u.email}</p>
                    {u.position && <p className="mt-0.5 truncate text-[11px] text-fg-secondary">{u.position}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => openEdit(u)} title="ویرایش" aria-label={`ویرایش ${name}`}
                      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-fg-muted opacity-0 transition-all hover:bg-sunken hover:text-fg focus:opacity-100 group-hover:opacity-100">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button onClick={() => handleDelete(u)} title="حذف کاربر" aria-label={`حذف ${name}`}
                      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-fg-muted opacity-0 transition-all hover:bg-bad-soft hover:text-bad focus:opacity-100 group-hover:opacity-100">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  {depts.length ? depts.map((m) => (
                    <Badge key={m.department.id} tone="neutral">{m.department.name}</Badge>
                  )) : <Badge tone="warn">بدون دپارتمان</Badge>}
                </div>

                <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="text-fg-muted">
                      تسک باز: <span className="tnum font-semibold text-fg">{load.open}</span>
                    </span>
                    {load.overdue > 0 && (
                      <span className="text-bad">
                        دیرکرد: <span className="tnum font-semibold">{load.overdue}</span>
                      </span>
                    )}
                  </div>
                  <span className="tnum text-[10px] text-fg-muted">از {joinedOn(u)}</span>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="py-16 text-center">
          <p className="text-sm text-fg-muted">{filterCount ? 'کاربری با این فیلترها پیدا نشد' : 'کاربری وجود ندارد'}</p>
        </Card>
      )}

      <UserFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingUserId(null); }}
        onSubmit={handleSubmit}
        mode={modalMode}
        initialData={editingUser ?? undefined}
      />
    </ProtectedRoute>
  );
}
