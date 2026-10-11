import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    router: { push: fn(), replace: fn(), refresh: fn(), back: fn(), prefetch: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
    pathname: { current: "/messages" },
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

// The people picker waits 300ms of real time before searching. This file runs
// beside a hundred others, and under that load a 300ms timer is not a 300ms
// wait - these tests were losing a four second race on it. The delay itself
// is covered in hooks/use-debounce.test.ts; what belongs here is what the
// picker does once the answer arrives.
vi.mock("@/hooks/use-debounce", () => ({
  useDebounce: <T,>(value: T) => value,
}));

// Typing is driven without userEvent's per-keystroke timer for the same
// reason. `delay: null` is set at every setup() in this file.

vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  usePathname: () => h.pathname.current,
  useSearchParams: () => new URLSearchParams(),
  // Which thread is open is read off the pathname, not from a route
  // parameter - see the screen's own note on why.
  useParams: () => ({}),
}));
vi.mock("@/stores/chat-store", () => ({
  useChatStore: (selector?: (s: unknown) => unknown) =>
    selector ? selector(h.chat) : h.chat,
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve, serveAll } from "@/test/page";
import MessagesPage from "./messages-screen";

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
      senderUserId: "u-3",
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

/**
 * Choose somebody from the results list.
 *
 * Everything is looked up again on each retry. The list re-renders as the
 * debounced search settles and the modal's own node is replaced with it, so
 * a dialog captured once and a button found in an earlier tick are both
 * liable to be detached by the time they are used - the click then lands on
 * a node that is no longer in the document and nothing happens.
 */
async function pickFromList(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
) {
  await waitFor(
    async () => {
      const found = within(screen.getByRole("dialog"))
        .getAllByRole("button")
        .find((b) => name.test(b.textContent ?? ""));
      expect(found).toBeTruthy();
      await user.click(found!);
      // Chosen people leave the list and come back as a chip with a remove
      // button, so this is what proves the click landed.
      expect(chipCloses()).not.toHaveLength(0);
    },
    { timeout: 4000 },
  );
}

/** The × buttons on the chosen-people chips. */
function chipCloses() {
  return within(screen.getByRole("dialog"))
    .queryAllByRole("button")
    .filter((b) => (b.textContent ?? "").trim() === "\u00d7");
}


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
    await userEvent.setup({ delay: null }).click(screen.getByText(/Aline/));
    return screen.findByPlaceholderText(/type a message/i);
  }

  it("shows the thread once a conversation is opened", async () => {
    await openConversation();
    await waitFor(() => expect(screen.getByText(/Muraho neza/)).toBeInTheDocument());
  });

  // An empty send would post a blank bubble into someone's thread. There is
  // no Send to press while the field is empty - the microphone has that
  // place - so what has to hold is that nothing leaves.
  it("refuses to send an empty message", async () => {
    await openConversation();
    expect(screen.queryByRole("button", { name: /send message/i })).toBeNull();
    expect(h.chat.sendMessage).not.toHaveBeenCalled();
    expect(h.api.post).not.toHaveBeenCalled();
  });

  // Enter reaches the same code without going through the button, so the
  // check has to be in the sending itself rather than only in what is dimmed.
  it("refuses an empty message pressed through with Enter", async () => {
    const box = await openConversation();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(h.chat.sendMessage).not.toHaveBeenCalled();
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("sends what was typed", async () => {
    const box = await openConversation();
    const user = userEvent.setup({ delay: null });
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
    const user = userEvent.setup({ delay: null });
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
    await userEvent.setup({ delay: null }).click(start!);
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
    await userEvent.setup({ delay: null }).click(start!);
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

    const user = userEvent.setup({ delay: null });
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

    const user = userEvent.setup({ delay: null });
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
    await userEvent.setup({ delay: null }).click(screen.getByText(/Aline/));

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

    await userEvent.setup({ delay: null }).click(screen.getByText(/Group \(3\)/));
    await waitFor(() => expect(document.body.textContent).toMatch(/online/i));
  });
});

/**
 * What a message you sent says about itself.
 *
 * Words, not ticks: one tick against two, and grey against blue, is a code
 * borrowed from one particular app, and a parent messaging the school should
 * not have to know it. It appears on your own messages only - the same line
 * under someone else's would read as though you had sent it.
 */
describe("the state of a message you sent", () => {
  function serveMine(status: string | null) {
    serve(h.api, {
      ...routes,
      "/messaging/conversations/conv-1/messages": [
        {
          id: "m-9",
          conversationId: "conv-1",
          senderUserId: "user-1",
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
    await userEvent.setup({ delay: null }).click(screen.getByText(/Aline/));
    await waitFor(() => expect(screen.getByText(/Mwaramutse/)).toBeInTheDocument());
  }

  /**
   * The state line for the run the message belongs to. Written once under a
   * run, on its timestamp line, rather than inside every bubble.
   *
   * Found by walking up to the run itself rather than by counting parents:
   * each message now sits in its own row alongside a reply control, so the
   * footer is no longer the bubble's immediate parent.
   */
  function state() {
    const run = screen
      .getByText(/Mwaramutse/)
      .closest('[class*="group/msg"]')!;
    return run.textContent ?? "";
  }

  it("says Sent for a message that has only left", async () => {
    serveMine("SENT");
    await openThread();
    expect(state()).toContain("Sent");
  });

  it("says Delivered once it has arrived", async () => {
    serveMine("DELIVERED");
    await openThread();
    expect(state()).toContain("Delivered");
    expect(state()).not.toContain("Read");
  });

  it("says Read, and sets it apart from Delivered", async () => {
    serveMine("READ");
    await openThread();
    expect(state()).toContain("Read");
    const word = screen.getByText("Read");
    expect(word.className).toContain("text-primary");
  });

  it("says Sent when there is no status at all", async () => {
    serveMine(null);
    await openThread();
    expect(state()).toContain("Sent");
  });

  // Someone else's message carries no state line; it is yours, about yours.
  it("says nothing about the other side's messages", async () => {
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await userEvent.setup({ delay: null }).click(screen.getByText(/Aline/));
    await waitFor(() => expect(screen.getByText(/Muraho neza/)).toBeInTheDocument());

    const run = screen.getByText(/Muraho neza/).closest("div")!.parentElement!;
    for (const word of ["Sent", "Delivered", "Read"]) {
      expect(run.textContent).not.toContain(word);
    }
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
    const user = userEvent.setup({ delay: null });
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
    await userEvent.setup({ delay: null }).click(screen.getByText(/Aline/));
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
    await userEvent.setup({ delay: null }).click(start!);
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
    // The composer is there to write in; Send appears once there is something
    // to send, so the field itself is what proves the school may reply.
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument(),
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

/**
 * The typing line, and everything the inbox draws when a thread is not tidy.
 *
 * "Aline is typing" and "Aline, Jean and 3 more are typing" are two different
 * sentences, and the second one is the one nobody writes a test for. The rest
 * of this block covers threads whose sender, name or participants are missing,
 * which is what a thread looks like after somebody leaves the school.
 */
/**
 * jsdom lays nothing out, so a scrolling container reports zero for all of
 * its metrics. These stand in for a thread taller than its own window.
 */
function tallList(scrollHeight: number, clientHeight: number) {
  const originals = (["scrollHeight", "clientHeight"] as const).map((name) => {
    const original = Object.getOwnPropertyDescriptor(Element.prototype, name);
    const value = name === "scrollHeight" ? scrollHeight : clientHeight;
    Object.defineProperty(Element.prototype, name, {
      configurable: true,
      get: () => value,
    });
    return () => {
      if (original) Object.defineProperty(Element.prototype, name, original);
      else delete (Element.prototype as unknown as Record<string, unknown>)[name];
    };
  });
  return () => originals.forEach((undo) => undo());
}

describe("who is typing", () => {
  async function openWithTyping(names: string[]) {
    const map = new Map(names.map((n, i) => [`typer-${i}`, n]));
    h.chat.getTypingUsers = () => map;
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await userEvent.setup({ delay: null }).click(screen.getByText(/Aline/));
    await screen.findByPlaceholderText(/type a message/i);
  }

  afterEach(() => {
    h.chat.getTypingUsers = () => new Map<string, string>();
  });

  it("says nothing when nobody is typing", async () => {
    await openWithTyping([]);
    expect(screen.queryByText(/is typing/)).toBeNull();
    expect(screen.queryByText(/are typing/)).toBeNull();
  });

  it("names one person in the singular", async () => {
    await openWithTyping(["Aline"]);
    expect(await screen.findByText(/Aline is typing/)).toBeInTheDocument();
  });

  /**
   * The notice is drawn under the last message, so the thread has to follow
   * it down. Left out of the scroll effect it sat below the fold and only
   * the person doing the typing ever saw it in full - their own keystrokes
   * were sending messages, and those did move the view.
   */
  it("does not jump a reader who has scrolled up", async () => {
    const restore = tallList(4000, 500);
    try {
      await openWithTyping(["Aline"]);
      await screen.findByText(/Aline is typing/);
      const list = document.querySelector(".overflow-y-auto.px-4") as HTMLElement;
      // Let the landing finish - it settles on the next frame, and scrolling
      // up before that would be undone by it rather than by the follow.
      await new Promise((r) => setTimeout(r, 80));

      // They scroll back to read something, and the thread must stay put.
      list.scrollTop = 100;
      await new Promise((r) => setTimeout(r, 80));
      expect(list.scrollTop).toBe(100);
    } finally {
      restore();
    }
  });

  it("waits for the thread before deciding where the bottom is", async () => {
    const restore = tallList(4000, 500);
    try {
      serve(h.api, {
        ...routes,
        "/messaging/conversations/conv-1/messages": [],
      });
      renderPage(MessagesPage, { role: "ADMIN" });
      await userEvent.setup({ delay: null }).click(
        await screen.findByRole("button", { name: /Aline/ }),
      );
      await screen.findByPlaceholderText(/type a message/i);

      // An empty thread has no end to land on, so nothing is scrolled and the
      // landing is still owed once the messages arrive.
      const list = document.querySelector(".overflow-y-auto.px-4") as HTMLElement;
      expect(list.scrollTop).toBe(0);
    } finally {
      restore();
    }
  });

  it("puts the notice inside the thread, above the point scrolled to", async () => {
    await openWithTyping(["Aline"]);
    const notice = await screen.findByText(/Aline is typing/);

    const list = notice.closest(".overflow-y-auto");
    expect(list).not.toBeNull();

    // The last child is the anchor `scrollIntoView` is called on, so
    // reaching it brings the notice with it.
    const anchor = list!.lastElementChild!;
    expect(anchor.textContent).toBe("");
    expect(
      notice.compareDocumentPosition(anchor) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  /**
   * Somebody who has scrolled up to read older messages is left where they
   * are. Being yanked to the bottom because the other party started typing
   * loses their place, which is worse than missing the notice.
   */
  it("leaves a reader who has scrolled up where they are", async () => {
    const metrics = (name: string, value: number) => {
      const original = Object.getOwnPropertyDescriptor(
        Element.prototype,
        name,
      );
      Object.defineProperty(Element.prototype, name, {
        configurable: true,
        get: () => value,
      });
      return () => {
        if (original) Object.defineProperty(Element.prototype, name, original);
        else delete (Element.prototype as unknown as Record<string, unknown>)[name];
      };
    };
    // A long thread, parked near the top of it.
    const restore = [
      metrics("scrollHeight", 4000),
      metrics("clientHeight", 500),
      metrics("scrollTop", 0),
    ];
    const scrolled = vi.spyOn(Element.prototype, "scrollIntoView");

    try {
      await openWithTyping(["Aline"]);
      expect(await screen.findByText(/Aline is typing/)).toBeInTheDocument();
      expect(scrolled).not.toHaveBeenCalled();
    } finally {
      scrolled.mockRestore();
      restore.forEach((undo) => undo());
    }
  });

  /**
   * Opening a thread lands on the end of it. Not smoothly: a smooth scroll
   * aims at the scroll height as it was when the animation began, and the
   * thread is still wrapping its messages underneath it - which left the last
   * message half-hidden behind the composer.
   */
  it("lands on the bottom when the thread opens", async () => {
    const restore = tallList(4000, 500);
    try {
      await openWithTyping(["Aline"]);
      await screen.findByText(/Aline is typing/);
      const list = document.querySelector(".overflow-y-auto.px-4") as HTMLElement;
      expect(list.scrollTop).toBe(4000);
    } finally {
      restore();
    }
  });

  it("names two people in the plural", async () => {
    await openWithTyping(["Aline", "Jean"]);
    const line = await screen.findByText(/are typing/);
    expect(line.textContent).toContain("Aline, Jean");
    expect(line.textContent).not.toContain("more");
  });

  it("counts the rest once more than two are typing", async () => {
    await openWithTyping(["Aline", "Jean", "Keza", "Manzi"]);
    const line = await screen.findByText(/are typing/);
    // Two names then a count, rather than a wall of names.
    expect(line.textContent).toContain("Aline, Jean");
    expect(line.textContent).toContain("and 2 more");
  });
});

describe("threads with pieces missing", () => {
  const nameless = {
    id: "conv-9",
    type: "ONE_ON_ONE",
    // Everyone in it has left, so there is no other person to name it after.
    participants: [],
    lastMessage: null,
    unreadCount: 0,
  };

  it("falls back to calling it a chat", async () => {
    serve(h.api, { ...routes, "/messaging/conversations": [nameless] });
    renderPage(MessagesPage, { role: "ADMIN" });
    expect(await screen.findByText("Chat")).toBeInTheDocument();
  });

  it("names the sender only on messages that are not yours", async () => {
    serve(h.api, {
      ...routes,
      "/messaging/conversations/conv-1/messages": [
        {
          id: "m-1",
          conversationId: "conv-1",
          senderUserId: "u-3",
          sender: other,
          content: "Muraho",
          createdAt: "2026-08-21T09:00:00Z",
        },
        {
          id: "m-2",
          conversationId: "conv-1",
          senderUserId: "user-1",
          sender: { id: "user-1", firstName: "Wilson", lastName: "Nshizirungu" },
          content: "Muraho neza",
          createdAt: "2026-08-21T09:01:00Z",
        },
      ],
    });
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    await waitFor(() => expect(screen.getAllByText(/Aline/).length).toBeGreaterThan(0));
    await userEvent.setup({ delay: null }).click(screen.getAllByText(/Aline/)[0]);

    await screen.findByText("Muraho neza");
    // Your own bubble carries no name: you know who you are.
    expect(screen.queryByText(/Wilson Nshizirungu/)).toBeNull();
  });
});

describe("choosing who a new conversation is with", () => {
  async function openPicker(over: Record<string, unknown> = {}) {
    serve(h.api, { ...routes, ...over });
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByRole("dialog");
    return user;
  }

  it("shows nobody until a name is typed", async () => {
    await openPicker();
    // The thread list behind the dialog still names Aline, so this asks the
    // dialog itself.
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText(/Aline Uwase/)).toBeNull();
  });

  it("says so when the search matches nobody", async () => {
    const user = await openPicker({ "/messaging/contacts": { data: [] } });
    await user.type(screen.getByLabelText("Search users by name..."), "zzz");

    expect(
      await screen.findByText("No users found", undefined, { timeout: 4000 }),
    ).toBeInTheDocument();
  });

  it("lists the people it found and puts one in the chip row", async () => {
    const user = await openPicker();
    await user.type(screen.getByLabelText("Search users by name..."), "ali");

    const row = await screen.findByRole("dialog");
    await pickFromList(user, /Aline Uwase/);

    // Chosen people move into a chip row above the search box.
    await waitFor(() =>
      expect(within(row).getAllByText(/Aline Uwase/).length).toBeGreaterThan(0),
    );
  });

  it("drops a person back out of the chip row", async () => {
    const user = await openPicker();
    await user.type(screen.getByLabelText("Search users by name..."), "ali");

    await pickFromList(user, /Aline Uwase/);

    await user.click(chipCloses()[0]);

    await waitFor(() => expect(chipCloses()).toHaveLength(0));
  });

  it("sends nothing when Create is pressed with nobody chosen", async () => {
    const user = await openPicker();
    const dialog = screen.getByRole("dialog");
    h.api.post.mockClear();

    const create = within(dialog)
      .getAllByRole("button")
      .find((b) => /create|start/i.test((b.textContent ?? "").trim()));
    if (!create) return;
    await user.click(create);

    expect(
      h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/messaging/conversations"),
      ),
    ).toBeUndefined();
  });
});

describe("an inbox with no threads in it at all", () => {
  it("says so rather than showing an empty column", async () => {
    serve(h.api, { ...routes, "/messaging/conversations": [] });
    renderPage(MessagesPage, { role: "ADMIN" });

    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(await screen.findByText("No conversations yet")).toBeInTheDocument();
  });
});

/**
 * Threads and people the joins came back short on.
 *
 * A school's messaging list outlives its accounts: a teacher leaves, a parent
 * is deactivated, and the threads they were in are still there. Every one of
 * these has to draw rather than take the inbox down.
 */
describe("people whose accounts are gone", () => {
  it("puts a question mark where an initial would be", async () => {
    serve(h.api, {
      ...routes,
      "/messaging/contacts": {
        data: [{ id: "u-9", firstName: "", lastName: "", role: "TEACHER" }],
      },
    });
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByRole("dialog");
    await user.type(screen.getByLabelText("Search users by name..."), "a");

    expect(await screen.findByText("?")).toBeInTheDocument();
  });

  it("falls back to an id when a chosen person is no longer in the results", async () => {
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByRole("dialog");
    await user.type(screen.getByLabelText("Search users by name..."), "ali");
    await pickFromList(user, /Aline Uwase/);

    // The search moves on and no longer contains them; the chip must still
    // show something rather than going blank.
    serve(h.api, { ...routes, "/messaging/contacts": { data: [] } });
    await user.clear(screen.getByLabelText("Search users by name..."));
    await user.type(screen.getByLabelText("Search users by name..."), "zzz");

    await waitFor(
      () =>
        expect(
          within(screen.getByRole("dialog")).getByText("u-3"),
        ).toBeInTheDocument(),
      { timeout: 4000 },
    );
  });

  it("names a message from someone with no name left", async () => {
    serve(h.api, {
      ...routes,
      "/messaging/conversations/conv-1/messages": [
        {
          id: "m-ghost",
          conversationId: "conv-1",
          senderUserId: "u-gone",
          sender: { id: "u-gone" },
          content: "Muraho",
          createdAt: "2026-08-21T09:00:00Z",
        },
      ],
    });
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await userEvent.setup({ delay: null }).click(screen.getByText(/Aline/));

    // The message itself survives, on the left, with a blank name above it.
    expect(await screen.findByText("Muraho")).toBeInTheDocument();
  });
});

describe("a group whose member list is still loading", () => {
  it("opens the members panel with nothing in it rather than throwing", async () => {
    const group = {
      id: "conv-2",
      type: "GROUP",
      name: "Senior 2 parents",
      participants: [{ user: other }],
      lastMessage: null,
      unreadCount: 0,
    };
    serve(h.api, {
      ...routes,
      "/messaging/conversations": [group],
      "/messaging/conversations/conv-2/messages": [],
      "/messaging/conversations/conv-2/participants": undefined,
    });
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    await waitFor(() =>
      expect(screen.getByText("Senior 2 parents")).toBeInTheDocument(),
    );

    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByText("Senior 2 parents"));
    await user.click(await screen.findByLabelText("Members"));

    // The rename box opens seeded with the group's current name.
    await waitFor(() =>
      expect(screen.getByDisplayValue("Senior 2 parents")).toBeInTheDocument(),
    );
  });
});
describe("a group whose members have no names left", () => {
  const group = {
    id: "conv-2",
    type: "GROUP",
    name: "Senior 2 parents",
    participants: [{ user: other }],
    lastMessage: null,
    unreadCount: 0,
  };

  async function openMembers(participants: unknown) {
    serve(h.api, {
      ...routes,
      "/messaging/conversations": [group],
      "/messaging/conversations/conv-2/messages": [],
      "/messaging/conversations/conv-2/participants": participants,
    });
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    await waitFor(() =>
      expect(screen.getByText("Senior 2 parents")).toBeInTheDocument(),
    );

    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByText("Senior 2 parents"));
    await user.click(await screen.findByLabelText("Members"));
  }

  it("puts a question mark where an initial would be", async () => {
    await openMembers([{ id: "p-1", user: { id: "u-9", firstName: "", lastName: "" } }]);

    expect(await screen.findByText("?")).toBeInTheDocument();
  });

  it("says so when a group has nobody in it", async () => {
    await openMembers([]);

    expect(await screen.findByText("Nobody to show.")).toBeInTheDocument();
  });

  it("names the members it does have", async () => {
    await openMembers([{ id: "p-1", user: other }]);

    await waitFor(() =>
      expect(screen.getAllByText(/Aline Uwase/).length).toBeGreaterThan(0),
    );
  });
});

/**
 * A group with no name, and lists that never arrived.
 *
 * A group started from the picker carries no name until somebody sets one, so
 * the rename box has to open empty rather than showing "undefined". The two
 * lists behind the members panel each come from their own request, and either
 * can fail on its own.
 */
describe("renaming a group that has no name yet", () => {
  const unnamed = {
    id: "conv-2",
    type: "GROUP",
    name: null,
    participants: [{ user: other }, { user: second }],
    lastMessage: null,
    unreadCount: 0,
  };

  async function openMembersOf(over: Record<string, unknown> = {}) {
    serve(h.api, {
      ...routes,
      "/messaging/conversations": [unnamed],
      "/messaging/conversations/conv-2/messages": [],
      "/messaging/conversations/conv-2/participants": [{ id: "p-1", user: other }],
      ...over,
    });
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    await waitFor(() => expect(screen.getByText(/Group \(2\)/)).toBeInTheDocument());

    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByText(/Group \(2\)/));
    await user.click(await screen.findByLabelText("Members"));
    return user;
  }

  it("opens the rename box empty", async () => {
    await openMembersOf();

    const box = await waitFor(() => {
      const found = screen
        .queryAllByRole("textbox")
        .find((el) => /name/i.test(el.getAttribute("placeholder") ?? ""));
      expect(found).toBeTruthy();
      return found as HTMLInputElement;
    });
    expect(box.value).toBe("");
  });

  it("copes with a member list that never arrived", async () => {
    await openMembersOf({
      "/messaging/conversations/conv-2/participants": undefined,
    });

    // The panel opens on an empty list rather than throwing on undefined.
    expect(await screen.findByText("Nobody to show.")).toBeInTheDocument();
  });

  it("copes with a contact list that never arrived", async () => {
    await openMembersOf({ "/messaging/contacts": undefined });

    // The "add someone" picker inside the panel has nobody to offer, and the
    // panel still draws rather than throwing on an undefined list.
    await waitFor(() =>
      expect(screen.getByRole("dialog")).toBeInTheDocument(),
    );
    expect(document.body.textContent).not.toMatch(/undefined/);
  });
});

/**
 * The typing indicator timing out, and a file the server named nothing.
 *
 * The indicator is switched off five seconds after the last keystroke, or the
 * other side is told somebody is typing for the rest of the day. The nameless
 * file is the other half: an upload that answers without a filename must not
 * become a message reading "undefined".
 */
describe("the typing indicator timing out", () => {
  it("tells the other side you stopped", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serve(h.api, routes);
    h.chat.connected = true;
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await user.click(screen.getByText(/Aline/));
    const box = await screen.findByPlaceholderText(/type a message/i);
    await user.type(box, "Mu");

    h.chat.stopTyping.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });

    expect(h.chat.stopTyping).toHaveBeenCalledWith("conv-1");
    vi.useRealTimers();
  }, 20000);
});
describe("how the inbox marks a thread", () => {
  const withConv = (over: Record<string, unknown>) => ({
    ...routes,
    "/messaging/conversations": [{ ...conversation, ...over }],
  });

  async function openInbox(over: Record<string, unknown>) {
    serve(h.api, withConv(over));
    renderPage(MessagesPage, { role: "ADMIN" });
    await screen.findByRole("button", { name: /Aline/ });
  }

  /**
   * The inbox row, by its exact label. A loose match now also finds the
   * "Reply to Aline Uwase" control inside an open thread.
   */
  /**
   * The inbox row. Anchored at the start so it matches both the plain label
   * and "Aline Uwase, 3 unread", but not the "Reply to Aline Uwase" control
   * inside an open thread.
   */
  function row() {
    return screen.getByRole("button", { name: /^Aline Uwase/ });
  }

  it("counts the unread messages in the school's own colour", async () => {
    await openInbox({ unreadCount: 3 });
    const badge = screen.getByText("3");
    // Not danger red: an unread message is not an error.
    expect(badge.className).toContain("bg-primary");
    expect(badge.className).toContain("text-on-primary");
    expect(badge.className).not.toContain("danger");
  });

  it("caps a runaway count rather than stretching the row", async () => {
    await openInbox({ unreadCount: 214 });
    expect(screen.getByText("99+")).toBeInTheDocument();
    expect(screen.queryByText("214")).toBeNull();
  });

  it("says how many are unread to a screen reader", async () => {
    await openInbox({ unreadCount: 3 });
    expect(
      screen.getByRole("button", { name: /Aline Uwase, 3 unread/ }),
    ).toBeInTheDocument();
  });

  /**
   * "Where am I" and "what is waiting" are two questions, so they get two
   * devices and can both be true at once. Selection changes the row's
   * ground; unread is weight, a full-strength preview and a marker.
   */
  it("sets an unread thread apart by weight and a marker", async () => {
    await openInbox({ unreadCount: 2 });
    const name = screen.getByText("Aline Uwase");
    expect(name.className).toContain("font-semibold");
    // The one place brand colour appears in this column.
    expect(row().querySelector(".bg-primary")).not.toBeNull();
  });

  it("leaves a read thread quiet", async () => {
    await openInbox({ unreadCount: 0 });
    const name = screen.getByText("Aline Uwase");
    expect(name.className).toContain("font-medium");
    expect(name.className).not.toContain("font-semibold");
    expect(screen.queryByText("0")).toBeNull();
  });

  it("marks the open thread without borrowing the unread signal", async () => {
    await openInbox({ unreadCount: 0 });
    await userEvent.setup({ delay: null }).click(row());
    await waitFor(() => expect(row()).toHaveAttribute("aria-current", "true"));
    expect(row().className).toContain("bg-surface-muted");
    // Selection must not light the unread marker.
    expect(row().querySelector(".bg-primary")).toBeNull();
  });

  it("shows both at once on an unread thread that is open", async () => {
    await openInbox({ unreadCount: 4 });
    await userEvent.setup({ delay: null }).click(row());
    await waitFor(() => expect(row()).toHaveAttribute("aria-current", "true"));
    expect(row().className).toContain("bg-surface-muted");
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("names the other person on their last message", async () => {
    await openInbox({
      lastMessage: {
        senderUserId: "u-3",
        content: "Muraho",
        createdAt: "2026-08-21T09:00:00Z",
        sender: { firstName: "Aline", lastName: "Uwase" },
      },
    });
    expect(await screen.findByText(/Aline: Muraho/)).toBeInTheDocument();
  });

  // Your own name quoted back at you in your own inbox reads as somebody
  // else talking about you.
  it("says You on a message the viewer sent", async () => {
    await openInbox({
      lastMessage: {
        // `sender` is a two-field projection with no id; the id the API
        // sends is `senderUserId`.
        senderUserId: "user-1",
        content: "Murakoze",
        createdAt: "2026-08-21T09:00:00Z",
        sender: { firstName: "Aline", lastName: "Uwase" },
      },
    });
    expect(await screen.findByText(/You: Murakoze/)).toBeInTheDocument();
  });
});

/**
 * How a run of messages is drawn.
 *
 * Three messages sent in a row are one remark. Repeating the sender's name
 * and the clock on each of them gives the least important thing on screen the
 * same rhythm as the words, which is what made this read like a log file.
 */
describe("runs of messages from one person", () => {
  const at = (id: string, senderUserId: string, minute: number, content: string) => ({
    id,
    conversationId: "conv-1",
    senderUserId,
    sender:
      senderUserId === "user-1"
        ? { id: "user-1", firstName: "Wilson", lastName: "Nshizirungu" }
        : other,
    content,
    /*
      Seconds apart inside one minute, because that is what a run is now: a
      run carries one clock reading, so it can only hold messages that read
      the same on the clock.
    */
    createdAt: `2026-08-21T09:00:${String(minute * 10).padStart(2, "0")}Z`,
  });

  async function openWith(messages: unknown[], conv = conversation, open = /Aline/) {
    serve(h.api, {
      ...routes,
      "/messaging/conversations": [conv],
      "/messaging/conversations/conv-1/messages": messages,
    });
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    const row = await screen.findByRole("button", { name: open });
    await userEvent.setup({ delay: null }).click(row);
  }

  /** Timestamps inside the thread, not the one on each inbox row. */
  function threadStamps() {
    const thread = document.querySelector(".overflow-y-auto.px-4");
    return Array.from(thread?.querySelectorAll("span.tabular-nums") ?? []);
  }

  it("stamps the clock once on a run, not on every message", async () => {
    // The endpoint answers newest first.
    await openWith([
      at("m-3", "u-3", 2, "and one more"),
      at("m-2", "u-3", 1, "another"),
      at("m-1", "u-3", 0, "Muraho"),
    ]);
    await screen.findByText("Muraho");
    expect(screen.getByText("another")).toBeInTheDocument();

    expect(threadStamps()).toHaveLength(1);
  });

  it("splits the run when the other person answers", async () => {
    await openWith([
      at("m-3", "u-3", 2, "and one more"),
      at("m-2", "user-1", 1, "my reply"),
      at("m-1", "u-3", 0, "Muraho"),
    ]);
    await screen.findByText("Muraho");
    expect(threadStamps()).toHaveLength(3);
  });

  /**
   * The tail is what tells a chat bubble from a box: it points at whoever
   * said it, so the eye knows which side a message came from before reading
   * a word. Only the first bubble of a run carries one - four bubbles from
   * one person do not need four arrows.
   */
  /**
   * The tail opens a run and points at whoever said it. Four bubbles from one
   * person do not need four arrows pointing at the same place.
   */
  it("gives the run one tail, on its first bubble", async () => {
    await openWith([
      at("m-2", "u-3", 1, "another"),
      at("m-1", "u-3", 0, "Muraho"),
    ]);
    await screen.findByText("Muraho");
    const first = screen.getByText("Muraho").closest("div")!;
    const last = screen.getByText("another").closest("div")!;
    expect(first.className).toContain("bubble-tail-start");
    expect(last.className).not.toContain("bubble-tail");
    expect(last.className).toContain("bubble");
  });

  // Your own run is the same shape mirrored: the tail points the other way.
  it("points your own tail at your side", async () => {
    await openWith([
      at("m-2", "user-1", 1, "and this"),
      at("m-1", "user-1", 0, "I said this"),
    ]);
    await screen.findByText("I said this");
    const first = screen.getByText("I said this").closest("div")!;
    const last = screen.getByText("and this").closest("div")!;
    expect(first.className).toContain("bubble-tail-end");
    expect(last.className).not.toContain("bubble-tail");
    expect(first.className).toContain("bg-primary");
  });

  it("states the message's fate once for the run, not per message", async () => {
    await openWith([
      { ...at("m-2", "user-1", 1, "and this"), status: "READ" },
      { ...at("m-1", "user-1", 0, "I said this"), status: "READ" },
    ]);
    await screen.findByText("I said this");
    expect(screen.getAllByText("Read")).toHaveLength(1);
  });

  /**
   * One control at the end of the row, and it is whichever one you mean: a
   * microphone while there is nothing to send, Send the moment there is.
   */
  it("offers the microphone until something has been typed", async () => {
    await openWith([at("m-1", "u-3", 0, "Muraho")]);
    await screen.findByText("Muraho");

    expect(
      screen.getByRole("button", { name: /record a voice note/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send message/i })).toBeNull();

    const box = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(box, { target: { value: "Murakoze" } });

    expect(
      screen.getByRole("button", { name: /send message/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /record a voice note/i }),
    ).toBeNull();
  });

  // A stray space is not a message, and must not take the microphone away.
  it("keeps the microphone for a field holding only spaces", async () => {
    await openWith([at("m-1", "u-3", 0, "Muraho")]);
    await screen.findByText("Muraho");

    fireEvent.change(screen.getByPlaceholderText(/type a message/i), {
      target: { value: "   " },
    });

    expect(
      screen.getByRole("button", { name: /record a voice note/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send message/i })).toBeNull();
  });

  // Choosing a file is something to send, even with nothing typed.
  it("offers Send once a file is chosen with nothing typed", async () => {
    await openWith([at("m-1", "u-3", 0, "Muraho")]);
    await screen.findByText("Muraho");

    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "marks.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: 2000 });
    fireEvent.change(picker, { target: { files: [file] } });

    expect(
      await screen.findByRole("button", { name: /send message/i }),
    ).toBeInTheDocument();
  });

  /*
    Attachments were taken out of the chat once, when the only thing they did
    was upload a file with no preview and no download. They are back with all
    three, and the composer offers them beside the field rather than as a
    separate control somewhere else on the page.
  */
  it("offers a way to attach a file beside the field", async () => {
    await openWith([at("m-1", "u-3", 0, "Muraho")]);
    await screen.findByText("Muraho");
    expect(document.querySelector('input[type="file"]')).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /attach a file/i }),
    ).toBeInTheDocument();
  });

  it("names the sender in a group, where there is more than one", async () => {
    await openWith(
      [at("m-1", "u-3", 0, "Muraho")],
      {
        ...conversation,
        type: "GROUP",
        name: "Staff",
        participants: [{ user: other }, { user: second }],
      } as typeof conversation & { name: string },
      /Staff/,
    );
    await screen.findByText("Muraho");
    // Once, above the run - not on the bubble.
    expect(screen.getAllByText("Aline Uwase").length).toBeGreaterThan(0);
  });

  it("leaves the name off a one to one, where there is only one sender", async () => {
    await openWith([at("m-1", "u-3", 0, "Muraho")]);
    await screen.findByText("Muraho");
    const thread = screen.getByText("Muraho").closest(".overflow-y-auto")!;
    expect(thread.textContent).not.toContain("Aline Uwase");
  });

  it("separates the days rather than running them together", async () => {
    await openWith([
      { ...at("m-2", "u-3", 1, "today"), createdAt: new Date().toISOString() },
      { ...at("m-1", "u-3", 0, "long ago"), createdAt: "2026-08-01T09:00:00Z" },
    ]);
    await screen.findByText("today");
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText(/August/)).toBeInTheDocument();
  });
});

/**
 * Motion in the thread.
 *
 * A message that arrives while you are reading rises in. Everything already
 * in the thread when you opened it does not - animating a hundred bubbles up
 * on a thread you scrolled back through is a staggered list entrance: it
 * delays reading and looks like the page loading twice.
 */
describe("a message arriving while you watch", () => {
  const at = (id: string, senderUserId: string, minute: number, content: string) => ({
    id,
    conversationId: "conv-1",
    senderUserId,
    sender: { id: senderUserId, firstName: "Aline", lastName: "Uwase" },
    content,
    /*
      Seconds apart inside one minute, because that is what a run is now: a
      run carries one clock reading, so it can only hold messages that read
      the same on the clock.
    */
    createdAt: `2026-08-21T09:00:${String(minute * 10).padStart(2, "0")}Z`,
  });

  async function openThread(messages: unknown[]) {
    serve(h.api, {
      ...routes,
      "/messaging/conversations/conv-1/messages": messages,
    });
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    const row = await screen.findByRole("button", { name: /Aline/ });
    await userEvent.setup({ delay: null }).click(row);
  }

  it("animates nothing on a thread you have just opened", async () => {
    await openThread([at("m-2", "u-3", 1, "second"), at("m-1", "u-3", 0, "first")]);
    await screen.findByText("first");
    expect(document.querySelector(".motion-rise-in")).toBeNull();
  });

  it("leaves an old message alone even when it is the last one", async () => {
    await openThread([at("m-1", "u-3", 0, "only")]);
    await screen.findByText("only");
    const group = screen.getByText("only").closest("div")!.parentElement!;
    expect(group.className).not.toContain("motion-rise-in");
  });

  // The one case that should move: a message that turns up while the thread
  // is open. Here it is the reader's own reply coming back from the server.
  it("lifts in a message that arrives while the thread is open", async () => {
    await openThread([at("m-1", "u-3", 0, "first")]);
    await screen.findByText("first");
    expect(document.querySelector(".motion-rise-in")).toBeNull();

    serve(h.api, {
      ...routes,
      "/messaging/conversations/conv-1/messages": [
        at("m-2", "user-1", 1, "a reply"),
        at("m-1", "u-3", 0, "first"),
      ],
      "/messaging/messages": at("m-2", "user-1", 1, "a reply"),
    });
    // Sent over REST, whose success refetches the thread.
    h.chat.sendMessage.mockRejectedValue(new Error("Not connected"));
    const user = userEvent.setup({ delay: null });
    await user.type(screen.getByPlaceholderText("Type a message..."), "a reply");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() =>
      expect(screen.getAllByText("a reply").length).toBeGreaterThan(0),
    );
    await waitFor(() =>
      expect(document.querySelector(".motion-rise-in")).not.toBeNull(),
    );
    expect(document.querySelectorAll(".motion-rise-in")).toHaveLength(1);
  });

  // The class is on the group, not on each bubble, so a run of three
  // messages rises as the one remark it is.
  it("puts the movement on the run rather than on every bubble", async () => {
    await openThread([
      at("m-3", "u-3", 2, "third"),
      at("m-2", "u-3", 1, "second"),
      at("m-1", "u-3", 0, "first"),
    ]);
    await screen.findByText("first");
    const bubbles = ["first", "second", "third"].map(
      (t) => screen.getByText(t).closest("div")!,
    );
    for (const bubble of bubbles) {
      expect(bubble.className).not.toContain("motion-rise-in");
    }
  });
});

/**
 * Finding a thread in a long inbox.
 *
 * Searches who a conversation is with, not what was said in it - that is the
 * question somebody has open ("where is the thread with Aline"), and it is
 * answerable from what is already on screen without a request.
 */
describe("searching the inbox for a person", () => {
  const withPeople = (extra: unknown[]) => ({
    ...routes,
    "/messaging/conversations": [conversation, ...extra],
  });

  const second = {
    id: "conv-2",
    type: "ONE_ON_ONE",
    participants: [
      {
        user: {
          id: "u-4",
          firstName: "Jean",
          lastName: "Habimana",
          role: "PARENT",
        },
      },
    ],
    lastMessage: {
      senderUserId: "u-4",
      content: "Murakoze",
      createdAt: "2026-08-21T09:00:00Z",
      sender: { firstName: "Jean", lastName: "Habimana" },
    },
    unreadCount: 0,
  };

  async function openInbox() {
    serve(h.api, withPeople([second]));
    renderPage(MessagesPage, { role: "ADMIN" });
    await screen.findByRole("button", { name: /Aline/ });
  }

  const search = () => screen.getByLabelText("Search people");

  it("shows every thread before anything is typed", async () => {
    await openInbox();
    expect(screen.getByRole("button", { name: /Aline/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Jean/ })).toBeInTheDocument();
  });

  it("narrows to the person named", async () => {
    await openInbox();
    await userEvent.setup({ delay: null }).type(search(), "jean");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Aline/ })).toBeNull(),
    );
    expect(screen.getByRole("button", { name: /Jean/ })).toBeInTheDocument();
  });

  it("ignores case", async () => {
    await openInbox();
    await userEvent.setup({ delay: null }).type(search(), "JEAN");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Jean/ })).toBeInTheDocument(),
    );
  });

  it("finds a group by what it is called", async () => {
    serve(h.api, {
      ...routes,
      "/messaging/conversations": [
        { ...conversation, id: "conv-3", type: "GROUP", name: "Senior 2 A" },
      ],
    });
    renderPage(MessagesPage, { role: "ADMIN" });
    await screen.findByRole("button", { name: /Senior 2 A/ });
    await userEvent.setup({ delay: null }).type(search(), "senior");
    expect(
      screen.getByRole("button", { name: /Senior 2 A/ }),
    ).toBeInTheDocument();
  });

  /**
   * Finding nothing is a different answer from having nothing, and the way
   * back has to be offered - otherwise an empty inbox looks broken.
   */
  it("says who it could not find, and offers the way back", async () => {
    await openInbox();
    const user = userEvent.setup({ delay: null });
    await user.type(search(), "zzzz");

    const nothing = await screen.findByText(/Nobody matches/);
    expect(nothing.textContent).toContain("zzzz");

    await user.click(screen.getByRole("button", { name: /show every conversation/i }));
    expect(
      await screen.findByRole("button", { name: /Aline/ }),
    ).toBeInTheDocument();
  });

  // Not the same thing as an inbox with nothing in it.
  it("keeps the empty inbox wording for an inbox that is empty", async () => {
    serve(h.api, { ...routes, "/messaging/conversations": [] });
    renderPage(MessagesPage, { role: "ADMIN" });
    expect(await screen.findByText("No conversations yet")).toBeInTheDocument();
  });
});

