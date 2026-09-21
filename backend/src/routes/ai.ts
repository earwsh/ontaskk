import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { askLLM, askLLMJSON } from '../services/ai/llmClient';
import { buildPrompt, systemPrompt } from '../services/ai/promptBuilder';
import {
  buildHealthContext,
  buildPredictiveContext,
  buildWorkloadContext,
  buildDailyContext,
  buildWeeklyContext,
  buildSearchContext,
  buildExecutiveContext,
  buildTaskGeneratorContext,
  buildMeetingNotesContext,
  buildQAContext,
  buildSummaryContext,
  buildRecommendationsContext,
  buildDashboardContext,
} from '../services/ai/contextBuilder';
import {
  validateHealthScore,
  validatePredictive,
  validatePrioritization,
  validateWorkload,
  validateDailySummary,
  validateWeeklyReport,
  validateTaskGenerator,
  validateNLSearch,
  validateMeetingNotes,
  validateExecutive,
} from '../services/ai/responseValidator';
import { cacheGet, cacheSet } from '../services/ai/cache';

const router = Router();

// ─── Unified endpoints ─────────────────────────────────────────

router.post('/ask', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'question is required' });

    const context = await buildQAContext(prisma, {
      userId: req.user!.id,
      userRole: req.user!.role,
    });

    const fullPrompt = `اطلاعات سیستم:
${context}

سوال کاربر: ${question}

پاسخ:`;

    const answer = await askLLM(fullPrompt, { system: systemPrompt('question'), temperature: 0.3, maxTokens: 1024 });
    res.json({ answer });
  } catch (err: any) {
    console.error('ai/ask error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

router.post('/summary', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userRole = req.user!.role;

    if (!['CEO', 'INTERNAL_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER'].includes(userRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const cacheKey = `summary-${req.user!.id}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const result = await buildSummaryContext(prisma, {
      userId: req.user!.id,
      userRole,
    });

    if (!result.scopeLabel) {
      return res.json({ summary: 'شما مدیر هیچ دپارتمانی نیستید.', tasksCount: 0 });
    }

    const answer = await askLLM(result.context, { system: systemPrompt('summary'), temperature: 0.3, maxTokens: 1024 });

    const payload = { summary: answer };
    cacheSet(cacheKey, payload);
    res.json(payload);
  } catch (err: any) {
    console.error('ai/summary error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

router.post('/analyze-task/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = parseInt(String(req.params.id), 10);
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: { select: { name: true } },
        reports: { include: { user: { select: { firstName: true, lastName: true } } } },
        assignees: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });

    if (!task) return res.status(404).json({ error: 'Task not found' });

    const reportTexts = task.reports.map((r) => `- ${r.user.firstName} ${r.user.lastName}: "${r.content}"`).join('\n');
    const assigneeNames = task.assignees.map((a) => `${a.user.firstName} ${a.user.lastName}`).join(', ') || 'تعیین نشده';

    const context = `عنوان: "${task.title}"
توضیحات: "${task.description || 'ندارد'}"
وضعیت: ${task.status}
پروژه: ${task.project?.name}
تسک‌دهنده: ${assigneeNames}
ددلاین: ${task.deadline ? new Date(task.deadline).toLocaleDateString('fa-IR') : 'ندارد'}
گزارشات:
${reportTexts || 'گزارشی ثبت نشده'}`;

    const answer = await askLLM(context, { system: systemPrompt('task-analysis'), temperature: 0.3, maxTokens: 1024 });
    res.json({ taskId: task.id, title: task.title, analysis: answer });
  } catch (err: any) {
    console.error('ai/analyze-task error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

router.post('/recommendations', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userRole = req.user!.role;

    if (!['CEO', 'INTERNAL_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER'].includes(userRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const cacheKey = `recommendations-${req.user!.id}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const context = await buildRecommendationsContext(prisma, {
      userId: req.user!.id,
      userRole,
    });

    const answer = await askLLM(context, { system: systemPrompt('recommendations'), temperature: 0.3, maxTokens: 1024 });

    const payload = { recommendations: answer };
    cacheSet(cacheKey, payload);
    res.json(payload);
  } catch (err: any) {
    console.error('ai/recommendations error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

router.get('/dashboard', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userRole = req.user!.role;

    if (!['CEO', 'INTERNAL_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER'].includes(userRole)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const cacheKey = `dashboard-${req.user!.id}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const { context, stats } = await buildDashboardContext(prisma, {
      userId: req.user!.id,
      userRole,
    });

    if (!stats.tasks) {
      return res.json({ analysis: 'شما مدیر هیچ دپارتمانی نیستید.', stats: {} });
    }

    const answer = await askLLM(context, { system: systemPrompt('dashboard'), temperature: 0.3, maxTokens: 2048 });

    const payload = { analysis: answer, stats };
    cacheSet(cacheKey, payload);
    res.json(payload);
  } catch (err: any) {
    console.error('ai/dashboard error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 10 NEW AI FEATURES
// ═══════════════════════════════════════════════════════════════

// 1. Health Score
router.post('/health-score', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};
    const cacheKey = `health-${req.user!.id}-${body.projectId || 'all'}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const context = await buildHealthContext(prisma, {
      userId: req.user!.id,
      userRole: req.user!.role,
      projectId: body.projectId,
      departmentId: body.departmentId,
    });

    const prompt = buildPrompt('health', context);
    const raw = await askLLM(prompt, { system: systemPrompt('health'), temperature: 0.2, maxTokens: 2048 });
    const result = validateHealthScore(raw);

    cacheSet(cacheKey, result);
    res.json(result);
  } catch (err: any) {
    console.error('ai/health-score error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// 2. Predictive Analysis
router.post('/predict', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};
    const cacheKey = `predict-${req.user!.id}-${body.projectId || 'all'}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const context = await buildPredictiveContext(prisma, {
      userId: req.user!.id,
      userRole: req.user!.role,
      projectId: body.projectId,
    });

    const prompt = buildPrompt('predict', context);
    const raw = await askLLM(prompt, { system: systemPrompt('predict'), temperature: 0.2, maxTokens: 2048 });
    const result = validatePredictive(raw);

    cacheSet(cacheKey, result);
    res.json(result);
  } catch (err: any) {
    console.error('ai/predict error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// 3. Smart Prioritization
router.post('/prioritize', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};
    const cacheKey = `prioritize-${req.user!.id}-${body.projectId || 'all'}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const context = await buildPredictiveContext(prisma, {
      userId: req.user!.id,
      userRole: req.user!.role,
      projectId: body.projectId,
    });

    const prompt = buildPrompt('prioritize', context);
    const raw = await askLLM(prompt, { system: systemPrompt('prioritize'), temperature: 0.3, maxTokens: 2048 });
    const result = validatePrioritization(raw);

    cacheSet(cacheKey, result);
    res.json(result);
  } catch (err: any) {
    console.error('ai/prioritize error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// 4. Workload Analysis
router.post('/workload', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};
    const cacheKey = `workload-${req.user!.id}-${body.departmentId || 'all'}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const context = await buildWorkloadContext(prisma, {
      userId: req.user!.id,
      userRole: req.user!.role,
      departmentId: body.departmentId,
    });

    const prompt = buildPrompt('workload', context);
    const raw = await askLLM(prompt, { system: systemPrompt('workload'), temperature: 0.2, maxTokens: 2048 });
    const result = validateWorkload(raw);

    cacheSet(cacheKey, result);
    res.json(result);
  } catch (err: any) {
    console.error('ai/workload error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// 5. Daily Summary
router.post('/daily-summary', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};
    const cacheKey = `daily-${req.user!.id}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const context = await buildDailyContext(prisma, {
      userId: req.user!.id,
      userRole: req.user!.role,
      departmentId: body.departmentId,
    });

    const prompt = buildPrompt('daily', context);
    const raw = await askLLM(prompt, { system: systemPrompt('daily'), temperature: 0.3, maxTokens: 2048 });
    const result = validateDailySummary(raw);

    cacheSet(cacheKey, result);
    res.json(result);
  } catch (err: any) {
    console.error('ai/daily-summary error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// 6. Weekly Report
router.post('/weekly-report', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};
    const cacheKey = `weekly-${req.user!.id}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const context = await buildWeeklyContext(prisma, {
      userId: req.user!.id,
      userRole: req.user!.role,
      departmentId: body.departmentId,
    });

    const prompt = buildPrompt('weekly', context);
    const raw = await askLLM(prompt, { system: systemPrompt('weekly'), temperature: 0.3, maxTokens: 3072 });
    const result = validateWeeklyReport(raw);

    cacheSet(cacheKey, result);
    res.json(result);
  } catch (err: any) {
    console.error('ai/weekly-report error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// 7. AI Task Generator
router.post('/generate-tasks', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { description, projectId } = req.body;
    if (!description) return res.status(400).json({ error: 'description is required' });

    const context = await buildTaskGeneratorContext(prisma, {
      userId: req.user!.id,
      userRole: req.user!.role,
      projectId,
    });

    const userPrompt = `توضیحات مدیر: "${description}"

${context}

لطفاً بر اساس توضیحات بالا، تسک‌های زیرمجموعه را تولید کن:`;

    const prompt = buildPrompt('generate', userPrompt);
    const raw = await askLLM(prompt, { system: systemPrompt('generate'), temperature: 0.4, maxTokens: 3072 });
    const result = validateTaskGenerator(raw);

    res.json(result);
  } catch (err: any) {
    console.error('ai/generate-tasks error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// 8. Natural Language Search
router.post('/search', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });

    const cacheKey = `search-${req.user!.id}-${query.slice(0, 50)}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const context = await buildSearchContext(prisma, req.user!.id, req.user!.role);
    const searchPrompt = `سوال کاربر: ${query}

داده‌های سیستم:
${context}

پاسخ:`;

    const prompt = buildPrompt('search', searchPrompt);
    const raw = await askLLM(prompt, { system: systemPrompt('search'), temperature: 0.2, maxTokens: 2048 });
    const result = validateNLSearch(raw);

    cacheSet(cacheKey, result);
    res.json(result);
  } catch (err: any) {
    console.error('ai/search error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// 9. Meeting Notes
router.post('/meeting-notes', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { notes } = req.body;
    if (!notes) return res.status(400).json({ error: 'notes is required' });

    const context = await buildMeetingNotesContext(prisma, {
      userId: req.user!.id,
      userRole: req.user!.role,
    });

    const meetingPrompt = `صورت جلسه:
${notes}

اطلاعات سیستم:
${context}

لطفاً صورت جلسه را پردازش کن:`;

    const prompt = buildPrompt('meeting', meetingPrompt);
    const raw = await askLLM(prompt, { system: systemPrompt('meeting'), temperature: 0.3, maxTokens: 3072 });
    const result = validateMeetingNotes(raw);

    res.json(result);
  } catch (err: any) {
    console.error('ai/meeting-notes error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// 10. Executive Dashboard
router.get('/executive', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const cacheKey = `executive-${req.user!.id}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const context = await buildExecutiveContext(prisma, {
      userId: req.user!.id,
      userRole: req.user!.role,
    });

    const prompt = buildPrompt('executive', context);
    const raw = await askLLM(prompt, { system: systemPrompt('executive'), temperature: 0.2, maxTokens: 3072 });
    const result = validateExecutive(raw);

    cacheSet(cacheKey, result);
    res.json(result);
  } catch (err: any) {
    console.error('ai/executive error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

export default router;
