'use client';

import { useState } from 'react';
import Card from '@/components/ui/Card';
import { useToast } from '@/components/Toast';
import { getRecurrenceDescription } from '@/components/TaskRecurrenceBadge';
import { describeRequestError } from '@/lib/requestError';
import api from '@/lib/api';

export interface SeriesInfo {
  isSeries: boolean;
  templateId?: number;
  viewingTemplate?: boolean;
  template?: {
    id: number;
    title: string;
    recurrencePattern: string | null;
    recurrenceDays: string | null;
    recurrenceEnd: string | null;
    isRecurring: boolean;
  };
  counts?: { total: number; upcoming: number; done: number; past: number };
}

/**
 * One line of context for a task that repeats, and the way to stop it.
 *
 * It used to carry "go to template" and "apply to N upcoming": changing the
 * later days meant finding a task that appears in no list, editing it, then
 * pressing a second button. Editing any occurrence now asks whether the change
 * is for that day or for it and every day after, so neither button is needed.
 */
export default function SeriesBar({
  info, canManage, onChanged,
}: { info: SeriesInfo | null; canManage: boolean; onChanged: () => void }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  if (!info?.isSeries || !info.counts || !info.template) return null;
  const { upcoming, done } = info.counts;
  const { template } = info;

  const stop = async () => {
    if (!confirm(
      `توقف تکرار:\n\n• ${upcoming} نوبت آینده حذف می‌شود\n• ${done} نوبت انجام‌شده دست‌نخورده می‌ماند\n\nاین کار برگشت‌ناپذیر است. ادامه می‌دهید؟`
    )) return;
    setBusy(true);
    try {
      const { data } = await api.delete(`/tasks/${info.templateId}/series`);
      showToast(`${data.cancelled} نوبت آینده حذف شد و تکرار متوقف شد`);
      onChanged();
    } catch (err) {
      showToast(describeRequestError(err, 'توقف تکرار'), 'error');
    } finally { setBusy(false); }
  };

  return (
    <Card className="mb-3" tint="info" padding="sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="tnum flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-fg-secondary">
          <svg className="h-3.5 w-3.5 shrink-0 text-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="font-semibold text-fg">
            {template.isRecurring ? getRecurrenceDescription(template.recurrencePattern, template.recurrenceDays) : 'تکرار متوقف شده'}
          </span>
          <span>· {upcoming} نوبت آینده</span>
          <span>· {done} انجام‌شده</span>
          {template.recurrenceEnd && template.isRecurring && (
            <span>· تا {new Date(template.recurrenceEnd).toLocaleDateString('fa-IR')}</span>
          )}
        </p>

        {canManage && template.isRecurring && upcoming > 0 && (
          <button
            onClick={stop}
            disabled={busy}
            className="cursor-pointer rounded-full bg-bad-soft px-3 py-1.5 text-[11px] font-medium text-bad transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {busy ? '…' : 'توقف تکرار'}
          </button>
        )}
      </div>
    </Card>
  );
}