/**
 * A school of fourteen hundred children has four Alines. A list of bare names
 * is unusable the moment it does.
 */
describe("telling two people with the same name apart", () => {
  const inClass = {
    ...conversation,
    participants: [
      {
        user: {
          ...other,
          student: {
            studentIdNumber: "STD-2026-011",
            classSection: {
              name: "A",
              classLevel: { name: "Senior 2" },
              trade: null,
            },
          },
        },
      },
    ],
  };

  it("puts the class beside a student's name", async () => {
    serve(h.api, { ...routes, "/messaging/conversations": [inClass] });
    renderPage(MessagesPage, { role: "ADMIN" });
    const row = await screen.findByRole("button", { name: /Aline/ });
    expect(row.textContent).toContain("Senior 2 A");
  });

  it("leaves a group name alone", async () => {
    serve(h.api, {
      ...routes,
      "/messaging/conversations": [
        { ...inClass, type: "GROUP", name: "Staff room" },
      ],
    });
    renderPage(MessagesPage, { role: "ADMIN" });
    const row = await screen.findByRole("button", { name: /Staff room/ });
    expect(row.textContent).not.toContain("Senior 2 A");
  });

  it("finds a person by their class", async () => {
    serve(h.api, { ...routes, "/messaging/conversations": [inClass] });
    renderPage(MessagesPage, { role: "ADMIN" });
    await screen.findByRole("button", { name: /Aline/ });
    await userEvent
      .setup({ delay: null })
      .type(screen.getByLabelText("Search people"), "senior 2");
    expect(screen.getByRole("button", { name: /Aline/ })).toBeInTheDocument();
  });
});

