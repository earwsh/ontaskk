import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { getIO, isUserOnline } from '../lib/socket';
import { dispatchWebhook } from '../services/webhookDispatcher';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'chat-' + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

// 1. Get available users for chat
router.get('/users', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const users = await prisma.user.findMany({
      where: { id: { not: currentUserId } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        position: true,
      },
      orderBy: { firstName: 'asc' },
    });

    const withStatus = users.map((u) => ({
      ...u,
      isOnline: isUserOnline(u.id),
    }));

    res.json(withStatus);
  } catch (err: any) {
    console.error('get chat users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// 2. Get list of conversations for current user
router.get('/conversations', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const participants = await prisma.chatParticipant.findMany({
      where: { userId },
      select: {
        conversationId: true,
        lastReadAt: true,
      },
    });

    const convIds = participants.map((p) => p.conversationId);

    const conversations = await prisma.conversation.findMany({
      where: { id: { in: convIds } },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
              },
            },
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Compute unread counts and enrich format
    const formatted = await Promise.all(
      conversations.map(async (conv) => {
        const userPart = participants.find((p) => p.conversationId === conv.id);
        const lastReadAt = userPart?.lastReadAt || new Date(0);

        const unreadCount = await prisma.chatMessage.count({
          where: {
            conversationId: conv.id,
            senderId: { not: userId },
            createdAt: { gt: lastReadAt },
          },
        });

        // Determine title and avatar
        let title = conv.title;
        let otherUser = null;

        if (conv.type === 'DIRECT') {
          const otherParticipant = conv.participants.find((p) => p.userId !== userId);
          if (otherParticipant) {
            otherUser = {
              ...otherParticipant.user,
              isOnline: isUserOnline(otherParticipant.user.id),
            };
            title = `${otherParticipant.user.firstName} ${otherParticipant.user.lastName}`;
          }
        }

        return {
          id: conv.id,
          type: conv.type,
          title: title || 'گفتگو',
          taskId: conv.taskId,
          departmentId: conv.departmentId,
          updatedAt: conv.updatedAt,
          otherUser,
          participants: conv.participants.map((p) => ({
            userId: p.userId,
            user: p.user,
            isOnline: isUserOnline(p.userId),
            lastReadAt: p.lastReadAt,
          })),
          lastMessage: conv.messages[0] || null,
          unreadCount,
        };
      })
    );

    res.json(formatted);
  } catch (err: any) {
    console.error('get conversations error:', err);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// 3. Get or create direct conversation
router.post('/conversations/direct', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const { targetUserId } = req.body;

    if (!targetUserId || targetUserId === currentUserId) {
      return res.status(400).json({ error: 'Invalid target user' });
    }

    // Find existing direct conversation between these two
    const existing = await prisma.conversation.findFirst({
      where: {
        type: 'DIRECT',
        AND: [
          { participants: { some: { userId: currentUserId } } },
          { participants: { some: { userId: targetUserId } } },
        ],
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (existing) {
      return res.json(existing);
    }

    // Create new direct conversation
    const newConv = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        participants: {
          create: [{ userId: currentUserId }, { userId: targetUserId }],
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
              },
            },
          },
        },
      },
    });

    // Notify target user via socket
    const io = getIO();
    if (io) {
      io.to(`user_${targetUserId}`).emit('conversation_created', newConv);
    }

    res.status(201).json(newConv);
  } catch (err: any) {
    console.error('create direct conv error:', err);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// 4. Create group conversation
router.post('/conversations/group', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const { title, participantIds } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({ error: 'Group title is required' });
    }

    const allUserIds = Array.from(new Set([currentUserId, ...(participantIds || [])]));
    if (allUserIds.length < 2) {
      return res.status(400).json({ error: 'At least 2 participants required' });
    }

    const newConv = await prisma.conversation.create({
      data: {
        type: 'GROUP',
        title: title.trim(),
        participants: {
          create: allUserIds.map((uid: number) => ({ userId: uid })),
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
              },
            },
          },
        },
      },
    });

    const io = getIO();
    if (io) {
      allUserIds.forEach((uid) => {
        io.to(`user_${uid}`).emit('conversation_created', newConv);
      });
    }

    res.status(201).json(newConv);
  } catch (err: any) {
    console.error('create group conv error:', err);
    res.status(500).json({ error: 'Failed to create group conversation' });
  }
});

// 5. Get messages for conversation
router.get('/conversations/:id/messages', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const conversationId = parseInt(req.params.id as string);

    // Verify membership
    const isMember = await prisma.chatParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });

    if (!isMember) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = await prisma.chatMessage.findMany({
      where: { conversationId, isDeleted: false },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        replyTo: {
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    // Update lastReadAt
    await prisma.chatParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    });

    res.json(messages);
  } catch (err: any) {
    console.error('get messages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// 6. Upload attachment in chat
router.post('/upload', authenticate, upload.single('file'), (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const fileUrl = `/uploads/${file.filename}`;
    res.json({
      url: fileUrl,
      filename: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Upload failed' });
  }
});

// 7. REST endpoint to send message
router.post('/conversations/:id/messages', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const conversationId = parseInt(req.params.id as string);
    const { content, attachments, replyToId } = req.body;

    const isMember = await prisma.chatParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });

    if (!isMember) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const message = await prisma.chatMessage.create({
      data: {
        conversationId,
        senderId: userId,
        content: content ? content.trim() : '',
        attachments,
        replyToId,
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        replyTo: {
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    await prisma.chatParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    });

    const io = getIO();
    if (io) {
      io.to(`conv_${conversationId}`).emit('new_message', message);

      const otherParticipants = await prisma.chatParticipant.findMany({
        where: { conversationId, userId: { not: userId } },
        select: { userId: true },
      });

      for (const p of otherParticipants) {
        io.to(`user_${p.userId}`).emit('message_notification', {
          conversationId,
          message,
        });
      }
    }

    dispatchWebhook('chat.message_created', {
      messageId: message.id,
      conversationId,
      sender: {
        id: req.user!.id,
        name: `${req.user!.firstName} ${req.user!.lastName}`,
      },
      content: message.content,
      createdAt: message.createdAt,
    });

    res.status(201).json(message);
  } catch (err: any) {
    console.error('send message error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
