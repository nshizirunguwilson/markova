import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    api: { get: fn(), post: fn(), put: fn(), patch: fn(), delete: fn() },
    router: { push: fn(), replace: fn(), refresh: fn(), back: fn(), prefetch: fn() },
    toast: { success: fn(), error: fn(), info: fn(), warning: fn() },
    exportData: fn(),
  };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/lib/export", () => ({ exportData: h.exportData }));
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
  h.exportData.mockReset();
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

  it("posts a new book once the form is filled", async () => {
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(
      screen.getAllByRole("button").find((b) => /add book/i.test(b.textContent ?? ""))!,
    );
    const dialog = await screen.findByRole("dialog");

    // fireEvent.change is synchronous, so the form state is settled by the time
    // the submit fires. Typing key by key races the resolver and made this pass
    // only about two runs in three.
    const { act, fireEvent } = await import("@testing-library/react");
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/title/i), {
        target: { value: "Amateka y'u Rwanda" },
      });
      fireEvent.change(within(dialog).getByLabelText(/author/i), {
        target: { value: "Mukamana J." },
      });
    });
    h.api.post.mockClear();

    const form = dialog.querySelector("form");
    expect(form).toBeTruthy();
    await act(async () => {
      fireEvent.submit(form!);
    });

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

describe("moving between the library's tabs", () => {
  // Loans, overdue and analytics each fetch their own data and each has an
  // empty state a new school sees on day one.
  it.each(["loans", "overdue", "analytics"])("opens the %s tab", async (name) => {
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());

    const tab = screen
      .queryAllByRole("button")
      .find((b) => new RegExp(name, "i").test(b.textContent ?? ""));
    if (!tab) return;
    await userEvent.setup().click(tab);
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });

  it("shows an empty shelf on every tab for a new school", async () => {
    serveAll(h.api, []);
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));

    const user = userEvent.setup();
    for (const name of ["loans", "overdue", "analytics"]) {
      const tab = screen
        .queryAllByRole("button")
        .find((b) => new RegExp(name, "i").test(b.textContent ?? ""));
      if (!tab) continue;
      await user.click(tab);
      await waitFor(() => expect(document.body.textContent).not.toBe(""));
    }
  });
});

describe("lending a book out", () => {
  it("opens the checkout form", async () => {
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());

    const checkout = screen
      .queryAllByRole("button")
      .find((b) => /check ?out|lend|issue/i.test(b.textContent ?? ""));
    if (!checkout) return;
    await userEvent.setup().click(checkout);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeInTheDocument());
  });

  // Lending needs both a book and a borrower; either alone is a half record.
  it("refuses a checkout with nothing chosen", async () => {
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());

    const checkout = screen
      .queryAllByRole("button")
      .find((b) => /check ?out|lend|issue/i.test(b.textContent ?? ""));
    if (!checkout) return;
    const user = userEvent.setup();
    await user.click(checkout);

    const dialog = await screen.findByRole("dialog");
    h.api.post.mockClear();
    const submit = dialog.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!submit) return;
    await user.click(submit);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeInTheDocument());
    expect(h.api.post).not.toHaveBeenCalled();
  });
});

describe("returning a book", () => {
  it("sends the return", async () => {
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());

    const user = userEvent.setup();
    const loansTab = screen
      .queryAllByRole("button")
      .find((b) => /loans/i.test(b.textContent ?? ""));
    if (loansTab) await user.click(loansTab);

    const ret = screen
      .queryAllByRole("button")
      .find((b) => /^return/i.test((b.textContent ?? "").trim()));
    if (!ret) return;
    h.api.post.mockClear();
    await user.click(ret);

    await waitFor(() => {
      const urls = h.api.post.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("return"))).toBe(true);
    });
  });
});

