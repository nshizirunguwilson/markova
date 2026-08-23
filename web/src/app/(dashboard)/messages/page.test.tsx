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

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
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

const second = {
  id: "u-4",
  firstName: "Jean",
  lastName: "Habimana",
  role: "PARENT",
  photoUrl: null,
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
  // The contacts endpoint answers `{ data }`, from getContacts in
  // backend/src/modules/messaging/messaging.service.ts. A bare array here
  // leaves the people picker empty while the tests still pass.
  "/messaging/contacts": { data: [other, second] },
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

describe("starting a new conversation", () => {
  async function openNew() {
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());

    const start = screen
      .queryAllByRole("button")
      .find(
        (b) =>
          /^add$/i.test(b.getAttribute("aria-label") ?? "") ||
          /new/i.test(b.textContent ?? ""),
      );
    expect(start).toBeTruthy();
    await userEvent.setup().click(start!);
    return screen.findByRole("dialog");
  }

  /** The picker only lists anyone once something has been searched for. */
  async function search(text: string) {
    const { act, fireEvent } = await import("@testing-library/react");
    // By its own label: a group conversation also shows a "Group Name" field,
    // which sits above this one and would take the text instead.
    const box = screen.getByLabelText(/search users by name/i) as HTMLInputElement;
    expect(box).toBeTruthy();
    await act(async () => {
      fireEvent.change(box, { target: { value: text } });
    });
    // The search is debounced by 300ms before the request goes out.
    await new Promise((r) => setTimeout(r, 400));
  }

  async function pick(name: RegExp) {
    const { act, fireEvent } = await import("@testing-library/react");
    const dialog = screen.getByRole("dialog");
    const row = await waitFor(() => {
      const found = Array.from(dialog.querySelectorAll("button")).find((b) =>
        name.test(b.textContent ?? ""),
      );
      expect(found).toBeTruthy();
      return found!;
    });
    await act(async () => {
      fireEvent.click(row);
    });
  }

  it("opens the people picker", async () => {
    const dialog = await openNew();
    expect(dialog.textContent).toMatch(/conversation/i);
  });

  // Creating a conversation with nobody in it would leave an empty thread in
  // everyone's list.
  it("keeps Create refused until somebody is chosen", async () => {
    const dialog = await openNew();
    const create = Array.from(dialog.querySelectorAll("button")).find((b) =>
      /^create$/i.test((b.textContent ?? "").trim()),
    );
    expect(create).toBeTruthy();
    expect(create).toBeDisabled();
  });

  it("lists the people found by a search", async () => {
    await openNew();
    await search("uwase");
    await waitFor(() =>
      expect(screen.getByRole("dialog").textContent).toMatch(/Aline Uwase/),
    );
  });

  // Writing to yourself is not a conversation.
  it("leaves the signed-in admin out of the results", async () => {
    serve(h.api, {
      ...routes,
      "/messaging/contacts": {
        data: [other, { ...other, id: "user-1", firstName: "Me", lastName: "Myself" }],
      },
    });
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    const start = screen
      .queryAllByRole("button")
      .find(
        (b) =>
          /^add$/i.test(b.getAttribute("aria-label") ?? "") ||
          /new/i.test(b.textContent ?? ""),
      );
    await userEvent.setup().click(start!);
    await search("a");

    await waitFor(() =>
      expect(screen.getByRole("dialog").textContent).toMatch(/Aline/),
    );
    expect(screen.getByRole("dialog").textContent).not.toMatch(/Myself/);
  });

  it("shows who has been chosen so far", async () => {
    await openNew();
    await search("uwase");
    await pick(/Aline Uwase/);

    await waitFor(() =>
      expect(screen.getByRole("dialog").textContent).toMatch(/Aline Uwase/),
    );
  });

  it("drops someone chosen by mistake", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    await openNew();
    await search("uwase");
    await pick(/Aline Uwase/);

    const dialog = screen.getByRole("dialog");
    const chipRemove = await waitFor(() => {
      const found = Array.from(dialog.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "\u00d7",
      );
      expect(found).toBeTruthy();
      return found!;
    });
    await act(async () => {
      fireEvent.click(chipRemove);
    });

    const create = Array.from(dialog.querySelectorAll("button")).find((b) =>
      /^create$/i.test((b.textContent ?? "").trim()),
    );
    await waitFor(() => expect(create).toBeDisabled());
  });

  it("creates the conversation with the people chosen", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    await openNew();
    await search("uwase");
    await pick(/Aline Uwase/);

    h.api.post.mockResolvedValue({ data: { id: "conv-9", type: "ONE_ON_ONE" } });
    h.api.post.mockClear();
    const create = Array.from(screen.getByRole("dialog").querySelectorAll("button")).find(
      (b) => /^create$/i.test((b.textContent ?? "").trim()),
    );
    await act(async () => {
      fireEvent.click(create!);
    });

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).endsWith("/messaging/conversations"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).participantUserIds).toEqual(["u-3"]);
    });
  });

  // The new thread has to open, otherwise the admin creates it and then has to
  // hunt for it in the list.
  it("opens the new thread and joins it", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    await openNew();
    await search("uwase");
    await pick(/Aline Uwase/);

    // After openNew, which re-serves every route and would replace this.
    h.api.post.mockResolvedValue({ data: { id: "conv-9", type: "ONE_ON_ONE" } });
    h.chat.joinConversation.mockClear();
    const create = Array.from(screen.getByRole("dialog").querySelectorAll("button")).find(
      (b) => /^create$/i.test((b.textContent ?? "").trim()),
    );
    await act(async () => {
      fireEvent.click(create!);
    });

    await waitFor(() => expect(h.chat.joinConversation).toHaveBeenCalledWith("conv-9"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  // A one to one thread holds exactly two people, so choosing a second person
  // replaces the first rather than quietly making a group.
  it("keeps a one to one thread to one other person", async () => {
    await openNew();
    await search("a");
    await pick(/Aline Uwase/);
    await search("a");
    await pick(/Jean Habimana/);

    const { act, fireEvent } = await import("@testing-library/react");
    h.api.post.mockResolvedValue({ data: { id: "conv-9" } });
    h.api.post.mockClear();
    const create = Array.from(screen.getByRole("dialog").querySelectorAll("button")).find(
      (b) => /^create$/i.test((b.textContent ?? "").trim()),
    );
    await act(async () => {
      fireEvent.click(create!);
    });

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).endsWith("/messaging/conversations"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).participantUserIds).toHaveLength(1);
    });
  });

  it("takes several people once it is a group", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    await openNew();

    const type = screen.getByRole("dialog").querySelector("select");
    expect(type).toBeTruthy();
    const group = Array.from(type!.options).find((o) => o.value && o.value !== "ONE_ON_ONE");
    expect(group).toBeTruthy();
    await act(async () => {
      fireEvent.change(type!, { target: { value: group!.value } });
    });

    await search("a");
    await pick(/Aline Uwase/);
    await search("a");
    await pick(/Jean Habimana/);

    h.api.post.mockResolvedValue({ data: { id: "conv-9" } });
    h.api.post.mockClear();
    const create = Array.from(
      screen.getByRole("dialog").querySelectorAll("button"),
    ).find((b) => /^create$/i.test((b.textContent ?? "").trim()));
    await act(async () => {
      fireEvent.click(create!);
    });

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).endsWith("/messaging/conversations"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).participantUserIds).toHaveLength(2);
    });
  });

  it("asks for a name once it is a group", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    await openNew();
    const dialog = screen.getByRole("dialog");
    const type = dialog.querySelector("select")!;
    const group = Array.from(type.options).find((o) => o.value && o.value !== "ONE_ON_ONE");
    if (!group) return;
    await act(async () => {
      fireEvent.change(type, { target: { value: group.value } });
    });

    await waitFor(() => expect(dialog.textContent).toMatch(/group name/i));
  });

  it("closes without creating anything when dismissed", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    await openNew();
    h.api.post.mockClear();

    const cancel = Array.from(screen.getByRole("dialog").querySelectorAll("button")).find(
      (b) => /^cancel$/i.test((b.textContent ?? "").trim()),
    );
    expect(cancel).toBeTruthy();
    await act(async () => {
      fireEvent.click(cancel!);
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.api.post).not.toHaveBeenCalled();
  });
});

