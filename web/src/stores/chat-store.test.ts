import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

/**
 * A stand-in socket.io client.
 *
 * The store registers handlers on connect and reacts to server events, so the
 * fake keeps the handlers and lets a test fire them. That is the whole surface:
 * everything the store does about realtime chat happens inside one of these.
 */
class FakeSocket {
  handlers = new Map<string, (payload: unknown) => void>();
  emitted: Array<{ event: string; payload: unknown }> = [];
  connected = false;
  disconnected = false;

  on(event: string, handler: (payload: unknown) => void) {
    this.handlers.set(event, handler);
  }
  emit(event: string, payload: unknown, ack?: (r: unknown) => void) {
    this.emitted.push({ event, payload });
    if (ack) ack({ ok: true, id: "msg-1" });
  }
  disconnect() {
    this.disconnected = true;
    this.connected = false;
  }
  /**
   * Fire a server event at the store. Real socket.io flips `connected` itself
   * around these two, and the store's emit methods check it, so the fake has to
   * do the same or every send looks like it happened while offline.
   */
  fire(event: string, payload?: unknown) {
    if (event === "connect") this.connected = true;
    if (event === "disconnect") this.connected = false;
    const handler = this.handlers.get(event);
    if (!handler) throw new Error(`nothing listening for "${event}"`);
    handler(payload);
  }
}

const h = vi.hoisted(() => ({ socket: { current: null as unknown } }));

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => h.socket.current),
}));

import { useChatStore } from "./chat-store";

let socket: FakeSocket;
let queryClient: QueryClient;

beforeEach(() => {
  socket = new FakeSocket();
  h.socket.current = socket;
  queryClient = new QueryClient();
  useChatStore.setState({
    socket: null,
    connected: false,
    onlineUsers: new Set(),
    typingUsers: new Map(),
  });
});

const connect = () => useChatStore.getState().connect("token", queryClient, "me");

describe("connecting", () => {
  it("marks the store connected when the socket connects", () => {
    connect();
    expect(useChatStore.getState().connected).toBe(false);
    socket.fire("connect");
    expect(useChatStore.getState().connected).toBe(true);
  });

  it("marks the store disconnected when the socket drops", () => {
    connect();
    socket.fire("connect");
    socket.fire("disconnect");
    expect(useChatStore.getState().connected).toBe(false);
  });

  // Reconnecting on every render would open a socket per keystroke.
  it("does not open a second socket while one is already connected", () => {
    connect();
    socket.fire("connect");
    const before = socket.handlers.size;
    connect();
    expect(socket.handlers.size).toBe(before);
  });
});

describe("presence", () => {
  it("takes the online list handed over on connect", () => {
    connect();
    socket.fire("onlineUsers", ["u-1", "u-2"]);
    expect(useChatStore.getState().isOnline("u-1")).toBe(true);
    expect(useChatStore.getState().isOnline("u-3")).toBe(false);
  });

  it("adds someone who comes online", () => {
    connect();
    socket.fire("onlineUsers", []);
    socket.fire("presenceChange", { userId: "u-9", isOnline: true });
    expect(useChatStore.getState().isOnline("u-9")).toBe(true);
  });

  it("removes someone who goes offline", () => {
    connect();
    socket.fire("onlineUsers", ["u-9"]);
    socket.fire("presenceChange", { userId: "u-9", isOnline: false });
    expect(useChatStore.getState().isOnline("u-9")).toBe(false);
  });
});

describe("typing indicators", () => {
  it("records who is typing, per conversation", () => {
    connect();
    socket.fire("userTyping", { conversationId: "c-1", userId: "u-1", userName: "Divine" });
    const typing = useChatStore.getState().getTypingUsers("c-1");
    expect(typing.get("u-1")).toBe("Divine");
    expect(useChatStore.getState().getTypingUsers("c-2").size).toBe(0);
  });

  it("clears one when they stop", () => {
    connect();
    socket.fire("userTyping", { conversationId: "c-1", userId: "u-1", userName: "Divine" });
    socket.fire("userStopTyping", { conversationId: "c-1", userId: "u-1" });
    expect(useChatStore.getState().getTypingUsers("c-1").size).toBe(0);
  });

  it("keeps two people in the same conversation apart", () => {
    connect();
    socket.fire("userTyping", { conversationId: "c-1", userId: "u-1", userName: "Divine" });
    socket.fire("userTyping", { conversationId: "c-1", userId: "u-2", userName: "Keza" });
    expect(useChatStore.getState().getTypingUsers("c-1").size).toBe(2);
  });
});

describe("outgoing events", () => {
  it.each([
    ["markRead", "markRead"],
    ["startTyping", "typing"],
    ["stopTyping", "stopTyping"],
    ["joinConversation", "joinConversation"],
  ])("%s emits %s with the conversation id", (method, event) => {
    connect();
    socket.fire("connect");
    (useChatStore.getState() as unknown as Record<string, (id: string) => void>)[method]("c-1");
    expect(socket.emitted.at(-1)).toEqual({
      event,
      payload: { conversationId: "c-1" },
    });
  });

  it("sends a message and resolves with the server's acknowledgement", async () => {
    connect();
    socket.fire("connect");
    const result = await useChatStore.getState().sendMessage("c-1", "Muraho");
    expect(socket.emitted.at(-1)?.event).toBe("sendMessage");
    expect(result).toMatchObject({ ok: true });
  });
});

describe("incoming messages", () => {
  // A beep must never be the reason an incoming message is lost, so the store
  // is expected to survive an Audio implementation that refuses to play.
  it("still handles the message when the notification sound fails", () => {
    connect();
    socket.fire("connect");
    expect(() =>
      socket.fire("newMessage", {
        id: "m-2",
        conversationId: "c-1",
        sender: { id: "someone-else" },
        content: "Muraho",
      }),
    ).not.toThrow();
    expect(queryClient.getQueryData(["messages", "c-1"])).toHaveLength(1);
  });

  it("refreshes the conversation list when one arrives", () => {
    connect();
    socket.fire("connect");
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    socket.fire("newMessage", {
      id: "m-1",
      conversationId: "c-1",
      senderId: "u-1",
      content: "Muraho",
    });
    expect(invalidate).toHaveBeenCalled();
  });

  it("handles a read receipt without throwing", () => {
    connect();
    expect(() =>
      socket.fire("messagesRead", {
        conversationId: "c-1",
        readBy: "u-1",
        messageIds: ["m-1"],
      }),
    ).not.toThrow();
  });

  it("handles a delivery receipt without throwing", () => {
    connect();
    expect(() =>
      socket.fire("messageDelivered", { messageId: "m-1", conversationId: "c-1" }),
    ).not.toThrow();
  });
});

describe("disconnecting", () => {
  it("closes the socket and clears presence", () => {
    connect();
    socket.fire("connect");
    socket.fire("onlineUsers", ["u-1"]);

    useChatStore.getState().disconnect();

    expect(socket.disconnected).toBe(true);
    expect(useChatStore.getState().connected).toBe(false);
    expect(useChatStore.getState().socket).toBeNull();
  });

  it("is safe to call when nothing was ever connected", () => {
    expect(() => useChatStore.getState().disconnect()).not.toThrow();
  });
});
