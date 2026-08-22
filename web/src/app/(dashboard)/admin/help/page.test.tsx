import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    router: { push: fn(), replace: fn(), refresh: fn(), back: fn(), prefetch: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  usePathname: () => "/admin/help",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";

import AdminHelpPage from "./page";

/**
 * The other side of the help centre.
 *
 * An admin writes the articles everyone else reads and works the ticket queue.
 * Deleting an article removes it from every role's help page at once, so it
 * asks first; a ticket's status is the only thing telling the person who
 * raised it whether anyone is looking.
 */

const faqs = [
  {
    id: "faq-1",
    title: "How do I reset a password?",
    content: "Open the user, then choose Reset password.",
    category: "Accounts",
    displayOrder: 1,
    isPublished: true,
  },
  {
    id: "faq-2",
    title: "Draft article",
    content: "Not ready yet.",
    category: null,
    displayOrder: 2,
    isPublished: false,
  },
];

const tickets = [
  {
    id: "t-1",
    title: "Projector will not connect",
    description: "The HDMI port is loose.",
    status: "OPEN",
    createdAt: "2026-08-20T09:00:00Z",
    user: { firstName: "Aline", lastName: "Uwase", role: "TEACHER" },
  },
  {
    id: "t-2",
    title: "Report card shows the wrong term",
    description: "Term 2 marks appear under Term 3.",
    status: "RESOLVED",
    createdAt: "2026-08-12T09:00:00Z",
    user: { firstName: "Jean", lastName: "Habimana", role: "PARENT" },
  },
];

const routes = {
  "/help/faqs/admin": faqs,
  "/help/tickets": tickets,
  "/help/faqs": { id: "faq-9" },
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function mount() {
  renderPage(AdminHelpPage, { role: "ADMIN" });
  await waitFor(() =>
    expect(screen.getByText(/How do I reset a password/)).toBeInTheDocument(),
  );
}

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    fireEvent.click(el as Element);
  });
}

function button(name: RegExp) {
  return screen.queryAllByRole("button").find((b) => name.test((b.textContent ?? "").trim()));
}

describe("the articles an admin manages", () => {
  it("lists them, drafts included", async () => {
    await mount();
    expect(screen.getByText(/Draft article/)).toBeInTheDocument();
  });

  // A draft is invisible to everyone else, so the admin list has to say which
  // is which.
  it("says which are published and which are not", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/Published/i);
  });

  it("does not go blank when the articles fail to load", async () => {
    serveFailure(h.api);
    renderPage(AdminHelpPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("writing an article", () => {
  async function openNew() {
    await mount();
    await click(button(/new faq|add faq|new article/i));
    return screen.findByRole("dialog");
  }

  async function fill(dialog: HTMLElement, title: string, content: string) {
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/^title$/i), {
        target: { value: title },
      });
      fireEvent.change(within(dialog).getByLabelText(/^content$/i), {
        target: { value: content },
      });
    });
  }

  function save(dialog: HTMLElement) {
    return within(dialog)
      .getAllByRole("button")
      .find((b) => /^(save|create|add)/i.test((b.textContent ?? "").trim()));
  }

  it("opens an empty form", async () => {
    const dialog = await openNew();
    expect((within(dialog).getByLabelText(/^title$/i) as HTMLInputElement).value).toBe("");
  });

  // An article with a title and no answer is worse than none.
  it("refuses one with no content", async () => {
    const dialog = await openNew();
    await fill(dialog, "How do I do this?", "");
    h.api.post.mockClear();
    await click(save(dialog));

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("creates it with what was written", async () => {
    const dialog = await openNew();
    await fill(dialog, "How do I mark a register?", "Open Attendance, then the class.");
    h.api.post.mockClear();
    await click(save(dialog));

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/help/faqs"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).title).toBe("How do I mark a register?");
    });
  });

  // An empty category is not a category called "".
  it("leaves the category out when none was given", async () => {
    const dialog = await openNew();
    await fill(dialog, "A question", "An answer.");
    h.api.post.mockClear();
    await click(save(dialog));

    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
    expect((h.api.post.mock.calls[0][1] as any).category).toBeUndefined();
  });

  it("closes and says so once it is created", async () => {
    const dialog = await openNew();
    await fill(dialog, "A question", "An answer.");
    await click(save(dialog));

    await waitFor(() => expect(h.toast.success).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the form open when the save is refused", async () => {
    const dialog = await openNew();
    await fill(dialog, "A question", "An answer.");
    h.api.post.mockRejectedValue({ response: { status: 500 } });
    h.toast.error.mockClear();
    await click(save(dialog));

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeInTheDocument();
  });
});