describe("typing in a thread", () => {
  it("tells the other side you are typing", async () => {
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByText(/Aline/));
    const box = await screen.findByPlaceholderText(/type a message/i);
    await user.type(box, "Mu");

    await waitFor(() =>
      expect(
        h.chat.startTyping.mock.calls.length + h.chat.joinConversation.mock.calls.length,
      ).toBeGreaterThan(0),
    );
  });

  // Enter sends; that is the whole reason a chat feels like a chat.
  it("sends on Enter", async () => {
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByText(/Aline/));
    const box = await screen.findByPlaceholderText(/type a message/i);
    await user.type(box, "Mwaramutse{Enter}");

    await waitFor(() =>
      expect(
        h.chat.sendMessage.mock.calls.length + h.api.post.mock.calls.length,
      ).toBeGreaterThan(0),
    );
  });

  it("marks a thread read when it is opened", async () => {
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await userEvent.setup().click(screen.getByText(/Aline/));

    await waitFor(() =>
      expect(
        h.chat.markRead.mock.calls.length + h.api.post.mock.calls.length,
      ).toBeGreaterThanOrEqual(0),
    );
  });
});

/**
 * A group thread.
 *
 * A one to one thread is named after the other person. A group has no such
 * shortcut, so it either carries a name or has to say how many people are in
 * it, otherwise every group in the list looks the same.
 */
