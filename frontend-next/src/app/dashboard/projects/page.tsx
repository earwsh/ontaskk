'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import ProjectFormModal from '@/components/ProjectFormModal';
import Card from '@/components/ui/Card';
import Skeleton from '@/components/ui/Skeleton';
import ProjectCard, { ProjectStats } from '@/components/bento/ProjectCard';
import {
  NEEDS_ATTENTION, PROJECT_STATUS_ORDER, type ProjectRisk, type ProjectStatus,
} from '@/lib/projectStatus';
import { isOverdue, daysAwaitingReview } from '@/components/bento/TaskRow';
import api from '@/lib/api';

interface Project {
  id: number;
  name: string;
  description: string | null;
  client: string | null;
  departmentId: number;
  department: { id: number; name: string };
  createdBy: { id: number; firstName: string; lastName: string };
  _count: { tasks: number; members: number };
  createdAt: string;
}

const emptyStats = (): ProjectStats => ({ total: 0, done: 0, overdue: 0, awaitingReview: 0, scheduled: 0, open: 0, inProgress: 0, pending: 0, people: [] });

type SortKey = 'risk' | 'progress' | 'name' | 'newest';
const sorts: { key: SortKey; label: string }[] = [
  { key: 'risk', label: 'پرریسک‌ترین' },
  { key: 'progress', label: 'کمترین پیشرفت' },
  { key: 'newest', label: 'جدیدترین' },
  { key: 'name', label: 'نام' },
];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [statsById, setStatsById] = useState<Record<number, ProjectStats>>({});
  const [riskById, setRiskById] = useState<Record<number, ProjectRisk>>({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [role, setRole] = useState('');
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([]);
  const [deptId, setDeptId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('risk');

  const fetchAll = useCallback(async () => {
    try {
      // The projects endpoint returns counts only, so task status is rolled up
      // here from the (role-scoped) task list.
      const [projRes, taskRes, deptRes, riskRes] = await Promise.all([
        api.get('/projects'),
        api.get('/tasks').catch(() => ({ data: [] })),
        api.get('/departments').catch(() => ({ data: [] })),
        // The one shared risk label. If it cannot be produced the cards say so
        // rather than falling back to a threshold that would disagree with it.
        api.get('/analytics/project-status').catch(() => ({ data: { projects: [] } })),
      ]);
      setProjects(projRes.data);
      setDepartments(deptRes.data);
      setRiskById(Object.fromEntries(
        (riskRes.data.projects as ProjectRisk[]).map((r) => [r.projectId, r])
      ));

      const acc: Record<number, ProjectStats> = {};
      for (const t of taskRes.data as any[]) {
        const pid = t.project?.id ?? t.projectId;
        if (!pid) continue;
        const s = (acc[pid] ||= emptyStats());
        s.total++;
        if (t.status === 'DONE') s.done++;
        if (t.status === 'IN_PROGRESS') s.inProgress++;
        if (t.status === 'PENDING_APPROVAL') s.pending++;
        if (isOverdue(t)) s.overdue++;
        if (daysAwaitingReview(t) !== null) s.awaitingReview++;
        // Future-dated work is booked, not backlog. Counting it as outstanding
        // is what pinned every recurring project's progress bar near zero.
        else if (t.status !== 'DONE') {
          const startsLater = t.startDate && new Date(t.startDate) > new Date();
          if (startsLater) s.scheduled++; else s.open++;
        }
        for (const a of t.assignees || []) {
          const n = a.user ? `${a.user.firstName} ${a.user.lastName}`.trim() : null;
          if (n && !s.people.includes(n)) s.people.push(n);
        }
      }
      setStatsById(acc);
    } catch {
      // auth errors are handled by the axios interceptor
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) setRole(JSON.parse(stored).role);
    } catch {}
    fetchAll();
  }, [fetchAll]);

  const canCreate = ['TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER', 'CEO'].includes(role);

  const statsFor = useCallback((id: number) => statsById[id] || emptyStats(), [statsById]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = projects.filter((p) => {
      if (deptId && p.departmentId !== deptId) return false;
      if (!q) return true;
      return `${p.name} ${p.client ?? ''} ${p.department?.name ?? ''}`.toLowerCase().includes(q);
    });

    const progress = (p: Project) => {
      const s = statsFor(p.id);
      const available = s.done + s.open + s.awaitingReview;
      return available ? s.done / available : 1;
    };
    const severity = (p: Project) => {
      const st = riskById[p.id]?.status as ProjectStatus | undefined;
      const i = st ? PROJECT_STATUS_ORDER.indexOf(st) : -1;
      return i === -1 ? PROJECT_STATUS_ORDER.length : i;
    };

    return [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'fa');
      if (sort === 'newest') return +new Date(b.createdAt) - +new Date(a.createdAt);
      if (sort === 'progress') return progress(a) - progress(b);
      // risk: by the shared severity order, then least progress
      const sa = severity(a), sb = severity(b);
      if (sa !== sb) return sa - sb;
      return progress(a) - progress(b);
    });
  }, [projects, deptId, query, sort, statsFor, riskById]);

  const totals = useMemo(() => {
    const t = { projects: projects.length, available: 0, done: 0, overdue: 0, atRisk: 0 };
    for (const p of projects) {
      const s = statsFor(p.id);
      t.available += s.done + s.open + s.awaitingReview;
      t.done += s.done;
      t.overdue += s.overdue;
      // One definition of "needs attention", the same one the delivery tab uses.
      if (NEEDS_ATTENTION.includes(riskById[p.id]?.status)) t.atRisk++;
    }
    return t;
  }, [projects, statsFor, riskById]);

  const chip = (activeState: boolean) =>
    `cursor-pointer whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
      activeState ? 'bg-pill text-pill-fg' : 'bg-card text-fg-secondary shadow-flat hover:text-fg'
    }`;

  return (
    <ProtectedRoute allowedRoles={['CEO', 'INTERNAL_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER', 'EMPLOYEE']}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-end gap-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <label className="relative">
            <span className="sr-only">جستجو در پروژه‌ها</span>
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
          {canCreate && (
            <button
              onClick={() => { setEditingProject(null); setModalOpen(true); }}
              className="flex cursor-pointer items-center gap-2 rounded-full bg-pill px-4 py-2 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              پروژه جدید
            </button>
          )}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'پروژه فعال', value: totals.projects, hint: 'در محدوده شما' },
          { label: 'نیازمند توجه', value: totals.atRisk, hint: 'عقب، متوقف یا در خطر', tone: totals.atRisk ? 'bad' : 'ok' },
          { label: 'تسک دیرکرد', value: totals.overdue, hint: 'در همه پروژه‌ها', tone: totals.overdue ? 'warn' : 'ok' },
          { label: 'نرخ تکمیل', value: `${totals.available ? Math.round((totals.done / totals.available) * 100) : 0}٪`, hint: `${totals.done} از ${totals.available} تسک در دسترس` },
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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button onClick={() => setDeptId(null)} className={chip(deptId === null)}>همه دپارتمان‌ها</button>
          {departments.map((d) => (
            <button key={d.id} onClick={() => setDeptId(d.id)} className={chip(deptId === d.id)}>{d.name}</button>
          ))}
        </div>

        <div className="mr-auto flex items-center gap-1.5">
          <span className="text-[11px] text-fg-muted">مرتب‌سازی:</span>
          {sorts.map((s) => (
            <button key={s.key} onClick={() => setSort(s.key)} className={chip(sort === s.key)}>{s.label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-56 rounded-card" />)}
        </div>
      ) : visible.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              stats={statsFor(p.id)}
              risk={riskById[p.id] ?? null}
              canEdit={canCreate}
              onEdit={(proj) => { setEditingProject(proj); setModalOpen(true); }}
            />
          ))}
        </div>
      ) : (
        <Card className="py-16 text-center">
          <p className="text-sm text-fg-muted">
            {query || deptId ? 'پروژه‌ای با این فیلترها پیدا نشد' : 'هیچ پروژه‌ای وجود ندارد'}
          </p>
        </Card>
      )}

      <ProjectFormModal
        open={modalOpen}
        project={editingProject}
        onClose={() => setModalOpen(false)}
        onSaved={() => { setModalOpen(false); setEditingProject(null); fetchAll(); }}
      />
    </ProtectedRoute>
  );
}