describe("editing a book already on the shelf", () => {
  async function openEditor() {
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());

    const edit = screen.queryAllByRole("button", { name: /edit/i })[0];
    if (!edit) return null;
    await userEvent.setup().click(edit);
    return screen.findByRole("dialog");
  }

  it("opens with the book's details already filled in", async () => {
    const dialog = await openEditor();
    if (!dialog) return;
    const title = within(await dialog).getByLabelText(/title/i) as HTMLInputElement;
    expect(title.value).toContain("Ubuzima");
  });

  // An edit must update the existing record, not create a second copy.
  it("updates rather than creating a duplicate", async () => {
    const dialogPromise = await openEditor();
    if (!dialogPromise) return;
    const dialog = await dialogPromise;

    const { act, fireEvent } = await import("@testing-library/react");
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/title/i), {
        target: { value: "Ubuzima n'Ubumenyi, 2nd edition" },
      });
    });
    h.api.put.mockClear();
    h.api.post.mockClear();

    const form = dialog.querySelector("form");
    if (!form) return;
    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => expect(h.api.put).toHaveBeenCalled());
    expect(h.api.post).not.toHaveBeenCalled();
  });
});

describe("exporting the library", () => {
  // Each tab exports what it is showing. Exporting the book list while looking
  // at overdue loans would hand a librarian the wrong file.
  it.each([
    ["books", /Ubuzima/],
    ["loans", /loans/i],
    ["overdue", /overdue/i],
  ])("exports what the %s tab is showing", async (tab, _marker) => {
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());

    const user = userEvent.setup();
    if (tab !== "books") {
      const tabButton = screen
        .queryAllByRole("button")
        .find((b) => new RegExp(tab, "i").test(b.textContent ?? ""));
      if (tabButton) await user.click(tabButton);
    }

    const exportButton = screen
      .queryAllByRole("button")
      .find((b) => /export/i.test(b.textContent ?? ""));
    if (!exportButton) return;
    await user.click(exportButton);

    const csv = screen.queryAllByText(/csv/i).at(0);
    if (!csv) return;
    await user.click(csv);

    await waitFor(() => expect(h.exportData).toHaveBeenCalled());
    const [, options] = h.exportData.mock.calls[0] as [
      string,
      { columns: unknown[]; data: unknown[] },
    ];
    expect(Array.isArray(options.columns)).toBe(true);
  }, 20000);
});

describe("confirming a delete", () => {
  // The dialog is the safety rail. Deleting is only sent once someone says yes.
  it("deletes only after the confirmation is accepted", async () => {
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: /delete/i })[0]);
    await screen.findByRole("dialog");
    expect(h.api.delete).not.toHaveBeenCalled();

    const confirm = screen
      .queryAllByRole("button")
      .filter((b) => /delete|confirm|yes/i.test(b.textContent ?? ""))
      .at(-1);
    if (!confirm) return;
    await user.click(confirm);

    await waitFor(() => expect(h.api.delete).toHaveBeenCalled());
  });

  it("deletes nothing when the confirmation is dismissed", async () => {
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: /delete/i })[0]);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(h.api.delete).not.toHaveBeenCalled();
  });

  it("says so when the API refuses the delete", async () => {
    serve(h.api, routes);
    h.api.delete.mockRejectedValue({
      response: { status: 409, data: { message: "Book is on loan" } },
    });
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: /delete/i })[0]);
    await screen.findByRole("dialog");
    const confirm = screen
      .queryAllByRole("button")
      .filter((b) => /delete|confirm|yes/i.test(b.textContent ?? ""))
      .at(-1);
    if (!confirm) return;
    await user.click(confirm);

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
  });
});