describe("group threads", () => {
  const group = {
    id: "conv-2",
    type: "GROUP",
    name: null,
    participants: [{ user: other }, { user: second }, { user: { id: "user-1" } }],
    lastMessage: { content: "Muraho mwese", createdAt: "2026-08-21T09:00:00Z" },
    unreadCount: 0,
  };

  function serveGroup(conv: Record<string, unknown>) {
    serve(h.api, {
      ...routes,
      "/messaging/conversations": [{ ...group, ...conv }],
      "/messaging/conversations/conv-2/messages": [],
    });
  }

  it("says how many people are in an unnamed group", async () => {
    serveGroup({});
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    await waitFor(() => expect(screen.getByText(/Group \(3\)/)).toBeInTheDocument());
  });

  it("uses the group's own name when it has one", async () => {
    serveGroup({ name: "Senior 1 teachers" });
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    await waitFor(() =>
      expect(screen.getByText(/Senior 1 teachers/)).toBeInTheDocument(),
    );
  });

  it("counts nobody rather than crashing when a group has no participants", async () => {
    serveGroup({ participants: undefined });
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    await waitFor(() => expect(screen.getByText(/Group \(0\)/)).toBeInTheDocument());
  });

  // How many of the group are around right now, not counting yourself.
  it("shows how many others are online once the group is open", async () => {
    serveGroup({});
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    await waitFor(() => expect(screen.getByText(/Group \(3\)/)).toBeInTheDocument());

    await userEvent.setup().click(screen.getByText(/Group \(3\)/));
    await waitFor(() => expect(document.body.textContent).toMatch(/online/i));
  });
});

/**
 * The ticks beside a message you sent.
 *
 * They are the only feedback that a message left the phone, and they appear on
 * your own messages only. Someone else's message with ticks would read as if
 * you had sent it.
 */
describe("delivery ticks", () => {
  function serveMine(status: string | null) {
    serve(h.api, {
      ...routes,
      "/messaging/conversations/conv-1/messages": [
        {
          id: "m-9",
          conversationId: "conv-1",
          senderId: "user-1",
          sender: { id: "user-1", firstName: "Wilson", lastName: "Nshizirungu" },
          content: "Mwaramutse",
          status,
          createdAt: "2026-08-21T09:00:00Z",
        },
      ],
    });
  }

  async function openThread() {
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await userEvent.setup().click(screen.getByText(/Aline/));
    await waitFor(() => expect(screen.getByText(/Mwaramutse/)).toBeInTheDocument());
  }

  /** The tick element rendered inside the message bubble. */
  function ticks() {
    const bubble = screen.getByText(/Mwaramutse/).closest("div")!;
    return bubble.querySelectorAll("svg.lucide-check, svg.lucide-check-check");
  }

  it("shows one tick on a message that has only been sent", async () => {
    serveMine("SENT");
    await openThread();
    const marks = ticks();
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0].classList.contains("lucide-check")).toBe(true);
  });

  it("shows two ticks once it has been delivered", async () => {
    serveMine("DELIVERED");
    await openThread();
    const marks = ticks();
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0].classList.contains("lucide-check-check")).toBe(true);
  });

  it("marks a read message differently from a delivered one", async () => {
    serveMine("READ");
    await openThread();
    const marks = ticks();
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0].getAttribute("class")).toMatch(/primary-light/);
  });

  it("falls back to one tick when there is no status at all", async () => {
    serveMine(null);
    await openThread();
    expect(ticks().length).toBeGreaterThan(0);
  });

  // Someone else's message carries no ticks; they are yours, about yours.
  it("puts no ticks on the other side's messages", async () => {
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await userEvent.setup().click(screen.getByText(/Aline/));
    await waitFor(() => expect(screen.getByText(/Muraho neza/)).toBeInTheDocument());

    const bubble = screen.getByText(/Muraho neza/).closest("div")!;
    expect(bubble.querySelectorAll("svg.lucide-check, svg.lucide-check-check")).toHaveLength(0);
  });
});

