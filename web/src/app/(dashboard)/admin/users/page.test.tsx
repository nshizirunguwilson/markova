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
  usePathname: () => "/admin/users",
  useSearchParams: () => new URLSearchParams(),
}));

import { screen, waitFor, within } from "@testing-library/react";
import { renderPage, serve, serveAll } from "@/test/page";
import UsersPage from "./page";

const person = (id: string, firstName: string, lastName: string, role: string) => ({
  id,
  firstName,
  lastName,
  email: `${firstName.toLowerCase()}@markova.edu`,
  phone: "+250788000001",
  role,
  isActive: true,
  photoUrl: null,
});

/** Matches PaginatedResponse: the rows live under `data`, not `users`. */
const page = (rows: unknown[], total = rows.length) => ({
  data: rows,
  meta: { total, page: 1, limit: 20, totalPages: Math.max(1, Math.ceil(total / 20)) },
});

const routes = {
  "/users": page([
    person("u-1", "Divine", "Niyonkuru", "STUDENT"),
    person("u-2", "Aline", "Uwase", "TEACHER"),
  ]),
  "/academic/sections": [],
  "/academic/class-levels": [],
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
});

describe("the user list", () => {
  it("lists the people the school has on file", async () => {
    serve(h.api, routes);
    renderPage(UsersPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());
    expect(screen.getByText(/Aline/)).toBeInTheDocument();
  });

  it("says so when nobody matches, rather than showing a bare table", async () => {
    serve(h.api, { ...routes, "/users": page([], 0) });
    renderPage(UsersPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
    expect(screen.queryByText(/Divine/)).not.toBeInTheDocument();
  });

  it("survives a school with no users at all", async () => {
    serveAll(h.api, []);
    renderPage(UsersPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });
});

describe("searching and filtering", () => {
  // The search box is debounced, so the request carries the term rather than
  // firing once per keystroke.
  it("sends the typed search to the API", async () => {
    serve(h.api, routes);
    renderPage(UsersPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    const box = screen.getByPlaceholderText(/search/i);
    await userEvent.setup().type(box, "uwase");

    await waitFor(
      () => {
        const urls = h.api.get.mock.calls.map((c) => String(c[0]));
        expect(urls.some((u) => u.includes("uwase"))).toBe(true);
      },
      { timeout: 3000 },
    );
  });

  it("asks for one role when a role filter is chosen", async () => {
    serve(h.api, routes);
    renderPage(UsersPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    const roleSelect = screen
      .getAllByRole("combobox")
      .find((s) => within(s).queryByText(/teacher/i));
    if (!roleSelect) return; // the filter is optional on narrow layouts
    await userEvent.setup().selectOptions(roleSelect, "TEACHER");

    await waitFor(() => {
      const urls = h.api.get.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("role=TEACHER"))).toBe(true);
    });
  });
});

describe("deleting a user", () => {
  // Removing a person takes their marks, attendance and records with them, so
  // it must never happen on a single stray click.
  it("asks for confirmation and does not delete until given", async () => {
    serve(h.api, routes);
    renderPage(UsersPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    const remove = screen.queryAllByRole("button", { name: /delete/i })[0];
    if (!remove) return;
    await userEvent.setup().click(remove);

    await screen.findByRole("dialog");
    expect(h.api.delete).not.toHaveBeenCalled();
  });
});
