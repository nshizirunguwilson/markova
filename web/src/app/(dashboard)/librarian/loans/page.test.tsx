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
  usePathname: () => "/librarian/loans",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve } from "@/test/page";
import { book, populatedRoutes } from "@/test/fixtures";

import LibrarianLoansPage from "./page";

/**
 * What the librarian chases.
 *
 * The status column is the whole screen: it is what tells a librarian whether
 * to say nothing, remind someone at break, or write to a parent. Its three
 * bands are one day apart, so all three have to be tested against real dates
 * rather than against a fixture frozen at one point in time.
 */

/** A loan due `days` from now; negative means it is already late. */
function dueIn(days: number, over: Record<string, unknown> = {}) {
  const due = new Date();
  due.setDate(due.getDate() + days);
  return {
    id: `loan-${days}`,
    book,
    borrower: { id: "u-1", firstName: "Divine", lastName: "Niyonkuru" },
    checkedOutAt: "2026-08-01T00:00:00Z",
    dueDate: due.toISOString(),
    ...over,
  };
}

const routes = {
  ...populatedRoutes,
  "/library/loans/active": [dueIn(9)],
  "/library/loans/overdue": [],
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

function mount(over: Record<string, unknown> = {}) {
  serve(h.api, { ...routes, ...over });
  renderPage(LibrarianLoansPage, { role: "LIBRARIAN" });
}

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    fireEvent.click(el as Element);
  });
}

describe("the loans a librarian is watching", () => {
  it("counts each tab", async () => {
    mount({
      "/library/loans/active": [dueIn(9), dueIn(4, { id: "l-2" })],
      "/library/loans/overdue": [dueIn(-3, { id: "l-3" })],
    });

    expect(await screen.findByText(/Active \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Overdue \(1\)/)).toBeInTheDocument();
  });

  it("counts nought on a tab with nothing in it", async () => {
    mount({ "/library/loans/active": [], "/library/loans/overdue": [] });
    expect(await screen.findByText(/Active \(0\)/)).toBeInTheDocument();
  });

  it("names the book and who has it", async () => {
    mount();
    expect(await screen.findByText(book.title)).toBeInTheDocument();
    expect(screen.getByText(/Divine Niyonkuru/)).toBeInTheDocument();
  });
});

describe("the status column's three bands", () => {
  const statusIn = async (days: number) => {
    mount({ "/library/loans/active": [dueIn(days)] });
    await screen.findByText(book.title);
    const row = screen.getByText(book.title).closest("tr")!;
    return within(row).getByText(/day/).textContent ?? "";
  };

  it("says nothing much about a book due next week", async () => {
    expect(await statusIn(9)).toMatch(/9 days left/);
  });

  it("warns about a book due in two days", async () => {
    document.body.innerHTML = "";
    expect(await statusIn(2)).toMatch(/Due in 2 days/);
  });

  it("uses the singular for a book due tomorrow", async () => {
    document.body.innerHTML = "";
    const text = await statusIn(1);
    expect(text).toMatch(/Due in 1 day/);
    expect(text).not.toMatch(/1 days/);
  });

  it("counts the days a book is already late", async () => {
    document.body.innerHTML = "";
    expect(await statusIn(-4)).toMatch(/4 days overdue/);
  });
});

describe("loans whose records came back short", () => {
  it("names a loan whose book record has gone", async () => {
    mount({ "/library/loans/active": [dueIn(5, { book: undefined })] });
    expect(await screen.findByText("Unknown book")).toBeInTheDocument();
  });

  it("leaves the borrower column blank rather than printing undefined", async () => {
    mount({ "/library/loans/active": [dueIn(5, { borrower: undefined })] });
    await screen.findByText(book.title);

    expect(document.body.textContent).not.toMatch(/undefined/);
  });
});

describe("moving between the tabs", () => {
  it("shows the overdue list when asked", async () => {
    mount({
      "/library/loans/overdue": [dueIn(-6, { id: "l-late" })],
    });
    await screen.findByText(/Overdue \(1\)/);

    await click(
      screen.queryAllByRole("button").find((b) => /overdue/i.test(b.textContent ?? "")),
    );

    expect(await screen.findByText(/6 days overdue/)).toBeInTheDocument();
  });

  it("says so when a tab has nothing on it", async () => {
    mount({ "/library/loans/active": [] });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("spins rather than claiming a tab is empty", async () => {
    mount({ "/library/loans/active": () => new Promise(() => {}) });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
