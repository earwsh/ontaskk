'use client';

import Badge from '@/components/ui/Badge';
import { jalaliDateTime } from '@/lib/date';

export interface RejectionEvent {
  taskId: number;
  stage: 'QC' | 'APPROVAL';
  reason: string | null;
  at: string;
  by: { id: number; name: string } | null;
  assignees: { id: number; name: string }[];
}

const stageLabel = (s: string) => (s === 'QC' ? 'کنترل کیفیت' : 'تایید نهایی');

/**
 * Why a task was sent back, every time it was sent back.
 *
 * The task row only keeps the latest QC decision and clears it on
 * resubmission, so a reviewer looking at the same task a second time had
 * nothing to remind them what they had asked for. This reads oldest first,
 * so it tells the story in order.
 */
export default function RejectionHistory({
  events,
  compact = false,
}: {
  events: RejectionEvent[];
  compact?: boolean;
}) {
  if (!events?.length) return null;

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {events.map((e, i) => (
        <div
          key={`${e.at}-${i}`}
          className={`rounded-tile border-r-2 border-bad bg-bad-soft/40 ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'}`}
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`font-semibold text-bad ${compact ? 'text-[11px]' : 'text-xs'}`}>
              بار {i + 1}
            </span>
            <Badge tone="neutral">{stageLabel(e.stage)}</Badge>
            <span className="tnum text-[10px] text-fg-muted">{jalaliDateTime(e.at)}</span>
            {e.by && <span className="text-[10px] text-fg-muted">توسط {e.by.name}</span>}
          </div>
          {e.reason ? (
            <p className={`mt-1.5 whitespace-pre-wrap leading-relaxed text-fg-secondary ${compact ? 'text-[11px]' : 'text-xs'}`}>
              {e.reason}
            </p>
          ) : (
            <p className="mt-1.5 text-[11px] text-fg-muted">دلیلی ثبت نشده است</p>
          )}
        </div>
      ))}
    </div>
  );
}

/** A one-line summary for a dense list. */
export function RejectionBadge({ events }: { events?: RejectionEvent[] }) {
  if (!events?.length) return null;
  return <Badge tone="bad">{events.length} بار برگشته</Badge>;
}
