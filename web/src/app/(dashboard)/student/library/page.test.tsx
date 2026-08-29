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
  usePathname: () => "/student/library",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve } from "@/test/page";
import { book, populatedRoutes } from "@/test/fixtures";

import StudentLibraryPage from "./page";

/**
 * What a student sees of the library.
 *
 * Two questions, in this order: what have I got out, and when is it due. The
 * catalogue is second because a student searches it far less often than they
 * check whether they are about to be fined.
 *
 * The due-date badge is the whole point of the first tab, so every band of it
 * is tested here: overdue, due within two days, and comfortably in hand.
 */

/** A loan due `days` from now; negative means it is already late. */
function dueIn(days: number, over: Record<string, unknown> = {}) {
  const due = new Date();
  due.setDate(due.getDate() + days);
  return {
    id: `loan-${days}`,
    status: "ACTIVE",
    book,
    checkedOutAt: "2026-08-01T00:00:00Z",
    dueDate: due.toISOString(),
    returnedAt: null,
    ...over,
  };
}

const routes = {
  ...populatedRoutes,
  "/library/loans/my": [],
  "/library/books": [book],
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

function mount(loans: unknown[] = [], extra: Record<string, unknown> = {}) {
  serve(h.api, { ...routes, "/library/loans/my": loans, ...extra });
  renderPage(StudentLibraryPage, { role: "STUDENT" });
}

describe("what a student has out", () => {
  it("says plainly when they have nothing out", async () => {
    mount([]);
    expect(await screen.findByText("You have no books out.")).toBeInTheDocument();
  });

  it("counts the books out on the tab itself", async () => {
    mount([dueIn(5), dueIn(9, { id: "loan-b" })]);
    expect(await screen.findByText(/My books \(2\)/)).toBeInTheDocument();
  });

  it("counts only the ones still out", async () => {
    mount([
      dueIn(5),
      dueIn(-30, { id: "loan-done", status: "RETURNED", returnedAt: "2026-08-10T00:00:00Z" }),
    ]);
    expect(await screen.findByText(/My books \(1\)/)).toBeInTheDocument();
  });

  it("says how many days are left on a book due next week", async () => {
    mount([dueIn(6)]);
    expect(await screen.findByText("6 days left")).toBeInTheDocument();
  });

  it("warns differently on a book due in two days", async () => {
    mount([dueIn(9, { id: "loan-calm" }), dueIn(2, { id: "loan-soon" })]);
    await screen.findByText("2 days left");

    const soon = screen.getByText("2 days left").className;
    const calm = screen.getByText("9 days left").className;
    // Two days is the last chance to renew, so it cannot look like nine.
    expect(soon).not.toBe(calm);
  });

  it("counts the days a book is already late", async () => {
    mount([dueIn(-4)]);
    expect(await screen.findByText("4 days overdue")).toBeInTheDocument();
  });

  it("names a loan whose book record has gone", async () => {
    mount([dueIn(3, { book: undefined })]);
    expect(await screen.findByText("Unknown book")).toBeInTheDocument();
  });
});

describe("what a student has already given back", () => {
  it("hides the history section entirely when there is none", async () => {
    mount([dueIn(5)]);
    await screen.findByText(/My books/);
    expect(screen.queryByText("Borrowing History")).toBeNull();
  });

  it("shows the date a book went back", async () => {
    mount([
      dueIn(-20, {
        id: "loan-back",
        status: "RETURNED",
        returnedAt: "2026-08-10T00:00:00Z",
      }),
    ]);

    await screen.findByText("Borrowing History");
    const row = screen.getByText("RETURNED").closest("tr")!;
    expect(within(row).getAllByText(/\d/).length).toBeGreaterThan(0);
  });

  it("leaves a dash where a lost book was never returned", async () => {
    mount([
      dueIn(-60, { id: "loan-lost", status: "LOST", returnedAt: null }),
    ]);

    await screen.findByText("Borrowing History");
    const row = screen.getByText("LOST").closest("tr")!;
    expect(within(row).getByText("-")).toBeInTheDocument();
    // A lost book is not a success, whatever colour a returned one gets.
    expect(screen.getByText("LOST").className).not.toBe(
      screen.queryByText("RETURNED")?.className,
    );
  });
});

describe("the catalogue", () => {
  async function openCatalogue() {
    await screen.findByText(/My books/);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /all books/i }));
    });
  }

  it("lists the books the school holds", async () => {
    mount([]);
    await openCatalogue();
    expect(await screen.findByText(book.title)).toBeInTheDocument();
    expect(screen.getByText("3 available")).toBeInTheDocument();
  });

  it("says when every copy is out", async () => {
    mount([], { "/library/books": [{ ...book, availableCount: 0 }] });
    await openCatalogue();
    expect(await screen.findByText("Unavailable")).toBeInTheDocument();
  });

  it("omits the category chip on a book that has none", async () => {
    mount([], { "/library/books": [{ ...book, category: null }] });
    await openCatalogue();
    await screen.findByText(book.title);
    expect(screen.queryByText("SCIENCE")).toBeNull();
  });

  it("says so when the shelves are empty", async () => {
    mount([], { "/library/books": [] });
    await openCatalogue();
    expect(await screen.findByText("No books found.")).toBeInTheDocument();
  });

  it("searches the catalogue on the server, not in the page", async () => {
    mount([]);
    await openCatalogue();
    await screen.findByText(book.title);

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Search books..."), {
        target: { value: "ubuzima" },
      });
    });

    await waitFor(() => {
      const asked = h.api.get.mock.calls.some(([url, config]: any[]) =>
        String(url).includes("/library/books") &&
        (config?.params?.search === "ubuzima" || String(url).includes("ubuzima")),
      );
      expect(asked).toBe(true);
    });
  });
});

describe("while the library is still loading", () => {
  const hangs = () => new Promise(() => {});

  it("spins rather than claiming no loans", async () => {
    mount([], { "/library/loans/my": hangs });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(screen.queryByText("You have no books out.")).toBeNull();
  });

  it("spins rather than claiming the shelves are empty", async () => {
    mount([], { "/library/books": hangs });
    await screen.findByText(/My books/);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /all books/i }));
    });
    expect(screen.queryByText("No books found.")).toBeNull();
  });
});
