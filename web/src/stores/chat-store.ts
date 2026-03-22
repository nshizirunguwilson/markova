"use client";

import { create } from "zustand";
import { io, Socket } from "socket.io-client";
import { QueryClient } from "@tanstack/react-query";

interface ChatState {
  socket: Socket | null;
  connected: boolean;
  onlineUsers: Set<string>;
  typingUsers: Map<string, Map<string, string>>; // convId -> Map<userId, userName>

  connect: (token: string, queryClient: QueryClient) => void;
  disconnect: () => void;
  sendMessage: (conversationId: string, content: string, contentType?: string) => Promise<any>;
  markRead: (conversationId: string) => void;
  startTyping: (conversationId: string) => void;
  stopTyping: (conversationId: string) => void;
  joinConversation: (conversationId: string) => void;
  isOnline: (userId: string) => boolean;
  getTypingUsers: (conversationId: string) => Map<string, string>;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const WS_URL = API_URL.replace("/api", "");

// Notification sound
let notificationAudio: HTMLAudioElement | null = null;
function playNotificationSound() {
  if (!notificationAudio) {
    // Simple beep using data URI — no file dependency
    notificationAudio = new Audio(
      "data:audio/wav;base64,UklGRl9vT19teleXhBTUEgaWQzMBAAAAA//uQxAAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ=="
    );
  }
  notificationAudio.volume = 0.3;
  notificationAudio.play().catch(() => {});
}

export const useChatStore = create<ChatState>((set, get) => ({
  socket: null,
  connected: false,
  onlineUsers: new Set(),
  typingUsers: new Map(),

  connect: (token: string, queryClient: QueryClient) => {
    const existing = get().socket;
    if (existing?.connected) return;

    const socket = io(`${WS_URL}/chat`, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socket.on("connect", () => {
      set({ connected: true });
    });

    socket.on("disconnect", () => {
      set({ connected: false });
    });

    // Online users list on connect
    socket.on("onlineUsers", (userIds: string[]) => {
      set({ onlineUsers: new Set(userIds) });
    });

    // Presence changes
    socket.on("presenceChange", (data: { userId: string; isOnline: boolean }) => {
      set((state) => {
        const next = new Set(state.onlineUsers);
        if (data.isOnline) next.add(data.userId);
        else next.delete(data.userId);
        return { onlineUsers: next };
      });
    });

    // New message
    socket.on("newMessage", (message: any) => {
      // Update messages cache
      queryClient.setQueryData(
        ["messages", message.conversationId],
        (old: any[] | undefined) => {
          if (!old) return [message];
          if (old.some((m: any) => m.id === message.id)) return old;
          return [message, ...old];
        }
      );

      // Invalidate conversations to update lastMessage and order
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["unread-messages"] });

      // Play sound for messages from others
      const currentUserId = (socket as any)._userId;
      if (message.sender?.id !== currentUserId) {
        playNotificationSound();
      }
    });

    // Delivery receipt
    socket.on("messageDelivered", (data: { messageId: string; conversationId: string }) => {
      queryClient.setQueryData(
        ["messages", data.conversationId],
        (old: any[] | undefined) => {
          if (!old) return old;
          return old.map((m: any) =>
            m.id === data.messageId ? { ...m, status: "DELIVERED" } : m
          );
        }
      );
    });

    // Read receipt
    socket.on("messagesRead", (data: { conversationId: string; readBy: string; messageIds: string[] }) => {
      queryClient.setQueryData(
        ["messages", data.conversationId],
        (old: any[] | undefined) => {
          if (!old) return old;
          const idSet = new Set(data.messageIds);
          return old.map((m: any) =>
            idSet.has(m.id) ? { ...m, status: "READ" } : m
          );
        }
      );
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    });

    // Typing indicators
    socket.on("userTyping", (data: { conversationId: string; userId: string; userName: string }) => {
      set((state) => {
        const next = new Map(state.typingUsers);
        if (!next.has(data.conversationId)) {
          next.set(data.conversationId, new Map());
        }
        next.get(data.conversationId)!.set(data.userId, data.userName);
        return { typingUsers: next };
      });
    });

    socket.on("userStopTyping", (data: { conversationId: string; userId: string }) => {
      set((state) => {
        const next = new Map(state.typingUsers);
        const convTyping = next.get(data.conversationId);
        if (convTyping) {
          convTyping.delete(data.userId);
          if (convTyping.size === 0) next.delete(data.conversationId);
        }
        return { typingUsers: next };
      });
    });

    // Handle reconnection — refresh token
    socket.on("connect_error", async () => {
      const newToken = localStorage.getItem("access_token");
      if (newToken && newToken !== token) {
        socket.auth = { token: newToken };
      }
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, connected: false, onlineUsers: new Set(), typingUsers: new Map() });
    }
  },

  sendMessage: async (conversationId: string, content: string, contentType?: string) => {
    const { socket } = get();
    if (!socket?.connected) throw new Error("Not connected");

    return new Promise((resolve, reject) => {
      socket.emit(
        "sendMessage",
        { conversationId, content, contentType },
        (response: any) => {
          if (response?.error) reject(new Error(response.error));
          else resolve(response);
        }
      );

      // Timeout fallback
      setTimeout(() => reject(new Error("Message send timeout")), 10000);
    });
  },

  markRead: (conversationId: string) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit("markRead", { conversationId });
    }
  },

  startTyping: (conversationId: string) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit("typing", { conversationId });
    }
  },

  stopTyping: (conversationId: string) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit("stopTyping", { conversationId });
    }
  },

  joinConversation: (conversationId: string) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit("joinConversation", { conversationId });
    }
  },

  isOnline: (userId: string) => {
    return get().onlineUsers.has(userId);
  },

  getTypingUsers: (conversationId: string) => {
    return get().typingUsers.get(conversationId) || new Map();
  },
}));
