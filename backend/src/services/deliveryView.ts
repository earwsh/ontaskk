import {
  projectFacts, weeklyThroughput, cycleSamples, memberFacts, historyDepth,
  type ProjectFact,
} from './deliveryFacts';
import { callPython, callRust } from './analysisClient';

/**
 * The technical manager's command view.
 *
 * Three layers, each doing what it is actually good at:
 *   Postgres  — all counting and aggregation (it holds the rows and the indexes)
 *   Python    — statistics SQL is awkward at: regression, percentiles, dispersion
 *   Rust      — Monte Carlo forecasting: 10k simulated futures per project
 *
 * The risk label is derived from the simulation, not from a threshold. The old
 * rule ("any overdue task ⇒ critical") labelled 58% of projects critical, 13 of
 * them for a single late task out of twenty or thirty — which made the label
 * useless for deciding what to look at first.
 */

export type RiskStatus =
  | 'on_track' | 'at_risk' | 'behind' | 'stalled'
  | 'awaiting_review' | 'unknown' | 'no_deadline' | 'done';

const STATUS_LABEL: Record<RiskStatus, string> = {
  on_track: 'در مسیر',
  at_risk: 'در خطر',
  behind: 'عقب از برنامه',
  stalled: 'متوقف',
  unknown: 'قابل پیش‌بینی نیست',
  no_deadline: 'بدون ددلاین',
  awaiting_review: 'معطل بررسی',
  done: 'تمام‌شده',
};

/** Sort weight — what a manager should look at first. */
const STATUS_PRIORITY: Record<RiskStatus, number> = {
  behind: 0, stalled: 1, at_risk: 2, awaiting_review: 3, unknown: 4, no_deadline: 5, on_track: 6, done: 7,
};

function weeksBetween(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round(((d.getTime() - Date.now()) / (7 * 86400000)) * 10) / 10;
}

/** Pivot the flat week rows into a dense per-project series. */
function seriesByProject(rows: { projectId: number | null; week: string; completed: number }[]) {
  const weeks = [...new Set(rows.map((r) => r.week))].sort();
  const byProject = new Map<number, Map<string, number>>();
  for (const r of rows) {
    if (r.projectId == null) continue;
    if (!byProject.has(r.projectId)) byProject.set(r.projectId, new Map());
    byProject.get(r.projectId)!.set(r.week, Number(r.completed));
  }
  // Zero-fill: a week with no completions is a real observation of zero, and
  // dropping it would quietly inflate the average throughput.
  const dense = new Map<number, number[]>();
  for (const [pid, m] of byProject) dense.set(pid, weeks.map((w) => m.get(w) ?? 0));
  return { weeks, dense };
}

/**
 * The view is expensive — Postgres aggregation, a Python round trip and 10k
 * Monte Carlo runs per project — and both the delivery tab and every project
 * card now ask for it. One short-lived cache keeps a dashboard load from
 * running the simulation several times over.
 */
let cached: { at: number; value: Awaited<ReturnType<typeof computeDeliveryView>> } | null = null;
const CACHE_MS = 60_000;

export async function buildDeliveryView(force = false) {
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const value = await computeDeliveryView();
  cached = { at: Date.now(), value };
  return value;
}