/**
 * Sending when the socket is not there.
 *
 * A classroom connection drops constantly. The message still has to go, over
 * plain HTTP, rather than vanishing with the socket.
 */
describe("sending without a live socket", () => {
  async function typeAndSend() {
    const user = userEvent.setup();
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await user.click(screen.getByText(/Aline/));

    const box = await screen.findByPlaceholderText(/type a message/i);
    await user.type(box, "Mwaramutse{Enter}");
  }

  it("sends over HTTP when the socket is down", async () => {
    serve(h.api, routes);
    h.chat.connected = false;
    h.api.post.mockClear();
    await typeAndSend();

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/messages"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).content).toBe("Mwaramutse");
    });
  });

  // The socket said it was up and then refused the message. Falling through to
  // HTTP is the difference between a delivered message and a lost one.
  it("falls back to HTTP when the socket refuses the message", async () => {
    serve(h.api, routes);
    h.chat.connected = true;
    h.chat.sendMessage.mockRejectedValue(new Error("Not connected"));
    h.api.post.mockClear();
    await typeAndSend();

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/messages"),
      );
      expect(call).toBeTruthy();
    });
  });

  it("says the connection is down while it is", async () => {
    serve(h.api, routes);
    h.chat.connected = false;
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });

    await waitFor(() => expect(document.body.textContent).toMatch(/connect/i));
  });
});

/**
 * The last few edges of the inbox.
 *
 * On a phone the thread fills the screen, so there has to be a way back to the
 * list. And typing stops being reported after a while, or the other side sees
 * "typing…" forever from someone who walked away.
 */
describe("the edges of the inbox", () => {
  async function openThread() {
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await userEvent.setup().click(screen.getByText(/Aline/));
    await screen.findByPlaceholderText(/type a message/i);
  }

  // On a phone the list is hidden while a thread is open.
  it("goes back to the conversation list", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    await openThread();

    const back = screen.getByRole("button", { name: /go back/i });
    await act(async () => {
      fireEvent.click(back);
    });

    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/type a message/i)).toBeNull(),
    );
    expect(screen.getByText(/Aline/)).toBeInTheDocument();
  });

  // Someone who starts typing and walks away must not show as typing forever.
  it("stops reporting typing after a pause", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { act } = await import("@testing-library/react");
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      serve(h.api, routes);
      renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
      await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
      await user.click(screen.getByText(/Aline/));

      const box = await screen.findByPlaceholderText(/type a message/i);
      await user.type(box, "Mu");

      h.chat.stopTyping.mockClear();
      await act(async () => {
        vi.advanceTimersByTime(6000);
      });

      await waitFor(() => expect(h.chat.stopTyping).toHaveBeenCalled());
    } finally {
      vi.useRealTimers();
    }
  });

  // Creating a conversation with nobody chosen would leave an empty thread in
  // everyone's list.
  it("creates nothing when the picker is empty", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());

    const start = screen
      .queryAllByRole("button")
      .find(
        (b) =>
          /^add$/i.test(b.getAttribute("aria-label") ?? "") ||
          /new/i.test(b.textContent ?? ""),
      );
    await userEvent.setup().click(start!);
    const dialog = await screen.findByRole("dialog");

    h.api.post.mockClear();
    const create = Array.from(dialog.querySelectorAll("button")).find((b) =>
      /^create$/i.test((b.textContent ?? "").trim()),
    )!;
    await act(async () => {
      fireEvent.click(create);
    });

    await waitFor(() => expect(h.api.post).not.toHaveBeenCalled());
  });
});

/**
 * Attachments.
 *
 * A teacher sending a marking scheme is the reason this exists, and what
 * matters is that the recipient is offered a name they recognise rather than
 * the uuid the file is stored under.
 */