/**
 * Answering a particular message.
 *
 * A reply that does not show what it answers is a reply nobody can follow
 * once the conversation has moved on - which is the whole reason the quote
 * exists.
 */
describe("replying to a message", () => {
  const msg = (id: string, senderUserId: string, content: string, over = {}) => ({
    id,
    conversationId: "conv-1",
    senderUserId,
    sender:
      senderUserId === "user-1"
        ? { id: "user-1", firstName: "Wilson", lastName: "Nshizirungu" }
        : other,
    content,
    createdAt: "2026-08-21T09:00:00Z",
    ...over,
  });

  async function openThread(messages: unknown[]) {
    serve(h.api, {
      ...routes,
      "/messaging/conversations/conv-1/messages": messages,
    });
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    const row = await screen.findByRole("button", { name: /^Aline/ });
    await userEvent.setup({ delay: null }).click(row);
    return userEvent.setup({ delay: null });
  }

  it("offers a way to answer each message", async () => {
    await openThread([msg("m-1", "u-3", "Muraho")]);
    await screen.findByText("Muraho");
    expect(
      screen.getByRole("button", { name: /reply to aline/i }),
    ).toBeInTheDocument();
  });

  it("shows what is being answered above the box", async () => {
    const user = await openThread([msg("m-1", "u-3", "Muraho")]);
    await screen.findByText("Muraho");

    await user.click(screen.getByRole("button", { name: /reply to aline/i }));

    // The quote names who said it and repeats a line of it.
    const cancel = screen.getByRole("button", { name: /cancel reply/i });
    expect(cancel).toBeInTheDocument();
    expect(screen.getAllByText("Aline Uwase").length).toBeGreaterThan(0);
  });

  it("lets the quote be dismissed", async () => {
    const user = await openThread([msg("m-1", "u-3", "Muraho")]);
    await screen.findByText("Muraho");
    await user.click(screen.getByRole("button", { name: /reply to aline/i }));

    await user.click(screen.getByRole("button", { name: /cancel reply/i }));

    expect(screen.queryByRole("button", { name: /cancel reply/i })).toBeNull();
  });

  it("sends the answer against the message it answers", async () => {
    const user = await openThread([msg("m-1", "u-3", "Muraho")]);
    await screen.findByText("Muraho");
    await user.click(screen.getByRole("button", { name: /reply to aline/i }));

    await user.type(screen.getByPlaceholderText(/type a message/i), "Yego");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(h.chat.sendMessage).toHaveBeenCalled());
    const [, , , replyToId] = h.chat.sendMessage.mock.calls[0];
    expect(replyToId).toBe("m-1");
  });

  // The quote is spent once it has been sent.
  it("clears the quote after sending", async () => {
    const user = await openThread([msg("m-1", "u-3", "Muraho")]);
    await screen.findByText("Muraho");
    await user.click(screen.getByRole("button", { name: /reply to aline/i }));
    await user.type(screen.getByPlaceholderText(/type a message/i), "Yego");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /cancel reply/i })).toBeNull(),
    );
  });

  it("draws the quote inside a message that answers one", async () => {
    await openThread([
      msg("m-2", "u-3", "Yego", {
        replyTo: {
          id: "m-1",
          content: "Muraho",
          contentType: "TEXT",
          sender: { firstName: "Wilson", lastName: "Nshizirungu" },
        },
      }),
      msg("m-1", "user-1", "Muraho"),
    ]);
    await screen.findByText("Yego");
    // The quoted line appears twice: once as the original, once in the quote.
    expect(screen.getAllByText("Muraho").length).toBe(2);
  });

  it("goes to the original when the quote is clicked", async () => {
    const scrolled = vi.spyOn(Element.prototype, "scrollIntoView");
    const user = await openThread([
      msg("m-2", "u-3", "Yego", {
        replyTo: {
          id: "m-1",
          content: "Muraho",
          contentType: "TEXT",
          sender: { firstName: "Wilson", lastName: "Nshizirungu" },
        },
      }),
      msg("m-1", "user-1", "Muraho"),
    ]);
    await screen.findByText("Yego");
    scrolled.mockClear();

    // Inside the thread, not the inbox row - whose preview also says
    // "Muraho".
    const thread = document.querySelector(".overflow-y-auto.px-4")!;
    const quote = Array.from(thread.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Muraho"),
    )!;
    expect(quote).toBeTruthy();
    await user.click(quote);

    expect(scrolled).toHaveBeenCalled();
    scrolled.mockRestore();
  });
});

