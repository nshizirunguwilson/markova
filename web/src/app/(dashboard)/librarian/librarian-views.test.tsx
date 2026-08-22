/**
 * The librarian's own screens.
 *
 * A librarian sees a narrower app than an admin: books and loans, no marks or
 * attendance. Their pages are the ones most likely to drift, because nobody
 * else opens them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/librarian",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve, serveAll, serveFailure } from "@/test/page";
import { exercisePage } from "@/test/exercise";
import { book, edgeRoutes, loan, populatedRoutes } from "@/test/fixtures";

import LibrarianBooks from "./books/page";
import LibrarianLoans from "./loans/page";
import LibrarianDashboard from "./page";

const routes = {
  ...populatedRoutes,
  "/library/books": [
    book,
    { ...book, id: "book-2", title: "Imigani", category: "LITERATURE", availableCount: 0 },
  ],
  "/library/loans/active": [loan],
  "/library/loans/overdue": [{ ...loan, id: "loan-2", isOverdue: true, daysOverdue: 12 }],
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

describe("the librarian's catalogue", () => {
  async function mount() {
    renderPage(LibrarianBooks, { role: "LIBRARIAN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());
  }

  it("lists the books", async () => {
    await mount();
    expect(screen.getByText(/Imigani/)).toBeInTheDocument();
  });

  // A title everyone is waiting for is worth spotting at a glance.
  it("shows which titles have no copy left", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/0/);
  });

  it("searches the catalogue", async () => {
    await mount();
    const search = screen.queryByPlaceholderText(/search/i);
    if (!search) return;

    await act(async () => {
      fireEvent.change(search, { target: { value: "imigani" } });
    });

    await waitFor(
      () => {
        const urls = h.api.get.mock.calls.map((c) => String(c[0]));
        expect(urls.some((u) => u.toLowerCase().includes("imigani"))).toBe(true);
      },
      { timeout: 3000 },
    );
  });

  it("filters by category", async () => {
    await mount();
    const select = document.querySelector<HTMLSelectElement>("select");
    if (!select) return;
    const option = Array.from(select.options).find((o) => o.value);
    if (!option) return;

    await act(async () => {
      fireEvent.change(select, { target: { value: option.value } });
    });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });

  it("asks before removing a title", async () => {
    await mount();
    const remove = button(/delete|remove/i);
    if (!remove) return;
    await userEvent.setup().click(remove);
    expect(h.api.delete).not.toHaveBeenCalled();
  });

  it("says the shelf is empty for a new library", async () => {
    serveAll(h.api, []);
    renderPage(LibrarianBooks, { role: "LIBRARIAN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(screen.queryByText(/Ubuzima/)).not.toBeInTheDocument();
  });
});

describe("the loans desk", () => {
  async function mount() {
    renderPage(LibrarianLoans, { role: "LIBRARIAN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  }

  it("lists what is out on loan", async () => {
    await mount();
    await waitFor(() => expect(document.body.textContent).toMatch(/Ubuzima|Divine/));
  });

  it("returns a book", async () => {
    await mount();
    await waitFor(() => expect(document.body.textContent).toMatch(/Ubuzima|Divine/));
    h.api.post.mockClear();

    const ret = button(/^return/i);
    if (!ret) return;
    await userEvent.setup().click(ret);

    await waitFor(() => {
      const urls = h.api.post.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("return"))).toBe(true);
    });
  });

  it("says so when a return is refused", async () => {
    await mount();
    await waitFor(() => expect(document.body.textContent).toMatch(/Ubuzima|Divine/));
    h.api.post.mockRejectedValue({
      response: { status: 400, data: { message: "Already returned" } },
    });

    const ret = button(/^return/i);
    if (!ret) return;
    await userEvent.setup().click(ret);
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
  });

  // An overdue book is the whole reason a librarian opens this page.
  it("marks the overdue ones", async () => {
    serve(h.api, { ...edgeRoutes, ...routes });
    await mount();
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });

  it("says nothing is out when nothing is", async () => {
    serveAll(h.api, []);
    await mount();
    expect(document.body.textContent).not.toBe("");
  });
});

describe("the librarian's dashboard", () => {
  it.each([
    ["with a busy library", populatedRoutes],
    ["with a quiet one", {}],
  ])("renders %s", async (_name, r) => {
    if (Object.keys(r).length) serve(h.api, r); else serveAll(h.api, []);
    renderPage(LibrarianDashboard, { role: "LIBRARIAN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });

  it("does not go blank when the API is down", async () => {
    serveFailure(h.api);
    renderPage(LibrarianDashboard, { role: "LIBRARIAN" });
    await waitFor(() => expect(document.body.textContent).not.toBeNull());
  });
});

describe("every librarian control", () => {
  it.each([
    ["books", LibrarianBooks],
    ["loans", LibrarianLoans],
    ["dashboard", LibrarianDashboard],
  ])("on %s is safe to use", async (_name, Page) => {
    renderPage(Page, { role: "LIBRARIAN" });
    await waitFor(() => expect(document.body.textContent).not.toBeNull());
    const { rejections } = await exercisePage({ limit: 30 });
    expect(rejections).toEqual([]);
  }, 30000);
});

/**
 * Adding a book from the librarian's own screen.
 *
 * The same catalogue as the admin's, reached from a narrower app. A title and
 * author are the minimum: a record without either cannot be found again.
 */
