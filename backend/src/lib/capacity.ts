/**
 * One person's working day, in minutes.
 *
 * Weight is minutes, so this is what turns a pile of weight into an answer a
 * manager can act on: 49,010 minutes of open work is meaningless, 102 working
 * days of it is not.
 *
 * Fridays are not working days here, so any capacity figure counts only the
 * days that are — see dailyRate, which marks them.
 */
export const WORKING_MINUTES_PER_DAY = 480;

/** Minutes expressed as working days, to one decimal. */
export function workingDays(minutes: number): number {
  return Math.round((minutes / WORKING_MINUTES_PER_DAY) * 10) / 10;
}

/**
 * Share of capacity used, as a percentage.
 *
 * Over 100 is not an error: it means the estimates delivered in that span add
 * up to more than the hours available, which is either overtime or estimates
 * that do not match reality. Both are worth seeing rather than clamping away.
 */
export function utilisation(minutes: number, workingDayCount: number): number {
  if (workingDayCount <= 0) return 0;
  return Math.round((minutes / (workingDayCount * WORKING_MINUTES_PER_DAY)) * 100);
}