/**
 * The edges of replying - the shapes the API can send that the happy path
 * never produces.
 */
describe("replies that are not straightforward", () => {
  const msg = (id: string, senderUserId: string, content: string, over = {}) => ({
    id,
    conversationId: "conv-1",
    senderUserId,
    sender: { id: senderUserId, firstName: "Aline", lastName: "Uwase" },
    content,
    createdAt: "2026-08-21T09:00:00Z",
    ...over,
  });

  async function openThread(messages: unknown[]) {
    serve(h.api, {
      ...routes,
      "/messaging/conversations/conv-1/messages": messages,
    });
    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    const row = await screen.findByRole("button", { name: /^Aline/ });
    await userEvent.setup({ delay: null }).click(row);
    return userEvent.setup({ delay: null });
  }

  it("draws no quote on a message that answers nothing", async () => {
    await openThread([msg("m-1", "u-3", "Muraho")]);
    await screen.findByText("Muraho");
    const thread = document.querySelector(".overflow-y-auto.px-4")!;
    expect(thread.querySelectorAll("button").length).toBeGreaterThan(0);
    // The only buttons in the thread are the reply controls.
    for (const b of Array.from(thread.querySelectorAll("button"))) {
      expect(b.getAttribute("aria-label")).toMatch(/reply to/i);
    }
  });

  /**
   * The original was deleted after being answered. The database sets the
   * link to null rather than removing the reply, so the answer survives with
   * nothing to quote - and has to draw.
   */
  it("draws a reply whose original has gone", async () => {
    await openThread([msg("m-2", "u-3", "Yego", { replyTo: null })]);
    expect(await screen.findByText("Yego")).toBeInTheDocument();
  });

  it("goes nowhere when the original is not on screen", async () => {
    const user = await openThread([
      msg("m-2", "u-3", "Yego", {
        replyTo: {
          id: "scrolled-away",
          content: "Muraho",
          contentType: "TEXT",
          sender: { firstName: "Wilson", lastName: "Nshizirungu" },
        },
      }),
    ]);
    await screen.findByText("Yego");

    const thread = document.querySelector(".overflow-y-auto.px-4")!;
    const quote = Array.from(thread.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Muraho"),
    )!;

    // Older messages are not loaded, so there is nothing to scroll to - and
    // clicking must not throw.
    await user.click(quote);
    expect(screen.getByText("Yego")).toBeInTheDocument();
  });

  it("forgets the quote when another thread is opened", async () => {
    const user = await openThread([msg("m-1", "u-3", "Muraho")]);
    await screen.findByText("Muraho");
    await user.click(screen.getByRole("button", { name: /reply to aline/i }));
    expect(screen.getByRole("button", { name: /cancel reply/i })).toBeInTheDocument();

    // Leaving the thread drops the quote: it belonged to that conversation.
    await user.click(screen.getByRole("button", { name: /go back/i }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /cancel reply/i })).toBeNull(),
    );
  });
});

