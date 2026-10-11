"use client";

import { create } from "zustand";
import { io, Socket } from "socket.io-client";
import { QueryClient } from "@tanstack/react-query";
import { accessToken } from "@/lib/session";

/**
 * How long a "typing" notice survives without being renewed.
 *
 * The sender stops it after five seconds of no keystrokes, but only if their
 * socket is still up. A tab closed mid-sentence never sends the stop, and the
 * indicator then sat there for the rest of the session. Slightly longer than
 * the sender's own timer so a steady typist never flickers.
 */
const TYPING_TTL_MS = 7000;

interface ChatState {
  socket: Socket | null;
  connected: boolean;
  onlineUsers: Set<string>;
  typingUsers: Map<string, Map<string, string>>; // convId -> Map<userId, userName>

  connect: (token: string, queryClient: QueryClient, userId?: string) => void;
  disconnect: () => void;
  applyAck: (
    queryClient: QueryClient,
    conversationId: string,
    ack: { messageId?: string; status?: string } | undefined,
  ) => void;
  sendMessage: (
    conversationId: string,
    content: string,
    contentType?: string,
    replyToId?: string,
  ) => Promise<any>;
  markRead: (conversationId: string) => void;
  startTyping: (conversationId: string) => void;
  stopTyping: (conversationId: string) => void;
  joinConversation: (conversationId: string) => void;
  isOnline: (userId: string) => boolean;
  getTypingUsers: (conversationId: string) => Map<string, string>;
  /**
   * Watch for messages arriving, from anywhere in the app.
   *
   * The socket is opened once for the whole dashboard, so this is how a page
   * that is not the chat learns a message has come in. Returns the function
   * that stops watching; callers must call it when they unmount or a second
   * notice appears for every message.
   *
   * A list of watchers rather than one, and kept outside the store's own
   * state, so registering one does not re-render everything reading the
   * store.
   */
  onNewMessage: (handler: (message: unknown) => void) => () => void;
}

/** Everyone currently watching for messages. See `onNewMessage`. */
const watchers = new Set<(message: unknown) => void>();

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const WS_URL = API_URL.replace("/api", "");

