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
  usePathname: () => "/admin/library",
  useSearchParams: () => new URLSearchParams(),
}));

import { screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve, serveAll } from "@/test/page";
import { book, loan, students } from "@/test/fixtures";
import LibraryPage from "./page";

const routes = {
  "/library/books": [book],
  "/library/loans/active": [loan],
  "/library/loans/overdue": [],
  "/library/analytics": { totalBooks: 1, activeLoans: 1, overdue: 0, popular: [book] },
  "/users": { users: students.map((s) => s.user), meta: { total: 2, page: 1, limit: 20, totalPages: 1 } },
  "/academic/sections": [],
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
});

describe("the library catalogue", () => {
  it("lists the books the school holds", async () => {
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());
  });

  it("says the shelf is empty rather than showing a bare table", async () => {
    serveAll(h.api, []);
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(screen.queryByText(/Ubuzima/)).not.toBeInTheDocument();
  });
});

describe("adding a book", () => {
  it("opens and closes the book form", async () => {
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());

    const user = userEvent.setup();
    const add = screen
      .getAllByRole("button")
      .find((b) => /add book/i.test(b.textContent ?? ""));
    await user.click(add!);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("posts a new book and closes the form", async () => {
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(
      screen.getAllByRole("button").find((b) => /add book/i.test(b.textContent ?? ""))!,
    );
    const dialog = await screen.findByRole("dialog");

    // Title and author are both required by the form's schema.
    await user.type(within(dialog).getByLabelText(/title/i), "Amateka y'u Rwanda");
    await user.type(within(dialog).getByLabelText(/author/i), "Mukamana J.");
    h.api.post.mockClear();

    const save = within(dialog)
      .getAllByRole("button")
      .find((b) => /save|add|create/i.test(b.textContent ?? ""));
    await user.click(save!);

    await waitFor(() => expect(h.api.post).toHaveBeenCalled());
    expect(String(h.api.post.mock.calls[0][0])).toContain("/library/books");
    expect(h.api.post.mock.calls[0][1]).toMatchObject({
      title: "Amateka y'u Rwanda",
      author: "Mukamana J.",
    });
  });

  // Both fields are required, and the form is expected to say which is missing
  // rather than posting a half-filled record.
  it("refuses a book with no author", async () => {
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(
      screen.getAllByRole("button").find((b) => /add book/i.test(b.textContent ?? ""))!,
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/title/i), "Amateka y'u Rwanda");
    h.api.post.mockClear();

    await user.click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /save|add|create/i.test(b.textContent ?? ""))!,
    );

    // The form is expected to hold the dialog open and refuse the write.
    await new Promise((r) => setTimeout(r, 300));
    expect(h.api.post).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeInTheDocument();
  });
});

describe("deleting a book", () => {
  // Deleting a copy from the catalogue is not undoable, so it asks first.
  it("asks before deleting and does nothing until confirmed", async () => {
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: /delete/i })[0]);

    await screen.findByRole("dialog");
    expect(h.api.delete).not.toHaveBeenCalled();
  });
});
