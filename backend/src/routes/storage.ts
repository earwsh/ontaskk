import { Router, Response } from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { encryptionReady, encrypt } from '../lib/crypto';
import * as drive from '../lib/googleDrive';
import { storedFileExists, removeStoredFile } from '../lib/uploads';

const router = Router();

/** Only these roles may connect or disconnect the organisation's drive. */
const STORAGE_ADMINS = ['CEO', 'TECHNICAL_MANAGER'];

/* ── Connection state ─────────────────────────────────────────────────── */

router.get('/status', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const account = await prisma.storageAccount.findUnique({ where: { provider: 'GOOGLE_DRIVE' } });
    if (!account) {
      return res.json({
        connected: false,
        configured: drive.driveConfigured(),
        encryptionReady: encryptionReady(),
      });
    }
    let quota = null;
    try { quota = await drive.storageQuota(); } catch { /* token may be revoked; still report connected */ }
    res.json({
      connected: true,
      configured: true,
      encryptionReady: encryptionReady(),
      email: account.accountEmail,
      connectedAt: account.createdAt,
      quota,
    });
  } catch (err) {
    console.error('storage status error:', err);
    res.status(500).json({ error: 'خطا در خواندن وضعیت فضای ذخیره‌سازی' });
  }
});

/* ── OAuth ────────────────────────────────────────────────────────────── */

/**
 * Short-lived one-time states, so the callback cannot be replayed or forged by
 * a third party who lures an admin to the callback URL.
 */
const pendingStates = new Map<string, number>();
setInterval(() => {
  const now = Date.now();
  for (const [s, t] of pendingStates) if (now - t > 10 * 60_000) pendingStates.delete(s);
}, 60_000).unref();

router.get('/google/auth-url', authenticate, authorize(...STORAGE_ADMINS), async (_req: AuthRequest, res: Response) => {
  if (!drive.driveConfigured()) {
    return res.status(400).json({ error: 'GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET در سرور تنظیم نشده‌اند' });
  }
  if (!encryptionReady()) {
    return res.status(400).json({ error: 'ENCRYPTION_KEY در سرور تنظیم نشده است' });
  }
  const state = crypto.randomBytes(24).toString('base64url');
  pendingStates.set(state, Date.now());
  res.json({ url: drive.authUrl(state), redirectUri: drive.redirectUri() });
});

/**
 * Google redirects the browser here. No session cookie is involved, so the
 * `state` value proves this callback belongs to an auth-url we just issued.
 */
router.get('/google/callback', async (req: AuthRequest, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;
  const done = (msg: string, ok: boolean) =>
    res.send(`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;direction:rtl;text-align:center;padding:3rem">
      <h2>${ok ? '✅' : '❌'} ${msg}</h2><p>می‌توانید این پنجره را ببندید.</p>
      <script>setTimeout(()=>window.close(),2500)</script></body>`);

  if (error) return done(`اتصال لغو شد: ${error}`, false);
  if (!state || !pendingStates.has(state)) return done('درخواست نامعتبر یا منقضی شده است', false);
  pendingStates.delete(state);
  if (!code) return done('کد بازگشتی از گوگل دریافت نشد', false);

  try {
    const tokens = await drive.exchangeCode(code);
    if (!tokens.refresh_token) {
      return done('گوگل refresh token نداد. در حساب گوگل دسترسی قبلی برنامه را حذف کنید و دوباره تلاش کنید.', false);
    }
    const email = await drive.userEmail(tokens.access_token);
    await prisma.storageAccount.upsert({
      where: { provider: 'GOOGLE_DRIVE' },
      create: { provider: 'GOOGLE_DRIVE', refreshTokenEnc: encrypt(tokens.refresh_token), accountEmail: email },
      update: { refreshTokenEnc: encrypt(tokens.refresh_token), accountEmail: email, rootFolderId: null },
    });
    drive.clearTokenCache();
    done(`گوگل درایو متصل شد${email ? ` (${email})` : ''}`, true);
  } catch (err: any) {
    console.error('google callback error:', err);
    done(`خطا در اتصال: ${err.message || 'نامشخص'}`, false);
  }
});

router.delete('/google', authenticate, authorize(...STORAGE_ADMINS), async (_req: AuthRequest, res: Response) => {
  try {
    await prisma.storageAccount.deleteMany({ where: { provider: 'GOOGLE_DRIVE' } });
    // Folder ids point into an account we no longer hold; clear them so a future
    // connection rebuilds its own structure instead of writing to dead ids.
    await prisma.project.updateMany({ data: { driveFolderId: null } });
    await prisma.task.updateMany({ data: { driveFolderId: null } });
    drive.clearTokenCache();
    res.json({ success: true });
  } catch (err) {
    console.error('disconnect error:', err);
    res.status(500).json({ error: 'خطا در قطع اتصال' });
  }
});

