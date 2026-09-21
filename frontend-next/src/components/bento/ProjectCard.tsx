'use client';

import Link from 'next/link';
import Card from '@/components/ui/Card';
import Badge, { BadgeTone } from '@/components/ui/Badge';
import AvatarStack from '@/components/ui/AvatarStack';
import { statusMeta, type ProjectRisk } from '@/lib/projectStatus';

export interface ProjectStats {
  total: number;
  done: number;
  overdue: number;
  /** Handed over and waiting on a reviewer — a queue, not a slippage. */
  awaitingReview: number;
  /** Not done, but dated for the future: booked work, not backlog. */
  scheduled: number;
  open: number;
  inProgress: number;
  pending: number;
  people: string[];
}

interface ProjectCardProps {
  project: any;
  stats: ProjectStats;
  /** The shared risk label. Absent while it loads, or if the forecast is down. */
  risk?: ProjectRisk | null;
  canEdit?: boolean;
  onEdit?: (project: any) => void;
}

export default function ProjectCard({ project, stats, risk, canEdit, onEdit }: ProjectCardProps) {
  // Completion over work that is due. The old figure divided by every future
  // recurring occurrence, which read 17% for a project actually running at 83%.
  const available = stats.done + stats.open + stats.awaitingReview;
  const pct = risk?.completionRate ?? (available ? Math.round((stats.done / available) * 100) : 0);
  const h = stats.total === 0
    ? { tone: 'neutral' as BadgeTone, label: 'بدون تسک', hint: '' }
    : risk
      ? { ...statusMeta(risk.status), label: risk.statusLabel }
      : { tone: 'neutral' as BadgeTone, label: '…', hint: 'در حال محاسبه' };
  const barColor = h.tone === 'bad' ? 'bg-bad' : h.tone === 'warn' ? 'bg-warn' : h.tone === 'violet' ? 'bg-violet' : 'bg-ok';

  return (
    <Card interactive className="group relative flex h-full flex-col">
      {/*
        The overlay covers the whole card, so the whole card is the link.

        Content blocks below must stay unpositioned: a positioned sibling that
        comes later in the DOM paints above this overlay and swallows the click.
        Every content block used to carry `relative`, which left only the gaps
        between them clickable — measured at 42% of the card surface. Anything
        that needs its own click handler opts back in with `relative z-10`.
      */}
      <Link href={`/dashboard/projects/${project.id}`} className="absolute inset-0 rounded-card" aria-label={project.name} />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-fg">{project.name}</h3>
          <p className="mt-1 truncate text-[11px] text-fg-muted">
            {project.department?.name}
            {project.client && <> • کارفرما: {project.client}</>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge tone={h.tone} className={risk?.headline ? 'cursor-help' : ''}>
            <span title={risk?.headline || h.hint}>{h.label}</span>
          </Badge>
          {canEdit && onEdit && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(project); }}
              title="ویرایش پروژه"
              aria-label="ویرایش پروژه"
              className="relative z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-fg-muted opacity-0 transition-all hover:bg-sunken hover:text-fg focus:opacity-100 group-hover:opacity-100"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {project.description && (
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-fg-secondary">{project.description}</p>
      )}

      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="tnum text-2xl font-extrabold text-fg">{pct}٪</span>
          <span className="tnum text-[11px] text-fg-muted">
            {stats.done} از {available} تسک
            {stats.scheduled > 0 && <span className="opacity-70"> · {stats.scheduled} در برنامه</span>}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-sunken">
          <div className={`h-full rounded-full ${barColor} transition-all duration-700`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {stats.overdue > 0 && <Badge tone="bad">{stats.overdue} دیرکرد</Badge>}
        {stats.awaitingReview > 0 && <Badge tone="violet">{stats.awaitingReview} معطل بررسی</Badge>}
        {stats.inProgress > 0 && <Badge tone="info">{stats.inProgress} در جریان</Badge>}
        {stats.pending > 0 && <Badge tone="violet">{stats.pending} منتظر تایید</Badge>}
        {stats.total === 0 && <Badge tone="neutral">هنوز تسکی ندارد</Badge>}
      </div>

      <div className="mt-auto flex items-center justify-between pt-4">
        {stats.people.length ? (
          <AvatarStack names={stats.people} max={4} size={26} />
        ) : (
          <span className="text-[11px] text-fg-muted">بدون عضو</span>
        )}
        <span className="tnum text-[11px] text-fg-muted">{project._count?.members ?? 0} عضو</span>
      </div>
    </Card>
  );
}