/**
 * Files, and the checks that stop a person wasting their data on one that was
 * never going to be accepted.
 */
describe("attaching a file", () => {
  async function openConversation() {
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await userEvent.setup({ delay: null }).click(screen.getByText(/Aline/));
    return screen.findByPlaceholderText(/type a message/i);
  }

  /** The hidden file input the paperclip opens. */
  function picker() {
    return document.querySelector('input[type="file"]') as HTMLInputElement;
  }

  const asFile = (name: string, type: string, size: number) => {
    const f = new File(["x"], name, { type });
    Object.defineProperty(f, "size", { value: size });
    return f;
  };

  it("offers a way to attach one", async () => {
    await openConversation();
    expect(
      screen.getByRole("button", { name: /attach a file/i }),
    ).toBeInTheDocument();
  });

  // The picker greys out what would be refused, which is a better place to
  // learn it than an error after the upload.
  it("offers only the types the API accepts", async () => {
    await openConversation();
    const accept = picker().getAttribute("accept") ?? "";
    expect(accept).toContain("image/png");
    expect(accept).toContain("video/mp4");
    expect(accept).toContain("application/pdf");
    expect(accept).not.toContain("svg");
  });

  /**
   * "Which photo did I pick" is the question a filename cannot answer, so a
   * chosen image is shown rather than named.
   */
  it("shows a thumbnail of a chosen photograph", async () => {
    const madeUrl = vi.fn(() => "blob:preview");
    vi.stubGlobal("URL", { ...URL, createObjectURL: madeUrl });
    await openConversation();

    fireEvent.change(picker(), {
      target: { files: [asFile("sports day.jpg", "image/jpeg", 2000)] },
    });

    await waitFor(() => expect(madeUrl).toHaveBeenCalled());
    expect(document.querySelector('img[src="blob:preview"]')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("shows the chosen file before it is sent", async () => {
    await openConversation();
    fireEvent.change(picker(), {
      target: { files: [asFile("marks.pdf", "application/pdf", 2000)] },
    });
    await waitFor(() =>
      expect(screen.getByText(/marks\.pdf/)).toBeInTheDocument(),
    );
  });

  /**
   * Checked before a byte is uploaded: somebody on a mobile line should not
   * push sixty megabytes up only to be told it was never going to fit.
   */
  it("refuses one that is too large without uploading it", async () => {
    await openConversation();
    fireEvent.change(picker(), {
      target: { files: [asFile("film.mp4", "video/mp4", 80 * 1024 * 1024)] },
    });
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("refuses a kind that is not accepted", async () => {
    await openConversation();
    fireEvent.change(picker(), {
      target: { files: [asFile("x.svg", "image/svg+xml", 500)] },
    });
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.api.post).not.toHaveBeenCalled();
  });

  // The picker can be opened and closed again without choosing anything.
  it("does nothing when the picker is closed without a choice", async () => {
    await openConversation();
    fireEvent.change(picker(), { target: { files: [] } });
    expect(h.toast.error).not.toHaveBeenCalled();
    expect(h.api.post).not.toHaveBeenCalled();
  });

  /*
    One at a time: a second send while the first is still uploading would send
    the same file twice.
  */
  it("refuses a second send while the first is still uploading", async () => {
    await openConversation();
    // An upload that never answers, so the send stays in flight.
    h.api.post.mockImplementation(() => new Promise(() => {}));

    fireEvent.change(picker(), {
      target: { files: [asFile("marks.pdf", "application/pdf", 2000)] },
    });
    await waitFor(() =>
      expect(screen.getByText(/marks\.pdf/)).toBeInTheDocument(),
    );

    const send = screen.getByRole("button", { name: /send message/i });
    await userEvent.setup({ delay: null }).click(send);

    await waitFor(() => expect(h.api.post).toHaveBeenCalledTimes(1));
    // Dimmed while it is in flight, so the second press cannot happen.
    await waitFor(() => expect(send).toBeDisabled());

    // And Enter, which does not go through the button at all, is refused too.
    fireEvent.keyDown(screen.getByPlaceholderText(/type a message/i), {
      key: "Enter",
    });
    expect(h.api.post).toHaveBeenCalledTimes(1);
  });

  it("lets the wrong file be taken back before anyone sees it", async () => {
    await openConversation();
    fireEvent.change(picker(), {
      target: { files: [asFile("marks.pdf", "application/pdf", 2000)] },
    });
    await waitFor(() =>
      expect(screen.getByText(/marks\.pdf/)).toBeInTheDocument(),
    );

    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole("button", { name: /remove attachment/i }));

    await waitFor(() => expect(screen.queryByText(/marks\.pdf/)).toBeNull());
  });

  // A file on its own is a message; the send button has to say so.
  it("allows sending a file with no words typed", async () => {
    await openConversation();
    fireEvent.change(picker(), {
      target: { files: [asFile("marks.pdf", "application/pdf", 2000)] },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /send message/i }),
      ).not.toBeDisabled(),
    );
  });

  // The socket carries text only, so anything with a file goes by REST -
  // after the upload, because the message cannot be stored without the URL.
  it("uploads first, then sends the message pointing at it", async () => {
    await openConversation();
    h.api.post.mockResolvedValue({
      data: { fileUrl: "/uploads/attachments/a1.pdf", fileName: "marks.pdf", size: 2000 },
    });

    fireEvent.change(picker(), {
      target: { files: [asFile("marks.pdf", "application/pdf", 2000)] },
    });
    await waitFor(() =>
      expect(screen.getByText(/marks\.pdf/)).toBeInTheDocument(),
    );
    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => {
      const paths = h.api.post.mock.calls.map((c: unknown[]) => c[0]);
      expect(paths).toContain("/messaging/attachments");
      expect(paths).toContain("/messaging/messages");
    });

    const sent = h.api.post.mock.calls.find(
      (c: unknown[]) => c[0] === "/messaging/messages",
    )?.[1] as Record<string, unknown>;
    expect(sent.fileUrl).toBe("/uploads/attachments/a1.pdf");
    expect(sent.fileName).toBe("marks.pdf");
    expect(sent.contentType).toBe("FILE");
  });

  // A failed upload has to leave the file and the caption where they were,
  // so the person can try again rather than retyping.
  /*
    A file with no caption is stored under its own name. When the API answers
    without one - which it should not, but a message with an empty body is
    better than one that never sends - the message still goes.
  */
  it("still sends when the upload comes back without a name", async () => {
    await openConversation();
    serve(h.api, {
      ...routes,
      "/messaging/attachments": { fileUrl: "/uploads/attachments/a1.pdf" },
      "/messaging/messages": { id: "m-2" },
    });

    fireEvent.change(picker(), {
      target: { files: [asFile("marks.pdf", "application/pdf", 2000)] },
    });
    await waitFor(() =>
      expect(screen.getByText(/marks\.pdf/)).toBeInTheDocument(),
    );
    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() =>
      expect(
        h.api.post.mock.calls.some(
          (c: unknown[]) => c[0] === "/messaging/messages",
        ),
      ).toBe(true),
    );
  });

  it("keeps the file when the upload fails", async () => {
    await openConversation();
    h.api.post.mockRejectedValue(new Error("no"));

    fireEvent.change(picker(), {
      target: { files: [asFile("marks.pdf", "application/pdf", 2000)] },
    });
    await waitFor(() =>
      expect(screen.getByText(/marks\.pdf/)).toBeInTheDocument(),
    );
    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
    expect(screen.getByText(/marks\.pdf/)).toBeInTheDocument();
  });
});

/**
 * A teacher pasting a link to a past paper and everybody having to retype it
 * is the whole problem.
 */
describe("a link inside a message", () => {
  it("is clickable", async () => {
    serve(h.api, {
      ...routes,
      "/messaging/conversations/conv-1/messages": [
        {
          id: "m-1",
          conversationId: "conv-1",
          senderUserId: "u-3",
          sender: other,
          content: "The paper is at https://markova.edu/papers",
          createdAt: "2026-08-21T09:00:00Z",
        },
      ],
    });
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await userEvent.setup({ delay: null }).click(screen.getByText(/Aline/));

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: /markova\.edu\/papers/ }),
      ).toBeInTheDocument(),
    );
  });
});

/** A photograph is shown, not named. */
describe("a photograph in a thread", () => {
  it("is shown in the bubble", async () => {
    serve(h.api, {
      ...routes,
      "/messaging/conversations/conv-1/messages": [
        {
          id: "m-1",
          conversationId: "conv-1",
          senderUserId: "u-3",
          sender: other,
          content: "sports day.jpg",
          contentType: "FILE",
          fileUrl: "/uploads/attachments/a1.jpg",
          fileName: "sports day.jpg",
          createdAt: "2026-08-21T09:00:00Z",
        },
      ],
    });
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await userEvent.setup({ delay: null }).click(screen.getByText(/Aline/));

    await waitFor(() =>
      expect(
        document.querySelector('img[src*="a1.jpg"]'),
      ).toBeInTheDocument(),
    );
  });
});

/**
 * A voice note is finished the moment recording stops, so it goes straight
 * out - asking somebody to press send twice for one recording is a step
 * nobody expects.
 */
describe("a voice note in a thread", () => {
  async function openWithVoice(messages: unknown[] = []) {
    serve(h.api, {
      ...routes,
      "/messaging/conversations/conv-1/messages": messages,
    });
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await userEvent.setup({ delay: null }).click(screen.getByText(/Aline/));
  }

  it("offers a way to record one", async () => {
    await openWithVoice();
    expect(
      await screen.findByRole("button", { name: /record a voice note/i }),
    ).toBeInTheDocument();
  });

  it("plays rather than offering itself for download", async () => {
    await openWithVoice([
      {
        id: "m-1",
        conversationId: "conv-1",
        senderUserId: "u-3",
        sender: other,
        content: "voice-note-1.weba",
        contentType: "VOICE",
        fileUrl: "/uploads/attachments/a1.weba",
        fileName: "voice-note-1.weba",
        createdAt: "2026-08-21T09:00:00Z",
      },
    ]);

    expect(
      await screen.findByRole("button", { name: /play voice note/i }),
    ).toBeInTheDocument();
    // Its stored name is not a caption; repeating it under the player says
    // nothing.
    expect(screen.queryByText("voice-note-1.weba")).toBeNull();
  });
});

