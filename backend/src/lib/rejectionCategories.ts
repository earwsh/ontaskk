/**
 * The categories a reviewer picks from when sending work back.
 *
 * Labels live here rather than in the frontend so the API can name them in
 * its own error messages and the two never drift.
 */
export const REJECTION_CATEGORIES = [
  { key: 'CONTENT', label: 'محتوا و نگارش' },
  { key: 'DESIGN', label: 'تصویر و طراحی' },
  { key: 'BRIEF_MISMATCH', label: 'مغایرت با بریف' },
  { key: 'INCOMPLETE', label: 'ناقص بودن کار' },
  { key: 'WEAK_REPORT', label: 'گزارش ناکافی' },
  { key: 'TIMING', label: 'زمان‌بندی' },
  { key: 'OTHER', label: 'سایر' },
] as const;

export type RejectionCategoryKey = (typeof REJECTION_CATEGORIES)[number]['key'];

const KEYS = new Set<string>(REJECTION_CATEGORIES.map((c) => c.key));

export function isRejectionCategory(v: unknown): v is RejectionCategoryKey {
  return typeof v === 'string' && KEYS.has(v);
}

/**
 * The categories a rejection names, de-duplicated, or null if none are valid.
 *
 * A task can be wrong in the copy and in the artwork at once, so this takes a
 * list. Duplicates are dropped rather than rejected — the caller sending the
 * same label twice is a UI slip, not a reason to refuse the rejection.
 */
export function normaliseCategories(v: unknown): RejectionCategoryKey[] | null {
  const raw = Array.isArray(v) ? v : v == null ? [] : [v];
  const out = [...new Set(raw.filter(isRejectionCategory))];
  return out.length ? out : null;
}

/**
 * Whether the free-text reason says anything.
 *
 * "Required" was already true and produced "." sixteen times out of
 * twenty-one, so the check now looks for actual letters or digits rather than
 * for a non-empty string.
 */
export function meaningfulReason(reason: unknown): boolean {
  if (typeof reason !== 'string') return false;
  // Persian, Arabic and Latin letters, plus digits of either script.
  const substantive = reason.replace(/[^\p{L}\p{N}]/gu, '');
  return substantive.length >= 5;
}

export const REASON_TOO_SHORT =
  'دلیل رد را با جزئیات بنویسید — حداقل چند کلمه، تا انجام‌دهنده بداند چه چیزی باید اصلاح شود.';

/** Quick picks for the rework estimate, so the common cases are one tap. */
export const REWORK_PRESETS = [15, 30, 60, 90, 120] as const;

/** A rework estimate has to be a real number of minutes, and a working day is the ceiling. */
export function validReworkMinutes(v: unknown): v is number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= 480;
}

export const REWORK_INVALID =
  'زمان اصلاح را بین ۱ تا ۴۸۰ دقیقه وارد کنید.';