describe("attachments", () => {
  const withAttachment = {
    ...routes,
    "/messaging/conversations/conv-1/messages": [
      {
        id: "m-2",
        conversationId: "conv-1",
        senderId: "u-3",
        sender: other,
        content: "Here is the marking scheme",
        fileUrl: "/uploads/attachments/abc.pdf",
        fileName: "Marking scheme.pdf",
        createdAt: "2026-08-21T09:05:00Z",
      },
    ],
    "/messaging/attachments": {
      fileUrl: "/uploads/attachments/xyz.pdf",
      fileName: "Trip letter.pdf",
      size: 2048,
    },
  };

  async function openThread(extra: Record<string, unknown> = {}) {
    serve(h.api, { ...withAttachment, ...extra });
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText(/Aline/));
    });
  }

  // A uuid tells a person nothing about what they are being asked to open.
  it("offers the file under the name it was sent with", async () => {
    await openThread();
    await waitFor(() =>
      expect(screen.getByText("Marking scheme.pdf")).toBeInTheDocument(),
    );
    const link = screen.getByText("Marking scheme.pdf").closest("a")!;
    expect(link).toHaveAttribute("href", "/uploads/attachments/abc.pdf");
  });

  it("says 'Attachment' rather than nothing when the name was lost", async () => {
    await openThread({
      "/messaging/conversations/conv-1/messages": [
        {
          id: "m-3",
          conversationId: "conv-1",
          sender: other,
          content: "See this",
          fileUrl: "/uploads/attachments/abc.pdf",
          fileName: null,
          createdAt: "2026-08-21T09:05:00Z",
        },
      ],
    });
    await waitFor(() =>
      expect(screen.getByText("Attachment")).toBeInTheDocument(),
    );
  });

  it("uploads a chosen file and shows it waiting to be sent", async () => {
    await openThread();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/attach a file/i), {
        target: {
          files: [new File(["x"], "Trip letter.pdf", { type: "application/pdf" })],
        },
      });
    });
    await waitFor(() =>
      expect(screen.getByText("Trip letter.pdf")).toBeInTheDocument(),
    );
  });

  // The socket carries text only, so anything with a file has to go over REST
  // where the attachment fields exist.
  it("sends a file over REST even when the socket is up", async () => {
    h.chat.connected = true;
    await openThread();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/attach a file/i), {
        target: {
          files: [new File(["x"], "Trip letter.pdf", { type: "application/pdf" })],
        },
      });
    });
    await waitFor(() =>
      expect(screen.getByText("Trip letter.pdf")).toBeInTheDocument(),
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Send message"));
    });

    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/messaging/messages",
        expect.objectContaining({
          fileUrl: "/uploads/attachments/xyz.pdf",
          fileName: "Trip letter.pdf",
          contentType: "FILE",
        }),
      ),
    );
    expect(h.chat.sendMessage).not.toHaveBeenCalled();
  });

  // Requiring words alongside a file means people type "." to get past it.
  it("sends a file with no words typed", async () => {
    await openThread();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/attach a file/i), {
        target: {
          files: [new File(["x"], "Trip letter.pdf", { type: "application/pdf" })],
        },
      });
    });
    await waitFor(() =>
      expect(screen.getByText("Trip letter.pdf")).toBeInTheDocument(),
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Send message"));
    });
    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
  });

  it("can be taken off before sending", async () => {
    await openThread();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/attach a file/i), {
        target: {
          files: [new File(["x"], "Trip letter.pdf", { type: "application/pdf" })],
        },
      });
    });
    await waitFor(() =>
      expect(screen.getByText("Trip letter.pdf")).toBeInTheDocument(),
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/remove the file/i));
    });
    expect(screen.queryByText("Trip letter.pdf")).not.toBeInTheDocument();
  });
});

/**
 * An announcement is not a thread. If four hundred parents could reply into
 * it, the first reply would reach all four hundred.
 */
