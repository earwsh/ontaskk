import type { BadgeTone } from '@/components/ui/Badge';

/**
 * The one definition of a project's health, shared by every screen that shows
 * a project.
 *
 * There used to be four: two hand-picked thresholds in the frontend, one in
 * Rust and one in Python. On live data they disagreed about 15 of 45 projects
 * — three of them the card called «سالم» while the forecast put them at risk.
 * Worse, the threshold rules divided completion by every materialised future
 * occurrence, and since 76% of all tasks are recurring work booked months
 * ahead, every large recurring project sat permanently at 9–17% and was
 * labelled «بحرانی» no matter how well it was running.
 *
 * The label now comes from `/analytics/project-status`, which forecasts from
 * each project's own delivery history instead of from a number someone chose.
 */
export type ProjectStatus =
  | 'behind' | 'stalled' | 'at_risk' | 'awaiting_review'
  | 'unknown' | 'no_deadline' | 'on_track' | 'done';

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: BadgeTone; hint: string }> = {
  behind:          { label: 'عقب از برنامه', tone: 'bad',     hint: 'با سرعت فعلی بیش از دو هفته دیرتر تمام می‌شود' },
  stalled:         { label: 'متوقف',          tone: 'bad',     hint: 'کار باز دارد ولی هفته‌هاست چیزی تحویل نشده' },
  at_risk:         { label: 'در خطر',         tone: 'warn',    hint: 'احتمال رسیدن به ددلاین زیر ۸۰٪ یا تأخیر کوتاه' },
  awaiting_review: { label: 'معطل بررسی',     tone: 'violet',  hint: 'کار تیم تمام شده و منتظر کنترل کیفیت یا تایید مانده' },
  unknown:         { label: 'نامشخص',         tone: 'neutral', hint: 'سابقه تحویل برای پیش‌بینی کافی نیست' },
  no_deadline:     { label: 'بدون ددلاین',    tone: 'neutral', hint: 'ددلاینی ثبت نشده که بشود با آن سنجید' },
  on_track:        { label: 'در مسیر',        tone: 'ok',      hint: 'احتمال رسیدن به ددلاین ۸۰٪ یا بیشتر' },
  done:            { label: 'تمام‌شده',       tone: 'ok',      hint: 'تسک بازی ندارد' },
};

/** Most in need of attention first — the order the tabs and lists use. */
export const PROJECT_STATUS_ORDER: ProjectStatus[] = [
  'behind', 'stalled', 'at_risk', 'awaiting_review', 'unknown', 'no_deadline', 'on_track', 'done',
];

/** The statuses a manager should act on. */
export const NEEDS_ATTENTION: ProjectStatus[] = ['behind', 'stalled', 'at_risk'];

/** What `/analytics/project-status` returns per project. */
export interface ProjectRisk {
  projectId: number;
  status: ProjectStatus;
  statusLabel: string;
  headline: string;
  total: number;
  done: number;
  open: number;
  scheduled: number;
  overdue: number;
  awaitingReview: number;
  /** Completion over work that is actually due, ignoring future occurrences. */
  completionRate: number | null;
}

export const statusMeta = (s?: string | null) =>
  PROJECT_STATUS[(s as ProjectStatus)] ?? { label: 'نامشخص', tone: 'neutral' as BadgeTone, hint: '' };
