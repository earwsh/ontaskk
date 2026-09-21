'use client';

import Link from 'next/link';
import SectionCard from './SectionCard';

interface PendingTask {
  id: number;
  title: string;
  project?: { name?: string } | null;
  createdBy?: { firstName?: string; lastName?: string } | null;
}

interface PendingApprovalsPanelProps {
  tasks: PendingTask[];
  onApprove: (taskId: number) => void;
  title?: string;
  emptyText?: string;
  limit?: number;
}

const clockIcon = 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z';

export default function PendingApprovalsPanel({ tasks, onApprove, title = 'منتظر تایید', emptyText = 'هیچ تسکی منتظر تایید نیست', limit = 5 }: PendingApprovalsPanelProps) {
  const shown = tasks.slice(0, limit);

  return (
    <SectionCard
      title={title}
      icon={clockIcon}
      iconColor="#A855F7"
      action={{ label: 'مشاهده همه', href: '/dashboard/approvals' }}
      className="h-full"
    >
      {shown.length > 0 ? (
        <div className="space-y-2">
          {shown.map((task) => (
            <div key={task.id} className="flex items-center justify-between rounded-xl bg-card px-4 py-3 transition-all duration-200 hover:bg-card-hover">
              <div className="min-w-0 flex-1">
                <Link href={`/dashboard/tasks/${task.id}`} className="block truncate text-sm text-fg transition-colors hover:text-brand">
                  {task.title}
                </Link>
                <div className="mt-0.5 text-xs text-fg-muted">
                  {task.project?.name} • {task.createdBy?.firstName} {task.createdBy?.lastName}
                </div>
              </div>
              <button
                onClick={() => onApprove(task.id)}
                className="ml-2 flex shrink-0 items-center gap-1.5 rounded-lg bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-400 transition-all hover:bg-green-500/20 active:scale-[0.97]"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                تایید
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-fg-muted">
          <svg className="mb-2 h-10 w-10 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs">{emptyText}</p>
        </div>
      )}
    </SectionCard>
  );
}