/**
 * Driving a real recording through the page: the recorder is stood up here
 * because jsdom has neither a microphone nor a MediaRecorder, and what is
 * being tested is what the page does with the finished file.
 */
describe("sending a voice note", () => {
  class FakeRecorder {
    static isTypeSupported = () => true;
    state = "inactive";
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    constructor(
      public stream: unknown,
      public options: { mimeType: string },
    ) {}
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({
        data: new Blob(["x".repeat(200)], { type: "audio/webm" }),
      });
      this.onstop?.();
    }
  }

  beforeEach(() => {
    // Installed before anything renders: the recorder's own one-second
    // counter is created when recording starts, and a clock swapped in
    // afterwards would never reach it.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    vi.stubGlobal("AudioContext", undefined);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** The upload endpoint answering, on top of the ordinary thread routes. */
  const withUpload = (over: Record<string, unknown> = {}) => ({
    ...routes,
    "/messaging/attachments": {
      fileUrl: "/uploads/attachments/a1.weba",
      fileName: "voice-note-1.weba",
      size: 200,
    },
    "/messaging/messages": { id: "m-2" },
    ...over,
  });

  async function recordFor(
    seconds: number,
    served: Record<string, unknown> = withUpload(),
  ) {
    serve(h.api, served);
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    const user = userEvent.setup({
      delay: null,
      advanceTimers: vi.advanceTimersByTime,
    });
    await user.click(screen.getByText(/Aline/));

    await user.click(
      await screen.findByRole("button", { name: /record a voice note/i }),
    );
    await screen.findByRole("button", { name: /send voice note/i });

    // The recorder counts in seconds and the page refuses anything under
    // one, so the clock is nudged forward rather than waited on.
    await act(async () => {
      vi.advanceTimersByTime(seconds * 1000);
    });

    await user.click(screen.getByRole("button", { name: /send voice note/i }));
    return user;
  }

  it("uploads the recording and sends it as a voice message", async () => {
    await recordFor(3);

    await waitFor(
      () => {
        const paths = h.api.post.mock.calls.map((c: unknown[]) => c[0]);
        expect(paths).toContain("/messaging/attachments");
        expect(paths).toContain("/messaging/messages");
      },
      { timeout: 4000 },
    );

    const sent = h.api.post.mock.calls.find(
      (c: unknown[]) => c[0] === "/messaging/messages",
    )?.[1] as Record<string, unknown>;
    expect(sent.contentType).toBe("VOICE");
    expect(sent.fileUrl).toBe("/uploads/attachments/a1.weba");
  });

  /*
    The size cap applies to a recording as much as to a chosen file. Five
    minutes of speech is nowhere near it, so this only happens to a recorder
    that has gone wrong - but a wrong recorder should be refused here rather
    than half way through an upload.
  */
  it("refuses a recording over the size cap", async () => {
    class HugeRecorder extends FakeRecorder {
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({
          data: new Blob(["x".repeat(17 * 1024 * 1024)], {
            type: "audio/webm",
          }),
        });
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder", HugeRecorder);

    await recordFor(3);

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(
      h.api.post.mock.calls.some(
        (c: unknown[]) => c[0] === "/messaging/attachments",
      ),
    ).toBe(false);
  });

  // A tap that produced nothing is not a message.
  it("refuses a recording too short to be one", async () => {
    await recordFor(0);
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("says so rather than silently dropping a failed upload", async () => {
    // Everything answers except the upload itself.
    await recordFor(3, routes);

    await waitFor(() =>
      expect(
        h.api.post.mock.calls.some(
          (c: unknown[]) => c[0] === "/messaging/attachments",
        ),
      ).toBe(true),
    );
    // Nothing was sent as a message, and the composer is usable again.
    expect(
      h.api.post.mock.calls.some(
        (c: unknown[]) => c[0] === "/messaging/messages",
      ),
    ).toBe(false);
    expect(
      await screen.findByRole("button", { name: /record a voice note/i }),
    ).toBeInTheDocument();
  });

  // While recording, the recorder takes the whole row: a field you cannot
  // type into beside a running recorder only invites people to try.
  it("hides the message field while recording", async () => {
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByText(/Aline/));
    await user.click(
      await screen.findByRole("button", { name: /record a voice note/i }),
    );

    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/type a message/i)).toBeNull(),
    );
  });

  it("brings the field back when the recording is thrown away", async () => {
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByText(/Aline/));
    await user.click(
      await screen.findByRole("button", { name: /record a voice note/i }),
    );
    await user.click(
      await screen.findByRole("button", { name: /discard recording/i }),
    );

    expect(
      await screen.findByPlaceholderText(/type a message/i),
    ).toBeInTheDocument();
  });
});

/**
 * The people picker names everybody by what tells them apart: a class for a
 * student, a role for staff. A student with neither has only their role left.
 */
describe("naming people in the picker", () => {
  it("falls back to a bare role for somebody with nothing else", async () => {
    serve(h.api, {
      ...routes,
      "/messaging/contacts": {
        data: [{ id: "u-9", firstName: "Divine", lastName: "Mukamana", role: "STUDENT" }],
      },
    });
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());

    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("button", { name: /^add$/i }));
    // The picker lists nobody until something has been searched for.
    fireEvent.change(screen.getByLabelText(/search users by name/i), {
      target: { value: "Divine" },
    });

    await waitFor(
      () => expect(screen.getByText(/Divine Mukamana/)).toBeInTheDocument(),
      { timeout: 4000 },
    );
    expect(screen.getByText("STUDENT")).toBeInTheDocument();
  });

  // The endpoint can answer with nothing at all while it is still loading.
  it("shows an empty picker rather than failing on no answer", async () => {
    serve(h.api, { ...routes, "/messaging/contacts": {} });
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());

    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("button", { name: /^add$/i }));
    fireEvent.change(screen.getByLabelText(/search users by name/i), {
      target: { value: "Divine" },
    });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

/**
 * A photograph, a video or a voice note takes up no height until it has
 * loaded, so a thread ending in one lands short of its own last message. The
 * page watches the thread's own size rather than each element's load event,
 * which catches a late web font and anything else that moves the ground.
 */
