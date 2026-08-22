'use client';

const WEEK_NAMES: Record<number, string> = {
  0: 'شنبه',
  1: 'یکشنبه',
  2: 'دوشنبه',
  3: 'سه‌شنبه',
  4: 'چهارشنبه',
  5: 'پنج‌شنبه',
  6: 'جمعه',
};

export function getRecurrenceDescription(pattern?: string | null, daysJson?: string | null): string {
  if (!pattern) return '';

  let days: number[] = [];
  if (daysJson) {
    try {
      const parsed = typeof daysJson === 'string' ? JSON.parse(daysJson) : daysJson;
      if (Array.isArray(parsed)) days = parsed;
    } catch {
      // ignore
    }
  }

  switch (pattern) {
    case 'DAILY':
      return 'روزانه (هر روز)';
    case 'WEEKLY':
      if (days.length > 0) {
        return `هفتگی (${days.map((d) => WEEK_NAMES[d] || d).join('، ')})`;
      }
      return 'هفتگی (همان روز)';
    case 'MONTHLY_DAYS':
      if (days.length > 0) {
        return `روزهای ${days.join('، ')} هر ماه`;
      }
      return 'ماهانه';
    case 'ODD_DAYS':
      return 'روزهای فرد ماه';
    case 'EVEN_DAYS':
      return 'روزهای زوج ماه';
    default:
      return pattern;
  }
}

interface TaskRecurrenceBadgeProps {
  isRecurring?: boolean;
  recurrencePattern?: string | null;
  recurrenceDays?: string | null;
  recurringParentId?: number | null;
  recurringParent?: { id: number; title: string } | null;
  compact?: boolean;
}

export default function TaskRecurrenceBadge({
  isRecurring,
  recurrencePattern,
  recurrenceDays,
  recurringParentId,
  recurringParent,
  compact = false,
}: TaskRecurrenceBadgeProps) {
  if (!isRecurring && !recurringParentId) return null;

  if (isRecurring) {
    const label = getRecurrenceDescription(recurrencePattern, recurrenceDays);
    return (
      <span
        title={`تسک تکرارشونده: ${label}`}
        className={`inline-flex items-center gap-1.5 rounded-lg font-medium border ${
          compact
            ? 'px-2 py-0.5 text-[10px] bg-primary/10 text-primary border-primary/20'
            : 'px-2.5 py-1 text-xs bg-primary/10 text-primary border-primary/25 shadow-[0_0_10px_rgba(99,102,241,0.15)]'
        }`}
      >
        <svg className="w-3 h-3 animate-spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <span>{compact ? 'تکرار' : label}</span>
      </span>
    );
  }

  if (recurringParentId) {
    return (
      <span
        title={recurringParent?.title ? `تولید شده از تسک تکرارشونده: ${recurringParent.title}` : 'تولید شده از تسک تکرارشونده'}
        className={`inline-flex items-center gap-1 rounded-lg font-medium border ${
          compact
            ? 'px-1.5 py-0.5 text-[10px] bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
            : 'px-2 py-0.5 text-xs bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
        }`}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <span>نمونه تکرار</span>
      </span>
    );
  }

  return null;
}
