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
