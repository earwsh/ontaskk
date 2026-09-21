/**
 * Weight is minutes. One minute of estimated work is one unit of weight.
 *
 * It used to be two things in one column: the form asked for a 1–5 priority
 * while the API filled the same field from the estimate whenever that box was
 * left empty. On live data 2,272 tasks carried a 1–5 value and 1,727 carried
 * minutes, and the workload figures summed them together — a 60-minute task
 * entered through the form counted 1 against a 90-minute task's 90.
 *
 * Deriving it in one place removes the choice, so the column cannot drift
 * back apart.
 */
export function weightFromEstimate(
  estimatedHours?: number | string | null,
  estimatedMinutes?: number | string | null
): number | null {
  const h = Number(estimatedHours) || 0;
  const m = Number(estimatedMinutes) || 0;
  const total = h * 60 + m;
  // No estimate is not zero work; it is an unknown, and analytics has its own
  // fallback for that. Storing 0 would quietly drop the task from workload.
  return total > 0 ? total : null;
}