// Notification sound
let notificationAudio: HTMLAudioElement | null = null;
function playNotificationSound() {
  if (!notificationAudio) {
    // Simple beep using data URI - no file dependency
    notificationAudio = new Audio(
      "data:audio/wav;base64,UklGRl9vT19teleXhBTUEgaWQzMBAAAAA//uQxAAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ=="
    );
  }
  notificationAudio.volume = 0.3;
  // play() returns a promise in current browsers but returned undefined in
  // older ones, and does the same under jsdom. Calling .catch on that throws,
  // inside the socket handler, which would take the incoming message with it.
  // A beep is never worth losing a message over.
  try {
    void notificationAudio.play()?.catch(() => {});
  } catch {
    /* audio is a nicety; a browser that refuses it changes nothing that matters */
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  socket: null,
  connected: false,
  onlineUsers: new Set(),
  typingUsers: new Map(),

  connect: (token: string, queryClient: QueryClient, userId?: string) => {
    const existing = get().socket;
    if (existing?.connected) return;
    // A socket that exists but is not connected is still trying to reconnect,
    // and its handlers still write to this store. Leaving it in place while
    // opening a second one gives the user two sockets, so the server keeps
    // counting them as online after the real tab has gone.
    if (existing) existing.removeAllListeners(), existing.disconnect();

    // `<convId>:<userId>` -> the timer that will clear that typing notice.
    const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const clearTyping = (conversationId: string, userId: string) => {
      const key = `${conversationId}:${userId}`;
      const timer = typingTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        typingTimers.delete(key);
      }
      set((state) => {
        const next = new Map(state.typingUsers);
        const convTyping = next.get(conversationId);
        if (!convTyping?.has(userId)) return state;
        const updated = new Map(convTyping);
        updated.delete(userId);
        if (updated.size === 0) next.delete(conversationId);
        else next.set(conversationId, updated);
        return { typingUsers: next };
      });
    };

    const socket = io(`${WS_URL}/chat`, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
    // Remember who we are so we don't beep for our own messages
    (socket as any)._userId = userId;

    socket.on("connect", () => {
      set({ connected: true });
    });

    socket.on("disconnect", () => {
      // Nobody is known to be online while we are not connected. Holding the
      // last set means a tab whose socket has quietly died goes on showing
      // green dots and "Online" for people the server has since marked away,
      // which is worse than showing nothing: it is confidently wrong.
      set({ connected: false, onlineUsers: new Set(), typingUsers: new Map() });
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
      // Somebody who has gone offline is not still typing. Their tab may have
      // closed mid-sentence, in which case no stopTyping was ever sent.
      if (!data.isOnline) {
        for (const convId of [...get().typingUsers.keys()]) {
          clearTyping(convId, data.userId);
        }
      }
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

      /*
        And tell whoever is watching. Each watcher is called inside its own
        try, because a notice that throws must not take the message with it -
        the cache above has already been updated, and the thread being right
        matters more than the corner of the screen being right.
      */
      for (const watcher of watchers) {
        try {
          watcher(message);
        } catch {
          /* a notice is a nicety; the message has already landed */
        }
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

    // Read receipt. Both halves matter: `status` is the sender's tick, and
    // `reads` is the per-person record the page uses to decide whether THIS
    // user still has something unread. Updating only the tick left the page
    // asking to mark the same messages read every time it re-rendered.
    socket.on("messagesRead", (data: { conversationId: string; readBy: string; messageIds: string[] }) => {
      queryClient.setQueryData(
        ["messages", data.conversationId],
        (old: any[] | undefined) => {
          if (!old) return old;
          const idSet = new Set(data.messageIds);
          const readAt = new Date().toISOString();
          return old.map((m: any) => {
            if (!idSet.has(m.id)) return m;
            const reads = m.reads ?? [];
            return {
              ...m,
              status: "READ",
              reads: reads.some((r: any) => r.userId === data.readBy)
                ? reads
                : [...reads, { userId: data.readBy, readAt }],
            };
          });
        }
      );
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["unread-messages"] });
    });

    // Typing indicators. Each notice carries its own expiry, so one that is
    // never followed by a stop clears itself instead of sitting there.
    socket.on("userTyping", (data: { conversationId: string; userId: string; userName: string }) => {
      const key = `${data.conversationId}:${data.userId}`;
      const existing = typingTimers.get(key);
      if (existing) clearTimeout(existing);
      typingTimers.set(
        key,
        setTimeout(() => clearTyping(data.conversationId, data.userId), TYPING_TTL_MS),
      );

      set((state) => {
        const next = new Map(state.typingUsers);
        const convTyping = new Map(next.get(data.conversationId) ?? []);
        // The gateway now sends a real name; older builds sent "". Falling
        // back keeps the sentence readable either way.
        convTyping.set(data.userId, data.userName || "Someone");
        next.set(data.conversationId, convTyping);
        return { typingUsers: next };
      });
    });

    socket.on("userStopTyping", (data: { conversationId: string; userId: string }) => {
      clearTyping(data.conversationId, data.userId);
    });

    // Handle reconnection - refresh token
    socket.on("connect_error", async () => {
      const newToken = accessToken();
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

  /**
   * Everything the sender's own screen should show the instant they send.
   *
   * The message is echoed back over the socket, so the tick state that
   * matters is the one the ack carries: without this a message the server had
   * already delivered sat on one tick until something else invalidated the
   * cache.
   */
  applyAck: (
    queryClient: QueryClient,
    conversationId: string,
    ack: { messageId?: string; status?: string } | undefined,
  ) => {
    if (!ack?.messageId || !ack.status) return;
    queryClient.setQueryData(
      ["messages", conversationId],
      (old: any[] | undefined) =>
        old?.map((m: any) =>
          m.id === ack.messageId ? { ...m, status: ack.status } : m,
        ),
    );
  },

  sendMessage: async (
    conversationId: string,
    content: string,
    contentType?: string,
    replyToId?: string,
  ) => {
    const { socket } = get();
    if (!socket?.connected) throw new Error("Not connected");

    return new Promise((resolve, reject) => {
      // Cleared once the ack lands, or a message sent every few seconds
      // leaves a timer per send armed for the next ten seconds.
      const timeout = setTimeout(
        () => reject(new Error("Message send timeout")),
        10000,
      );
      socket.emit(
        "sendMessage",
        { conversationId, content, contentType, replyToId },
        (response: any) => {
          clearTimeout(timeout);
          if (response?.error) reject(new Error(response.error));
          else resolve(response);
        }
      );
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

  onNewMessage: (handler: (message: unknown) => void) => {
    watchers.add(handler);
    return () => {
      watchers.delete(handler);
    };
  },

  getTypingUsers: (conversationId: string) => {
    return get().typingUsers.get(conversationId) || new Map();
  },
}));
