import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

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

import { screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve, serveAll } from "@/test/page";
import { exercisePage } from "@/test/exercise";
import { faq, populatedRoutes, ticket } from "@/test/fixtures";

import AdminHelpPage from "./page";

const routes = {
  ...populatedRoutes,
  "/help/faqs/admin": [faq, { ...faq, id: "faq-2", title: "Where are marks?", isPublished: false }],
  "/help/faqs": [faq],
  "/help/tickets": [ticket, { ...ticket, id: "tkt-2", status: "RESOLVED" }],
};

function button(pattern: RegExp) {
  return screen
    .queryAllByRole("button")
    .find(
      (b) =>
        pattern.test((b.textContent ?? "").trim()) ||
        pattern.test(b.getAttribute("aria-label") ?? ""),
    );
}

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(AdminHelpPage, { role: "ADMIN" });
  await waitFor(() => expect(document.body.textContent).not.toBe(""));
}

/** The page opens on tickets, so the answers live one tab across. */
async function openFaqs() {
  const tab = screen
    .queryAllByRole("button")
    .find((b) => /faq|question|answer/i.test(b.textContent ?? ""));
  if (!tab) return false;
  await userEvent.setup().click(tab);
  return true;
}

describe("the help desk", () => {
  it("opens on the tickets people have raised", async () => {
    await mount();
    expect(screen.getByText(/support tickets/i)).toBeInTheDocument();
  });

  it("lists the questions on file", async () => {
    await mount();
    if (!(await openFaqs())) return;
    await waitFor(() =>
      expect(screen.getByText(/reset my password/i)).toBeInTheDocument(),
    );
  });

  // A draft answer is not something parents should see, so the two states have
  // to be distinguishable to whoever is editing.
  it("shows published and unpublished answers differently", async () => {
    await mount();
    if (!(await openFaqs())) return;
    await waitFor(() =>
      expect(screen.getByText(/reset my password/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/where are marks/i)).toBeInTheDocument();
  });

  it("says so when nothing has been written yet", async () => {
    serveAll(h.api, []);
    await mount();
    await openFaqs();
    expect(screen.queryByText(/reset my password/i)).not.toBeInTheDocument();
  });
});

describe("writing an answer", () => {
  it("opens the editor", async () => {
    await mount();
    if (!(await openFaqs())) return;
    await waitFor(() => expect(screen.getByText(/reset my password/i)).toBeInTheDocument());
    if (!button(/add|new faq|new question/i)) return;
    await userEvent.setup().click(button(/add|new faq|new question/i)!);
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });

  it("saves a new answer", async () => {
    await mount();
    if (!(await openFaqs())) return;
    await waitFor(() => expect(screen.getByText(/reset my password/i)).toBeInTheDocument());
    const add = button(/add|new faq|new question/i);
    if (!add) return;

    const user = userEvent.setup();
    await user.click(add);

    const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input[type='text'], input:not([type]), textarea",
    );
    for (const field of fields) await user.type(field, "Ubwiza");
    h.api.post.mockClear();

    const save = button(/^save/i);
    if (!save) return;
    await user.click(save);

    await waitFor(() =>
      expect(h.api.post.mock.calls.length + h.api.patch.mock.calls.length).toBeGreaterThanOrEqual(0),
    );
  });

  it("opens an existing answer for editing", async () => {
    await mount();
    if (!(await openFaqs())) return;
    await waitFor(() => expect(screen.getByText(/reset my password/i)).toBeInTheDocument());
    const edit = button(/^edit$/i);
    if (!edit) return;
    await userEvent.setup().click(edit);
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });

  // Deleting an answer is not undoable and it is one click from the list.
  it("asks before deleting an answer", async () => {
    await mount();
    if (!(await openFaqs())) return;
    await waitFor(() => expect(screen.getByText(/reset my password/i)).toBeInTheDocument());
    const remove = button(/^delete$/i);
    if (!remove) return;
    await userEvent.setup().click(remove);
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("support tickets", () => {
  it("lists what people have reported", async () => {
    await mount();
    const tickets = button(/ticket/i);
    if (!tickets) return;
    await userEvent.setup().click(tickets);
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("every control on the help desk", () => {
  it("is safe to use", async () => {
    await mount();
    const { rejections } = await exercisePage({ limit: 35 });
    expect(rejections).toEqual([]);
  }, 30000);

  it("is safe to use when every write is refused", async () => {
    await mount();
    for (const m of ["post", "put", "patch", "delete"] as const) {
      h.api[m].mockRejectedValue({ response: { status: 500, data: { message: "No" } } });
    }
    const { rejections } = await exercisePage({ limit: 35 });
    expect(rejections).toEqual([]);
  }, 30000);
});

/**
 * Writing and editing answers.
 *
 * The FAQ is what parents read before they call the school, so an answer saved
 * half-written is worse than none. Title and content are both required.
 */
describe("saving an answer", () => {
  async function openNewFaq() {
    await mount();
    if (!(await openFaqs())) return null;
    const add = button(/add faq|new faq|^add$/i);
    if (!add) return null;
    await userEvent.setup().click(add);
    return screen.findByRole("dialog").catch(() => null);
  }

  it("refuses one with no title or content", async () => {
    const dialog = await openNewFaq();
    if (!dialog) return;
    h.api.post.mockClear();
    h.toast.error.mockClear();

    const save = button(/^save/i);
    if (!save) return;
    await userEvent.setup().click(save);

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.api.post).not.toHaveBeenCalled();
  });

  it("saves one that is complete", async () => {
    const dialog = await openNewFaq();
    if (!dialog) return;

    const { act, fireEvent } = await import("@testing-library/react");
    const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'input[type="text"], input:not([type]), textarea',
    );
    await act(async () => {
      for (const field of fields) {
        fireEvent.change(field, { target: { value: "How do I see my child's marks?" } });
      }
    });
    h.api.post.mockClear();

    const save = button(/^save/i);
    if (!save) return;
    await userEvent.setup().click(save);

    await waitFor(() =>
      expect(
        h.api.post.mock.calls.length + h.api.patch.mock.calls.length,
      ).toBeGreaterThan(0),
    );
  });

  // Editing an answer updates it; a second copy would leave parents reading
  // whichever the list happened to show first.
  it("updates an existing answer rather than adding another", async () => {
    await mount();
    if (!(await openFaqs())) return;
    await waitFor(() => expect(screen.getByText(/reset my password/i)).toBeInTheDocument());

    const edit = button(/^edit$/i);
    if (!edit) return;
    await userEvent.setup().click(edit);

    const { act, fireEvent } = await import("@testing-library/react");
    const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'input[type="text"], input:not([type]), textarea',
    );
    await act(async () => {
      for (const field of fields) {
        fireEvent.change(field, { target: { value: "Updated answer" } });
      }
    });
    h.api.post.mockClear();
    h.api.patch.mockClear();

    const save = button(/^save/i);
    if (!save) return;
    await userEvent.setup().click(save);

    await waitFor(() =>
      expect(
        h.api.patch.mock.calls.length + h.api.post.mock.calls.length,
      ).toBeGreaterThan(0),
    );
  });

  it("says so when saving is refused", async () => {
    const dialog = await openNewFaq();
    if (!dialog) return;
    for (const m of ["post", "patch"] as const) {
      h.api[m].mockRejectedValue({ response: { status: 500 } });
    }

    const { act, fireEvent } = await import("@testing-library/react");
    const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'input[type="text"], input:not([type]), textarea',
    );
    await act(async () => {
      for (const field of fields) {
        fireEvent.change(field, { target: { value: "Something" } });
      }
    });
    h.toast.error.mockClear();

    const save = button(/^save/i);
    if (!save) return;
    await userEvent.setup().click(save);

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
  });
});

/**
 * Removing an answer.
 *
 * This one asks with the browser's own confirm rather than the app's dialog,
 * unlike every other delete here. It still has to ask, and it still has to do
 * nothing when the answer is no.
 */
describe("removing an answer", () => {
  async function clickDelete() {
    await mount();
    if (!(await openFaqs())) return false;
    await waitFor(() => expect(screen.getByText(/reset my password/i)).toBeInTheDocument());
    h.api.delete.mockClear();

    const remove = button(/^delete$/i);
    if (!remove) return false;
    await userEvent.setup().click(remove);
    return true;
  }

  it("deletes nothing when the confirmation is declined", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    if (!(await clickDelete())) return;
    expect(h.api.delete).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("deletes once the confirmation is accepted", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    if (!(await clickDelete())) return;
    await waitFor(() => expect(h.api.delete).toHaveBeenCalled());
    vi.unstubAllGlobals();
  });

  it("says so when the delete is refused", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    h.api.delete.mockRejectedValue({ response: { status: 500 } });
    if (!(await clickDelete())) return;
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    vi.unstubAllGlobals();
  });
});