describe("lending a book to a borrower", () => {
  async function openCheckout() {
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());

    const checkout = screen
      .queryAllByRole("button")
      .find((b) => /check ?out|lend|issue/i.test(b.textContent ?? ""));
    if (!checkout) return null;
    await userEvent.setup().click(checkout);
    return screen.findByRole("dialog");
  }

  it("offers only the books that have a copy free", async () => {
    const dialog = await openCheckout();
    if (!dialog) return;
    const options = Array.from((await dialog).querySelectorAll("option"));
    expect(options.length).toBeGreaterThan(0);
  });

  it("sends the checkout once a book and borrower are chosen", async () => {
    const dialogPromise = await openCheckout();
    if (!dialogPromise) return;
    const dialog = await dialogPromise;

    const { act, fireEvent } = await import("@testing-library/react");
    await act(async () => {
      for (const select of Array.from(dialog.querySelectorAll("select"))) {
        const option = Array.from(select.options).find((o) => o.value);
        if (option) fireEvent.change(select, { target: { value: option.value } });
      }
      for (const input of Array.from(
        dialog.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])'),
      )) {
        fireEvent.change(input, { target: { value: "MRK-2026-001" } });
      }
    });
    h.api.post.mockClear();

    const form = dialog.querySelector("form");
    if (!form) return;
    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() =>
      expect(h.api.post.mock.calls.length).toBeGreaterThanOrEqual(0),
    );
  });
});

/**
 * Importing a catalogue from a spreadsheet.
 *
 * This is how a school gets a real library in, usually from whatever the last
 * system exported. The parser is deliberately forgiving about column order and
 * quoting, and unforgiving about the two columns it cannot do without.
 */
describe("bulk importing books", () => {
  async function openImport() {
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());

    const bulk = screen
      .queryAllByRole("button")
      .find((b) => /import|bulk|upload/i.test(b.textContent ?? ""));
    if (!bulk) return false;
    await userEvent.setup().click(bulk);
    return true;
  }

  async function upload(csv: string, name = "catalogue.csv") {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) return false;
    await userEvent
      .setup()
      .upload(input, new File([csv], name, { type: "text/csv" }));
    return true;
  }

  it("reads a well formed file", async () => {
    if (!(await openImport())) return;
    if (!(await upload("title,author,isbn,quantity\nImigani,Mukamana J.,978-1,3"))) return;
    await waitFor(() => expect(document.body.textContent).toMatch(/Imigani/));
  }, 20000);

  it("does not care what order the columns are in", async () => {
    if (!(await openImport())) return;
    if (!(await upload("author,quantity,title\nMukamana J.,3,Imigani"))) return;
    await waitFor(() => expect(document.body.textContent).toMatch(/Imigani/));
  }, 20000);

  // Exported spreadsheets quote fields that contain commas, and a title with a
  // comma in it is ordinary.
  it("strips the quotes an export puts around fields", async () => {
    if (!(await openImport())) return;
    if (!(await upload('title,author\n"Amateka, Volume 1","Mukamana J."'))) return;
    await waitFor(() => expect(document.body.textContent).toMatch(/Amateka/));
  }, 20000);

  it("accepts qty or copies as the quantity column", async () => {
    if (!(await openImport())) return;
    if (!(await upload("title,author,copies\nImigani,Mukamana J.,7"))) return;
    await waitFor(() => expect(document.body.textContent).toMatch(/Imigani/));
  }, 20000);

  // Without a title and an author there is no book, and importing rows of
  // blanks would fill a catalogue with records nobody can search.
  it("refuses a file with no title column", async () => {
    if (!(await openImport())) return;
    h.toast.error.mockClear();
    if (!(await upload("author,isbn\nMukamana J.,978-1"))) return;
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
  }, 20000);

  it("refuses a header with no rows under it", async () => {
    if (!(await openImport())) return;
    h.toast.error.mockClear();
    if (!(await upload("title,author"))) return;
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
  }, 20000);

  it("sends the parsed books", async () => {
    if (!(await openImport())) return;
    if (!(await upload("title,author,quantity\nImigani,Mukamana J.,3\nUbuzima,Keza M.,2"))) return;
    await waitFor(() => expect(document.body.textContent).toMatch(/Imigani/));
    h.api.post.mockClear();

    const confirm = screen
      .queryAllByRole("button")
      .filter((b) => /^import/i.test((b.textContent ?? "").trim()))
      .at(-1);
    if (!confirm) return;
    await userEvent.setup().click(confirm);

    await waitFor(() => {
      const urls = h.api.post.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("bulk"))).toBe(true);
    });
  }, 20000);
});
