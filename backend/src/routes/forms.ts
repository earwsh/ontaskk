import { Router, Request, Response } from 'express';
import cors from 'cors';
import prisma from '../lib/prisma';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { createNotification } from '../lib/notifications';

const router = Router();

/** Roles allowed to read and manage submissions. */
const FORM_MANAGERS = ['CEO', 'TECHNICAL_MANAGER', 'INTERNAL_MANAGER'] as const;

/* ── Limits ───────────────────────────────────────────────────────────────
   The ingest endpoint is public, so every bound here is a defence against
   an unauthenticated flood rather than a convenience.                     */
const MAX_FIELDS = 40;
const MAX_KEY_LEN = 100;
const MAX_VALUE_LEN = 5000;
const MAX_STRING_LEN = 255;
const MAX_URL_LEN = 2048;

const RATE_PER_MINUTE = 10;
const RATE_PER_HOUR = 120;

type Hit = { minute: number[]; hour: number[] };
const hits = new Map<string, Hit>();

/**
 * In-memory, per-IP throttle. Resets on restart and is not shared between
 * processes — adequate for a single-process deployment, and far better than
 * leaving a public write endpoint entirely unbounded.
 */
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip) ?? { minute: [], hour: [] };
  entry.minute = entry.minute.filter((t) => now - t < 60_000);
  entry.hour = entry.hour.filter((t) => now - t < 3_600_000);
  if (entry.minute.length >= RATE_PER_MINUTE || entry.hour.length >= RATE_PER_HOUR) {
    hits.set(ip, entry);
    return true;
  }
  entry.minute.push(now);
  entry.hour.push(now);
  hits.set(ip, entry);
  return false;
}

// Keep the map from growing without bound on a long-running process.
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of hits) {
    if (!e.hour.some((t) => now - t < 3_600_000)) hits.delete(ip);
  }
}, 10 * 60_000).unref();

const clip = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.slice(0, max) : String(v ?? '').slice(0, max);

/** Only http(s) links are stored; a `javascript:` URL must never reach the UI. */
function safeUrl(raw: unknown): string | null {
  const s = clip(raw, MAX_URL_LEN);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? s : null;
  } catch {
    return null;
  }
}

/** Flattens the submitted object into predictable string key/value pairs. */
function normaliseFields(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n++ >= MAX_FIELDS) break;
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') {
      out[clip(k, MAX_KEY_LEN)] = clip(JSON.stringify(v), MAX_VALUE_LEN);
    } else {
      out[clip(k, MAX_KEY_LEN)] = clip(v, MAX_VALUE_LEN);
    }
  }
  return out;
}

/* ── Public ingest ──────────────────────────────────────────────────────── */

// Its own CORS: any origin may post, but never with credentials.
const publicCors = cors({ origin: '*', methods: ['POST', 'OPTIONS'], credentials: false });
router.options('/submit', publicCors);

router.post('/submit', publicCors, async (req: Request, res: Response) => {
  try {
    const ip = (req.headers['x-forwarded-for'] as string || '').split(',')[0].trim()
      || req.socket.remoteAddress || 'unknown';

    if (rateLimited(ip)) {
      return res.status(429).json({ success: false, message: 'تعداد درخواست‌ها بیش از حد مجاز است' });
    }

    const body = req.body ?? {};
    const fields = normaliseFields(body.fields);
    if (!fields || Object.keys(fields).length === 0) {
      return res.status(400).json({ success: false, message: 'fields الزامی است' });
    }

    const site = clip(body.site, MAX_STRING_LEN) || 'نامشخص';
    const formName = clip(body.form_name ?? body.formName, MAX_STRING_LEN) || 'فرم بدون نام';

    const submission = await prisma.formSubmission.create({
      data: {
        site,
        formName,
        pageUrl: safeUrl(body.page_url ?? body.pageUrl),
        fields,
        ip,
        userAgent: clip(req.headers['user-agent'], MAX_STRING_LEN) || null,
      },
    });

    // Fire-and-forget: a notification failure must never fail the submission.
    (async () => {
      const managers = await prisma.user.findMany({
        where: { role: { in: [...FORM_MANAGERS] } },
        select: { id: true },
      });
      for (const m of managers) {
        await createNotification({
          type: 'FORM_SUBMISSION',
          title: 'فرم جدید',
          message: `«${formName}» از ${site}`,
          userId: m.id,
        });
      }
    })().catch(console.error);

    res.status(201).json({ success: true, id: submission.id });
  } catch (err) {
    console.error('form submit error:', err);
    res.status(500).json({ success: false, message: 'خطا در ثبت فرم' });
  }
});

/* ── Management ─────────────────────────────────────────────────────────── */

router.get('/submissions', authenticate, authorize(...FORM_MANAGERS), async (req: AuthRequest, res: Response) => {
  try {
    const { site, archived, unread } = req.query;
    const where: any = {};
    if (site) where.site = String(site);
    where.archived = archived === 'true';
    if (unread === 'true') where.read = false;

    const submissions = await prisma.formSubmission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    res.json(submissions);
  } catch (err) {
    console.error('list submissions error:', err);
    res.status(500).json({ error: 'Failed to load submissions' });
  }
});

/** Distinct sites and form names, for the filter chips. */
router.get('/sources', authenticate, authorize(...FORM_MANAGERS), async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await prisma.formSubmission.groupBy({
      by: ['site', 'formName'],
      _count: { _all: true },
    });
    res.json(rows.map((r) => ({ site: r.site, formName: r.formName, count: r._count._all })));
  } catch (err) {
    console.error('sources error:', err);
    res.status(500).json({ error: 'Failed to load sources' });
  }
});

router.patch('/submissions/:id', authenticate, authorize(...FORM_MANAGERS), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { read, archived } = req.body as { read?: boolean; archived?: boolean };
    const data: any = {};
    if (typeof read === 'boolean') data.read = read;
    if (typeof archived === 'boolean') data.archived = archived;
    if (!Object.keys(data).length) return res.status(400).json({ error: 'Nothing to update' });

    const updated = await prisma.formSubmission.update({ where: { id }, data });
    res.json(updated);
  } catch (err) {
    console.error('update submission error:', err);
    res.status(500).json({ error: 'Failed to update submission' });
  }
});

router.patch('/submissions/read-all', authenticate, authorize(...FORM_MANAGERS), async (_req: AuthRequest, res: Response) => {
  try {
    await prisma.formSubmission.updateMany({ where: { read: false }, data: { read: true } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark all read' });
  }
});

router.delete('/submissions/:id', authenticate, authorize(...FORM_MANAGERS), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    await prisma.formSubmission.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error('delete submission error:', err);
    res.status(500).json({ error: 'Failed to delete submission' });
  }
});

export default router;
