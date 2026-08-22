import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import crypto from 'crypto';

const router = Router();

const allowedRoles = ['TECHNICAL_MANAGER'];

// 1. List webhooks
router.get('/', authenticate, authorize(...allowedRoles), async (req: AuthRequest, res: Response) => {
  try {
    const webhooks = await prisma.webhook.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
    res.json(webhooks);
  } catch (err: any) {
    console.error('get webhooks error:', err);
    res.status(500).json({ error: 'Failed to fetch webhooks' });
  }
});

// 2. Create webhook
router.post('/', authenticate, authorize(...allowedRoles), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, targetUrl, events, secret } = req.body;

    if (!name?.trim() || !targetUrl?.trim()) {
      return res.status(400).json({ error: 'Name and Target URL are required' });
    }

    try {
      new URL(targetUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid Target URL' });
    }

    const webhook = await prisma.webhook.create({
      data: {
        name: name.trim(),
        targetUrl: targetUrl.trim(),
        events: events?.trim() || '*',
        secret: secret?.trim() || crypto.randomBytes(24).toString('hex'),
        createdById: userId,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    res.status(201).json(webhook);
  } catch (err: any) {
    console.error('create webhook error:', err);
    res.status(500).json({ error: 'Failed to create webhook' });
  }
});

// 3. Update webhook
router.patch('/:id', authenticate, authorize(...allowedRoles), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { name, targetUrl, events, secret, isActive } = req.body;

    const webhook = await prisma.webhook.update({
      where: { id },
      data: {
        name: name !== undefined ? name.trim() : undefined,
        targetUrl: targetUrl !== undefined ? targetUrl.trim() : undefined,
        events: events !== undefined ? events.trim() : undefined,
        secret: secret !== undefined ? secret.trim() : undefined,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined,
      },
    });

    res.json(webhook);
  } catch (err: any) {
    console.error('update webhook error:', err);
    res.status(500).json({ error: 'Failed to update webhook' });
  }
});

// 4. Delete webhook
router.delete('/:id', authenticate, authorize(...allowedRoles), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    await prisma.webhook.delete({ where: { id } });
    res.json({ message: 'Webhook deleted successfully' });
  } catch (err: any) {
    console.error('delete webhook error:', err);
    res.status(500).json({ error: 'Failed to delete webhook' });
  }
});

// 5. Test webhook dispatch
router.post('/:id/test', authenticate, authorize(...allowedRoles), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const webhook = await prisma.webhook.findUnique({ where: { id } });

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    const testPayload = JSON.stringify({
      event: 'ping',
      timestamp: new Date().toISOString(),
      data: {
        message: 'این یک پیام آزمایشی از سامانه OnTask است.',
        webhookId: webhook.id,
        webhookName: webhook.name,
      },
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'OnTask-Webhook-Dispatcher/1.0',
      'X-OnTask-Event': 'ping',
    };

    if (webhook.secret) {
      const signature = crypto
        .createHmac('sha256', webhook.secret)
        .update(testPayload)
        .digest('hex');
      headers['X-OnTask-Signature'] = `sha256=${signature}`;
    }

    const response = await fetch(webhook.targetUrl, {
      method: 'POST',
      headers,
      body: testPayload,
      signal: AbortSignal.timeout(6000),
    });

    res.json({
      success: true,
      statusCode: response.status,
      statusText: response.statusText,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err.message || 'Failed to connect to target URL',
    });
  }
});

export default router;
