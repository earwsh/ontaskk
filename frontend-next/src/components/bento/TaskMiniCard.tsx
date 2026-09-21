'use client';

import Link from 'next/link';
import Badge from '@/components/ui/Badge';
import AvatarStack from '@/components/ui/AvatarStack';
import TaskRecurrenceBadge from '@/components/TaskRecurrenceBadge';
import { daysTo, isOverdue } from './TaskRow';
import { gregorianToShamsi } from '@/lib/date';

interface TaskMiniCardProps {
  task: any;
  /** Rendered under the card — quick actions vary by column and role. */
  action?: React.ReactNode;
}

export default function TaskMiniCard({ task, action }: TaskMiniCardProps) {
  const days = daysTo(task.deadline);
  const overdue = task.status !== 'DONE' && days !== null && days < 0;
  const names = (task.assignees || [])
    .map((a: any) => (a.user ? `${a.user.firstName} ${a.user.lastName}`.trim() : null))
    .filter(Boolean) as string[];

  return (
    <div className="rounded-tile bg-card p-3 shadow-flat transition-shadow hover:shadow-card">
      <div className="flex items-start gap-2">
        <Link href={`/dashboard/tasks/${task.id}`} className="min-w-0 flex-1 text-xs font-medium text-fg transition-colors hover:text-brand-ink">
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

      {task.deadline && (
        <div className="mt-2">
          <Badge tone={overdue ? 'bad' : days === 0 ? 'warn' : 'neutral'}>
            {overdue ? `${Math.abs(days!)} روز دیرکرد` : days === 0 ? 'امروز' : gregorianToShamsi(task.deadline)}
          </Badge>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        {names.length ? <AvatarStack names={names} max={3} size={22} /> : <span className="text-[10px] text-fg-muted">بدون مسئول</span>}
        {action}
      </div>
    </div>
  );
}
