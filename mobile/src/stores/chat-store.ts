import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { WS_URL } from '@/constants/config';
import { getAccessToken } from '@/lib/storage';
import api from '@/lib/api';

export interface Message {
  id: string;
  content: string;
  contentType?: string;
  fileUrl?: string;
  conversationId: string;
  senderId: string;
  senderUserId?: string;
  sender?: { id: string; firstName?: string; lastName?: string };
  status: 'SENT' | 'DELIVERED' | 'READ';
  createdAt: string;
}

// The backend identifies the author as `senderUserId` (scalar) / `sender.id`
// (relation), never `senderId`. Normalise so the UI's `senderId === userId`
// "is this mine?" check works for both REST- and socket-delivered messages.
function normalizeMessage(m: any): Message {
  if (!m) return m;
  return { ...m, senderId: m.senderId ?? m.senderUserId ?? m.sender?.id };
}

export interface Conversation {
  id: string;
  participants: {
    id: string;
    userId: string;
    user: {
      id: string;
      firstName: string;
      lastName: string;
      role: string;
      photoUrl?: string;
    };
  }[];
  lastMessage?: Message;
  unreadCount?: number;
  updatedAt: string;
}

interface TypingUser {
  userId: string;
  userName: string;
  conversationId: string;
}

interface ChatState {
  socket: Socket | null;
  connected: boolean;
  conversations: Conversation[];
  messages: Record<string, Message[]>; // conversationId → messages
  onlineUsers: Set<string>;
  typingUsers: TypingUser[];
  unreadCount: number;

  connect: () => Promise<void>;
  disconnect: () => void;
  loadConversations: () => Promise<void>;
  loadMessages: (conversationId: string, page?: number) => Promise<void>;
  sendMessage: (conversationId: string, content: string) => void;
  markRead: (conversationId: string) => void;
  startTyping: (conversationId: string) => void;
  stopTyping: (conversationId: string) => void;
  createConversation: (participantIds: string[]) => Promise<string>;
  loadUnreadCount: () => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  socket: null,
  connected: false,
  conversations: [],
  messages: {},
  onlineUsers: new Set(),
  typingUsers: [],
  unreadCount: 0,

