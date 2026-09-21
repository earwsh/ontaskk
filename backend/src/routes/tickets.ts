import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

// GET /tickets - List tickets
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const isManager = ['TECHNICAL_MANAGER', 'CEO', 'INTERNAL_MANAGER', 'STRATEGY_MANAGER'].includes(user.role);

    const where = isManager ? {} : { userId: user.id };

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            role: true,
            position: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(tickets);
  } catch (err: any) {
    console.error('Error fetching tickets:', err);
    res.status(500).json({ error: 'خطا در دریافت تیکت‌ها' });
  }
});

// POST /tickets - Create new ticket
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { title, description, department = 'technical', priority = 'NORMAL' } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'عنوان و شرح تیکت الزامی است.' });
    }

    const ticket = await prisma.ticket.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        department,
        priority,
        userId: user.id,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            role: true,
          },
        },
      },
    });

    // Notify Technical Managers and CEO
    try {
      const managers = await prisma.user.findMany({
        where: {
          role: { in: ['TECHNICAL_MANAGER', 'CEO'] },
          id: { not: user.id },
        },
        select: { id: true },
      });

      if (managers.length > 0) {
        await prisma.notification.createMany({
          data: managers.map((m) => ({
            userId: m.id,
            type: 'TICKET',
            title: 'تیکت جدید ثبت شد',
            message: `${user.firstName} ${user.lastName}: ${title}`,
          })),
        });
      }
    } catch (notifErr) {
      console.error('Failed to create ticket notification:', notifErr);
    }

    res.status(201).json(ticket);
  } catch (err: any) {
    console.error('Error creating ticket:', err);
    res.status(500).json({ error: 'خطا در ثبت تیکت' });
  }
});

// PATCH /tickets/:id - Update ticket status or response
router.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const id = parseInt(req.params.id as string);
    const { status, response } = req.body;

    const isManager = ['TECHNICAL_MANAGER', 'CEO', 'INTERNAL_MANAGER', 'STRATEGY_MANAGER'].includes(user.role);

    const existing = await prisma.ticket.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'تیکت یافت نشد.' });
    }

    if (!isManager && existing.userId !== user.id) {
      return res.status(403).json({ error: 'دسترسی غیرمجاز.' });
    }

    const data: any = {};
    if (status) {
      data.status = status;
      if (status === 'RESOLVED' || status === 'CLOSED') {
        data.resolvedAt = new Date();
      }
    }
    if (response !== undefined) {
      data.response = response;
    }

    const updated = await prisma.ticket.update({
      where: { id },
      data,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            role: true,
          },
        },
      },
    });

    // Notify ticket creator if response added or status changed
    if (existing.userId !== user.id && (status || response)) {
      try {
        await prisma.notification.create({
          data: {
            userId: existing.userId,
            type: 'TICKET_UPDATE',
            title: status === 'RESOLVED' ? 'تیکت شما حل شد' : 'وضعیت تیکت به‌روزرسانی شد',
            message: `تیکت «${existing.title}» بررسی شد.`,
          },
        });
      } catch {}
    }

    res.json(updated);
  } catch (err: any) {
    console.error('Error updating ticket:', err);
    res.status(500).json({ error: 'خطا در به‌روزرسانی تیکت' });
  }
});

export default router;
