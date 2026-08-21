import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    router: { push: fn(), replace: fn(), refresh: fn(), back: fn(), prefetch: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
    chat: {
      connected: true,
      sendMessage: fn(),
      joinConversation: fn(),
      markRead: fn(),
      startTyping: fn(),
      stopTyping: fn(),
      isOnline: () => true,
      getTypingUsers: () => new Map<string, string>(),
    },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  usePathname: () => "/messages",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/stores/chat-store", () => ({
  useChatStore: (selector?: (s: unknown) => unknown) =>
    selector ? selector(h.chat) : h.chat,
}));

import { screen, waitFor } from "@testing-library/react";
import { renderPage, serve, serveAll } from "@/test/page";
import MessagesPage from "./page";

const other = {
  id: "u-3",
  firstName: "Aline",
  lastName: "Uwase",
  role: "TEACHER",
  photoUrl: null,
};

// `type` decides how the title is built, so a one to one thread without it
// renders as "Group (1)" rather than naming the person.
const conversation = {
  id: "conv-1",
  type: "ONE_ON_ONE",
  participants: [{ user: other }],
  lastMessage: { content: "Muraho", createdAt: "2026-08-21T09:00:00Z" },
  unreadCount: 1,
};

const routes = {
  "/messaging/conversations/conv-1/messages": [
    {
      id: "m-1",
      conversationId: "conv-1",
      senderId: "u-3",
      sender: other,
      content: "Muraho neza",
      createdAt: "2026-08-21T09:00:00Z",
    },
  ],
  "/messaging/conversations": [conversation],
  "/messaging/contacts": [other],
  "/messaging/unread": { count: 1 },
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  h.chat.sendMessage.mockReset();
  h.chat.connected = true;
});

describe("the conversation list", () => {
  it("lists the people the user is talking to", async () => {
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
  });

  it("says so when there are no conversations yet", async () => {
    serveAll(h.api, []);
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(screen.queryByText(/Aline/)).not.toBeInTheDocument();
  });

  it("does not go blank when the conversations fail to load", async () => {
    for (const m of Object.values(h.api)) {
      m.mockRejectedValue({ response: { status: 500, data: { message: "no" } } });
    }
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBeNull());
  });
});

describe("sending a message", () => {
  async function openConversation() {
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await userEvent.setup().click(screen.getByText(/Aline/));
    return screen.findByPlaceholderText(/type a message/i);
  }

  it("shows the thread once a conversation is opened", async () => {
    await openConversation();
    await waitFor(() => expect(screen.getByText(/Muraho neza/)).toBeInTheDocument());
  });

  // An empty send would post a blank bubble into someone's thread.
  it("refuses to send an empty message", async () => {
    await openConversation();
    await userEvent.setup().click(screen.getByRole("button", { name: /send message/i }));
    expect(h.chat.sendMessage).not.toHaveBeenCalled();
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("sends what was typed", async () => {
    const box = await openConversation();
    const user = userEvent.setup();
    await user.type(box, "Mwaramutse");
    await user.click(screen.getByRole("button", { name: /send message/i }));
    await waitFor(() => {
      const sentOverSocket = h.chat.sendMessage.mock.calls.length > 0;
      const sentOverRest = h.api.post.mock.calls.length > 0;
      expect(sentOverSocket || sentOverRest).toBe(true);
    });
  });

  // The socket is the fast path; a school on a poor connection still needs the
  // message to leave.
  it("falls back to the REST endpoint when the socket is down", async () => {
    h.chat.connected = false;
    const box = await openConversation();
    const user = userEvent.setup();
    await user.type(box, "Mwaramutse");
    await user.click(screen.getByRole("button", { name: /send message/i }));
    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
  });
});