  connect: async () => {
    const existing = get().socket;
    if (existing?.connected) return;

    const token = await getAccessToken();
    if (!token) return;

    // The backend gateway lives on the "/chat" namespace (same as web).
    const socket = io(`${WS_URL}/chat`, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socket.on('connect', () => {
      set({ connected: true });
      get().loadConversations();
      get().loadUnreadCount();
    });

    socket.on('disconnect', () => {
      set({ connected: false });
    });

    socket.on('connect_error', async () => {
      const newToken = await getAccessToken();
      if (newToken && socket.auth) {
        (socket.auth as any).token = newToken;
      }
    });

    // New message received
    socket.on('newMessage', (raw: Message) => {
      const message = normalizeMessage(raw);
      // A frame with nothing in it is not worth crashing a live socket over.
      if (!message) return;
      set((state) => {
        const convMessages = state.messages[message.conversationId] ?? [];
        // Avoid duplicates
        if (convMessages.some((m) => m.id === message.id)) return state;

        const newMessages = {
          ...state.messages,
          [message.conversationId]: [...convMessages, message],
        };

        // Update conversation last message
        const conversations = state.conversations.map((c) =>
          c.id === message.conversationId
            ? { ...c, lastMessage: message, updatedAt: message.createdAt }
            : c
        );

        // Sort conversations by latest message
        conversations.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );

        return {
          messages: newMessages,
          conversations,
          unreadCount: state.unreadCount + 1,
        };
      });
    });

    // Message delivered
    socket.on('messageDelivered', ({ messageId, conversationId }: { messageId: string; conversationId: string }) => {
      set((state) => {
        const convMessages = state.messages[conversationId];
        if (!convMessages) return state;
        return {
          messages: {
            ...state.messages,
            [conversationId]: convMessages.map((m) =>
              m.id === messageId ? { ...m, status: 'DELIVERED' as const } : m
            ),
          },
        };
      });
    });

    // Messages read
    socket.on('messagesRead', ({ conversationId, readBy, messageIds }: { conversationId: string; readBy: string; messageIds: string[] }) => {
      set((state) => {
        const convMessages = state.messages[conversationId];
        if (!convMessages) return state;
        const readSet = new Set(messageIds);
        return {
          messages: {
            ...state.messages,
            [conversationId]: convMessages.map((m) =>
              readSet.has(m.id) ? { ...m, status: 'READ' as const } : m
            ),
          },
        };
      });
    });

    // Typing indicators
    socket.on('userTyping', (data: { conversationId: string; userId: string; userName: string }) => {
      set((state) => {
        if (state.typingUsers.some((t) => t.userId === data.userId && t.conversationId === data.conversationId)) {
          return state;
        }
        return { typingUsers: [...state.typingUsers, data] };
      });

      // Auto-clear after 5 seconds
      setTimeout(() => {
        set((state) => ({
          typingUsers: state.typingUsers.filter(
            (t) => !(t.userId === data.userId && t.conversationId === data.conversationId)
          ),
        }));
      }, 5000);
    });

    socket.on('userStopTyping', (data: { conversationId: string; userId: string }) => {
      set((state) => ({
        typingUsers: state.typingUsers.filter(
          (t) => !(t.userId === data.userId && t.conversationId === data.conversationId)
        ),
      }));
    });

    // Presence
    socket.on('presenceChange', ({ userId, isOnline }: { userId: string; isOnline: boolean }) => {
      set((state) => {
        const newOnline = new Set(state.onlineUsers);
        if (isOnline) newOnline.add(userId);
        else newOnline.delete(userId);
        return { onlineUsers: newOnline };
      });
    });

    socket.on('onlineUsers', (userIds: string[]) => {
      set({ onlineUsers: new Set(userIds) });
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, connected: false });
    }
  },

  loadConversations: async () => {
    try {
      const { data } = await api.get('/messaging/conversations');
      const conversations = (data as Conversation[]).map((c) => ({
        ...c,
        lastMessage: c.lastMessage ? normalizeMessage(c.lastMessage) : c.lastMessage,
      }));
      set({ conversations });
    } catch {
      // Silently fail
    }
  },

  loadMessages: async (conversationId, page = 1) => {
    try {
      const { data } = await api.get(`/messaging/conversations/${conversationId}/messages`, {
        params: { page, limit: 50 },
      });
      const messages = ((data.data ?? data) as Message[]).map(normalizeMessage);
      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]: page === 1
            ? messages.reverse()
            : [...messages.reverse(), ...(state.messages[conversationId] ?? [])],
        },
      }));

      // Join room
      const { socket } = get();
      socket?.emit('joinConversation', { conversationId });
    } catch {
      // Silently fail
    }
  },

  sendMessage: (conversationId, content) => {
    const { socket } = get();
    if (!socket?.connected) return;

    socket.emit('sendMessage', { conversationId, content }, (ack: any) => {
      if (ack?.error) {
        console.warn('Send failed:', ack.error);
      }
    });
  },

  markRead: (conversationId) => {
    const { socket } = get();
    if (!socket?.connected) return;
    socket.emit('markRead', { conversationId });
    set((state) => ({
      unreadCount: Math.max(0, state.unreadCount - (state.conversations.find((c) => c.id === conversationId)?.unreadCount ?? 0)),
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c
      ),
    }));
  },

  startTyping: (conversationId) => {
    const { socket } = get();
    socket?.emit('typing', { conversationId });
  },

  stopTyping: (conversationId) => {
    const { socket } = get();
    socket?.emit('stopTyping', { conversationId });
  },

  createConversation: async (participantIds) => {
    const { data } = await api.post('/messaging/conversations', { participantIds });
    await get().loadConversations();
    return data.id;
  },

  loadUnreadCount: async () => {
    try {
      const { data } = await api.get('/messaging/unread');
      set({ unreadCount: data.count ?? 0 });
    } catch {
      // Silently fail
    }
  },
}));
