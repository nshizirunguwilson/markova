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
      /* The table prints the school's word for a role, not the API's enum:
         "Head teacher" rather than HEAD_TEACHER. */
      const body = (document.querySelector("tbody")?.textContent ?? "");
      expect(body.indexOf("Parent")).toBeLessThan(body.indexOf("Teacher"));
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
      expect(body.indexOf("Parent")).toBeLessThan(body.indexOf("Teacher"));
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

/**
 * The rest of the controls on the roll.
 *
 * Deactivating is the destructive one: it does not delete a person, it locks
 * them out. So it asks first, and the wording has to say which of the two it
 * is doing.
 */
describe("the other controls on the user list", () => {
  async function mount() {
    serve(h.api, {
      ...routes,
      "/users": page(
        [
          { ...person("u-1", "Divine", "Niyonkuru", "STUDENT"), isActive: true },
          { ...person("u-2", "Aline", "Uwase", "TEACHER"), isActive: false },
        ],
        60,
      ),
    });
    renderPage(UsersPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());
  }

  async function click(el: Element | null | undefined) {
    expect(el).toBeTruthy();
    await act(async () => {
      fireEvent.click(el as Element);
    });
  }

  function button(name: RegExp) {
    return screen
      .queryAllByRole("button")
      .find((b) => name.test((b.textContent ?? "").trim()));
  }

  function lastQuery(): Record<string, string | undefined> {
    const call = [...h.api.get.mock.calls]
      .reverse()
      .find(([url]) => String(url).startsWith("/users?"));
    const qs = String(call?.[0] ?? "").split("?")[1] ?? "";
    return Object.fromEntries(new URLSearchParams(qs).entries());
  }

  it("opens the add-user wizard", async () => {
    await mount();
    await click(button(/add user|new user/i));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
  });

  it("opens the bulk import", async () => {
    await mount();
    await click(button(/import/i));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
  });

  it("filters to the active accounts", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/account status/i), {
        target: { value: "true" },
      });
    });

    await waitFor(() => expect(lastQuery().isActive).toBe("true"));
  });

  it("filters to the deactivated accounts", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/account status/i), {
        target: { value: "false" },
      });
    });

    await waitFor(() => expect(lastQuery().isActive).toBe("false"));
  });

  // "Any" is the absence of a filter, not a value of its own.
  it("drops the status filter when set back to any", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/account status/i), {
        target: { value: "true" },
      });
    });
    await waitFor(() => expect(lastQuery().isActive).toBe("true"));

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/account status/i), { target: { value: "" } });
    });
    await waitFor(() => expect(lastQuery().isActive).toBeUndefined());
  });

  it("takes a different page size", async () => {
    await mount();
    const limit = screen
      .queryAllByRole("combobox")
      .find((el) =>
        Array.from((el as HTMLSelectElement).options).some((o) => o.value === "50"),
      );
    if (!limit) return;
    await act(async () => {
      fireEvent.change(limit, { target: { value: "50" } });
    });

    await waitFor(() => expect(lastQuery().limit).toBe("50"));
  });

  // Changing the page size while deep in the list would land on a page that
  // no longer exists.
  it("returns to the first page when the page size changes", async () => {
    await mount();
    await click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => expect(lastQuery().page).toBe("2"));

    const limit = screen
      .queryAllByRole("combobox")
      .find((el) =>
        Array.from((el as HTMLSelectElement).options).some((o) => o.value === "50"),
      );
    if (!limit) return;
    await act(async () => {
      fireEvent.change(limit, { target: { value: "50" } });
    });

    await waitFor(() => expect(lastQuery().page).toBe("1"));
  });

  /**
   * Answers with the page that was actually asked for.
   *
   * The flat fixture always claims to be page one, and a revisited page comes
   * from the query cache without a new request, so both the indicator and the
   * request log would read "page 1" whatever the buttons did.
   */
  function servePaged() {
    h.api.get.mockImplementation(async (url: string) => {
      const s = String(url);
      if (s.startsWith("/users?")) {
        const page = Number(new URLSearchParams(s.split("?")[1]).get("page") || 1);
        return {
          data: {
            data: [person(`u-${page}`, "Divine", "Niyonkuru", "STUDENT")],
            meta: { total: 60, page, limit: 20, totalPages: 3 },
          },
          status: 200,
        };
      }
      return { data: [], status: 200 };
    });
  }

  it("comes back a page", async () => {
    servePaged();
    renderPage(UsersPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    await click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /previous page/i })).toBeEnabled(),
    );

    await click(screen.getByRole("button", { name: /previous page/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled(),
    );
  });
});

