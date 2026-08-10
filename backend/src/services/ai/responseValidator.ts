import {
  HealthScoreResult,
  PredictiveResult,
  PrioritizationResult,
  WorkloadResult,
  DailySummaryResult,
  WeeklyReportResult,
  TaskGeneratorResult,
  NLSearchResult,
  MeetingNotesResult,
  ExecutiveResult,
} from './types';

function defaultHealth(overrides: Partial<HealthScoreResult> = {}): HealthScoreResult {
  return {
    score: 50,
    breakdown: {
      progress: { weight: 25, score: 50, details: 'داده کافی برای تحلیل موجود نیست' },
      overdue: { weight: 25, score: 50, details: 'داده کافی برای تحلیل موجود نیست' },
      blocked: { weight: 20, score: 50, details: 'داده کافی برای تحلیل موجود نیست' },
      workload: { weight: 15, score: 50, details: 'داده کافی برای تحلیل موجود نیست' },
      deadline: { weight: 15, score: 50, details: 'داده کافی برای تحلیل موجود نیست' },
    },
    level: 'warning',
    summary: 'داده کافی برای تحلیل سلامت پروژه موجود نیست',
    suggestions: ['اطلاعات پروژه را تکمیل کنید'],
    ...overrides,
  };
}

function defaultPredictive(overrides: Partial<PredictiveResult> = {}): PredictiveResult {
  return {
    onTimeProbability: 50,
    estimatedCompletionDate: '',
    delayRisk: 'medium',
    riskFactors: ['داده کافی موجود نیست'],
    riskyTasks: [],
    recommendations: ['داده‌های بیشتری برای پیش‌بینی دقیق‌تر مورد نیاز است'],
    ...overrides,
  };
}

function defaultPrioritization(overrides: Partial<PrioritizationResult> = {}): PrioritizationResult {
  return {
    todayTasks: [],
    backlog: [],
    focusArea: 'داده کافی موجود نیست',
    ...overrides,
  };
}

function defaultWorkload(overrides: Partial<WorkloadResult> = {}): WorkloadResult {
  return {
    members: [],
    overloadedCount: 0,
    underloadedCount: 0,
    suggestions: ['داده کافی موجود نیست'],
    ...overrides,
  };
}

function defaultDailySummary(overrides: Partial<DailySummaryResult> = {}): DailySummaryResult {
  return {
    date: new Date().toISOString().slice(0, 10),
    scope: '',
    completed: 0,
    created: 0,
    overdue: 0,
    blocked: 0,
    summary: 'داده کافی برای خلاصه روزانه موجود نیست',
    highlights: [],
    risks: [],
    ...overrides,
  };
}

function defaultWeeklyReport(overrides: Partial<WeeklyReportResult> = {}): WeeklyReportResult {
  return {
    weekStart: '',
    weekEnd: '',
    completed: 0,
    newTasks: 0,
    overdue: 0,
    completionRate: 0,
    topPerformers: [],
    challenges: [],
    recommendations: [],
    ...overrides,
  };
}

function defaultTaskGenerator(overrides: Partial<TaskGeneratorResult> = {}): TaskGeneratorResult {
  return {
    tasks: [],
    summary: 'تسکی تولید نشد',
    ...overrides,
  };
}

function defaultNLSearch(overrides: Partial<NLSearchResult> = {}): NLSearchResult {
  return {
    answer: 'پاسخی یافت نشد',
    sources: [],
    ...overrides,
  };
}

function defaultMeetingNotes(overrides: Partial<MeetingNotesResult> = {}): MeetingNotesResult {
  return {
    summary: 'خلاصه‌ای موجود نیست',
    tasks: [],
    decisions: [],
    ...overrides,
  };
}

function defaultExecutive(overrides: Partial<ExecutiveResult> = {}): ExecutiveResult {
  return {
    snapshot: 'داده کافی برای تحلیل اجرایی موجود نیست',
    projectStatuses: [],
    teamStatus: { total: 0, overloaded: 0, available: 0 },
    criticalTasks: [],
    warnings: [],
    recommendations: [],
    ...overrides,
  };
}

function safeParse<T extends Record<string, any>>(raw: string, defaults: T): T {
  try {
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

export function validateHealthScore(raw: string): HealthScoreResult {
  return safeParse(raw, defaultHealth());
}

export function validatePredictive(raw: string): PredictiveResult {
  return safeParse(raw, defaultPredictive());
}

export function validatePrioritization(raw: string): PrioritizationResult {
  return safeParse(raw, defaultPrioritization());
}

export function validateWorkload(raw: string): WorkloadResult {
  return safeParse(raw, defaultWorkload());
}

export function validateDailySummary(raw: string): DailySummaryResult {
  return safeParse(raw, defaultDailySummary());
}

export function validateWeeklyReport(raw: string): WeeklyReportResult {
  return safeParse(raw, defaultWeeklyReport());
}

export function validateTaskGenerator(raw: string): TaskGeneratorResult {
  return safeParse(raw, defaultTaskGenerator());
}

export function validateNLSearch(raw: string): NLSearchResult {
  return safeParse(raw, defaultNLSearch());
}

export function validateMeetingNotes(raw: string): MeetingNotesResult {
  return safeParse(raw, defaultMeetingNotes());
}

export function validateExecutive(raw: string): ExecutiveResult {
  return safeParse(raw, defaultExecutive());
}