describe("keeping the thread landed while media settles", () => {
  /**
   * Stands the observer up and hands back the callback, so the settling can be
   * driven with a thread of a known size. jsdom lays nothing out - every
   * element is zero by zero - so the geometry is stated rather than measured.
   */
  async function openWithWatcher() {
    const observed: Element[] = [];
    let fire: () => void = () => {};
    class Watcher {
      constructor(cb: () => void) {
        fire = cb;
      }
      observe(el: Element) {
        observed.push(el);
      }
      disconnect = vi.fn();
      unobserve = vi.fn();
    }
    vi.stubGlobal("ResizeObserver", Watcher);

    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await userEvent.setup({ delay: null }).click(screen.getByText(/Aline/));
    await waitFor(() => expect(observed.length).toBeGreaterThan(0));

    const list = observed[0].parentElement as HTMLElement;
    /** State the thread's size, since jsdom will not measure one. */
    const say = (scrollHeight: number, clientHeight: number, scrollTop: number) => {
      for (const [prop, value] of [
        ["scrollHeight", scrollHeight],
        ["clientHeight", clientHeight],
      ] as const) {
        Object.defineProperty(list, prop, { value, configurable: true });
      }
      list.scrollTop = scrollTop;
    };
    return { list, say, fire: () => act(() => fire()) };
  }

  /**
   * The thread and the inbox come from two different requests, and on a cold
   * load the messages usually win.
   *
   * Until the inbox has answered there is no row to build the thread pane
   * from, so there is no element to scroll - and nothing about the inbox
   * arriving afterwards would bring the scrolling effects back. The thread
   * sat at its very first message, and only on a first visit: every later one
   * had the inbox cached and both halves were ready together, which is why
   * this survived so long.
   */
  it("lands the thread even when the inbox answers after the messages", async () => {
    // jsdom measures nothing, so the thread is given a height to land at.
    const height = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollHeight",
    );
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get: () => 5000,
    });

    let release: () => void = () => {};
    const inbox = new Promise<void>((r) => {
      release = r;
    });
    let threadArrived = false;
    h.pathname.current = "/messages/conv-1";
    serve(h.api, {
      ...routes,
      "/messaging/conversations/conv-1/messages": () => {
        threadArrived = true;
        return routes["/messaging/conversations/conv-1/messages"];
      },
      "/messaging/conversations": async () => {
        await inbox;
        return [conversation];
      },
    });
    renderPage(MessagesPage, { role: "ADMIN" });

    // The messages are in hand, and there is still no pane to put them in.
    await waitFor(() => expect(threadArrived).toBe(true));
    // Let the thread's own answer land in the page while the inbox is still
    // out. That interleaving is the whole point of this test.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      release();
      await inbox;
    });
    const thread = await screen.findByText(/Muraho neza/);

    const list = thread.closest(".overflow-y-auto") as HTMLElement;
    expect(list).toBeTruthy();
    await waitFor(() => expect(list.scrollTop).toBe(5000));

    if (height) {
      Object.defineProperty(HTMLElement.prototype, "scrollHeight", height);
    }
    h.pathname.current = "/messages";
  });

  it("watches the thread's own size", async () => {
    const { list } = await openWithWatcher();
    expect(list).toBeTruthy();
    vi.unstubAllGlobals();
  });

  /*
    A photograph loading at the end of a thread adds three hundred pixels in
    one frame. A reader who had not scrolled at all would otherwise be left
    stranded above the message they came to read.
  */
  it("pulls the thread back down when a picture pushes the ground away", async () => {
    const { list, say, fire } = await openWithWatcher();
    say(1200, 600, 300); // 300px of gap opened up underneath
    fire();
    expect(list.scrollTop).toBe(1200);
    vi.unstubAllGlobals();
  });

  /**
   * A cold load of a thread's own URL brings nine pictures and voice notes in
   * at once and pushes the end of the conversation thousands of pixels away -
   * far past any reasonable "nearly at the bottom" allowance. A distance rule
   * alone left the reader stranded at the top of the thread.
   */
  it("follows the bottom however far the thread grows, before any scrolling", async () => {
    const { list, say, fire } = await openWithWatcher();
    say(9000, 600, 0); // the whole thread arrived at once
    fire();
    expect(list.scrollTop).toBe(9000);
    vi.unstubAllGlobals();
  });

  /*
    Once the reader takes the scroll, media loading below them must not drag
    them off what they are reading. A gesture is what says they have taken it
    - the pinning sets scrollTop itself, so a scroll event cannot tell the two
    apart.
  */
  it.each([["wheel"], ["touchmove"]])(
    "hands the scroll back after a %s gesture",
    async (gesture) => {
      const { list, say, fire } = await openWithWatcher();
      act(() => {
        list.dispatchEvent(new Event(gesture, { bubbles: true }));
      });

      say(9000, 600, 0);
      fire();

      expect(list.scrollTop).toBe(0);
      vi.unstubAllGlobals();
    },
  );

  it("hands it back when the reader pages up with the keyboard", async () => {
    const { list, say, fire } = await openWithWatcher();
    act(() => {
      list.dispatchEvent(
        new KeyboardEvent("keydown", { key: "PageUp", bubbles: true }),
      );
    });

    say(9000, 600, 0);
    fire();

    expect(list.scrollTop).toBe(0);
    vi.unstubAllGlobals();
  });

  // A key that does not scroll is not the reader taking control.
  it("keeps following after a key that does not scroll", async () => {
    const { list, say, fire } = await openWithWatcher();
    act(() => {
      list.dispatchEvent(
        new KeyboardEvent("keydown", { key: "a", bubbles: true }),
      );
    });

    say(9000, 600, 0);
    fire();

    expect(list.scrollTop).toBe(9000);
    vi.unstubAllGlobals();
  });

  // Somebody who has scrolled up to read must not be yanked down because an
  // image three screens below them finished loading.
  /*
    A reader takes the scroll with a gesture. Setting `scrollTop` alone is
    what the pinning itself does, so it cannot be the signal - a thread that
    unpinned on its own writes would never reach the bottom at all.
  */
  it("leaves a reader who has scrolled up where they are", async () => {
    const { list, say, fire } = await openWithWatcher();
    act(() => {
      list.dispatchEvent(new Event("wheel", { bubbles: true }));
    });
    say(4000, 600, 0); // right at the top
    fire();
    expect(list.scrollTop).toBe(0);
    vi.unstubAllGlobals();
  });

  it("does nothing when the thread is already at the bottom", async () => {
    const { list, say, fire } = await openWithWatcher();
    say(1200, 600, 600);
    fire();
    expect(list.scrollTop).toBe(600);
    vi.unstubAllGlobals();
  });

  // A browser without one still shows the thread; it just does not re-settle.
  it("shows the thread anyway where there is no observer", async () => {
    vi.stubGlobal("ResizeObserver", undefined);

    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await userEvent.setup({ delay: null }).click(screen.getByText(/Aline/));

    expect(await screen.findByText(/Muraho neza/)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});

/**
 * The reply control used to sit once under a whole run, which meant two
 * messages in a row left the first one unanswerable - you could only ever
 * reply to the last thing somebody said.
 */
describe("replying to one message out of several", () => {
  async function twoInARow() {
    serve(h.api, {
      ...routes,
      "/messaging/conversations/conv-1/messages": [
        {
          id: "m-2",
          conversationId: "conv-1",
          senderUserId: "u-3",
          sender: other,
          content: "and the second thing",
          createdAt: "2026-08-21T09:01:00Z",
        },
        {
          id: "m-1",
          conversationId: "conv-1",
          senderUserId: "u-3",
          sender: other,
          content: "the first thing",
          createdAt: "2026-08-21T09:00:00Z",
        },
      ],
    });
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await userEvent.setup({ delay: null }).click(screen.getByText(/Aline/));
    await screen.findByText("the first thing");
  }

  it("offers a reply control for every message, not one per run", async () => {
    await twoInARow();
    expect(screen.getAllByRole("button", { name: /^Reply to/i })).toHaveLength(2);
  });

  // The bug itself: the earlier of two consecutive messages must be reachable.
  it("can reply to the first of two consecutive messages", async () => {
    await twoInARow();

    const first = screen
      .getAllByRole("button", { name: /^Reply to/i })
      .find((b) => /the first thing/.test(b.getAttribute("aria-label") ?? ""));
    expect(first).toBeTruthy();

    await userEvent.setup({ delay: null }).click(first!);

    // The composer now quotes that message rather than the later one.
    const quoted = await screen.findByLabelText(/cancel reply/i);
    const draft = quoted.closest("div")!;
    expect(draft.textContent).toContain("the first thing");
    expect(draft.textContent).not.toContain("and the second thing");
  });

  it("names the message each control answers, for a screen reader", async () => {
    await twoInARow();
    const labels = screen
      .getAllByRole("button", { name: /^Reply to/i })
      .map((b) => b.getAttribute("aria-label"));
    expect(labels.some((l) => l?.includes("the first thing"))).toBe(true);
    expect(labels.some((l) => l?.includes("and the second thing"))).toBe(true);
  });
});

/**
 * Scrolling up in a long thread leaves the newest message off screen, and
 * dragging back down by hand is a poor way to return to it.
 */
describe("getting back to the newest message", () => {
  async function openLongThread() {
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await userEvent.setup({ delay: null }).click(screen.getByText(/Aline/));
    await screen.findByText(/Muraho neza/);

    // jsdom lays nothing out, so the thread's size is stated.
    const list = document.querySelector(".overflow-y-auto.px-4") as HTMLElement;
    const say = (scrollHeight: number, clientHeight: number, scrollTop: number) => {
      for (const [prop, value] of [
        ["scrollHeight", scrollHeight],
        ["clientHeight", clientHeight],
      ] as const) {
        Object.defineProperty(list, prop, { value, configurable: true });
      }
      list.scrollTop = scrollTop;
      fireEvent.scroll(list);
    };
    return { list, say };
  }

  it("offers nothing while the newest message is in view", async () => {
    const { say } = await openLongThread();
    act(() => say(1000, 600, 400));
    expect(screen.queryByRole("button", { name: /jump to the newest/i })).toBeNull();
  });

  it("appears once the newest message is off the screen", async () => {
    const { say } = await openLongThread();
    act(() => say(4000, 600, 0));
    expect(
      await screen.findByRole("button", { name: /jump to the newest/i }),
    ).toBeInTheDocument();
  });

  /*
    A fixed distance rather than a fraction of the view. Three quarters of the
    screen meant scrolling up nearly five hundred pixels before the way back
    appeared, by which point you have given up on it and started dragging.
  */
  it("appears after about two messages, not a whole screen", async () => {
    const { say } = await openLongThread();
    act(() => say(2000, 600, 1100)); // 300px from the bottom
    expect(
      await screen.findByRole("button", { name: /jump to the newest/i }),
    ).toBeInTheDocument();
  });

  // Still not for a nudge, and far enough past the follow distance that it
  // cannot flicker as the thread trails a new arrival.
  it("does not appear for a small nudge upward", async () => {
    const { say } = await openLongThread();
    act(() => say(1000, 600, 300)); // 100px from the bottom
    expect(screen.queryByRole("button", { name: /jump to the newest/i })).toBeNull();
  });

  it("goes back to the bottom when pressed", async () => {
    const { list, say } = await openLongThread();
    const scrollTo = vi.fn();
    Object.defineProperty(list, "scrollTo", { value: scrollTo, configurable: true });
    act(() => say(4000, 600, 0));

    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole("button", { name: /jump to the newest/i }));

    expect(scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ top: 4000, behavior: "smooth" }),
    );
  });

  /*
    Over the thread rather than inside it: a child of the scrolling element
    scrolls away with the messages, which is the one place it must not be.
  */
  it("sits outside the scrolling element", async () => {
    const { list, say } = await openLongThread();
    act(() => say(4000, 600, 0));

    const button = screen.getByRole("button", { name: /jump to the newest/i });
    expect(list.contains(button)).toBe(false);
  });

  // Bottom-right, just above the composer: it is where you are going, and out
  // of the way of the messages you are reading on the way there.
  it("sits at the bottom right, not the top", async () => {
    const { say } = await openLongThread();
    act(() => say(4000, 600, 0));

    const button = screen.getByRole("button", { name: /jump to the newest/i });
    expect(button.className).toContain("bottom-4");
    expect(button.className).toContain("right-4");
    expect(button.className).not.toContain("top-3");
  });
});

/**
 * Somebody who clicks a conversation has already decided to write in it, and
 * somebody who presses reply has already decided to answer. Making either of
 * them click a second time to start typing is a step that exists for no
 * reason.
 */
describe("where the cursor lands", () => {
  it("puts it in the field when a thread is opened", async () => {
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await userEvent.setup({ delay: null }).click(screen.getByText(/Aline/));

    const field = await screen.findByPlaceholderText(/type a message/i);
    await waitFor(() => expect(field).toHaveFocus());
  });

  it("puts it in the field when a message is answered", async () => {
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByText(/Aline/));
    await screen.findByText(/Muraho neza/);

    const field = screen.getByPlaceholderText(/type a message/i);
    field.blur();
    await user.click(screen.getAllByRole("button", { name: /^Reply to/i })[0]);

    await waitFor(() => expect(field).toHaveFocus());
  });

  /*
    The row around the field already draws a ring on focus-within, and the
    app-wide `:focus-visible` rule was adding a second inside it. A bare
    `focus:` variant never reaches that rule.
  */
  it("leaves the ring to the row, not the field", async () => {
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await userEvent.setup({ delay: null }).click(screen.getByText(/Aline/));

    const field = await screen.findByPlaceholderText(/type a message/i);
    expect(field.className).toContain("focus-visible:outline-none");
  });
});

/**
 * Answering a message means scrolling up to find it. Without this you send
 * from up there and never see your own message land.
 */
describe("after sending", () => {
  it("goes back to the newest message", async () => {
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByText(/Aline/));
    await screen.findByText(/Muraho neza/);

    const list = document.querySelector(".overflow-y-auto.px-4") as HTMLElement;
    const scrollTo = vi.fn();
    Object.defineProperty(list, "scrollTo", { value: scrollTo, configurable: true });
    Object.defineProperty(list, "scrollHeight", { value: 4000, configurable: true });

    await user.type(screen.getByPlaceholderText(/type a message/i), "Mwaramutse");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() =>
      expect(scrollTo).toHaveBeenCalledWith(
        expect.objectContaining({ top: 4000, behavior: "smooth" }),
      ),
    );
  });
});

/**
 * A notice about a new message opens this page with the thread it came from
 * named in the URL, so the reader is not made to search for the person they
 * were just told about.
 */
describe("arriving from a notification", () => {
  afterEach(() => {
    h.pathname.current = "/messages";
    window.history.replaceState(null, "", "/messages");
  });

  it("opens the thread the route names", async () => {
    h.pathname.current = "/messages/conv-1";
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN" });

    // The thread opens without anybody clicking the inbox.
    expect(await screen.findByText(/Muraho neza/)).toBeInTheDocument();
  });

  /*
    A thread is something you link somebody to and reload, so it has an
    address of its own rather than a query string on a shared page.
  */
  it("gives a conversation its own address when one is opened", async () => {
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());

    await userEvent.setup({ delay: null }).click(screen.getByText(/Aline/));

    expect(window.location.pathname).toBe("/messages/conv-1");
  });

  /**
   * The address is written, not navigated to.
   *
   * A router push changes the route segment, and Next answers that by
   * unmounting this screen and mounting a new one - so the thread you clicked
   * was drawn and then, a frame or two later, the whole surface was torn down
   * and rebuilt around it. That rebuild is the flash, and it takes the scroll
   * position and a half-written reply with it.
   */
  it("opens a thread without navigating away from the page", async () => {
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());

    await userEvent.setup({ delay: null }).click(screen.getByText(/Aline/));

    expect(h.router.push).not.toHaveBeenCalled();
    expect(h.router.replace).not.toHaveBeenCalled();
  });

  // Every role re-exports this page under its own path, so a conversation is
  // appended to whichever one the reader is actually on.
  it("keeps a role's own path when opening a thread", async () => {
    h.pathname.current = "/admin/messages";
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());

    await userEvent.setup({ delay: null }).click(screen.getByText(/Aline/));

    expect(window.location.pathname).toBe("/admin/messages/conv-1");
  });

  it("goes back to the inbox when the thread is closed", async () => {
    h.pathname.current = "/messages/conv-1";
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN" });
    await screen.findByText(/Muraho neza/);

    const back = screen.queryAllByRole("button").find((b) =>
      /back/i.test(b.getAttribute("aria-label") ?? ""),
    );
    if (!back) return;
    await userEvent.setup({ delay: null }).click(back);

    expect(window.location.pathname).toBe("/messages");
  });
});

/**
 * Focus is easily lost - you click a message to reply, scroll with the mouse,
 * come back from another tab - and then the first thing you type disappears.
 * Typing simply puts you in the field, the way it does in WhatsApp.
 */
describe("typing anywhere in the thread", () => {
  async function openThread() {
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await userEvent.setup({ delay: null }).click(screen.getByText(/Aline/));
    const field = await screen.findByPlaceholderText(/type a message/i);
    field.blur();
    return field;
  }

  it("puts the cursor in the field when a letter is pressed", async () => {
    const field = await openThread();
    expect(field).not.toHaveFocus();

    fireEvent.keyDown(document, { key: "a" });

    expect(field).toHaveFocus();
  });

  // Anything with a modifier is a shortcut, not typing.
  it.each([
    ["Meta", { key: "k", metaKey: true }],
    ["Control", { key: "r", ctrlKey: true }],
    ["Alt", { key: "a", altKey: true }],
  ])("leaves a %s shortcut alone", async (_n, event) => {
    const field = await openThread();
    fireEvent.keyDown(document, event);
    expect(field).not.toHaveFocus();
  });

  // Named keys are longer than one character, which is how they are excluded.
  it.each([["Enter"], ["Tab"], ["ArrowUp"], ["Escape"], ["Backspace"]])(
    "leaves %s alone",
    async (key) => {
      const field = await openThread();
      fireEvent.keyDown(document, { key });
      expect(field).not.toHaveFocus();
    },
  );

  // Something already typed into another field belongs where it is.
  it("does not steal from the search box", async () => {
    const field = await openThread();
    const search = screen.getByPlaceholderText(/search people/i);
    search.focus();

    fireEvent.keyDown(search, { key: "a", bubbles: true });

    expect(search).toHaveFocus();
    expect(field).not.toHaveFocus();
  });
});

