'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useToast } from '@/components/Toast';
import Card from '@/components/ui/Card';
import Badge, { BadgeTone } from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import TaskRow, { daysTo, isOverdue } from '@/components/bento/TaskRow';
import api from '@/lib/api';

const statusFilters: { key: string; label: string; tone: BadgeTone }[] = [
  { key: 'TODO', label: 'انجام نشده', tone: 'neutral' },
  { key: 'IN_PROGRESS', label: 'در حال انجام', tone: 'info' },
  { key: 'PENDING_QC', label: 'کنترل کیفیت', tone: 'warn' },
  { key: 'PENDING_APPROVAL', label: 'منتظر تایید', tone: 'violet' },
  { key: 'DONE', label: 'تکمیل شده', tone: 'ok' },
];

const deadlineFilters = [
  { key: 'overdue', label: 'دیرکرد' },
  { key: 'today', label: 'امروز' },
  { key: 'week', label: 'هفت روز آینده' },
  { key: 'month', label: 'سی روز آینده' },
  { key: 'none', label: 'بدون سررسید' },
];

/** Buckets used both for the filter chips and for the grouped output. */
function deadlineBucket(task: any): string {
  const d = daysTo(task.deadline);
  if (d === null) return 'none';
  if (isOverdue(task)) return 'overdue';
  if (d === 0) return 'today';
  if (d > 0 && d <= 7) return 'week';
  if (d > 0 && d <= 30) return 'month';
  return 'later';
}

const groups = [
  { key: 'overdue', label: 'دیرکرد', tone: 'bad' as BadgeTone },
  { key: 'today', label: 'امروز', tone: 'warn' as BadgeTone },
  { key: 'week', label: 'هفت روز آینده', tone: 'info' as BadgeTone },
  { key: 'month', label: 'سی روز آینده', tone: 'neutral' as BadgeTone },
  { key: 'later', label: 'دورتر', tone: 'neutral' as BadgeTone },
  { key: 'none', label: 'بدون سررسید', tone: 'neutral' as BadgeTone },
];

const STORAGE_KEY = 'task_on_org_tasks_filters';

interface FilterState {
  tab?: 'active' | 'history';
  search?: string;
  filterDept?: number | null;
  filterProject?: number | null;
  filterStatus?: string | null;
  filterUser?: number | null;
  filterCreator?: number | null;
  filterDeadline?: string | null;
}

function loadSavedFilters(): FilterState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveFilters(filters: FilterState) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {}
}

