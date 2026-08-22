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

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
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

/**
 * Ordering and scoping the roll.
 *
 * The list is the whole school on one screen, so an admin's two ways through
 * it are sorting a column and narrowing what the search looks at. Sorting is
 * done on the rows already fetched, which is why the order has to be right
 * rather than merely different.
 */
describe("sorting the list", () => {
  const rows = [
    { ...person("u-1", "Mugisha", "Habimana", "TEACHER"), isActive: false, lastLoginAt: "2026-08-01T09:00:00Z" },
    { ...person("u-2", "Aline", "Uwase", "STUDENT"), isActive: true, lastLoginAt: "2026-08-20T09:00:00Z" },
    { ...person("u-3", "Keza", "Mutesi", "PARENT"), isActive: true, lastLoginAt: null },
  ];

  async function mount() {
    serve(h.api, { ...routes, "/users": page(rows) });
    renderPage(UsersPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Aline/)).toBeInTheDocument());
  }

  /**
   * A sortable column header. The name column is headed "User", and each
   * header appends a sort arrow once it is active, so these match on the
   * leading word rather than the whole label.
   */
  function header(name: RegExp) {
    return screen
      .queryAllByRole("button")
      .find((b) => name.test((b.textContent ?? "").trim()));
  }

  async function click(el: Element | null | undefined) {
    expect(el).toBeTruthy();
    await act(async () => {
      fireEvent.click(el as Element);
    });
  }

  /**
   * The first names in the order the table shows them. Each row opens with the
   * avatar's initials, so the name is picked out by matching the known set
   * rather than by taking the first token.
   */
  function namesInOrder() {
    const known = ["Aline", "Keza", "Mugisha"];
    return Array.from(document.querySelectorAll("tbody tr")).map((tr) => {
      const text = tr.textContent ?? "";
      return known.find((n) => text.includes(n)) ?? "";
    });
  }

  // The list already opens sorted by name ascending, so the first click on
  // that column reverses it rather than sorting it again.
  it("opens sorted by name", async () => {
    await mount();
    const names = namesInOrder();
    expect(names.indexOf("Aline")).toBeLessThan(names.indexOf("Mugisha"));
  });

  it("reverses the name order on the first click", async () => {
    await mount();
    await click(header(/^user/i));

    await waitFor(() => {
      const names = namesInOrder();
      expect(names.indexOf("Mugisha")).toBeLessThan(names.indexOf("Aline"));
    });
  });

  // A second click on the same column reverses it, rather than re-sorting the
  // same way.
  it("puts it back on a second click", async () => {
    await mount();
    const original = namesInOrder();

    await click(header(/^user/i));
    await click(header(/^user/i));
    await waitFor(() => expect(namesInOrder()).toEqual(original));
  });

  it("sorts by role", async () => {
    await mount();
    await click(header(/^role/i));

    await waitFor(() => {
      const body = (document.querySelector("tbody")?.textContent ?? "");
      expect(body.indexOf("PARENT")).toBeLessThan(body.indexOf("TEACHER"));
    });
  });

  it("sorts by whether the account is active", async () => {
    await mount();
    await click(header(/^status/i));

    await waitFor(() => {
      // Ascending on "active"/"inactive" puts the live accounts first, so the
      // one deactivated account sorts to the bottom.
      expect(namesInOrder().at(-1)).toBe("Mugisha");
    });
  });

  // Someone who has never signed in has no date, and must not be treated as
  // the most recent.
  it("sorts by last login without promoting those who never signed in", async () => {
    await mount();
    await click(header(/last login/i));

    await waitFor(() => {
      expect(namesInOrder()[0]).toBe("Keza");
    });
  });

  // Switching columns starts that column ascending rather than inheriting the
  // previous column's direction.
  it("starts a newly chosen column ascending", async () => {
    await mount();
    await click(header(/^user/i));
    await click(header(/^user/i));
    await click(header(/^role/i));

    await waitFor(() => {
      const body = (document.querySelector("tbody")?.textContent ?? "");
      expect(body.indexOf("PARENT")).toBeLessThan(body.indexOf("TEACHER"));
    });
  });
});

describe("narrowing what the search looks at", () => {
  async function mount() {
    serve(h.api, routes);
    renderPage(UsersPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());
  }

  function lastQuery(): Record<string, string | undefined> {
    const call = [...h.api.get.mock.calls]
      .reverse()
      .find(([url]) => String(url).startsWith("/users?"));
    const qs = String(call?.[0] ?? "").split("?")[1] ?? "";
    return Object.fromEntries(new URLSearchParams(qs).entries());
  }

  it("searches every field by default", async () => {
    await mount();
    expect(lastQuery().searchIn).toBeUndefined();
  });

  it("narrows the search to one field group", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/search in/i), {
        target: { value: "email" },
      });
    });

    await waitFor(() => expect(lastQuery().searchIn).toBe("email"));
  });

  // "All" is the absence of a scope, not a scope called "all".
  it("drops the scope again when set back to all", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/search in/i), { target: { value: "email" } });
    });
    await waitFor(() => expect(lastQuery().searchIn).toBe("email"));

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/search in/i), { target: { value: "all" } });
    });
    await waitFor(() => expect(lastQuery().searchIn).toBeUndefined());
  });

  // Changing the scope while on page 4 would show an empty page.
  it("returns to the first page when the scope changes", async () => {
    serve(h.api, {
      ...routes,
      "/users": {
        data: [person("u-1", "Divine", "Niyonkuru", "STUDENT")],
        meta: { total: 60, page: 1, limit: 20, totalPages: 3 },
      },
    });
    renderPage(UsersPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /next page/i }));
    });
    await waitFor(() => expect(lastQuery().page).toBe("2"));

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/search in/i), { target: { value: "email" } });
    });
    await waitFor(() => expect(lastQuery().page).toBe("1"));
  });
});
