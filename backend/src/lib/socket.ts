import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from './prisma';
import { dispatchWebhook } from '../services/webhookDispatcher';

interface UserPayload {
  id: number;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

interface AuthenticatedSocket extends Socket {
  user?: UserPayload;
}

let ioInstance: Server | null = null;
const onlineUsers = new Map<number, Set<string>>(); // userId -> Set of socket IDs

export function initSocketIO(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
    pingTimeout: 30000,
    pingInterval: 15000,
  });

  ioInstance = io;

  // Middleware for JWT Authentication
  io.use((socket: AuthenticatedSocket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.split(' ')[1] ||
      socket.handshake.query?.token;

    if (!token || typeof token !== 'string') {
      return next(new Error('Authentication error: Token missing'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as UserPayload;
      socket.user = decoded;
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const user = socket.user;
    if (!user) {
      socket.disconnect();
      return;
    }

    const userId = user.id;

    // Register user socket
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId)!.add(socket.id);

    // Join personal room for private notifications
    socket.join(`user_${userId}`);

    // Broadcast online status
    io.emit('user_status', { userId, status: 'online' });

    // Join a conversation room
    socket.on('join_conversation', async (conversationId: number) => {
      // Verify user is participant
      const participant = await prisma.chatParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });
      if (participant) {
        socket.join(`conv_${conversationId}`);
      }
    });

    // Leave a conversation room
    socket.on('leave_conversation', (conversationId: number) => {
      socket.leave(`conv_${conversationId}`);
    });

    // Send a message
    socket.on(
      'send_message',
      async (
        data: {
          conversationId: number;
          content: string;
          attachments?: string;
          replyToId?: number;
        },
        callback?: (res: any) => void
      ) => {
        try {
          const { conversationId, content, attachments, replyToId } = data;
          if (!content?.trim() && !attachments) {
            if (callback) callback({ error: 'Message content cannot be empty' });
            return;
          }

          // Verify participation
          const isMember = await prisma.chatParticipant.findUnique({
            where: { conversationId_userId: { conversationId, userId } },
          });

          if (!isMember) {
            if (callback) callback({ error: 'You are not a participant in this conversation' });
            return;
          }

          // Save message to DB
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

          // Update conversation updatedAt
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
          });

          // Update sender's lastReadAt
          await prisma.chatParticipant.update({
            where: { conversationId_userId: { conversationId, userId } },
            data: { lastReadAt: new Date() },
          });

          // Broadcast to conversation room
          io.to(`conv_${conversationId}`).emit('new_message', message);

          // Notify all other participants in the conversation
          const participants = await prisma.chatParticipant.findMany({
            where: { conversationId, userId: { not: userId } },
            select: { userId: true },
          });

          for (const p of participants) {
            io.to(`user_${p.userId}`).emit('message_notification', {
              conversationId,
              message,
            });
          }

          // Trigger Webhooks
          dispatchWebhook('chat.message_created', {
            messageId: message.id,
            conversationId,
            sender: {
              id: user.id,
              name: `${user.firstName} ${user.lastName}`,
              email: user.email,
            },
            content: message.content,
            hasAttachments: !!message.attachments,
            createdAt: message.createdAt,
          });

          if (callback) callback({ success: true, message });
        } catch (err: any) {
          console.error('[Socket] Error in send_message:', err);
          if (callback) callback({ error: 'Failed to send message' });
        }
      }
    );

    // Typing indicators
    socket.on('typing', ({ conversationId }: { conversationId: number }) => {
      socket.to(`conv_${conversationId}`).emit('user_typing', {
        conversationId,
        userId,
        userName: `${user.firstName} ${user.lastName}`,
      });
    });

    socket.on('stop_typing', ({ conversationId }: { conversationId: number }) => {
      socket.to(`conv_${conversationId}`).emit('user_stop_typing', {
        conversationId,
        userId,
      });
    });

    // Mark as read
    socket.on('mark_read', async ({ conversationId }: { conversationId: number }) => {
      try {
        await prisma.chatParticipant.update({
          where: { conversationId_userId: { conversationId, userId } },
          data: { lastReadAt: new Date() },
        });

        socket.to(`conv_${conversationId}`).emit('messages_read', {
          conversationId,
          userId,
          readAt: new Date(),
        });
      } catch (err) {
        // ignore
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          io.emit('user_status', { userId, status: 'offline' });
        }
      }
    });
  });

  return io;
}

export function getIO(): Server | null {
  return ioInstance;
}

export function notifyUser(userId: number, event: string, payload: any) {
  if (ioInstance) {
    ioInstance.to(`user_${userId}`).emit(event, payload);
  }
}

export function broadcastEvent(event: string, payload: any) {
  if (ioInstance) {
    ioInstance.emit(event, payload);
  }
}

export function isUserOnline(userId: number): boolean {
  return onlineUsers.has(userId) && (onlineUsers.get(userId)?.size || 0) > 0;
}