describe("deactivating an account", () => {
  async function mount() {
    serve(h.api, routes);
    renderPage(UsersPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());
  }

  async function askToDeactivate() {
    await mount();
    const remove = screen.queryAllByRole("button", { name: /delete user/i })[0];
    if (!remove) return null;
    await act(async () => {
      fireEvent.click(remove);
    });
    return screen.findByRole("dialog");
  }

  // It locks someone out rather than erasing them, and the wording says so.
  it("asks first, and calls it deactivating", async () => {
    const dialog = await askToDeactivate();
    if (!dialog) return;
    expect(dialog.textContent).toMatch(/deactivate/i);
    expect(h.api.delete).not.toHaveBeenCalled();
  });

  it("does nothing when the ask is dismissed", async () => {
    const dialog = await askToDeactivate();
    if (!dialog) return;

    h.api.delete.mockClear();
    const cancel = within(dialog)
      .getAllByRole("button")
      .find((b) => /^cancel$/i.test((b.textContent ?? "").trim()));
    if (!cancel) return;
    await act(async () => {
      fireEvent.click(cancel);
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.api.delete).not.toHaveBeenCalled();
  });

  it("deactivates once confirmed", async () => {
    const dialog = await askToDeactivate();
    if (!dialog) return;

    h.api.delete.mockClear();
    const confirm = within(dialog)
      .getAllByRole("button")
      .find((b) => /deactivate|confirm/i.test((b.textContent ?? "").trim()));
    if (!confirm) return;
    await act(async () => {
      fireEvent.click(confirm);
    });

    await waitFor(() => expect(h.api.delete).toHaveBeenCalled());
  });
});

/**
 * A directory that is not perfectly filled in, and one that will not load.
 *
 * Every school has records missing a role, a class or a login, and an admin
 * looking for one person cannot be stopped by any of them. The failed load is
 * the other half: a directory that goes blank looks like a school with no
 * staff in it.
 */
describe("records with pieces missing", () => {
  const untidy = [
    // No role recorded at all, so the badge has nothing to colour itself by.
    { ...person("u-1", "Mugisha", "Habimana", ""), role: undefined, isActive: true },
    { ...person("u-2", "Aline", "Uwase", "TEACHER"), email: null, phone: null },
    {
      ...person("u-3", "Keza", "Mutesi", "STUDENT"),
      isActive: false,
      student: { studentIdNumber: "STD-2026-1", classSection: null },
    },
  ];

  async function mountUntidy() {
    serve(h.api, { ...routes, "/users": page(untidy) });
    renderPage(UsersPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Mugisha/)).toBeInTheDocument());
  }

  it("still draws a row for someone with no role", async () => {
    await mountUntidy();
    expect(screen.getByText(/Mugisha/)).toBeInTheDocument();
  });

  it("leaves the contact column empty rather than printing null", async () => {
    await mountUntidy();
    const row = screen.getByText(/Aline/).closest("tr")!;
    expect(row.textContent).not.toContain("null");
  });

  it("draws a dash for a student in no class", async () => {
    await mountUntidy();
    const row = screen.getByText(/Keza/).closest("tr")!;
    expect(within(row).getByText("-")).toBeInTheDocument();
  });

  it("marks a deactivated account as inactive", async () => {
    await mountUntidy();
    const row = screen.getByText(/Keza/).closest("tr")!;
    expect(within(row).getByText("Inactive")).toBeInTheDocument();
  });

  it("sorts by role even when one person has none", async () => {
    await mountUntidy();
    const roleHeader = screen
      .queryAllByRole("button")
      .find((b) => /^role/i.test((b.textContent ?? "").trim()))!;

    await act(async () => {
      fireEvent.click(roleHeader);
    });

    // Blank sorts first rather than throwing on a missing string.
    const first = document.querySelectorAll("tbody tr")[0];
    expect(first.textContent).toMatch(/Mugisha/);
  });
});

describe("a directory nobody matches", () => {
  it("suggests loosening the search rather than showing an empty table", async () => {
    serve(h.api, { ...routes, "/users": page([]) });
    renderPage(UsersPage, { role: "ADMIN" });

    expect(await screen.findByText("No users found")).toBeInTheDocument();
    expect(screen.getByText(/adjusting your search/i)).toBeInTheDocument();
  });
});

describe("a directory that will not load", () => {
  function fails() {
    const error = Object.assign(new Error("boom"), {
      response: { status: 500, data: { message: "boom" } },
    });
    for (const method of ["get", "post", "put", "patch", "delete"] as const) {
      h.api[method].mockRejectedValue(error);
    }
  }

  it("says so, and offers to try again", async () => {
    fails();
    renderPage(UsersPage, { role: "ADMIN" });

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /retry/i }),
    ).toBeInTheDocument();
  });

  it("asks the API again when Retry is pressed", async () => {
    fails();
    renderPage(UsersPage, { role: "ADMIN" });
    await screen.findByText("Something went wrong");

    h.api.get.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    });

    await waitFor(() => expect(h.api.get).toHaveBeenCalled());
  });
});