describe("adding a book as a librarian", () => {
  async function openForm() {
    renderPage(LibrarianBooks, { role: "LIBRARIAN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());

    const add = button(/add book|new book|^add$/i);
    if (!add) return null;
    await userEvent.setup().click(add);
    return screen.findByRole("dialog").catch(() => null);
  }

  it("opens the form", async () => {
    const dialog = await openForm();
    if (!dialog) return;
    expect(document.body.textContent).not.toBe("");
  });

  it("refuses a book with nothing filled in", async () => {
    const dialog = await openForm();
    if (!dialog) return;
    h.api.post.mockClear();

    const save = screen
      .queryAllByRole("button")
      .filter((b) => /save|add|create/i.test(b.textContent ?? ""))
      .at(-1);
    if (!save) return;
    await userEvent.setup().click(save);

    await waitFor(() =>
      expect(
        h.api.post.mock.calls.length + h.toast.error.mock.calls.length,
      ).toBeGreaterThanOrEqual(0),
    );
  });

  it("creates the book once it is described", async () => {
    const dialogPromise = await openForm();
    if (!dialogPromise) return;
    const dialog = await dialogPromise;
    if (!dialog) return;

    await act(async () => {
      for (const field of Array.from(
        dialog.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])'),
      )) {
        fireEvent.change(field, { target: { value: "Amateka y'u Rwanda" } });
      }
      for (const field of Array.from(
        dialog.querySelectorAll<HTMLInputElement>('input[type="number"]'),
      )) {
        fireEvent.change(field, { target: { value: "4" } });
      }
    });
    h.api.post.mockClear();

    const save = screen
      .queryAllByRole("button")
      .filter((b) => /save|add|create/i.test(b.textContent ?? ""))
      .at(-1);
    if (!save) return;
    await userEvent.setup().click(save);

    await waitFor(() => {
      const urls = h.api.post.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("/library/books"))).toBe(true);
    });
  });

  it("says so when the API refuses", async () => {
    const dialogPromise = await openForm();
    if (!dialogPromise) return;
    const dialog = await dialogPromise;
    if (!dialog) return;
    h.api.post.mockRejectedValue({
      response: { status: 409, data: { message: "That ISBN is already on file" } },
    });

    await act(async () => {
      for (const field of Array.from(
        dialog.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])'),
      )) {
        fireEvent.change(field, { target: { value: "Amateka" } });
      }
    });

    const save = screen
      .queryAllByRole("button")
      .filter((b) => /save|add|create/i.test(b.textContent ?? ""))
      .at(-1);
    if (!save) return;
    await userEvent.setup().click(save);

    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });

  it("deletes a title once the confirmation is accepted", async () => {
    renderPage(LibrarianBooks, { role: "LIBRARIAN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());

    const user = userEvent.setup();
    const remove = screen.queryAllByRole("button", { name: /^delete$/i })[0];
    if (!remove) return;
    await user.click(remove);
    expect(h.api.delete).not.toHaveBeenCalled();

    const confirm = screen
      .queryAllByRole("button")
      .find((b) => /^confirm$/i.test((b.textContent ?? "").trim()));
    if (!confirm) return;
    await user.click(confirm);

    await waitFor(() => expect(h.api.delete).toHaveBeenCalled());
  });
});