/* ── Upload ───────────────────────────────────────────────────────────── */

/** Anyone who can see the task may attach to it; reuse the task's own guard. */
async function canAccessTask(taskId: number, user: any): Promise<{ ok: boolean; projectId?: number }> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, assignees: { select: { userId: true } },
              project: { select: { qcId: true, members: { select: { userId: true } } } } },
  });
  if (!task) return { ok: false };
  const orgWide = ['CEO', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'INTERNAL_MANAGER', 'DEPARTMENT_MANAGER'];
  const ok =
    orgWide.includes(user.role) ||
    task.assignees.some((a) => a.userId === user.id) ||
    task.project?.members.some((m) => m.userId === user.id) ||
    task.project?.qcId === user.id;
  return { ok: !!ok, projectId: task.projectId ?? undefined };
}

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

router.post('/upload-session', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { taskId, filename, mimeType, sizeBytes } = req.body as {
      taskId: number; filename: string; mimeType: string; sizeBytes?: number;
    };
    if (!taskId || !filename) return res.status(400).json({ error: 'taskId و filename الزامی است' });
    if (sizeBytes && sizeBytes > MAX_UPLOAD_BYTES) {
      return res.status(413).json({ error: 'حجم فایل بیش از ۲ گیگابایت است' });
    }

    const access = await canAccessTask(taskId, req.user);
    if (!access.ok) return res.status(403).json({ error: 'به این تسک دسترسی ندارید' });
    if (!access.projectId) return res.status(400).json({ error: 'این تسک به پروژه‌ای متصل نیست' });

    const folderId = await drive.folderForTask(access.projectId, taskId);
    const uploadUrl = await drive.createUploadSession({
      filename: String(filename).slice(0, 255),
      mimeType: mimeType || 'application/octet-stream',
      folderId,
      sizeBytes,
    });
    res.json({ uploadUrl });
  } catch (err: any) {
    console.error('upload-session error:', err);
    res.status(500).json({ error: err.message || 'خطا در آماده‌سازی آپلود' });
  }
});

/** Called after the browser finishes PUTting bytes to Google. */
router.post('/complete', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { taskId, fileId } = req.body as { taskId: number; fileId: string };
    if (!taskId || !fileId) return res.status(400).json({ error: 'taskId و fileId الزامی است' });

    const access = await canAccessTask(taskId, req.user);
    if (!access.ok) return res.status(403).json({ error: 'به این تسک دسترسی ندارید' });

    const file = await drive.shareFile(fileId);
    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId,
        userId: req.user!.id,
        filename: file.name,
        fileUrl: file.webViewLink,
        mimeType: file.mimeType || null,
        provider: 'GOOGLE_DRIVE',
        externalId: file.id,
        thumbnailUrl: file.thumbnailLink || null,
        sizeBytes: file.size ? BigInt(file.size) : null,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    res.status(201).json({ ...attachment, sizeBytes: attachment.sizeBytes?.toString() ?? null });
  } catch (err: any) {
    console.error('complete error:', err);
    res.status(500).json({ error: err.message || 'خطا در ثبت فایل' });
  }
});

router.get('/attachments/:taskId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId as string);
    const access = await canAccessTask(taskId, req.user);
    if (!access.ok) return res.status(403).json({ error: 'به این تسک دسترسی ندارید' });

    const items = await prisma.taskAttachment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    // A row is not proof the bytes are still there. Say so plainly instead of
    // handing back a link that quietly does nothing when clicked.
    res.json(items.map((a) => ({
      ...a,
      sizeBytes: a.sizeBytes?.toString() ?? null,
      available: a.provider === 'LOCAL' ? storedFileExists(a.fileUrl) : true,
    })));
  } catch (err) {
    console.error('list attachments error:', err);
    res.status(500).json({ error: 'خطا در خواندن فایل‌ها' });
  }
});

router.delete('/attachments/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const att = await prisma.taskAttachment.findUnique({ where: { id } });
    if (!att) return res.status(404).json({ error: 'فایل پیدا نشد' });

    // The uploader or a manager may remove it.
    const isManager = ['CEO', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'INTERNAL_MANAGER'].includes(req.user!.role);
    if (att.userId !== req.user!.id && !isManager) {
      return res.status(403).json({ error: 'فقط آپلودکننده یا مدیر می‌تواند حذف کند' });
    }

    if (att.provider === 'GOOGLE_DRIVE' && att.externalId) {
      await drive.deleteFile(att.externalId);
    } else {
      removeStoredFile(att.fileUrl);
    }
    await prisma.taskAttachment.delete({ where: { id } });
    res.json({ success: true });
  } catch (err: any) {
    console.error('delete attachment error:', err);
    res.status(500).json({ error: err.message || 'خطا در حذف فایل' });
  }
});

export default router;
