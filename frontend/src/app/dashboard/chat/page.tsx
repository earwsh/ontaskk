'use client';

import { useState, useEffect, useRef } from 'react';
import { useChatSocket } from '@/context/SocketContext';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';

interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  position?: string;
  isOnline?: boolean;
}

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

interface Conversation {
  id: number;
  type: 'DIRECT' | 'GROUP' | 'TASK' | 'DEPARTMENT';
  title: string;
  taskId?: number;
  updatedAt: string;
  otherUser?: User | null;
  participants: {
    userId: number;
    user: User;
    isOnline: boolean;
  }[];
  lastMessage?: ChatMessage | null;
  unreadCount: number;
}

function formatPersianTime(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
}

function formatPersianDate(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('fa-IR', { month: 'long', day: 'numeric' });
}

export default function ChatPage() {
  const { socket, isConnected, onlineUserIds, activeConversationId, setActiveConversationId, requestNotificationPermission } = useChatSocket();
  const { showToast } = useToast();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loadingConv, setLoadingConv] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('granted');

  // New Chat Modal
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [chatType, setChatType] = useState<'DIRECT' | 'GROUP'>('DIRECT');
  const [groupTitle, setGroupTitle] = useState('');
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [searchUserQuery, setSearchUserQuery] = useState('');
  const [searchConvQuery, setSearchConvQuery] = useState('');

  // Upload & Reply
  const [uploading, setUploading] = useState(false);
  const [replyMessage, setReplyMessage] = useState<ChatMessage | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission);
    }
  }, []);

  // Load current user
  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        const u = JSON.parse(stored);
        setCurrentUserId(u.id);
      }
    } catch {}
  }, []);

  // Fetch conversations
  const fetchConversations = async () => {
    try {
      const { data } = await api.get('/chat/conversations');
      setConversations(data);
      if (data.length > 0 && !activeConv) {
        selectConversation(data[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingConv(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, []);

  // Fetch available users when modal opens
  useEffect(() => {
    if (showNewChatModal) {
      api.get('/chat/users').then(({ data }) => setAvailableUsers(data)).catch(() => {});
    }
  }, [showNewChatModal]);

  // Select conversation
  const selectConversation = async (conv: Conversation) => {
    setActiveConv(conv);
    setActiveConversationId(conv.id);
    setReplyMessage(null);
    setLoadingMsgs(true);

    if (socket) {
      if (activeConv?.id) {
        socket.emit('leave_conversation', activeConv.id);
      }
      socket.emit('join_conversation', conv.id);
      socket.emit('mark_read', { conversationId: conv.id });
    }

    try {
      const { data } = await api.get(`/chat/conversations/${conv.id}/messages`);
      setMessages(data);
      // Reset unread count locally
      setConversations((prev) =>
        prev.map((c) => (c.id === conv.id ? { ...c, unreadCount: 0 } : c))
      );
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMsgs(false);
      setTimeout(() => scrollToBottom(), 100);
    }
  };

  // Scroll to bottom helper
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Socket listener for new messages
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (msg: ChatMessage) => {
      if (activeConv && msg.conversationId === activeConv.id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        socket.emit('mark_read', { conversationId: activeConv.id });
      }

      setConversations((prev) => {
        return prev.map((c) => {
          if (c.id === msg.conversationId) {
            return {
              ...c,
              lastMessage: msg,
              updatedAt: msg.createdAt,
              unreadCount: activeConv?.id === msg.conversationId ? 0 : c.unreadCount + 1,
            };
          }
          return c;
        }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      });
    };

    const handleUserTyping = ({ conversationId, userName }: { conversationId: number; userName: string }) => {
      if (activeConv?.id === conversationId) {
        setTypingUsers((prev) => (prev.includes(userName) ? prev : [...prev, userName]));
      }
    };

    const handleUserStopTyping = ({ conversationId, userId }: { conversationId: number; userId: number }) => {
      if (activeConv?.id === conversationId) {
        setTypingUsers([]);
      }
    };

    const handleConvCreated = (newConv: Conversation) => {
      fetchConversations();
    };

    socket.on('new_message', handleNewMessage);
    socket.on('user_typing', handleUserTyping);
    socket.on('user_stop_typing', handleUserStopTyping);
    socket.on('conversation_created', handleConvCreated);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('user_typing', handleUserTyping);
      socket.off('user_stop_typing', handleUserStopTyping);
      socket.off('conversation_created', handleConvCreated);
    };
  }, [socket, activeConv]);

  // Handle typing input
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (!socket || !activeConv) return;

    socket.emit('typing', { conversationId: activeConv.id });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stop_typing', { conversationId: activeConv.id });
    }, 2000);
  };

  // Send message
  const handleSendMessage = async (e?: React.FormEvent, attachmentUrl?: string) => {
    if (e) e.preventDefault();
    const content = inputText.trim();
    if (!content && !attachmentUrl) return;
    if (!activeConv) return;

    setSending(true);

    const payload = {
      conversationId: activeConv.id,
      content,
      attachments: attachmentUrl || undefined,
      replyToId: replyMessage?.id || undefined,
    };

    if (socket && isConnected) {
      socket.emit('send_message', payload, (res: any) => {
        if (res?.error) {
          showToast(res.error, 'error');
        }
        setSending(false);
      });
    } else {
      // Fallback REST
      try {
        const { data } = await api.post(`/chat/conversations/${activeConv.id}/messages`, payload);
        setMessages((prev) => [...prev, data]);
      } catch (err: any) {
        showToast('خطا در ارسال پیام', 'error');
      } finally {
        setSending(false);
      }
    }

    setInputText('');
    setReplyMessage(null);
    if (socket && activeConv) {
      socket.emit('stop_typing', { conversationId: activeConv.id });
    }
  };

  // Handle File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConv) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data } = await api.post('/chat/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await handleSendMessage(undefined, data.url);
      showToast('فایل با موفقیت ارسال شد');
    } catch (err: any) {
      showToast('خطا در آپلود فایل', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Create Direct / Group conversation
  const handleCreateChat = async () => {
    if (chatType === 'DIRECT') {
      if (selectedUserIds.length !== 1) return;
      try {
        const { data } = await api.post('/chat/conversations/direct', {
          targetUserId: selectedUserIds[0],
        });
        setShowNewChatModal(false);
        setSelectedUserIds([]);
        await fetchConversations();
        selectConversation(data);
      } catch (err: any) {
        showToast(err.response?.data?.error || 'خطا در ایجاد گفتگو', 'error');
      }
    } else {
      if (!groupTitle.trim() || selectedUserIds.length === 0) {
        showToast('لطفاً عنوان گروه و حداقل یک کاربر را انتخاب کنید', 'error');
        return;
      }
      try {
        const { data } = await api.post('/chat/conversations/group', {
          title: groupTitle.trim(),
          participantIds: selectedUserIds,
        });
        setShowNewChatModal(false);
        setGroupTitle('');
        setSelectedUserIds([]);
        await fetchConversations();
        selectConversation(data);
      } catch (err: any) {
        showToast(err.response?.data?.error || 'خطا در ایجاد گروه', 'error');
      }
    }
  };

  const filteredConversations = conversations.filter((c) => {
    if (!searchConvQuery.trim()) return true;
    return c.title?.toLowerCase().includes(searchConvQuery.toLowerCase());
  });

  const filteredUsers = availableUsers.filter((u) => {
    const q = searchUserQuery.toLowerCase();
    return (
      u.firstName?.toLowerCase().includes(q) ||
      u.lastName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col bg-card border border-[rgba(255,255,255,0.06)] rounded-[24px] overflow-hidden shadow-2xl animate-fade-in" dir="rtl">
      <div className="flex-1 flex min-h-0">
        {/* Left Sidebar: Conversations list */}
        <div className="w-80 md:w-96 border-l border-[rgba(255,255,255,0.06)] flex flex-col bg-[rgba(15,19,29,0.5)] shrink-0">
          {/* Sidebar Header */}
          <div className="p-4 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h2 className="text-base font-bold text-white">پیام‌رسان سازمانی</h2>
            </div>
            <button
              onClick={() => setShowNewChatModal(true)}
              className="px-3 py-1.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              گفتگوی جدید
            </button>
          </div>

          {/* Search Bar */}
          <div className="p-3 border-b border-[rgba(255,255,255,0.04)] shrink-0">
            <div className="relative">
              <input
                type="text"
                value={searchConvQuery}
                onChange={(e) => setSearchConvQuery(e.target.value)}
                placeholder="جستجو در گفتگوها..."
                className="w-full pl-3 pr-9 py-2 bg-[rgba(22,27,38,0.6)] border border-[rgba(255,255,255,0.06)] rounded-xl text-xs text-white placeholder-text-muted focus:outline-none focus:border-primary/50 transition-all"
              />
              <svg className="w-4 h-4 text-text-muted absolute right-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Desktop Notification Banner */}
          {notifPermission === 'default' && (
            <div className="p-3 bg-primary/10 border-b border-primary/20 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 text-primary text-[11px] min-w-0">
                <svg className="w-4 h-4 shrink-0 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span className="truncate">دریافت اعلان پیام‌ها در پس‌زمینه</span>
              </div>
              <button
                onClick={async () => {
                  await requestNotificationPermission();
                  if (typeof window !== 'undefined' && 'Notification' in window) {
                    setNotifPermission(Notification.permission);
                  }
                }}
                className="px-2.5 py-1 bg-primary hover:bg-primary-hover text-white rounded-lg text-[10px] font-bold shrink-0 transition-all cursor-pointer"
              >
                فعال‌سازی
              </button>
            </div>
          )}

          {/* Conversations Scrollable List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[rgba(255,255,255,0.02)]">
            {loadingConv ? (
              <div className="p-8 text-center text-text-muted text-xs">در حال دریافت گفتگوها...</div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-text-muted text-xs flex flex-col items-center gap-2">
                <svg className="w-10 h-10 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                گفتگویی یافت نشد
              </div>
            ) : (
              filteredConversations.map((c) => {
                const isSelected = activeConv?.id === c.id;
                const isUserOnlineStatus = c.type === 'DIRECT' && c.otherUser ? onlineUserIds.includes(c.otherUser.id) : false;

                return (
                  <div
                    key={c.id}
                    onClick={() => selectConversation(c)}
                    className={`p-3.5 flex items-center gap-3 cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-primary/10 border-r-2 border-primary'
                        : 'hover:bg-[rgba(255,255,255,0.03)]'
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                        {c.type === 'GROUP' ? (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                        ) : (
                          c.title.charAt(0) || '?'
                        )}
                      </div>
                      {c.type === 'DIRECT' && (
                        <span
                          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-surface ${
                            isUserOnlineStatus ? 'bg-emerald-500' : 'bg-zinc-600'
                          }`}
                        />
                      )}
                    </div>

                    {/* Meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-white truncate block max-w-[140px]">{c.title}</span>
                        {c.lastMessage && (
                          <span className="text-[10px] text-text-muted shrink-0">
                            {formatPersianTime(c.lastMessage.createdAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-text-muted truncate">
                          {c.lastMessage ? (
                            c.lastMessage.attachments ? '📎 فایل ضمیمه' : c.lastMessage.content
                          ) : (
                            'شروع گفتگو...'
                          )}
                        </p>
                        {c.unreadCount > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1 bg-primary text-white rounded-full text-[10px] font-bold flex items-center justify-center shrink-0">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Area: Active Chat Conversation */}
        <div className="flex-1 flex flex-col bg-[rgba(10,13,20,0.4)] min-w-0">
          {activeConv ? (
            <>
              {/* Chat Header */}
              <div className="h-16 px-6 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between bg-[rgba(22,27,38,0.4)] shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-sm">
                    {activeConv.type === 'GROUP' ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    ) : (
                      activeConv.title.charAt(0) || '?'
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{activeConv.title}</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {activeConv.type === 'DIRECT' && activeConv.otherUser ? (
                        <>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              onlineUserIds.includes(activeConv.otherUser.id) ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
                            }`}
                          />
                          <span className="text-[11px] text-text-muted">
                            {onlineUserIds.includes(activeConv.otherUser.id) ? 'آنلاین' : 'آفلاین'}
                          </span>
                        </>
                      ) : (
                        <span className="text-[11px] text-text-muted">{activeConv.participants.length} عضو</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Messages Thread */}
              <div className="flex-1 p-6 overflow-y-auto space-y-4">
                {loadingMsgs ? (
                  <div className="flex items-center justify-center h-full text-text-muted text-xs">
                    در حال بارگذاری پیام‌ها...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-text-muted text-xs gap-2">
                    <svg className="w-12 h-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    پیامی در این گفتگو وجود ندارد. اولین پیام را ارسال کنید!
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMe = msg.senderId === currentUserId;
                    const isImage = msg.attachments && /\.(jpg|jpeg|png|webp|gif)$/i.test(msg.attachments);
                    const isAudio = msg.attachments && /\.(mp3|wav|ogg|m4a|aac)$/i.test(msg.attachments);

                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-3 max-w-[75%] ${isMe ? 'mr-auto flex-row-reverse' : 'ml-auto flex-row'}`}
                      >
                        {!isMe && (
                          <div className="w-8 h-8 rounded-xl bg-card border border-[rgba(255,255,255,0.08)] text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-1">
                            {msg.sender.firstName.charAt(0)}
                          </div>
                        )}

                        <div className="group relative">
                          <div
                            className={`rounded-2xl p-3.5 shadow-md ${
                              isMe
                                ? 'bg-primary text-white rounded-tr-sm'
                                : 'bg-[rgba(22,27,38,0.85)] border border-[rgba(255,255,255,0.06)] text-zinc-100 rounded-tl-sm'
                            }`}
                          >
                            {!isMe && activeConv.type === 'GROUP' && (
                              <p className="text-[11px] font-bold text-primary mb-1">
                                {msg.sender.firstName} {msg.sender.lastName}
                              </p>
                            )}

                            {/* Reply Header if replied */}
                            {msg.replyTo && (
                              <div
                                className={`mb-2 p-2 rounded-lg text-xs border-r-2 ${
                                  isMe
                                    ? 'bg-black/20 border-white/60 text-white/90'
                                    : 'bg-[rgba(255,255,255,0.05)] border-primary text-text-muted'
                                }`}
                              >
                                <span className="font-semibold block text-[10px]">
                                  {msg.replyTo.sender.firstName} {msg.replyTo.sender.lastName}
                                </span>
                                <p className="truncate line-clamp-1">{msg.replyTo.content}</p>
                              </div>
                            )}

                            {/* Message Content */}
                            {msg.content && <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>}

                            {/* Attachments */}
                            {msg.attachments && (
                              <div className="mt-2">
                                {isImage ? (
                                  <a href={msg.attachments} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden max-w-[280px]">
                                    <img src={msg.attachments} alt="attachment" className="w-full object-cover max-h-60 rounded-lg hover:scale-105 transition-transform" />
                                  </a>
                                ) : isAudio ? (
                                  <audio src={msg.attachments} controls className="w-full h-8 scale-95" />
                                ) : (
                                  <a
                                    href={msg.attachments}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 p-2 bg-black/20 rounded-lg text-xs hover:underline"
                                  >
                                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span className="truncate">دانلود فایل ضمیمه</span>
                                  </a>
                                )}
                              </div>
                            )}

                            {/* Timestamp */}
                            <div className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${isMe ? 'text-white/75' : 'text-text-muted'}`}>
                              <span>{formatPersianTime(msg.createdAt)}</span>
                            </div>
                          </div>

                          {/* Quick Reply Button on hover */}
                          <button
                            onClick={() => setReplyMessage(msg)}
                            className={`absolute top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-card border border-[rgba(255,255,255,0.1)] rounded-lg text-text-muted hover:text-white ${
                              isMe ? '-left-8' : '-right-8'
                            }`}
                            title="پاسخ دادن"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Typing status */}
                {typingUsers.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-text-muted animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-primary" />
                    <span>{typingUsers.join('، ')} در حال نوشتن...</span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Reply Preview Bar */}
              {replyMessage && (
                <div className="px-6 py-2 bg-[rgba(22,27,38,0.7)] border-t border-[rgba(255,255,255,0.06)] flex items-center justify-between text-xs text-text-muted">
                  <div className="flex items-center gap-2 truncate">
                    <svg className="w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                    <span>پاسخ به <strong>{replyMessage.sender.firstName} {replyMessage.sender.lastName}</strong>:</span>
                    <span className="truncate">{replyMessage.content}</span>
                  </div>
                  <button onClick={() => setReplyMessage(null)} className="p-1 hover:text-white transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Message Input Box */}
              <form onSubmit={handleSendMessage} className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-[rgba(15,19,29,0.7)] flex items-end gap-3 shrink-0">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                />

                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 rounded-xl bg-[rgba(255,255,255,0.05)] text-text-muted hover:text-white hover:bg-[rgba(255,255,255,0.1)] transition-all cursor-pointer disabled:opacity-50 shrink-0"
                  title="ارسال فایل یا عکس"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.414a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </button>

                <div className="flex-1 relative">
                  <textarea
                    rows={1}
                    value={inputText}
                    onChange={handleInputChange}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="پیام خود را بنویسید (Enter برای ارسال)..."
                    className="w-full px-4 py-2.5 bg-[rgba(22,27,38,0.8)] border border-[rgba(255,255,255,0.08)] rounded-xl text-xs text-white placeholder-text-muted focus:outline-none focus:border-primary/50 resize-none max-h-28 transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={sending || (!inputText.trim() && !uploading)}
                  className="p-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0 shadow-md"
                  title="ارسال پیام"
                >
                  <svg className="w-5 h-5 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-text-muted text-sm gap-3">
              <div className="w-16 h-16 rounded-3xl bg-primary/10 text-primary flex items-center justify-center">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p>یک گفتگو را از منوی سمت راست انتخاب کنید یا گفتگوی جدیدی بسازید.</p>
            </div>
          )}
        </div>
      </div>

      {/* New Chat Modal */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-[rgba(255,255,255,0.08)] rounded-[24px] w-full max-w-lg overflow-hidden shadow-2xl animate-scale-in">
            <div className="px-6 py-4 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
              <h3 className="text-base font-bold text-white">ایجاد گفتگوی جدید</h3>
              <button onClick={() => setShowNewChatModal(false)} className="text-text-muted hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Type Switcher */}
              <div className="flex bg-[rgba(22,27,38,0.8)] p-1 rounded-xl border border-[rgba(255,255,255,0.06)]">
                <button
                  type="button"
                  onClick={() => { setChatType('DIRECT'); setSelectedUserIds([]); }}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                    chatType === 'DIRECT' ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-white'
                  }`}
                >
                  چت خصوصی
                </button>
                <button
                  type="button"
                  onClick={() => { setChatType('GROUP'); setSelectedUserIds([]); }}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                    chatType === 'GROUP' ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-white'
                  }`}
                >
                  گروه جدید
                </button>
              </div>

              {chatType === 'GROUP' && (
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">نام گروه *</label>
                  <input
                    type="text"
                    value={groupTitle}
                    onChange={(e) => setGroupTitle(e.target.value)}
                    placeholder="مثال: تیم فنی و توسعه"
                    className="w-full px-4 py-2.5 bg-[rgba(22,27,38,0.6)] border border-[rgba(255,255,255,0.08)] rounded-xl text-xs text-white placeholder-text-muted focus:outline-none focus:border-primary/50"
                  />
                </div>
              )}

              {/* User Selection */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  {chatType === 'DIRECT' ? 'انتخاب همکار *' : 'انتخاب اعضای گروه *'}
                </label>
                <input
                  type="text"
                  value={searchUserQuery}
                  onChange={(e) => setSearchUserQuery(e.target.value)}
                  placeholder="جستجوی نام یا ایمیل..."
                  className="w-full px-4 py-2 bg-[rgba(22,27,38,0.6)] border border-[rgba(255,255,255,0.08)] rounded-xl text-xs text-white placeholder-text-muted focus:outline-none focus:border-primary/50 mb-2"
                />

                <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
                  {filteredUsers.map((u) => {
                    const selected = selectedUserIds.includes(u.id);
                    return (
                      <div
                        key={u.id}
                        onClick={() => {
                          if (chatType === 'DIRECT') {
                            setSelectedUserIds([u.id]);
                          } else {
                            setSelectedUserIds((prev) =>
                              prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                            );
                          }
                        }}
                        className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          selected
                            ? 'bg-primary/10 border-primary text-white'
                            : 'bg-[rgba(22,27,38,0.4)] border-[rgba(255,255,255,0.04)] text-text-secondary hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center font-bold text-xs">
                            {u.firstName.charAt(0)}
                          </div>
                          <div>
                            <span className="text-xs font-medium text-white block">{u.firstName} {u.lastName}</span>
                            <span className="text-[10px] text-text-muted">{u.email}</span>
                          </div>
                        </div>

                        <div className={`w-4 h-4 rounded-md border flex items-center justify-center ${selected ? 'bg-primary border-primary' : 'border-zinc-600'}`}>
                          {selected && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCreateChat}
                  disabled={selectedUserIds.length === 0}
                  className="flex-1 py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-40 text-white rounded-xl text-xs font-medium transition-all cursor-pointer"
                >
                  {chatType === 'DIRECT' ? 'شروع گفتگو' : 'ساخت گروه'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewChatModal(false)}
                  className="px-5 py-2.5 bg-card-hover text-text-secondary hover:text-white rounded-xl text-xs font-medium transition-all"
                >
                  انصراف
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