export default function OrgTasksPage() {
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [userId, setUserId] = useState(0);

  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState<number | null>(null);
  const [filterProject, setFilterProject] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterUser, setFilterUser] = useState<number | null>(null);
  const [filterCreator, setFilterCreator] = useState<number | null>(null);
  const [filterDeadline, setFilterDeadline] = useState<string | null>(null);
  const [filtersRestored, setFiltersRestored] = useState(false);

  // Restore filters from sessionStorage on mount so back-navigation preserves state
  useEffect(() => {
    const saved = loadSavedFilters();
    if (saved.tab) setTab(saved.tab);
    if (saved.search) setSearch(saved.search);
    if (saved.filterDept !== undefined) setFilterDept(saved.filterDept);
    if (saved.filterProject !== undefined) setFilterProject(saved.filterProject);
    if (saved.filterStatus !== undefined) setFilterStatus(saved.filterStatus);
    if (saved.filterUser !== undefined) setFilterUser(saved.filterUser);
    if (saved.filterCreator !== undefined) setFilterCreator(saved.filterCreator);
    if (saved.filterDeadline !== undefined) setFilterDeadline(saved.filterDeadline);
    setFiltersRestored(true);
  }, []);

  // Persist filters whenever they change
  useEffect(() => {
    if (!filtersRestored) return;
    saveFilters({
      tab,
      search,
      filterDept,
      filterProject,
      filterStatus,
      filterUser,
      filterCreator,
      filterDeadline,
    });
  }, [filtersRestored, tab, search, filterDept, filterProject, filterStatus, filterUser, filterCreator, filterDeadline]);

  const fetchTasks = useCallback(async () => {
    try {
      const [tasksRes, usersRes] = await Promise.all([
        api.get('/tasks'),
        api.get('/users').catch(() => ({ data: [] })),
      ]);
      const userMap = new Map<number, any>();
      for (const u of usersRes.data || []) {
        if (u.id) userMap.set(u.id, u);
      }
      const enrichedTasks = (tasksRes.data || []).map((t: any) => ({
        ...t,
        assignees: (t.assignees || []).map((a: any) => {
          const u = a.user || a;
          const fullUser = u?.id ? userMap.get(u.id) : null;
          return {
            ...a,
            user: {
              ...u,
              avatarUrl: u?.avatarUrl || fullUser?.avatarUrl || null,
            },
          };
        }),
        createdBy: t.createdBy
          ? {
              ...t.createdBy,
              avatarUrl: t.createdBy.avatarUrl || userMap.get(t.createdBy.id)?.avatarUrl || null,
            }
          : t.createdBy,
      }));
      setTasks(enrichedTasks);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) setUserId(JSON.parse(stored).id);
    } catch {}
    fetchTasks();
  }, [fetchTasks]);

  const handleDelete = async (task: any) => {
    if (!confirm(`آیا از حذف تسک «${task.title}» اطمینان دارید؟`)) return;
    try {
      await api.delete(`/tasks/${task.id}`);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      showToast('تسک حذف شد');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در حذف', 'error');
    }
  };

  const departments = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of tasks) {
      const id = t.project?.departmentId, name = t.project?.department?.name;
      if (id && name) map.set(id, name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [tasks]);

  // Project and people lists follow the department filter, so the controls
  // never offer a combination that yields nothing.
  const projects = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of tasks) {
      if (filterDept !== null && t.project?.departmentId !== filterDept) continue;
      if (t.project?.id) map.set(t.project.id, t.project.name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [tasks, filterDept]);

  const people = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of tasks) {
      if (filterDept !== null && t.project?.departmentId !== filterDept) continue;
      for (const a of t.assignees || []) {
        if (a.user?.id) map.set(a.user.id, `${a.user.firstName} ${a.user.lastName}`.trim());
      }
    }
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  }, [tasks, filterDept]);

  const creators = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of tasks) {
      if (filterDept !== null && t.project?.departmentId !== filterDept) continue;
      if (t.createdBy?.id) map.set(t.createdBy.id, `${t.createdBy.firstName} ${t.createdBy.lastName}`.trim());
    }
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  }, [tasks, filterDept]);

  const matches = useCallback((t: any) => {
    if (search && !`${t.title} ${t.project?.name ?? ''}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterDept !== null && t.project?.departmentId !== filterDept) return false;
    if (filterProject !== null && t.project?.id !== filterProject) return false;
    if (filterUser !== null && !t.assignees?.some((a: any) => a.user?.id === filterUser)) return false;
    if (filterCreator !== null && t.createdBy?.id !== filterCreator) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterDeadline && deadlineBucket(t) !== filterDeadline) return false;
    return true;
  }, [search, filterDept, filterProject, filterUser, filterCreator, filterStatus, filterDeadline]);

  const visible = useMemo(
    () => tasks.filter((t) => (tab === 'active' ? t.status !== 'DONE' : t.status === 'DONE') && matches(t)),
    [tasks, tab, matches]
  );

  const grouped = useMemo(() => {
    const out: Record<string, any[]> = Object.fromEntries(groups.map((g) => [g.key, []]));
    for (const t of visible) out[deadlineBucket(t)]?.push(t);
    return out;
  }, [visible]);

  const totals = useMemo(() => {
    const active = tasks.filter((t) => t.status !== 'DONE');
    return {
      all: tasks.length,
      overdue: active.filter((t) => deadlineBucket(t) === 'overdue').length,
      pending: tasks.filter((t) => t.status === 'PENDING_APPROVAL').length,
      done: tasks.filter((t) => t.status === 'DONE').length,
    };
  }, [tasks]);

  const activeCount = tasks.filter((t) => t.status !== 'DONE').length;
  const filterCount = [filterDept, filterProject, filterStatus, filterUser, filterCreator, filterDeadline]
    .filter((v) => v !== null).length + (search ? 1 : 0);

  const clearFilters = () => {
    setSearch(''); setFilterDept(null); setFilterProject(null);
    setFilterStatus(null); setFilterUser(null); setFilterCreator(null); setFilterDeadline(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  const chip = (on: boolean) =>
    `cursor-pointer whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
      on ? 'bg-pill text-pill-fg' : 'bg-card text-fg-secondary shadow-flat hover:text-fg'
    }`;
  const selectClass = 'cursor-pointer rounded-full bg-card px-3.5 py-1.5 text-xs text-fg-secondary shadow-flat outline-none';

  return (
    <ProtectedRoute allowedRoles={['TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'CEO', 'INTERNAL_MANAGER']}>
      <div className="flex flex-wrap items-center justify-end gap-3 pt-3 pb-2">
        <label className="relative">
          <span className="sr-only">جستجو در تسک‌ها</span>
          <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جستجو…"
            className="w-48 rounded-full bg-card py-2 pr-9 pl-3 text-xs text-fg shadow-flat outline-none transition-all placeholder:text-fg-muted focus:w-64" />
        </label>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'کل تسک‌ها', value: totals.all, hint: 'در محدوده شما' },
          { label: 'دیرکرد', value: totals.overdue, hint: 'از سررسید گذشته', tone: totals.overdue ? 'bad' : 'ok' },
          { label: 'منتظر تایید', value: totals.pending, hint: 'معطل تصمیم', tone: totals.pending ? 'warn' : 'ok' },
          { label: 'تکمیل‌شده', value: totals.done, hint: `${totals.all ? Math.round((totals.done / totals.all) * 100) : 0}٪ از کل`, tone: 'ok' },
        ].map((k) => (
          <Card key={k.label} padding="sm">
            <div className="flex items-start justify-between">
              {loading ? <Skeleton className="h-8 w-12" /> : <span className="tnum text-3xl font-extrabold text-fg">{k.value}</span>}
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                k.tone === 'bad' ? 'bg-bad-soft text-bad' : k.tone === 'warn' ? 'bg-warn-soft text-warn'
                : k.tone === 'ok' ? 'bg-ok-soft text-ok' : 'bg-sunken text-fg-secondary'
              }`}>{k.label}</span>
            </div>
            <p className="mt-3 text-[11px] text-fg-muted">{k.hint}</p>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card padding="sm" className="mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <select value={filterDept ?? ''} onChange={(e) => { setFilterDept(e.target.value ? +e.target.value : null); setFilterProject(null); setFilterUser(null); setFilterCreator(null); }} className={selectClass} aria-label="دپارتمان">
            <option value="">همه دپارتمان‌ها</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={filterProject ?? ''} onChange={(e) => setFilterProject(e.target.value ? +e.target.value : null)} className={selectClass} aria-label="پروژه">
            <option value="">همه پروژه‌ها</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={filterUser ?? ''} onChange={(e) => setFilterUser(e.target.value ? +e.target.value : null)} className={selectClass} aria-label="مسئول">
            <option value="">همه افراد</option>
            {people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select value={filterCreator ?? ''} onChange={(e) => setFilterCreator(e.target.value ? +e.target.value : null)} className={selectClass} aria-label="ایجادکننده">
            <option value="">همه ایجادکنندگان</option>
            {creators.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>

          <span className="mx-1 h-5 w-px bg-line" />

          {statusFilters.map((s) => (
            <button key={s.key} onClick={() => setFilterStatus(filterStatus === s.key ? null : s.key)} className={chip(filterStatus === s.key)}>
              {s.label}
            </button>
          ))}

          <span className="mx-1 h-5 w-px bg-line" />

          {deadlineFilters.map((d) => (
            <button key={d.key} onClick={() => setFilterDeadline(filterDeadline === d.key ? null : d.key)} className={chip(filterDeadline === d.key)}>
              {d.label}
            </button>
          ))}

          {filterCount > 0 && (
            <button onClick={clearFilters} className="mr-auto cursor-pointer rounded-full bg-bad-soft px-3.5 py-1.5 text-xs font-medium text-bad transition-opacity hover:opacity-80">
              پاک کردن {filterCount} فیلتر
            </button>
          )}
        </div>
      </Card>

      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-full bg-card p-1 shadow-flat">
          {([['active', 'فعال', activeCount], ['history', 'تاریخچه', totals.done]] as const).map(([key, label, count]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`cursor-pointer rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                tab === key ? 'bg-pill text-pill-fg' : 'text-fg-secondary hover:text-fg'
              }`}>
              {label}<span className="tnum mr-1.5 opacity-70">({count})</span>
            </button>
          ))}
        </div>
        <span className="tnum text-[11px] text-fg-muted">{visible.length} نتیجه</span>
      </div>

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-card" />)}</div>
      ) : visible.length ? (
        <div className="space-y-3">
          {groups.map((g) => {
            const list = grouped[g.key];
            if (!list?.length) return null;
            return (
              <Card key={g.key}>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-fg">{g.label}</h3>
                  <Badge tone={g.tone}>{list.length} تسک</Badge>
                </div>
                <div className="space-y-2">
                  {list.map((t) => (
                    <TaskRow key={t.id} task={t} userId={userId} onDelete={handleDelete} />
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="py-16 text-center">
          <p className="text-sm text-fg-muted">
            {filterCount > 0 ? 'تسکی با این فیلترها پیدا نشد' : tab === 'active' ? 'تسک فعالی وجود ندارد' : 'تسک تکمیل‌شده‌ای وجود ندارد'}
          </p>
          {filterCount > 0 && (
            <button onClick={clearFilters} className="mt-3 cursor-pointer rounded-full bg-sunken px-4 py-2 text-xs text-fg-secondary transition-colors hover:text-fg">
              پاک کردن فیلترها
            </button>
          )}
        </Card>
      )}
    </ProtectedRoute>
  );
}