describe("editing an article", () => {
  async function openEdit() {
    await mount();
    await click(screen.getAllByRole("button", { name: /^edit$/i })[0]);
    return screen.findByRole("dialog");
  }

  it("opens with the article already in it", async () => {
    const dialog = await openEdit();
    expect((within(dialog).getByLabelText(/^title$/i) as HTMLInputElement).value).toBe(
      "How do I reset a password?",
    );
  });

  // An edit updates the article, rather than adding a near-duplicate beside it.
  it("updates rather than creating a second one", async () => {
    const dialog = await openEdit();
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/^content$/i), {
        target: { value: "Open the user and choose Reset password." },
      });
    });

    h.api.patch.mockClear();
    h.api.post.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^(save|update)/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => expect(h.api.patch).toHaveBeenCalled());
    expect(String(h.api.patch.mock.calls[0][0])).toContain("faq-1");
    expect(h.api.post).not.toHaveBeenCalled();
  });

  // Opening the editor and then opening "new" must not carry the old article
  // into the new one.
  it("does not leak the edited article into a new one", async () => {
    const dialog = await openEdit();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^cancel$/i.test((b.textContent ?? "").trim())),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await click(button(/new faq|add faq|new article/i));
    const fresh = await screen.findByRole("dialog");
    expect((within(fresh).getByLabelText(/^title$/i) as HTMLInputElement).value).toBe("");
  });
});

describe("removing an article", () => {
  // It disappears from every role's help page at once.
  it("asks first", async () => {
    await mount();
    h.api.delete.mockClear();
    await click(screen.getAllByRole("button", { name: /^delete$/i })[0]);

    expect(window.confirm).toHaveBeenCalled();
  });

  it("deletes nothing when the ask is declined", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    await mount();
    h.api.delete.mockClear();
    await click(screen.getAllByRole("button", { name: /^delete$/i })[0]);

    await waitFor(() => expect(h.api.delete).not.toHaveBeenCalled());
  });

  it("deletes it once confirmed", async () => {
    await mount();
    h.api.delete.mockClear();
    await click(screen.getAllByRole("button", { name: /^delete$/i })[0]);

    await waitFor(() => expect(h.api.delete).toHaveBeenCalledWith("/help/faqs/faq-1"));
  });

  it("says so when the delete is refused", async () => {
    await mount();
    h.api.delete.mockRejectedValue({ response: { status: 500 } });
    h.toast.error.mockClear();
    await click(screen.getAllByRole("button", { name: /^delete$/i })[0]);

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
  });
});

describe("the ticket queue", () => {
  async function openTickets() {
    await mount();
    await click(button(/tickets/i));
    await waitFor(() =>
      expect(screen.getByText(/Projector will not connect/)).toBeInTheDocument(),
    );
  }

  it("lists what has been raised", async () => {
    await openTickets();
    expect(screen.getByText(/Report card shows the wrong term/)).toBeInTheDocument();
  });

  // Who raised it decides who to go back to.
  it("names who raised each one", async () => {
    await openTickets();
    expect(document.body.textContent).toMatch(/Aline/);
  });

  it("filters the queue by status", async () => {
    await openTickets();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/all status/i), {
        target: { value: "OPEN" },
      });
    });

    await waitFor(() => {
      const call = [...h.api.get.mock.calls]
        .reverse()
        .find(([url]) => String(url).includes("/help/tickets"));
      expect((call?.[1] as any)?.params?.status).toBe("OPEN");
    });
  });

  // The status is the only signal reaching the person who raised it.
  it("moves a ticket on", async () => {
    await openTickets();
    const status = screen.getAllByLabelText(/ticket status/i)[0];
    h.api.patch.mockClear();
    h.api.put.mockClear();
    await act(async () => {
      fireEvent.change(status, { target: { value: "IN_PROGRESS" } });
    });

    await waitFor(() => {
      const calls = [...h.api.patch.mock.calls, ...h.api.put.mock.calls];
      expect(calls.length).toBeGreaterThan(0);
      expect(JSON.stringify(calls[0])).toMatch(/IN_PROGRESS/);
    });
  });

  it("says so when a status change is refused", async () => {
    await openTickets();
    h.api.patch.mockRejectedValue({ response: { status: 500 } });
    h.api.put.mockRejectedValue({ response: { status: 500 } });
    h.toast.error.mockClear();

    await act(async () => {
      fireEvent.change(screen.getAllByLabelText(/ticket status/i)[0], {
        target: { value: "RESOLVED" },
      });
    });

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
  });

  it("says so when the queue is empty", async () => {
    serve(h.api, { ...routes, "/help/tickets": [] });
    renderPage(AdminHelpPage, { role: "ADMIN" });
    await waitFor(() =>
      expect(screen.getByText(/How do I reset a password/)).toBeInTheDocument(),
    );
    await click(button(/tickets/i));

    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(screen.queryByText(/Projector will not connect/)).toBeNull();
  });
});