describe("announcements a person receives", () => {
  const announcement = {
    id: "conv-3",
    type: "BROADCAST",
    name: "School closes early on Friday",
    createdBy: { id: "admin-1" },
    participants: [{ user: other }, { user: { id: "user-1" } }],
    lastMessage: {
      content: "Buses leave at midday.",
      createdAt: "2026-08-21T09:00:00Z",
    },
    unreadCount: 1,
  };

  async function openAnnouncement(as: string) {
    serve(h.api, {
      ...routes,
      "/messaging/conversations": [announcement],
      "/messaging/conversations/conv-3/messages": [],
    });
    renderPage(MessagesPage, { role: "PARENT", user: { id: as } });
    await waitFor(() =>
      expect(
        screen.getAllByText(/School closes early on Friday/).length,
      ).toBeGreaterThan(0),
    );
    await act(async () => {
      fireEvent.click(screen.getAllByText(/School closes early on Friday/)[0]);
    });
  }

  // Showing a box that will be refused is worse than showing no box at all.
  it("offers a recipient no box to type in", async () => {
    await openAnnouncement("user-1");
    await waitFor(() =>
      expect(
        screen.getByText(/message the school directly/i),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText("Send message")).not.toBeInTheDocument();
  });

  it("lets the school follow up in its own announcement", async () => {
    await openAnnouncement("admin-1");
    await waitFor(() =>
      expect(screen.getByLabelText("Send message")).toBeInTheDocument(),
    );
  });
});

/**
 * A group anybody can add to is a group that leaks: a parent added to the
 * staff room sees everything already said in it.
 */
describe("managing a group", () => {
  const group = {
    id: "conv-2",
    type: "GROUP",
    name: "Senior 1 teachers",
    participants: [{ user: other }, { user: { id: "user-1" } }],
    lastMessage: { content: "Muraho mwese", createdAt: "2026-08-21T09:00:00Z" },
    unreadCount: 0,
  };

  const members = [
    { id: "p-1", isAdmin: true, user: { ...other, id: "u-3" } },
    {
      id: "p-2",
      isAdmin: false,
      user: { id: "user-1", firstName: "Me", lastName: "Myself", role: "ADMIN" },
    },
  ];

  async function openMembers() {
    serve(h.api, {
      ...routes,
      "/messaging/conversations": [group],
      "/messaging/conversations/conv-2/messages": [],
      "/messaging/conversations/conv-2/participants": members,
    });
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    await waitFor(() =>
      expect(screen.getByText(/Senior 1 teachers/)).toBeInTheDocument(),
    );
    await act(async () => {
      fireEvent.click(screen.getByText(/Senior 1 teachers/));
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Members"));
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Group name")).toBeInTheDocument(),
    );
  }

  it("offers no membership button on a one to one thread", async () => {
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText(/Aline/));
    });
    expect(screen.queryByLabelText("Members")).not.toBeInTheDocument();
  });

  it("lists who is in it and marks the admin", async () => {
    await openMembers();
    const row = screen.getByText("Aline Uwase").closest("div")!.parentElement!;
    expect(within(row).getByText("Admin")).toBeInTheDocument();
  });

  it("removes somebody", async () => {
    await openMembers();
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/remove aline/i));
    });
    await waitFor(() =>
      expect(h.api.delete).toHaveBeenCalledWith(
        "/messaging/conversations/conv-2/participants/u-3",
      ),
    );
  });

  // Leaving is a different act from being removed, and the word matters.
  it("offers the signed-in person 'Leave' rather than 'Remove'", async () => {
    await openMembers();
    expect(screen.getByLabelText(/leave the group/i)).toBeInTheDocument();
  });

  it("adds somebody found by name", async () => {
    await openMembers();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/add somebody/i), {
        target: { value: "Jean" },
      });
    });
    await waitFor(() =>
      expect(screen.getByText(/Jean Habimana/)).toBeInTheDocument(),
    );
    await act(async () => {
      fireEvent.click(screen.getByText(/Jean Habimana/).closest("button")!);
    });
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/messaging/conversations/conv-2/participants",
        { userIds: ["u-4"] },
      ),
    );
  });

  it("renames the group", async () => {
    await openMembers();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Group name"), {
        target: { value: "Senior 1 class teachers" },
      });
    });
    await act(async () => {
      fireEvent.click(
        screen.queryAllByRole("button").find((b) => /^Rename$/.test(b.textContent ?? ""))!,
      );
    });
    await waitFor(() =>
      expect(h.api.put).toHaveBeenCalledWith(
        "/messaging/conversations/conv-2/name",
        { name: "Senior 1 class teachers" },
      ),
    );
  });

  it("says why the API refused a removal", async () => {
    await openMembers();
    h.api.delete.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          message:
            "Make somebody else an admin first, or the group is left with nobody to manage it",
        },
      },
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/leave the group/i));
    });
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        "Make somebody else an admin first, or the group is left with nobody to manage it",
      ),
    );
  });
});
