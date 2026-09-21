'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import Badge, { BadgeTone } from '@/components/ui/Badge';
import Avatar from '@/components/ui/Avatar';
import AvatarStack, { AvatarUser } from '@/components/ui/AvatarStack';
import TaskRecurrenceBadge from '@/components/TaskRecurrenceBadge';
import { gregorianToShamsi } from '@/lib/date';
// Re-exported so the many pages already importing `daysTo` from here keep working.
export { daysTo, isOverdue, daysAwaitingReview } from '@/lib/deadline';
import { daysTo, isOverdue, isAwaitingReview, type DeadlineTask } from '@/lib/deadline';

export const statusMeta: Record<string, { label: string; tone: BadgeTone }> = {
  TODO: { label: 'انجام نشده', tone: 'neutral' },
  IN_PROGRESS: { label: 'در حال انجام', tone: 'info' },
  PENDING_QC: { label: 'کنترل کیفیت', tone: 'warn' },
  PENDING_APPROVAL: { label: 'منتظر تایید', tone: 'violet' },
  DONE: { label: 'تکمیل شده', tone: 'ok' },
};

function deadlineTone(days: number | null, task: DeadlineTask): BadgeTone {
  if (days === null) return 'neutral';
  // A task in review is not the assignee's lateness any more, so it must not
  // keep bleeding red on the row while the analytics no longer count it.
  if (isAwaitingReview(task.status)) return isOverdue(task) ? 'bad' : 'violet';
  if (days < 0) return 'bad';
  if (days === 0) return 'warn';
  if (days <= 7) return 'info';
  return 'neutral';
}

function deadlineLabel(days: number | null, deadline: string | null, task: DeadlineTask): string {
  if (days === null || !deadline) return 'بدون سررسید';
  if (isAwaitingReview(task.status)) {
    return isOverdue(task) ? 'با تأخیر تحویل شد' : 'تحویل شده';
  }
  if (days < 0) return `${Math.abs(days)} روز دیرکرد`;
  if (days === 0) return 'امروز';
  if (days === 1) return 'فردا';
  return gregorianToShamsi(deadline);
}

interface TaskRowProps {
  task: any;
  /** Current user's id, used to find their own completion tick. */
  userId?: number;
  onToggle?: (task: any, next: boolean) => void;
  onDelete?: (task: any) => void;
  showOwner?: boolean;
  showAssignees?: boolean;
}

export default function TaskRow({
  task,
  userId,
  onToggle,
  onDelete,
  showOwner = false,
  showAssignees = true,
}: TaskRowProps) {
  const status = statusMeta[task.status] || statusMeta.TODO;
  const total = task.subtasks?.length || 0;
  const done = task.subtasks?.filter((s: any) => s.isDone).length || 0;
  const pct = total ? Math.round((done / total) * 100) : null;

  // The API refuses completion while subtasks remain open, so show that state
  // on the control rather than letting the user find out by being rejected.
  const blocked = total > 0 && done < total;

  const days = daysTo(task.deadline);
  const mine = task.assignees?.find((a: any) => a.userId === userId || a.user?.id === userId);
  const ticked = Boolean(mine?.isCompleted);
  const owner = task.createdBy ? `${task.createdBy.firstName} ${task.createdBy.lastName}`.trim() : null;
  const ownerAvatar = task.createdBy?.avatarUrl || null;

  const assignees: AvatarUser[] = useMemo(() => {
    if (!task.assignees || !Array.isArray(task.assignees)) return [];
    return task.assignees
      .map((a: any) => {
        const u = a.user || a;
        if (!u) return null;
        const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.name || 'کاربر';
        return {
          id: u.id,
          name,
          avatarUrl: u.avatarUrl || null,
        };
      })
      .filter((item: any): item is AvatarUser => Boolean(item));
  }, [task.assignees]);

  return (
    <div className="group flex items-center gap-3 rounded-tile bg-sunken px-3 py-3 transition-colors hover:bg-hover">
      {onToggle && task.status !== 'DONE' && (
        <button
          onClick={() => onToggle(task, !ticked)}
          title={
            ticked ? 'لغو تیک انجام'
              : blocked ? `ابتدا ${total - done} زیرتسک باقی‌مانده را تکمیل کنید`
              : 'تیک زدن انجام'
          }
          aria-pressed={ticked}
          className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${
            ticked ? 'bg-ok text-white'
              : blocked ? 'bg-card text-fg-muted/40 shadow-flat hover:text-warn'
              : 'bg-card text-fg-muted shadow-flat hover:text-fg'
          }`}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            {blocked && !ticked ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            )}
          </svg>
        </button>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/tasks/${task.id}`}
            className={`truncate text-sm font-medium transition-colors hover:text-brand-ink ${ticked ? 'text-fg-muted line-through' : 'text-fg'}`}
          >
            {task.title}
          </Link>
          <TaskRecurrenceBadge
            isRecurring={task.isRecurring}
            recurrencePattern={task.recurrencePattern}
            recurrenceDays={task.recurrenceDays}
            recurringParentId={task.recurringParentId}
            compact
          />
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-fg-muted">
          <span className="truncate">{task.project?.name || '—'}</span>
          {pct !== null && (
            <>
              <span aria-hidden>•</span>
              <span className="tnum shrink-0">{done}/{total} زیرتسک</span>
              <span className="hidden h-1 w-14 shrink-0 overflow-hidden rounded-full bg-panel-strong sm:block">
                <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
              </span>
            </>
          )}
        </div>
      </div>

      {showAssignees && (
        <div className="shrink-0">
          {assignees.length > 0 ? (
            <div title={`مسئول${assignees.length > 1 ? 'ین' : ''}: ${assignees.map((a) => a.name).join('، ')}`}>
              <AvatarStack users={assignees} size={28} max={3} />
            </div>
          ) : (
            <div
              className="hidden shrink-0 items-center justify-center rounded-full border border-dashed border-line text-fg-muted/50 sm:flex"
              style={{ width: 28, height: 28 }}
              title="بدون مسئول"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          )}
        </div>
      )}

      {showOwner && owner && (
        <div className="hidden shrink-0 md:block" title={`ایجاد‌کننده: ${owner}`}>
          <Avatar name={owner} size={28} src={ownerAvatar} />
        </div>
      )}

      <Badge tone={deadlineTone(days, task)} className="hidden shrink-0 sm:inline-flex">
        {deadlineLabel(days, task.deadline, task)}
      </Badge>

      <Badge tone={status.tone} className="shrink-0">{status.label}</Badge>

      <div className="flex shrink-0 items-center gap-1">
        <Link
          href={`/dashboard/tasks/${task.id}`}
          title="جزئیات"
          aria-label="جزئیات تسک"
          className="flex h-7 w-7 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-card hover:text-fg"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        {onDelete && (
          <button
            onClick={() => onDelete(task)}
            title="حذف"
            aria-label="حذف تسک"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-fg-muted opacity-0 transition-all hover:bg-bad-soft hover:text-bad focus:opacity-100 group-hover:opacity-100"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
