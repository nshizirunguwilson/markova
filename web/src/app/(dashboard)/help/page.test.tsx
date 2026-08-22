import { beforeEach, describe, expect, it, vi } from "vitest";

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
  usePathname: () => "/help",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve, serveFailure } from "@/test/page";

import HelpPage from "./page";

/**
 * The help centre, which every role shares.
 *
 * Two halves: articles someone can answer their own question with, and a
 * ticket for when they cannot. The ticket half is the one that matters when
 * something is broken during a school day, so a ticket must never be silently
 * dropped.
 */

const faqs = [
  {
    id: "faq-1",
    title: "How do I reset a password?",
    content: "Open the user, then choose Reset password.",
    category: "Accounts",
  },
  {
    id: "faq-2",
    title: "Why can a student not sign in on the phone?",
    content: "Students use the web portal. The mobile app is for staff and parents.",
    category: "Accounts",
  },
  {
    id: "faq-3",
    title: "How are marks published?",
    content: "A term's results are published from the Marks page.",
    category: "Marks",
  },
];

const tickets = [
  {
    id: "t-1",
    title: "Projector in Senior 1 A will not connect",
    description: "The HDMI port is loose.",
    status: "OPEN",
    createdAt: "2026-08-20T09:00:00Z",
  },
  {
    id: "t-2",
    title: "Report card shows the wrong term",
    description: "Term 2 marks appear under Term 3.",
    status: "RESOLVED",
    createdAt: "2026-08-12T09:00:00Z",
  },
];