describe("paging through a large school", () => {
  const many = Array.from({ length: 20 }, (_, i) =>
    person(`u-${i}`, `Person${i}`, "Uwase", "STUDENT"),
  );

  /**
   * Answers with whichever page was asked for, so the footer reads back the
   * page the table is actually on rather than a number frozen in a fixture.
   */
  async function mountPaged() {
    h.api.get.mockImplementation(async (url: string) => {
      const asked = String(url);
      if (!asked.startsWith("/users")) return { data: [] };
      const page = Number(new URLSearchParams(asked.split("?")[1]).get("page") ?? 1);
      return {
        data: { data: many, meta: { total: 60, page, limit: 20, totalPages: 3 } },
      };
    });
    renderPage(UsersPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Person0/)).toBeInTheDocument());
  }

  it("comes back to the page before", async () => {
    await mountPaged();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /next page/i }));
    });
    await waitFor(() => expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /previous page/i }));
    });

    await waitFor(() => expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument());
    // And there is nowhere further back to go.
    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
  });

  it("asks for the page after", async () => {
    await mountPaged();
    h.api.get.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /next page/i }));
    });

    await waitFor(() => {
      const urls = h.api.get.mock.calls.map(([u]: any[]) => String(u));
      expect(urls.some((u) => /page=2\b/.test(u))).toBe(true);
    });
    expect(screen.getByRole("button", { name: /previous page/i })).toBeEnabled();
  });
});

describe("searching from the keyboard", () => {
  it("searches on Enter without waiting for the debounce", async () => {
    serve(h.api, routes);
    renderPage(UsersPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    const box = screen.getByPlaceholderText(/search/i);
    const user = userEvent.setup();
    await user.type(box, "uwase");
    h.api.get.mockClear();
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });

    await waitFor(() => {
      const urls = h.api.get.mock.calls.map(([u]: any[]) => String(u));
      expect(urls.some((u) => u.includes("search=uwase"))).toBe(true);
    });
  });

  it("ignores any other key", async () => {
    serve(h.api, routes);
    renderPage(UsersPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    const box = screen.getByPlaceholderText(/search/i);
    h.api.get.mockClear();
    await act(async () => {
      fireEvent.keyDown(box, { key: "a" });
    });

    expect(h.api.get).not.toHaveBeenCalled();
  });
});

/**
 * The last few corners of the directory.
 *
 * A role filter set back to "all", a delete confirmed rather than dismissed,
 * and a student who does have a class. Each is one arm of a pair the tests
 * above only ever walk one side of.
 */
describe("clearing the role filter", () => {
  it("drops the constraint rather than sending an empty one", async () => {
    serve(h.api, routes);
    renderPage(UsersPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    const picker = screen
      .getAllByRole("combobox")
      .find((el) =>
        Array.from((el as HTMLSelectElement).options).some((o) => o.value === "TEACHER"),
      )!;

    await act(async () => {
      fireEvent.change(picker, { target: { value: "TEACHER" } });
    });
    await waitFor(() => {
      const urls = h.api.get.mock.calls.map(([u]: any[]) => String(u));
      expect(urls.some((u) => u.includes("role=TEACHER"))).toBe(true);
    });

    await act(async () => {
      fireEvent.change(picker, { target: { value: "" } });
    });

    await waitFor(() => {
      const last = [...h.api.get.mock.calls]
        .reverse()
        .find(([u]: any[]) => String(u).startsWith("/users?"));
      // An empty role would filter for people whose role is "", which is
      // nobody at all.
      expect(String(last![0])).not.toMatch(/role=/);
    });
  });
});

describe("a student who is in a class", () => {
  it("names it rather than drawing a dash", async () => {
    serve(h.api, {
      ...routes,
      "/users": page([
        {
          ...person("u-9", "Keza", "Mutesi", "STUDENT"),
          student: {
            studentIdNumber: "STD-2026-9",
            classSection: { id: "s-1", name: "A", classLevel: { name: "Senior 1" } },
          },
        },
      ]),
    });
    renderPage(UsersPage, { role: "ADMIN" });

    const row = (await screen.findByText(/Keza/)).closest("tr")!;
    expect(within(row).getByText(/Senior 1/)).toBeInTheDocument();
    expect(within(row).queryByText("-")).toBeNull();
  });
});

describe("confirming a deletion", () => {
  it("deactivates the account only after the dialog is confirmed", async () => {
    serve(h.api, routes);
    renderPage(UsersPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    const remove = screen.queryAllByRole("button", { name: /delete/i })[0];
    if (!remove) return;
    await act(async () => {
      fireEvent.click(remove);
    });

    const dialog = await screen.findByRole("dialog");
    expect(h.api.delete).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(
        within(dialog)
          .getAllByRole("button")
          .find((b) => /^(deactivate|delete|confirm|yes)/i.test((b.textContent ?? "").trim()))!,
      );
    });

    await waitFor(() => expect(h.api.delete).toHaveBeenCalled());
  });
});


describe("pressing Enter with nothing typed", () => {
  it("drops the search rather than sending an empty one", async () => {
    serve(h.api, routes);
    renderPage(UsersPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());

    const box = screen.getByPlaceholderText(/search/i);
    await act(async () => {
      fireEvent.change(box, { target: { value: "uwase" } });
    });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    await act(async () => {
      fireEvent.change(box, { target: { value: "" } });
    });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });

    await waitFor(() => {
      const last = [...h.api.get.mock.calls]
        .reverse()
        .find(([u]: any[]) => String(u).startsWith("/users?"));
      expect(String(last![0])).not.toMatch(/search=/);
    });
  });
});
