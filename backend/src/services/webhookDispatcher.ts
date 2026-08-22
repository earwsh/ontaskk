import prisma from '../lib/prisma';
import crypto from 'crypto';

export async function dispatchWebhook(event: string, payload: any) {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: { isActive: true },
    });

    const matching = webhooks.filter((w) => {
      if (w.events === '*' || w.events === 'all') return true;
      const list = w.events.split(',').map((e) => e.trim());
      return list.includes(event) || list.includes('*');
    });

    if (matching.length === 0) return;

    const bodyData = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      data: payload,
    });

    for (const webhook of matching) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'OnTask-Webhook-Dispatcher/1.0',
        'X-OnTask-Event': event,
      };

      if (webhook.secret) {
        const signature = crypto
          .createHmac('sha256', webhook.secret)
          .update(bodyData)
          .digest('hex');
        headers['X-OnTask-Signature'] = `sha256=${signature}`;
      }

      fetch(webhook.targetUrl, {
        method: 'POST',
        headers,
        body: bodyData,
        signal: AbortSignal.timeout(8000),
      }).catch((err) => {
        console.error(`[Webhook] Error sending to ${webhook.targetUrl} (${webhook.id}):`, err.message);
      });
    }
  } catch (err) {
    console.error('[Webhook] Dispatch failed:', err);
  }
}
