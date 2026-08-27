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

  /**
   * A tab whose socket has quietly died hears nothing more, so the last list
   * it received stays on screen. That is how one side of a conversation goes
   * on showing "Online" for somebody the other side is already being told
   * has left.
   */
  it("knows nobody is online once the connection drops", () => {
    connect();
    socket.fire("onlineUsers", ["u-1", "u-2"]);
    socket.fire("userTyping", {
      conversationId: "c-1",
      userId: "u-1",
      userName: "A",
    });

    socket.fire("disconnect");

    expect(useChatStore.getState().isOnline("u-1")).toBe(false);
    expect(useChatStore.getState().isOnline("u-2")).toBe(false);
    expect(useChatStore.getState().typingUsers.size).toBe(0);
    expect(useChatStore.getState().connected).toBe(false);
  });

  it("takes the list again when it comes back", () => {
    connect();
    socket.fire("onlineUsers", ["u-1"]);
    socket.fire("disconnect");

    socket.fire("onlineUsers", ["u-2"]);

    expect(useChatStore.getState().isOnline("u-1")).toBe(false);
    expect(useChatStore.getState().isOnline("u-2")).toBe(true);
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

  /**
   * The sender stops the indicator after five seconds of no keystrokes, but
   * only while their socket is up. A tab closed mid-sentence sends no stop at
   * all, and the notice then sat on screen for the rest of the session.
   */
  it("clears a notice nobody ever stopped", () => {
    vi.useFakeTimers();
    try {
      connect();
      socket.fire("userTyping", { conversationId: "c-1", userId: "u-1", userName: "Divine" });
      expect(useChatStore.getState().getTypingUsers("c-1").size).toBe(1);

      vi.advanceTimersByTime(7001);
      expect(useChatStore.getState().getTypingUsers("c-1").size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  // A steady typist re-sends every few keystrokes, and each one has to push
  // the expiry out or the indicator would flicker mid-sentence.
  it("keeps it up while the keystrokes keep coming", () => {
    vi.useFakeTimers();
    try {
      connect();
      socket.fire("userTyping", { conversationId: "c-1", userId: "u-1", userName: "Divine" });
      vi.advanceTimersByTime(5000);
      socket.fire("userTyping", { conversationId: "c-1", userId: "u-1", userName: "Divine" });
      vi.advanceTimersByTime(5000);
      expect(useChatStore.getState().getTypingUsers("c-1").size).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears it the moment they go offline", () => {
    connect();
    socket.fire("userTyping", { conversationId: "c-1", userId: "u-1", userName: "Divine" });
    socket.fire("presenceChange", { userId: "u-1", isOnline: false });
    expect(useChatStore.getState().getTypingUsers("c-1").size).toBe(0);
  });

  it("leaves the others typing when one goes offline", () => {
    connect();
    socket.fire("userTyping", { conversationId: "c-1", userId: "u-1", userName: "Divine" });
    socket.fire("userTyping", { conversationId: "c-1", userId: "u-2", userName: "Keza" });
    socket.fire("presenceChange", { userId: "u-1", isOnline: false });
    expect([...useChatStore.getState().getTypingUsers("c-1").keys()]).toEqual(["u-2"]);
  });

  /**
   * The gateway reads the name off the account now. It used to take it from
   * the JWT, which carries `sub` and `role` and nothing else, so every
   * recipient was shown a blank name followed by "is typing".
   */
  it("never renders a nameless someone as an empty string", () => {
    connect();
    socket.fire("userTyping", { conversationId: "c-1", userId: "u-1", userName: "" });
    expect(useChatStore.getState().getTypingUsers("c-1").get("u-1")).toBe("Someone");
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

/**
 * Receipts against a thread that is already on screen.
 *
 * The ticks beside a sent message are read straight out of the query cache, so
 * a receipt has to rewrite the message that is already there. Firing one at an
 * empty cache exercises nothing: the store returns early and the mapping that
 * does the work never runs.
 */
describe("receipts on an open thread", () => {
  /** Puts a thread in the cache the way the messages page would have. */
  function threadInCache() {
    queryClient.setQueryData(
      ["messages", "c-1"],
      [
        { id: "m-1", conversationId: "c-1", content: "Muraho", status: "SENT" },
        { id: "m-2", conversationId: "c-1", content: "Amakuru", status: "SENT" },
      ],
    );
  }

  const cached = () => queryClient.getQueryData(["messages", "c-1"]) as any[];

  /**
   * A read receipt has to record WHO read it, not only flip the tick. The
   * messages page decides whether this user still has something unread from
   * `reads`, so a receipt that only wrote `status` left the page asking the
   * server to mark the same thread read on every re-render.
   */
  it("records who did the reading, not just the tick", () => {
    connect();
    threadInCache();
    socket.fire("messagesRead", {
      conversationId: "c-1",
      readBy: "u-2",
      messageIds: ["m-1"],
    });
    const [first] = cached();
    expect(first.status).toBe("READ");
    expect(first.reads).toEqual([
      { userId: "u-2", readAt: expect.any(String) },
    ]);
  });

  it("does not record the same reader twice", () => {
    connect();
    queryClient.setQueryData(
      ["messages", "c-1"],
      [{ id: "m-1", conversationId: "c-1", status: "READ", reads: [{ userId: "u-2", readAt: "x" }] }],
    );
    socket.fire("messagesRead", {
      conversationId: "c-1",
      readBy: "u-2",
      messageIds: ["m-1"],
    });
    expect(cached()[0].reads).toHaveLength(1);
  });

  // A group thread: two people reading it are two records against the one
  // message, and losing the first would make it unread again for them.
  it("keeps an earlier reader when a second one arrives", () => {
    connect();
    queryClient.setQueryData(
      ["messages", "c-1"],
      [{ id: "m-1", conversationId: "c-1", status: "READ", reads: [{ userId: "u-2", readAt: "x" }] }],
    );
    socket.fire("messagesRead", {
      conversationId: "c-1",
      readBy: "u-3",
      messageIds: ["m-1"],
    });
    expect(cached()[0].reads.map((r: any) => r.userId)).toEqual(["u-2", "u-3"]);
  });

  /**
   * The ack the server returns says whether a recipient was online to take
   * the message. Without applying it, a message the server had already marked
   * delivered sat on one tick until something else refreshed the cache.
   */
  it("applies the send acknowledgement to the message it names", () => {
    connect();
    threadInCache();
    useChatStore
      .getState()
      .applyAck(queryClient, "c-1", { messageId: "m-1", status: "DELIVERED" });
    expect(cached()[0].status).toBe("DELIVERED");
    expect(cached()[1].status).toBe("SENT");
  });

  it("ignores an acknowledgement that names nothing", () => {
    connect();
    threadInCache();
    useChatStore.getState().applyAck(queryClient, "c-1", undefined);
    useChatStore.getState().applyAck(queryClient, "c-1", { status: "SENT" });
    expect(cached()[0].status).toBe("SENT");
  });

  it("survives an acknowledgement for a thread nothing has loaded", () => {
    connect();
    expect(() =>
      useChatStore
        .getState()
        .applyAck(queryClient, "c-9", { messageId: "m-1", status: "DELIVERED" }),
    ).not.toThrow();
  });

  it("moves one message to delivered", () => {
    connect();
    threadInCache();
    socket.fire("messageDelivered", { messageId: "m-1", conversationId: "c-1" });

    expect(cached()[0].status).toBe("DELIVERED");
  });

  // A receipt names one message. Marking the whole thread would show ticks
  // against messages that never arrived.
  it("leaves the other messages alone", () => {
    connect();
    threadInCache();
    socket.fire("messageDelivered", { messageId: "m-1", conversationId: "c-1" });

    expect(cached()[1].status).toBe("SENT");
  });

  it("marks every message a read receipt names", () => {
    connect();
    threadInCache();
    socket.fire("messagesRead", {
      conversationId: "c-1",
      readBy: "u-1",
      messageIds: ["m-1", "m-2"],
    });

    expect(cached().map((m) => m.status)).toEqual(["READ", "READ"]);
  });

  it("marks only the ones named", () => {
    connect();
    threadInCache();
    socket.fire("messagesRead", {
      conversationId: "c-1",
      readBy: "u-1",
      messageIds: ["m-2"],
    });

    expect(cached().map((m) => m.status)).toEqual(["SENT", "READ"]);
  });

  // The list shows a read count per thread, so it has to be refetched.
  it("refreshes the conversation list on a read receipt", () => {
    connect();
    threadInCache();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    socket.fire("messagesRead", {
      conversationId: "c-1",
      readBy: "u-1",
      messageIds: ["m-1"],
    });

    expect(invalidate).toHaveBeenCalled();
  });

  // A receipt for a thread nobody has open is normal and must not create one.
  it("creates nothing for a thread that is not loaded", () => {
    connect();
    socket.fire("messageDelivered", { messageId: "m-9", conversationId: "c-9" });

    expect(queryClient.getQueryData(["messages", "c-9"])).toBeUndefined();
  });
});

describe("a message arriving in a thread already on screen", () => {
  function threadInCache() {
    queryClient.setQueryData(
      ["messages", "c-1"],
      [{ id: "m-1", conversationId: "c-1", content: "Muraho" }],
    );
  }

  const cached = () => queryClient.getQueryData(["messages", "c-1"]) as any[];

  // Newest first: the thread renders in reverse and a message appended to the
  // end would show up above the older ones.
  it("goes to the front of the thread", () => {
    connect();
    threadInCache();
    socket.fire("newMessage", {
      id: "m-2",
      conversationId: "c-1",
      content: "Amakuru",
    });

    expect(cached().map((m) => m.id)).toEqual(["m-2", "m-1"]);
  });

  // The sender has the message on screen already, from their own send. The
  // socket echo must not double it.
  it("is ignored when it is already there", () => {
    connect();
    threadInCache();
    socket.fire("newMessage", { id: "m-1", conversationId: "c-1", content: "Muraho" });

    expect(cached()).toHaveLength(1);
  });

  it("starts the thread when there was nothing cached", () => {
    connect();
    socket.fire("newMessage", { id: "m-5", conversationId: "c-5", content: "Muraho" });

    expect(queryClient.getQueryData(["messages", "c-5"])).toHaveLength(1);
  });
});

describe("sending while the connection is down", () => {
  // The messages page falls back to the REST endpoint when this throws. It has
  // to throw rather than resolve, or the message is silently dropped.
  it("refuses to send with no socket at all", async () => {
    await expect(
      useChatStore.getState().sendMessage("c-1", "Muraho"),
    ).rejects.toThrow(/not connected/i);
  });

  it("refuses to send when the socket is not connected", async () => {
    connect();
    // Connected was never fired, so the socket is open but not usable.
    await expect(
      useChatStore.getState().sendMessage("c-1", "Muraho"),
    ).rejects.toThrow(/not connected/i);
  });

  it("sends once the connection is up", async () => {
    connect();
    socket.fire("connect");
    await expect(
      useChatStore.getState().sendMessage("c-1", "Muraho"),
    ).resolves.toBeTruthy();
    expect(socket.emitted.some((e) => e.event === "sendMessage")).toBe(true);
  });

  // The server acknowledges with an error rather than dropping the call, and
  // that has to reach the caller so it can fall back.
  it("rejects when the server refuses the message", async () => {
    connect();
    socket.fire("connect");
    socket.emit = (event: string, payload: unknown, ack?: (r: unknown) => void) => {
      socket.emitted.push({ event, payload });
      ack?.({ error: "You are not in this conversation" });
    };

    await expect(
      useChatStore.getState().sendMessage("c-1", "Muraho"),
    ).rejects.toThrow(/not in this conversation/i);
  });

  // No acknowledgement at all is the dropped-connection case. Without the
  // timeout the promise would hang and the message box would stay disabled.
  it("gives up when the server never answers", async () => {
    vi.useFakeTimers();
    try {
      connect();
      socket.fire("connect");
      socket.emit = (event: string, payload: unknown) => {
        socket.emitted.push({ event, payload });
      };

      const sending = useChatStore.getState().sendMessage("c-1", "Muraho");
      const assertion = expect(sending).rejects.toThrow(/timeout/i);
      await vi.advanceTimersByTimeAsync(10000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
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

/**
 * The paths a live chat only takes on a bad connection.
 *
 * A stop-typing for a thread nobody is typing in, a token that changed while
 * the socket was down, an emit attempted between the socket existing and it
 * being connected. None of these are reachable from a test that only ever
 * drives a healthy socket, and every one of them is reachable on a phone on
 * a school's wifi.
 */
describe("typing that stops out of order", () => {
  it("ignores a stop for a thread nobody was typing in", () => {
    connect();
    socket.fire("connect");

    socket.fire("userStopTyping", { conversationId: "c-unknown", userId: "u-1" });

    expect(useChatStore.getState().typingUsers.size).toBe(0);
  });

  it("keeps the thread while somebody else is still typing", () => {
    connect();
    socket.fire("connect");
    socket.fire("userTyping", { conversationId: "c-1", userId: "u-1", userName: "Divine" });
    socket.fire("userTyping", { conversationId: "c-1", userId: "u-2", userName: "Keza" });

    socket.fire("userStopTyping", { conversationId: "c-1", userId: "u-1" });

    const typing = useChatStore.getState().typingUsers.get("c-1");
    expect(typing?.size).toBe(1);
    expect(typing?.get("u-2")).toBe("Keza");
  });

  it("drops the thread once the last person stops", () => {
    connect();
    socket.fire("connect");
    socket.fire("userTyping", { conversationId: "c-1", userId: "u-1", userName: "Divine" });

    socket.fire("userStopTyping", { conversationId: "c-1", userId: "u-1" });

    expect(useChatStore.getState().typingUsers.has("c-1")).toBe(false);
  });
});

describe("a connection that fails and is retried", () => {
  it("picks up a token that was refreshed while it was down", () => {
    connect();
    localStorage.setItem("access_token", "a-newer-token");

    socket.fire("connect_error");

    expect((socket as unknown as { auth?: { token: string } }).auth).toEqual({
      token: "a-newer-token",
    });
  });

  it("leaves the socket alone when the token has not changed", () => {
    connect();
    localStorage.setItem("access_token", "token");

    socket.fire("connect_error");

    expect((socket as unknown as { auth?: unknown }).auth).toBeUndefined();
  });

  it("leaves the socket alone when there is no token at all", () => {
    connect();
    localStorage.removeItem("access_token");

    socket.fire("connect_error");

    expect((socket as unknown as { auth?: unknown }).auth).toBeUndefined();
  });
});

describe("emitting before the socket is up", () => {
  // The store is created, the socket exists, but the handshake has not
  // finished. Every one of these has to be a no-op rather than a crash.
  const beforeConnect = () => {
    connect();
    socket.connected = false;
  };

  it("does not mark a thread read", () => {
    beforeConnect();
    useChatStore.getState().markRead("c-1");
    expect(socket.emitted).toEqual([]);
  });

  it("does not announce typing", () => {
    beforeConnect();
    useChatStore.getState().startTyping("c-1");
    expect(socket.emitted).toEqual([]);
  });

  it("does not announce that typing stopped", () => {
    beforeConnect();
    useChatStore.getState().stopTyping("c-1");
    expect(socket.emitted).toEqual([]);
  });

  it("does not join a conversation", () => {
    beforeConnect();
    useChatStore.getState().joinConversation("c-1");
    expect(socket.emitted).toEqual([]);
  });

  it("does all four once the socket is up", () => {
    connect();
    socket.fire("connect");

    const store = useChatStore.getState();
    store.markRead("c-1");
    store.startTyping("c-1");
    store.stopTyping("c-1");
    store.joinConversation("c-1");

    expect(socket.emitted.map((e) => e.event)).toEqual([
      "markRead",
      "typing",
      "stopTyping",
      "joinConversation",
    ]);
  });
});
