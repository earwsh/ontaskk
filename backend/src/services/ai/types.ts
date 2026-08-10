export type AIScope = 'organization' | 'technical' | 'department';

export interface AICacheEntry {
  data: any;
  ttl: number;
}

export interface HealthScoreResult {
  score: number;
  breakdown: {
    progress: { weight: number; score: number; details: string };
    overdue: { weight: number; score: number; details: string };
    blocked: { weight: number; score: number; details: string };
    workload: { weight: number; score: number; details: string };
    deadline: { weight: number; score: number; details: string };
  };
  level: 'good' | 'warning' | 'critical';
  summary: string;
  suggestions: string[];
}

export interface PredictiveResult {
  onTimeProbability: number;
  estimatedCompletionDate: string;
  delayRisk: 'low' | 'medium' | 'high';
  riskFactors: string[];
  riskyTasks: { id: number; title: string; reason: string }[];
  recommendations: string[];
}

export interface PrioritizationResult {
  todayTasks: { id: number; title: string; priority: number; reason: string; estimatedHours: number }[];
  backlog: { id: number; title: string; reason: string }[];
  focusArea: string;
}

export interface WorkloadResult {
  members: { id: number; name: string; taskCount: number; completedCount: number; loadPercentage: number; status: 'overloaded' | 'balanced' | 'underloaded' }[];
  overloadedCount: number;
  underloadedCount: number;
  suggestions: string[];
}

export interface DailySummaryResult {
  date: string;
  scope: string;
  completed: number;
  created: number;
  overdue: number;
  blocked: number;
  summary: string;
  highlights: string[];
  risks: string[];
}

export interface WeeklyReportResult {
  weekStart: string;
  weekEnd: string;
  completed: number;
  newTasks: number;
  overdue: number;
  completionRate: number;
  topPerformers: { name: string; completed: number }[];
  challenges: string[];
  recommendations: string[];
}

export interface GeneratedTask {
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  estimatedHours: number;
  suggestedAssignee?: string;
}

export interface TaskGeneratorResult {
  tasks: GeneratedTask[];
  summary: string;
}

export interface NLSearchResult {
  answer: string;
  sources: { type: string; title: string; id: number }[];
  data?: any;
}

export interface MeetingNotesResult {
  summary: string;
  tasks: { title: string; description: string; assignee?: string; deadline?: string; priority: string }[];
  decisions: string[];
  participants?: string[];
}

export interface ExecutiveResult {
  snapshot: string;
  projectStatuses: { name: string; status: 'good' | 'warning' | 'critical'; score: number; keyIssue: string }[];
  teamStatus: { total: number; overloaded: number; available: number };
  criticalTasks: { id: number; title: string; project: string; deadline: string; risk: string }[];
  warnings: string[];
  recommendations: string[];
}