async function computeDeliveryView() {
  const [facts, weekly, cycles, members, depth] = await Promise.all([
    projectFacts(), weeklyThroughput(), cycleSamples(), memberFacts(), historyDepth(),
  ]);

  const { weeks, dense } = seriesByProject(weekly);
  const orgWeekly = weeks.map((w) =>
    weekly.filter((r) => r.week === w).reduce((s, r) => s + Number(r.completed), 0)
  );

  const projectsForPy = facts.map((f) => ({
    projectId: f.projectId,
    open: f.open,
    derivedDeadline: f.derivedDeadline,
    weekly: dense.get(f.projectId) ?? [],
  }));

  const py = await callPython('/analyze/delivery', {
    projects: projectsForPy,
    orgWeekly,
    cycleDays: cycles.map((c) => Number(c.days)),
    members: members.map((m) => ({
      userId: m.userId, name: m.name, open: Number(m.open),
      overdue: Number(m.overdue), completed4w: Number(m.completed4w),
    })),
    historyWeeks: depth.weeks,
  });

  const rs = await callRust('/simulate/completion', {
    iterations: 10000,
    projects: facts.map((f) => ({
      project_id: f.projectId,
      remaining: f.open,
      weekly: dense.get(f.projectId) ?? [],
      weeks_to_deadline: weeksBetween(f.derivedDeadline),
    })),
  });

  const pyById = new Map<number, any>((py?.projects ?? []).map((p: any) => [p.projectId, p]));
  const rsById = new Map<number, any>((rs?.projects ?? []).map((p: any) => [p.project_id, p]));

  const projects = facts.map((f) => {
    const s = pyById.get(f.projectId);
    const sim = rsById.get(f.projectId);
    // Falling back to 'no_deadline' when the simulator is unreachable made a
    // dead service look like missing data — every project would quietly read
    // "بدون ددلاین" instead of admitting the forecast could not be produced.
    let status: RiskStatus = (sim?.status as RiskStatus) ?? 'unknown';
    // With the team's own work finished, the simulator sees nothing remaining
    // and calls the project done. It is not done — it is sitting in someone's
    // review queue, and saying "تمام‌شده" would bury exactly that.
    if (f.open === 0 && f.awaitingReview > 0) status = 'awaiting_review';

    return {
      projectId: f.projectId,
      name: f.name,
      department: f.departmentName,
      total: f.total,
      done: f.done,
      open: f.open,
      scheduled: f.scheduled,
      overdue: f.overdue,
      pendingApproval: f.pendingApproval,
      pendingQc: f.pendingQc,
      awaitingReview: f.awaitingReview,
      longestReviewWaitDays: f.longestReviewWaitDays,
      memberCount: f.memberCount,
      completionRate: f.total ? Math.round((f.done / f.total) * 100) : null,
      deadline: f.derivedDeadline,
      weeksToDeadline: weeksBetween(f.derivedDeadline),
      velocity: s?.velocity ?? null,
      weekly: dense.get(f.projectId) ?? [],
      forecast: sim
        ? {
            p50Weeks: sim.p50_weeks, p80Weeks: sim.p80_weeks, p95Weeks: sim.p95_weeks,
            onTimeProbability: sim.on_time_probability, slipWeeks: sim.slip_weeks, reason: sim.reason,
          }
        : null,
      status,
      statusLabel: STATUS_LABEL[status] ?? status,
      /** One sentence a manager can act on, stating the evidence. */
      headline: headlineFor(f, s, sim, status),
    };
  });

  projects.sort((a, b) => {
    const d = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (d !== 0) return d;
    return (b.forecast?.slipWeeks ?? 0) - (a.forecast?.slipWeeks ?? 0);
  });

  const counts = projects.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {});

  return {
    generatedAt: new Date().toISOString(),
    weeks,
    org: {
      projects: projects.length,
      tasks: facts.reduce((s, f) => s + f.total, 0),
      open: facts.reduce((s, f) => s + f.open, 0),
      scheduled: facts.reduce((s, f) => s + f.scheduled, 0),
      overdue: facts.reduce((s, f) => s + f.overdue, 0),
      pendingApproval: facts.reduce((s, f) => s + f.pendingApproval, 0),
      pendingQc: facts.reduce((s, f) => s + f.pendingQc, 0),
      awaitingReview: facts.reduce((s, f) => s + f.awaitingReview, 0),
      longestReviewWaitDays: facts.reduce((s, f) => Math.max(s, f.longestReviewWaitDays), 0),
      weeklyThroughput: orgWeekly,
      velocity: py?.org?.velocity ?? null,
      cycleTime: py?.org?.cycleTime ?? null,
    },
    workload: py?.workload ?? null,
    confidence: py?.confidence ?? null,
    counts,
    projects,
    computedBy: { facts: 'postgres', statistics: py?.computedBy ?? null, simulation: rs?.computedBy ?? null },
    degraded: !py || !rs ? { statistics: !py, simulation: !rs } : null,
    simulation: rs ? { iterations: rs.iterations, elapsedMs: rs.elapsedMs } : null,
  };
}

function headlineFor(f: ProjectFact, s: any, sim: any, status: RiskStatus): string {
  const v = s?.velocity;
  switch (status) {
    case 'done':
      return 'همه تسک‌ها تحویل شده‌اند';
    case 'awaiting_review': {
      const gate = f.pendingQc > 0 && f.pendingApproval > 0 ? 'بررسی' : f.pendingQc > 0 ? 'کنترل کیفیت' : 'تایید';
      const days = f.longestReviewWaitDays;
      return days > 0
        ? `${f.awaitingReview} تسک معطل ${gate} است — قدیمی‌ترین ${days} روز`
        : `${f.awaitingReview} تسک معطل ${gate} است`;
    }
    case 'stalled':
      return `${f.open} تسک باز و در هفته‌های اخیر هیچ تحویلی ثبت نشده`;
    case 'unknown':
      if (f.total === 0) return 'پروژه هنوز تسکی ندارد';
      if (!sim) return 'سرویس پیش‌بینی در دسترس نیست';
      return 'سابقه تحویل برای پیش‌بینی کافی نیست';
    case 'no_deadline':
      return v?.mean
        ? `${f.open} تسک باز، سرعت ${v.mean} در هفته — ددلاینی ثبت نشده`
        : `${f.open} تسک باز و بدون ددلاین`;
    case 'behind': {
      const p = sim?.on_time_probability;
      if ((f.overdue ?? 0) > 0) {
        return `${f.overdue} تسک از سررسید گذشته؛ حدود ${sim?.slip_weeks} هفته عقب‌تر تمام می‌شود`;
      }
      return `حدود ${sim?.slip_weeks} هفته عقب‌تر از ددلاین — ${sim?.p50_weeks} هفته کار باقی است`;
    }
    case 'at_risk': {
      const slip = sim?.slip_weeks;
      if (slip != null && slip > 0) return `حدود ${slip} هفته دیرتر از ددلاین تمام می‌شود`;
      return `احتمال رسیدن به ددلاین ${Math.round((sim?.on_time_probability ?? 0) * 100)}٪`;
    }
    default:
      return `احتمال رسیدن به ددلاین ${Math.round((sim?.on_time_probability ?? 1) * 100)}٪`;
  }
}