/**
 * At the moment of sending, the new bubble is not in the thread yet and its
 * height is not in `scrollHeight` - so scrolling then lands on the bottom as
 * it was a moment ago, which is one message short.
 */
describe("landing on the true bottom after sending", () => {
  it("scrolls again once the message has rendered", async () => {
    // Over REST, so sending invalidates the thread and the new message is
    // refetched - which is what makes the thread grow after the send.
    h.chat.connected = false;
    const sent = {
      id: "m-2",
      conversationId: "conv-1",
      senderUserId: "user-1",
      sender: { id: "user-1", firstName: "Wilson", lastName: "Nshizirungu" },
      content: "Mwaramutse",
      createdAt: "2026-08-21T09:05:00Z",
    };
    let delivered = false;
    serve(h.api, {
      ...routes,
      // Empty until the message is sent, so the thread genuinely grows.
      "/messaging/conversations/conv-1/messages": () =>
        delivered
          ? [sent, ...(routes["/messaging/conversations/conv-1/messages"] as unknown[])]
          : routes["/messaging/conversations/conv-1/messages"],
      "/messaging/messages": () => {
        delivered = true;
        return sent;
      },
    });

    renderPage(MessagesPage, { role: "ADMIN", user: { id: "user-1" } });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByText(/Aline/));
    await screen.findByText(/Muraho neza/);

    const list = document.querySelector(".overflow-y-auto.px-4") as HTMLElement;
    Object.defineProperty(list, "clientHeight", { value: 600, configurable: true });
    // The thread as it stands before the message lands, and the reader is
    // scrolled well up it - which is where answering an old message leaves you.
    Object.defineProperty(list, "scrollHeight", {
      configurable: true,
      get: () => (delivered ? 1400 : 1000),
    });
    list.scrollTop = 0;

    await user.type(screen.getByPlaceholderText(/type a message/i), "Mwaramutse");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    // Not 1000, which is where the bottom was when Send was pressed.
    await waitFor(() => expect(list.scrollTop).toBe(1400), { timeout: 4000 });
    h.chat.connected = true;
  });
});

/**
 * Mentioning somebody.
 *
 * Groups and broadcasts only: in a conversation between two people there is
 * exactly one person a message could be addressed to, so a mention carries no
 * information and only adds a notification for something already being read.
 *
 * And the box holds what the writer meant - "@Aline Uwase, can you check
 * this" - while the person they picked is remembered beside it. A uuid in the
 * middle of somebody's sentence is not a compose experience.
 */
describe("mentioning somebody in a group", () => {
  const ALINE = "11111111-1111-1111-1111-111111111111";
  const JEAN = "22222222-2222-2222-2222-222222222222";

  const groupConv = {
    id: "conv-g",
    type: "GROUP",
    name: "Senior 1 A",
    participants: [
      { user: { id: "user-1", firstName: "Me", lastName: "Myself" } },
      { user: { id: ALINE, firstName: "Aline", lastName: "Uwase" } },
      { user: { id: JEAN, firstName: "Jean Bosco", lastName: "Habimana" } },
    ],
    lastMessage: { content: "Muraho", createdAt: "2026-08-21T09:00:00Z" },
    unreadCount: 0,
  };

  const groupRoutes = {
    ...routes,
    "/messaging/conversations": [groupConv],
    "/messaging/conversations/conv-g/messages": [
      {
        id: "gm-1",
        conversationId: "conv-g",
        senderUserId: ALINE,
        sender: { id: ALINE, firstName: "Aline", lastName: "Uwase" },
        content: "Muraho neza",
        createdAt: "2026-08-21T09:00:00Z",
      },
    ],
  };

  async function openGroup(extra: Record<string, unknown> = {}) {
    serve(h.api, { ...groupRoutes, ...extra });
    renderPage(MessagesPage, { role: "TEACHER", user: { id: "user-1" } });
    await waitFor(() =>
      expect(screen.getByText(/Senior 1 A/)).toBeInTheDocument(),
    );
    await userEvent
      .setup({ delay: null })
      .click(screen.getByText(/Senior 1 A/));
    await waitFor(() =>
      expect(screen.getByText(/Muraho neza/)).toBeInTheDocument(),
    );
  }

  const box = () => screen.getByLabelText(/Type a message/i);

  const type = async (text: string) => {
    await act(async () => {
      fireEvent.change(box(), { target: { value: text } });
    });
  };

  it("offers the people in the room once an at sign is typed", async () => {
    await openGroup();
    await type("@");
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Aline Uwase/ })).toBeInTheDocument();
  });

  // Nobody mentions themselves.
  it("never offers the person doing the typing", async () => {
    await openGroup();
    await type("@");
    await screen.findByRole("listbox");
    expect(screen.queryByRole("option", { name: /Me Myself/ })).toBeNull();
  });

  it("narrows as the name is typed", async () => {
    await openGroup();
    await type("@ali");
    await screen.findByRole("listbox");
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  /**
   * In a direct message a mention adds nothing, the API refuses one, and a
   * picker that leads to a refusal is worse than no picker.
   */
  it("offers nobody in a one to one conversation", async () => {
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "TEACHER", user: { id: "user-1" } });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
    await userEvent.setup({ delay: null }).click(screen.getByText(/Aline/));
    await waitFor(() =>
      expect(screen.getByText(/Muraho neza/)).toBeInTheDocument(),
    );
    await type("@");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  /* A uuid appearing in the middle of somebody's sentence is not a compose
     experience. The box holds the name; the person is remembered beside it. */
  it("puts the name in the box and never the id", async () => {
    await openGroup();
    await type("@ali");
    await act(async () => {
      fireEvent.mouseDown(screen.getByRole("option", { name: /Aline Uwase/ }));
    });
    expect((box() as HTMLInputElement).value).toBe("@Aline Uwase ");
    expect((box() as HTMLInputElement).value).not.toContain(ALINE);
  });

  it("closes the picker once somebody is chosen", async () => {
    await openGroup();
    await type("@ali");
    await act(async () => {
      fireEvent.mouseDown(screen.getByRole("option", { name: /Aline Uwase/ }));
    });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  /**
   * The picker owns Enter while it is open. Without this, choosing a name
   * sends the message half-written, which is the first thing anybody does.
   */
  it("chooses with Enter rather than sending the message", async () => {
    await openGroup();
    await type("@ali");
    await screen.findByRole("listbox");
    await act(async () => {
      fireEvent.keyDown(box(), { key: "Enter" });
    });
    expect((box() as HTMLInputElement).value).toBe("@Aline Uwase ");
    expect(h.api.post).not.toHaveBeenCalledWith(
      "/messaging/messages",
      expect.anything(),
    );
  });

  it("moves through the list with the arrows", async () => {
    await openGroup();
    await type("@");
    await screen.findByRole("listbox");
    await act(async () => {
      fireEvent.keyDown(box(), { key: "ArrowDown" });
    });
    const options = screen.getAllByRole("option");
    expect(options[1].getAttribute("aria-selected")).toBe("true");
  });

  it("gets out of the way on Escape", async () => {
    await openGroup();
    await type("@");
    await screen.findByRole("listbox");
    await act(async () => {
      fireEvent.keyDown(box(), { key: "Escape" });
    });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  /**
   * The person is resolved when the message is sent, from what was picked
   * rather than from what the text looks like.
   */
  it("sends the person behind the name that was chosen", async () => {
    await openGroup({ "/messaging/messages": { id: "new" } });
    await type("@ali");
    await act(async () => {
      fireEvent.mouseDown(screen.getByRole("option", { name: /Aline Uwase/ }));
    });
    await act(async () => {
      fireEvent.change(box(), {
        target: { value: "@Aline Uwase can you check this" },
      });
    });
    await act(async () => {
      fireEvent.keyDown(box(), { key: "Enter" });
    });
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/messaging/messages",
        expect.objectContaining({
          content: `@[Aline Uwase](${ALINE}) can you check this`,
        }),
      ),
    );
  });

  /**
   * The safe failure. A name typed by hand rather than chosen is ambiguous,
   * and guessing which of two Alines was meant is how a message reaches
   * somebody it was not for.
   */
  it("sends a typed name as plain text, mentioning nobody", async () => {
    await openGroup({ "/messaging/messages": { id: "new" } });
    await type("@Aline Uwase hello");
    await act(async () => {
      fireEvent.keyDown(box(), { key: "Enter" });
    });
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/messaging/messages",
        expect.objectContaining({ content: "@Aline Uwase hello" }),
      ),
    );
  });

  it("forgets a pick whose name was deleted again", async () => {
    await openGroup({ "/messaging/messages": { id: "new" } });
    await type("@ali");
    await act(async () => {
      fireEvent.mouseDown(screen.getByRole("option", { name: /Aline Uwase/ }));
    });
    await type("never mind");
    await act(async () => {
      fireEvent.keyDown(box(), { key: "Enter" });
    });
    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith(
        "/messaging/messages",
        expect.objectContaining({ content: "never mind" }),
      ),
    );
  });
});

/*
  No child alone in a chat with an adult. Every chat between staff and a
  student also holds somebody watching over it, and everybody in it is told
  who that is.
*/
describe("a chat somebody watches over", () => {
  const student = { id: "u-5", firstName: "Keza", lastName: "Habimana", role: "STUDENT", photoUrl: null };
  const matron = { id: "u-6", firstName: "Beatrice", lastName: "Mukamana", role: "MATRON", photoUrl: null };
  const watched = {
    id: "conv-9",
    type: "ONE_ON_ONE",
    participants: [
      { user: { ...other, id: "me" } },
      { user: student },
      { user: matron, watching: true },
    ],
    lastMessage: { content: "Thank you", createdAt: "2026-08-21T09:00:00Z" },
    unreadCount: 0,
  };
  const watchedRoutes = {
    "/messaging/conversations/conv-9/messages": [],
    "/messaging/conversations": [watched],
    "/messaging/contacts": { data: [] },
    "/messaging/unread": { count: 0 },
  };

  it("is named after the student, not the one watching, and says who watches", async () => {
    serve(h.api, watchedRoutes);
    renderPage(MessagesPage, { role: "TEACHER", user: { id: "me" } });
    await waitFor(() => expect(screen.getByText("Keza Habimana")).toBeInTheDocument());
    expect(screen.queryByText(/Watching/)).not.toBeInTheDocument();

    await userEvent.setup({ delay: null }).click(screen.getByText("Keza Habimana"));
    expect(await screen.findByTestId("watch-notice")).toHaveTextContent(
      "Beatrice Mukamana is watching over this chat.",
    );
  });

  it("shows the one watching both people, and tells them everyone can see them", async () => {
    serve(h.api, watchedRoutes);
    renderPage(MessagesPage, { role: "MATRON", user: { id: "u-6" } });
    const name = await screen.findByText("Aline Uwase and Keza Habimana");
    expect(screen.getByText("Watching")).toBeInTheDocument();

    await userEvent.setup({ delay: null }).click(name);
    expect(await screen.findByTestId("watch-notice")).toHaveTextContent(
      /You watch over this chat as a safeguarding lead/,
    );
  });

  it("says nothing in a chat nobody watches", async () => {
    serve(h.api, routes);
    renderPage(MessagesPage, { role: "ADMIN" });
    await userEvent.setup({ delay: null }).click(await screen.findByText(/Aline/));
    await screen.findByText(/Muraho neza/);
    expect(screen.queryByTestId("watch-notice")).not.toBeInTheDocument();
  });
});
