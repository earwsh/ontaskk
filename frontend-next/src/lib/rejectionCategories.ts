/** Mirror of the server's list, so the picker and the validation agree. */
export const REJECTION_CATEGORIES = [
  {
    key: 'CONTENT',
    label: 'محتوا و نگارش',
    // Heroicons outline paths, same 24x24 stroke style as the nav icons, so a
    // category reads at a glance in a row of seven where the labels blur.
    icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  },
  {
    key: 'DESIGN',
    label: 'تصویر و طراحی',
    icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
  },
  {
    key: 'BRIEF_MISMATCH',
    label: 'مغایرت با بریف',
    // Diverging arrows, not another document: beside "گزارش ناکافی" two
    // document outlines are indistinguishable at 14px.
    icon: 'M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4 4m-4-4l4-4',
  },
  {
    key: 'INCOMPLETE',
    label: 'ناقص بودن کار',
    icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    key: 'WEAK_REPORT',
    label: 'گزارش ناکافی',
    icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  {
    key: 'TIMING',
    label: 'زمان‌بندی',
    icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    key: 'OTHER',
    label: 'سایر',
    icon: 'M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z',
  },
] as const;

export type RejectionCategoryKey = (typeof REJECTION_CATEGORIES)[number]['key'];

const byKey = new Map(REJECTION_CATEGORIES.map((c) => [c.key as string, c]));

export const categoryLabel = (key: string | null | undefined): string =>
  byKey.get(key ?? '')?.label ?? 'ثبت‌نشده';

/** Null for a rejection recorded before categories existed — those get no icon. */
export const categoryIcon = (key: string | null | undefined): string | null =>
  byKey.get(key ?? '')?.icon ?? null;

/**
 * Same rule the API applies: letters and digits only, at least five.
 * Checked here too so the button explains itself before the request.
 */
export function meaningfulReason(reason: string): boolean {
  return reason.replace(/[^\p{L}\p{N}]/gu, '').length >= 5;
}

/** Quick picks for the rework estimate, so the common cases are one tap. */
export const REWORK_PRESETS = [15, 30, 60, 90, 120] as const;

/** Same bounds the API enforces. */
export function validReworkMinutes(v: unknown): boolean {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= 480;
}
