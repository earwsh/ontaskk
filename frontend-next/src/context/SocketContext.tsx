'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface ChatMessage {
  id: number;
  conversationId: number;
  senderId: number;
  content: string;
  attachments?: string;
  replyToId?: number;
  createdAt: string;
  sender: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
  replyTo?: {
    id: number;
    content: string;
    sender: {
      id: number;
      firstName: string;
      lastName: string;
    };
  };
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  onlineUserIds: number[];
  unreadTotal: number;
  setUnreadTotal: React.Dispatch<React.SetStateAction<number>>;
  latestMessage: ChatMessage | null;
  activeConversationId: number | null;
  setActiveConversationId: (id: number | null) => void;
  requestNotificationPermission: () => Promise<void>;
  playChime: () => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  onlineUserIds: [],
  unreadTotal: 0,
  setUnreadTotal: () => {},
  latestMessage: null,
  activeConversationId: null,
  setActiveConversationId: () => {},
  requestNotificationPermission: async () => {},
  playChime: () => {},
});

// Synthesized audio chime using Web Audio API (zero external files, 100% reliable)
function playNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.1); // A5
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1174.66, now + 0.1); // D6
    gain2.gain.setValueAtTime(0.2, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.45);
  } catch (err) {
    // Ignore autoplay restriction or unsupported
  }
}

// Browser desktop push notification
function showDesktopNotification(senderName: string, text: string, conversationId: number) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    const notif = new Notification(`پیام جدید از ${senderName}`, {
      body: text || '📎 فایل ضمیمه ارسال شد',
      icon: '/favicon.ico',
      dir: 'rtl',
      lang: 'fa',
      tag: `chat-conv-${conversationId}`,
    });

    notif.onclick = () => {
      window.focus();
      if (window.location.pathname !== '/dashboard/chat') {
        window.location.href = '/dashboard/chat';
      }
      notif.close();
    };
  }
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<number[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [latestMessage, setLatestMessage] = useState<ChatMessage | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const activeConvRef = useRef<number | null>(null);
  const currentUserIdRef = useRef<number | null>(null);
  const originalTitleRef = useRef<string>('تسکان | مدیریت پروژه و استارتاپ');

  useEffect(() => {
    activeConvRef.current = activeConversationId;
  }, [activeConversationId]);

  // Request browser notification permission
  const requestNotificationPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        try {
          await Notification.requestPermission();
        } catch {}
      }
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    originalTitleRef.current = document.title || 'تسکان | مدیریت پروژه و استارتاپ';

    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        currentUserIdRef.current = JSON.parse(stored).id;
      }
    } catch {}

    // Auto-request notification permission
    requestNotificationPermission();

    const handleFocus = () => {
      document.title = originalTitleRef.current;
    };
    window.addEventListener('focus', handleFocus);

    const token = localStorage.getItem('token');
    if (!token) return () => window.removeEventListener('focus', handleFocus);

    const socketInstance = io({
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 15,
      reconnectionDelay: 2000,
    });

    socketInstance.on('connect', () => {
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
    });

    socketInstance.on('user_status', ({ userId, status }: { userId: number; status: string }) => {
      setOnlineUserIds((prev) => {
        if (status === 'online') {
          return prev.includes(userId) ? prev : [...prev, userId];
        } else {
          return prev.filter((id) => id !== userId);
        }
      });
    });

    const handleIncomingMessage = (message: ChatMessage) => {
      setLatestMessage(message);

      // If not sent by current user
      if (message.senderId !== currentUserIdRef.current) {
        // Play notification sound
        playNotificationSound();

        const senderName = `${message.sender?.firstName || ''} ${message.sender?.lastName || ''}`.trim() || 'همکار';
        const previewText = message.content ? (message.content.length > 60 ? message.content.substring(0, 60) + '...' : message.content) : '📎 فایل ضمیمه';

        // Check if tab is inactive or not currently on this conversation
        const isBackgroundTab = document.hidden;
        const isNotActiveConversation = activeConvRef.current !== message.conversationId;

        if (isBackgroundTab || isNotActiveConversation) {
          setUnreadTotal((prev) => prev + 1);

          // Update tab title
          document.title = `🔔 ${senderName} | تسکان`;

          // Show Native Desktop/Browser Notification
          showDesktopNotification(senderName, previewText, message.conversationId);
        }
      }
    };

    socketInstance.on('new_message', handleIncomingMessage);
    socketInstance.on('message_notification', ({ message }: { conversationId: number; message: ChatMessage }) => {
      if (message.senderId !== currentUserIdRef.current) {
        handleIncomingMessage(message);
      }
    });

    setSocket(socketInstance);

    return () => {
      window.removeEventListener('focus', handleFocus);
      socketInstance.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        onlineUserIds,
        unreadTotal,
        setUnreadTotal,
        latestMessage,
        activeConversationId,
        setActiveConversationId,
        requestNotificationPermission,
        playChime: playNotificationSound,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export const useChatSocket = () => useContext(SocketContext);
