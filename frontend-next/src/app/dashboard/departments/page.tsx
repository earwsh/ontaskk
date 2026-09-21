'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import DepartmentFormModal from '@/components/DepartmentFormModal';
import SetManagerModal from '@/components/SetManagerModal';
import { useToast } from '@/components/Toast';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import Avatar from '@/components/ui/Avatar';
import AvatarStack from '@/components/ui/AvatarStack';
import { daysTo, isOverdue } from '@/components/bento/TaskRow';
import api from '@/lib/api';

interface Department {
  id: number;
  name: string;
  description: string | null;
  manager: { id: number; firstName: string; lastName: string; email: string } | null;
  // The API counts `members`; an earlier version of this page read `users`,
  // which is always undefined and silently disabled the delete guard.
  _count: { members: number };
}

interface DeptStats {
  projects: number;
  tasks: number;
  done: number;
  overdue: number;
  people: string[];
}

const emptyStats = (): DeptStats => ({ projects: 0, tasks: 0, done: 0, overdue: 0, people: [] });

export default function DepartmentsPage() {
  // Deleting a department is restricted to the technical manager, strategy
  // manager and CEO. Without this the internal manager would see the control
  // and only discover the limit from a 403.
  const [canDelete, setCanDelete] = useState(false);

  const { showToast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [statsById, setStatsById] = useState<Record<number, DeptStats>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingData, setEditingData] = useState<Record<string, string> | null>(null);
  const [managerModal, setManagerModal] = useState({ open: false, deptId: 0, deptName: '' });

  const fetchAll = useCallback(async () => {
    try {
      const [deptRes, projRes, taskRes] = await Promise.all([
        api.get('/departments'),
        api.get('/projects').catch(() => ({ data: [] })),
        api.get('/tasks').catch(() => ({ data: [] })),
      ]);
      setDepartments(deptRes.data);

      const acc: Record<number, DeptStats> = {};
      for (const p of projRes.data as any[]) {
        const s = (acc[p.departmentId] ||= emptyStats());
        s.projects++;
      }
      for (const t of taskRes.data as any[]) {
        const did = t.project?.departmentId;
        if (!did) continue;
        const s = (acc[did] ||= emptyStats());
        s.tasks++;
        if (t.status === 'DONE') s.done++;
        else if (isOverdue(t)) s.overdue++;
        for (const a of t.assignees || []) {
          const n = a.user ? `${a.user.firstName} ${a.user.lastName}`.trim() : null;
          if (n && !s.people.includes(n)) s.people.push(n);
        }
      }
      setStatsById(acc);
    } catch {
      // auth handled by the interceptor
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      setCanDelete(['TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'CEO'].includes(u.role));
    } catch {}
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => { setEditingId(null); setEditingData(null); setModalMode('create'); setModalOpen(true); };
  const openEdit = (d: Department) => {
    setEditingId(d.id);
    setEditingData({ name: d.name, description: d.description || '' });
    setModalMode('edit');
    setModalOpen(true);
  };

  const handleSubmit = async (data: any) => {
    try {
      if (modalMode === 'create') await api.post('/departments', data);
      else if (editingId) await api.put(`/departments/${editingId}`, data);
      setModalOpen(false);
      setEditingId(null);
      fetchAll();
      showToast(modalMode === 'create' ? 'دپارتمان ساخته شد' : 'تغییرات ذخیره شد');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا', 'error');
    }
  };

  const handleDelete = async (dept: Department) => {
    const members = dept._count?.members ?? 0;
    if (members > 0) {
      showToast(`این دپارتمان ${members} عضو دارد. ابتدا اعضا را جابه‌جا کنید.`, 'error');
      return;
    }
    if (!confirm(`آیا از حذف دپارتمان «${dept.name}» اطمینان دارید؟`)) return;
    try {
      await api.delete(`/departments/${dept.id}`);
      fetchAll();
      showToast('دپارتمان حذف شد');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در حذف', 'error');
    }
  };

  const handleRemoveManager = async (dept: Department) => {
    if (!confirm(`مدیریت «${dept.manager?.firstName} ${dept.manager?.lastName}» از دپارتمان «${dept.name}» برداشته شود؟`)) return;
    try {
      await api.post(`/departments/${dept.id}/remove-manager`);
      fetchAll();
      showToast('مدیر دپارتمان برداشته شد');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا', 'error');
    }
  };

  const statsFor = useCallback((id: number) => statsById[id] || emptyStats(), [statsById]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter((d) =>
      `${d.name} ${d.description ?? ''} ${d.manager ? d.manager.firstName + ' ' + d.manager.lastName : ''}`
        .toLowerCase().includes(q));
  }, [departments, query]);

  const totals = useMemo(() => {
    let members = 0, projects = 0, unmanaged = 0;
    for (const d of departments) {
      members += d._count?.members ?? 0;
      projects += statsFor(d.id).projects;
      if (!d.manager) unmanaged++;
    }
    return { departments: departments.length, members, projects, unmanaged };
  }, [departments, statsFor]);

  return (
    <ProtectedRoute allowedRoles={['TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'INTERNAL_MANAGER', 'CEO']}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-end gap-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <label className="relative">
            <span className="sr-only">جستجو در دپارتمان‌ها</span>
            <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجو…"
              className="w-44 rounded-full bg-card py-2 pr-9 pl-3 text-xs text-fg shadow-flat outline-none transition-all placeholder:text-fg-muted focus:w-56" />
          </label>
          <button onClick={openCreate}
            className="flex cursor-pointer items-center gap-2 rounded-full bg-pill px-4 py-2 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            دپارتمان جدید
          </button>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'دپارتمان', value: totals.departments, hint: 'واحد فعال' },
          { label: 'کل اعضا', value: totals.members, hint: 'در همه واحدها' },
          { label: 'پروژه‌ها', value: totals.projects, hint: 'در جریان' },
          { label: 'بدون مدیر', value: totals.unmanaged, hint: totals.unmanaged ? 'نیازمند تعیین مدیر' : 'همه واحدها مدیر دارند', tone: totals.unmanaged ? 'warn' : 'ok' },
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

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-60 rounded-card" />)}
        </div>
      ) : visible.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((dept) => {
            const s = statsFor(dept.id);
            const members = dept._count?.members ?? 0;
            const pct = s.tasks ? Math.round((s.done / s.tasks) * 100) : 0;
            const managerName = dept.manager ? `${dept.manager.firstName} ${dept.manager.lastName}`.trim() : null;

            return (
              <Card key={dept.id} className="group flex h-full flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-fg">{dept.name}</h3>
                    {dept.description && <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-fg-secondary">{dept.description}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => openEdit(dept)} title="ویرایش" aria-label={`ویرایش ${dept.name}`}
                      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-fg-muted opacity-0 transition-all hover:bg-sunken hover:text-fg focus:opacity-100 group-hover:opacity-100">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    {canDelete && (
                    <button onClick={() => handleDelete(dept)} title={members ? 'ابتدا اعضا را جابه‌جا کنید' : 'حذف دپارتمان'} aria-label={`حذف ${dept.name}`}
                      className={`flex h-7 w-7 items-center justify-center rounded-full transition-all focus:opacity-100 group-hover:opacity-100 ${
                        members ? 'cursor-not-allowed text-fg-muted/40 opacity-0' : 'cursor-pointer text-fg-muted opacity-0 hover:bg-bad-soft hover:text-bad'
                      }`}>
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                    )}
                  </div>
                </div>

                {/* Manager */}
                <div className="mt-4 flex items-center gap-2.5 rounded-tile bg-sunken px-3 py-2.5">
                  {managerName ? (
                    <>
                      <Avatar name={managerName} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-fg">{managerName}</p>
                        <p className="text-[10px] text-fg-muted">مدیر دپارتمان</p>
                      </div>
                      <button onClick={() => handleRemoveManager(dept)} title="برداشتن مدیر" aria-label={`برداشتن مدیر ${dept.name}`}
                        className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-bad-soft hover:text-bad">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-warn-soft text-warn">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                      </span>
                      <p className="min-w-0 flex-1 text-xs text-fg-secondary">مدیری تعیین نشده</p>
                      <button onClick={() => setManagerModal({ open: true, deptId: dept.id, deptName: dept.name })}
                        className="shrink-0 cursor-pointer rounded-full bg-pill px-3 py-1 text-[10px] font-medium text-pill-fg transition-opacity hover:opacity-90">
                        تعیین مدیر
                      </button>
                    </>
                  )}
                </div>

                {/* Workload */}
                <div className="mt-4">
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="tnum text-2xl font-extrabold text-fg">{pct}٪</span>
                    <span className="tnum text-[11px] text-fg-muted">{s.done} از {s.tasks} تسک</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-sunken">
                    <div className={`h-full rounded-full transition-all duration-700 ${s.overdue ? 'bg-warn' : 'bg-ok'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge tone="neutral">{s.projects} پروژه</Badge>
                  <Badge tone="neutral">{members} عضو</Badge>
                  {s.overdue > 0 && <Badge tone="bad">{s.overdue} دیرکرد</Badge>}
                </div>

                <div className="mt-auto flex items-center justify-between pt-4">
                  {s.people.length ? <AvatarStack names={s.people} max={5} size={26} />
                    : <span className="text-[11px] text-fg-muted">هنوز کسی تسکی ندارد</span>}
                  <Link href={`/dashboard/projects?dept=${dept.id}`} className="text-[11px] text-brand-ink transition-colors hover:text-brand">
                    پروژه‌ها ←
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="py-16 text-center">
          <p className="text-sm text-fg-muted">{query ? 'دپارتمانی با این جستجو پیدا نشد' : 'هیچ دپارتمانی وجود ندارد'}</p>
        </Card>
      )}

      <DepartmentFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingId(null); }}
        onSubmit={handleSubmit}
        mode={modalMode}
        initialData={editingData ?? undefined}
      />

      <SetManagerModal
        open={managerModal.open}
        departmentId={managerModal.deptId}
        departmentName={managerModal.deptName}
        onClose={() => setManagerModal({ open: false, deptId: 0, deptName: '' })}
        onSuccess={() => { setManagerModal({ open: false, deptId: 0, deptName: '' }); fetchAll(); }}
      />
    </ProtectedRoute>
  );
}