const routes = {
  "/help/faqs": faqs,
  "/help/tickets/mine": tickets,
  "/help/tickets": { id: "t-9" },
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount(role: "ADMIN" | "TEACHER" | "PARENT" = "TEACHER") {
  renderPage(HelpPage, { role });
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

function tab(name: RegExp) {
  return screen.queryAllByRole("button").find((b) => name.test((b.textContent ?? "").trim()));
}

describe("the articles", () => {
  it("lists them", async () => {
    await mount();
    expect(screen.getByText(/How are marks published/)).toBeInTheDocument();
  });

  // Grouping is what makes a long list usable; ungrouped, it is a wall.
  it("groups them under their category", async () => {
    await mount();
    expect(screen.getByText("Accounts")).toBeInTheDocument();
    expect(screen.getByText("Marks")).toBeInTheDocument();
  });

  it("files an article with no category under General", async () => {
    serve(h.api, {
      ...routes,
      "/help/faqs": [{ id: "faq-9", title: "Anything else", content: "Ask us.", category: null }],
    });
    renderPage(HelpPage, { role: "TEACHER" });
    await waitFor(() => expect(screen.getByText("General")).toBeInTheDocument());
  });

  // Answers stay closed so the list of questions is scannable.
  it("keeps the answer hidden until the question is opened", async () => {
    await mount();
    expect(screen.queryByText(/choose Reset password/)).not.toBeInTheDocument();
  });

  it("shows the answer when the question is opened", async () => {
    await mount();
    await click(screen.getByText(/How do I reset a password/).closest("button"));
    await waitFor(() =>
      expect(screen.getByText(/choose Reset password/)).toBeInTheDocument(),
    );
  });

  it("closes it again", async () => {
    await mount();
    const q = screen.getByText(/How do I reset a password/).closest("button");
    await click(q);
    await waitFor(() => expect(screen.getByText(/choose Reset password/)).toBeInTheDocument());
    await click(q);
    await waitFor(() =>
      expect(screen.queryByText(/choose Reset password/)).not.toBeInTheDocument(),
    );
  });

  // Only one answer at a time, so the page does not grow under the reader.
  it("closes the previous answer when another is opened", async () => {
    await mount();
    await click(screen.getByText(/How do I reset a password/).closest("button"));
    await waitFor(() => expect(screen.getByText(/choose Reset password/)).toBeInTheDocument());

    await click(screen.getByText(/How are marks published/).closest("button"));
    await waitFor(() =>
      expect(screen.getByText(/published from the Marks page/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/choose Reset password/)).not.toBeInTheDocument();
  });

  it("searches the articles on the server, not just on screen", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/search faq/i), {
        target: { value: "password" },
      });
    });

    await waitFor(() => {
      const call = [...h.api.get.mock.calls]
        .reverse()
        .find(([url]) => String(url).includes("/help/faqs"));
      expect((call?.[1] as any)?.params?.search).toBe("password");
    });
  });

  it("says so when a search matches nothing", async () => {
    serve(h.api, { ...routes, "/help/faqs": [] });
    renderPage(HelpPage, { role: "TEACHER" });
    await waitFor(() =>
      expect(screen.getByText(/no faq articles found/i)).toBeInTheDocument(),
    );
  });

  it("does not go blank when the articles fail to load", async () => {
    serveFailure(h.api);
    renderPage(HelpPage, { role: "TEACHER" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("my tickets", () => {
  async function openTickets() {
    await mount();
    await click(tab(/my tickets/i));
    await waitFor(() => expect(screen.getByText(/Projector in Senior 1 A/)).toBeInTheDocument());
  }

  it("lists what I have raised", async () => {
    await openTickets();
    expect(screen.getByText(/Report card shows the wrong term/)).toBeInTheDocument();
  });

  // The state is the only thing that tells someone whether to keep waiting.
  it("shows each one's state", async () => {
    await openTickets();
    expect(screen.getByText("OPEN")).toBeInTheDocument();
    expect(screen.getByText("RESOLVED")).toBeInTheDocument();
  });

  it("shows what was reported, not just the title", async () => {
    await openTickets();
    expect(screen.getByText(/The HDMI port is loose/)).toBeInTheDocument();
  });

  it("says so when I have raised none", async () => {
    serve(h.api, { ...routes, "/help/tickets/mine": [] });
    renderPage(HelpPage, { role: "TEACHER" });
    await waitFor(() => expect(screen.getByText(/How do I reset a password/)).toBeInTheDocument());
    await click(tab(/my tickets/i));

    await waitFor(() => expect(screen.getByText(/no support tickets/i)).toBeInTheDocument());
  });

  it("goes back to the articles", async () => {
    await openTickets();
    await click(tab(/^faq$/i));
    await waitFor(() =>
      expect(screen.getByText(/How do I reset a password/)).toBeInTheDocument(),
    );
  });
});

describe("raising a ticket", () => {
  async function openForm() {
    await mount();
    await click(tab(/submit ticket/i));
    return screen.findByRole("dialog");
  }

  async function fill(dialog: HTMLElement, title: string, description: string) {
    await act(async () => {
      if (title !== null) {
        fireEvent.change(within(dialog).getByLabelText(/title/i), {
          target: { value: title },
        });
      }
      if (description !== null) {
        fireEvent.change(within(dialog).getByLabelText(/description/i), {
          target: { value: description },
        });
      }
    });
  }

  function submit(dialog: HTMLElement) {
    return within(dialog)
      .getAllByRole("button")
      .find((b) => /^submit$/i.test((b.textContent ?? "").trim()));
  }

  it("opens a form", async () => {
    const dialog = await openForm();
    expect(within(dialog).getByLabelText(/title/i)).toBeInTheDocument();
  });

  // A ticket with no description is a ticket nobody can act on.
  it("refuses a ticket with nothing in it", async () => {
    const dialog = await openForm();
    h.api.post.mockClear();
    await click(submit(dialog));

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("refuses a title with no description", async () => {
    const dialog = await openForm();
    await fill(dialog, "Projector broken", "");
    h.api.post.mockClear();
    await click(submit(dialog));

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("sends what was filled in", async () => {
    const dialog = await openForm();
    await fill(dialog, "Projector broken", "The HDMI port is loose.");
    h.api.post.mockClear();
    await click(submit(dialog));

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/help/tickets"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).title).toBe("Projector broken");
      expect((call![1] as any).description).toBe("The HDMI port is loose.");
    });
  });

  // "General" is the placeholder, not a category the API should be told about.
  it("leaves the category out when none was chosen", async () => {
    const dialog = await openForm();
    await fill(dialog, "Projector broken", "The HDMI port is loose.");
    h.api.post.mockClear();
    await click(submit(dialog));

    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
    expect((h.api.post.mock.calls[0][1] as any).category).toBeUndefined();
  });

  it("sends the category when one was chosen", async () => {
    const dialog = await openForm();
    await fill(dialog, "Projector broken", "The HDMI port is loose.");
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/category/i), {
        target: { value: "Technical" },
      });
    });

    h.api.post.mockClear();
    await click(submit(dialog));

    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
    expect((h.api.post.mock.calls[0][1] as any).category).toBe("Technical");
  });

  it("closes and confirms once it is in", async () => {
    const dialog = await openForm();
    await fill(dialog, "Projector broken", "The HDMI port is loose.");
    await click(submit(dialog));

    await waitFor(() => expect(h.toast.success).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  // Losing the typed text on a failure would mean writing it out twice.
  it("keeps the form open and says so when it is refused", async () => {
    const dialog = await openForm();
    await fill(dialog, "Projector broken", "The HDMI port is loose.");
    h.api.post.mockRejectedValue({ response: { status: 500 } });
    h.toast.error.mockClear();
    await click(submit(dialog));

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeInTheDocument();
    const title = within(screen.getByRole("dialog")).getByLabelText(
      /title/i,
    ) as HTMLInputElement;
    expect(title.value).toBe("Projector broken");
  });

  it("empties the form for the next one", async () => {
    const dialog = await openForm();
    await fill(dialog, "Projector broken", "The HDMI port is loose.");
    await click(submit(dialog));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await click(tab(/submit ticket/i));
    const again = await screen.findByRole("dialog");
    expect((within(again).getByLabelText(/title/i) as HTMLInputElement).value).toBe("");
  });

  it("closes without sending anything when dismissed", async () => {
    const dialog = await openForm();
    h.api.post.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^cancel$/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.api.post).not.toHaveBeenCalled();
  });
});
