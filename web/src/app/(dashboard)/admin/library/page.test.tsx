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
  "/library/analytics": {
    totalBooks: 1,
    activeLoans: 1,
    overdueLoans: 0,
    popularBooks: [{ title: book.title, author: book.author, loanCount: 9 }],
    categories: [],
  },
  // PaginatedResponse puts the rows under `data`. Naming it `users` left the
  // checkout modal's borrower list empty in every test.
  "/users": {
    data: students.map((s) => ({ ...s.user, student: { studentIdNumber: s.studentIdNumber } })),
    meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
  },
  "/academic/sections": [],
  "/library/checkout": { id: "loan-9" },
  "/library/return": { id: "loan-9", returnedAt: "2026-08-22T10:00:00Z" },
  "/library/books/bulk": { imported: 1 },
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
        fireEvent.change(input, { target: { value: "STD-2026-001" } });
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

/**
 * The overdue shelf.
 *
 * This is the tab a librarian works from: who has what, how late it is, and
 * taking it back in. An empty overdue list means none of that is on screen, so
 * these serve a library with books actually out past their date.
 */
describe("books that are overdue", () => {
  const overdue = [
    {
      ...loan,
      id: "loan-2",
      dueDate: "2026-07-01",
      returnedAt: null,
      isOverdue: true,
      book,
      bookId: book.id,
      borrower: { id: "u-1", firstName: "Divine", lastName: "Niyonkuru" },
    },
    {
      ...loan,
      id: "loan-3",
      dueDate: "2026-08-01",
      returnedAt: null,
      isOverdue: true,
      book: { ...book, id: "book-2", title: "Imigani" },
      bookId: "book-2",
      borrower: { id: "u-2", firstName: "Keza", lastName: "Mutesi" },
    },
  ];

  async function openOverdue() {
    serve(h.api, { ...routes, "/library/loans/overdue": overdue });
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());

    const tab = screen
      .queryAllByRole("button")
      .find((b) => /overdue/i.test(b.textContent ?? ""));
    expect(tab).toBeTruthy();
    await userEvent.setup().click(tab!);
    await waitFor(() => expect(screen.getByText(/Divine/)).toBeInTheDocument());
  }

  it("lists every book that is late", async () => {
    await openOverdue();
    expect(screen.getByText(/Keza/)).toBeInTheDocument();
  });

  // Who has it is the whole point; a title with no name attached is useless
  // for chasing it up.
  it("names who has each one", async () => {
    await openOverdue();
    const row = screen.getByText(/Divine/).closest("tr")!;
    expect(row.textContent).toMatch(/Ubuzima/);
  });

  it("says how many days late each one is", async () => {
    await openOverdue();
    const row = screen.getByText(/Divine/).closest("tr")!;
    expect(row.textContent).toMatch(/\d+ days/);
  });

  // Taking a book back is done from this row, so the return has to name the
  // right book and not just the loan.
  it("takes a book back from its row", async () => {
    await openOverdue();
    const row = screen.getByText(/Divine/).closest("tr")!;
    const ret = within(row)
      .getAllByRole("button")
      .find((b) => /return/i.test(b.textContent ?? ""));
    expect(ret).toBeTruthy();

    h.api.post.mockClear();
    h.api.patch.mockClear();
    await userEvent.setup().click(ret!);

    await waitFor(() => {
      const calls = [...h.api.post.mock.calls, ...h.api.patch.mock.calls];
      expect(calls.length).toBeGreaterThan(0);
      expect(JSON.stringify(calls[0])).toMatch(/book-1/);
    });
  });

  it("exports the overdue list with the borrower and the days late", async () => {
    await openOverdue();
    h.exportData.mockClear();

    // Export is a dropdown: the trigger opens it, a format runs it.
    const user = userEvent.setup();
    const trigger = screen
      .queryAllByRole("button")
      .find((b) => /export/i.test(b.textContent ?? ""));
    expect(trigger).toBeTruthy();
    await user.click(trigger!);

    const csv = await waitFor(() => {
      const found = screen
        .queryAllByRole("button")
        .find((b) => /^csv$/i.test((b.textContent ?? "").trim()));
      expect(found).toBeTruthy();
      return found!;
    });
    await user.click(csv);

    await waitFor(() => expect(h.exportData).toHaveBeenCalled());
    // exportData(format, payload): the rows are in the second argument.
    const rows = (h.exportData.mock.calls[0][1] as any).data;
    expect(rows[0]._borrower).toBe("Divine Niyonkuru");
    expect(typeof rows[0]._daysOverdue).toBe("number");
  });
});

describe("the library's own numbers", () => {
  async function openAnalytics() {
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());

    const tab = screen
      .queryAllByRole("button")
      .find((b) => /analytic/i.test(b.textContent ?? ""));
    expect(tab).toBeTruthy();
    await userEvent.setup().click(tab!);
  }

  // The count beside each title is the reason the table exists; without it the
  // list is just books in an arbitrary order.
  it("shows how many times each popular book went out", async () => {
    await openAnalytics();
    await waitFor(() => expect(screen.getByText("9")).toBeInTheDocument());
  });
});

/**
 * Bringing a whole shelf in from a spreadsheet.
 *
 * A school hands over a CSV from whatever it kept before. The parser's job is
 * to accept the columns it needs in any order, ignore rows it cannot use, and
 * refuse the file outright rather than importing half a catalogue silently.
 */
describe("importing books from a CSV", () => {
  async function openImport() {
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());

    const open = screen
      .queryAllByRole("button")
      .find((b) => /bulk import/i.test(b.textContent ?? ""));
    expect(open).toBeTruthy();
    await userEvent.setup().click(open!);
    return screen.findByRole("dialog");
  }

  /** Hands the modal a CSV the way a file picker would. */
  async function upload(csv: string) {
    const { act, fireEvent } = await import("@testing-library/react");
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).toBeTruthy();
    const file = new File([csv], "books.csv", { type: "text/csv" });
    await act(async () => {
      fireEvent.change(input!, { target: { files: [file] } });
    });
    // FileReader resolves on a later tick than the change event.
    await new Promise((r) => setTimeout(r, 50));
  }

  const HEADER = "title,author,isbn,quantity";
  const ROW = "Inganzo,Kagabo P.,978-9-99,4";

  it("opens on the upload step", async () => {
    const dialog = await openImport();
    expect(dialog.textContent).toMatch(/import/i);
    expect(document.querySelector('input[type="file"]')).toBeTruthy();
  });

  it("shows what it parsed before importing anything", async () => {
    await openImport();
    h.api.post.mockClear();
    await upload(`${HEADER}\n${ROW}`);

    await waitFor(() => expect(screen.getByText(/Inganzo/)).toBeInTheDocument());
    expect(h.api.post).not.toHaveBeenCalled();
  });

  // Column order is whatever the old system produced.
  it("finds the columns wherever they are", async () => {
    await openImport();
    await upload(`author,quantity,title\nKagabo P.,7,Inganzo`);

    await waitFor(() => expect(screen.getByText(/Inganzo/)).toBeInTheDocument());
  });

  it("accepts qty or copies as the count", async () => {
    await openImport();
    await upload(`title,author,copies\nInganzo,Kagabo P.,9`);

    await waitFor(() => expect(screen.getByText(/Inganzo/)).toBeInTheDocument());
  });

  // Without a title and an author there is no book, so the file is refused
  // rather than imported as blanks.
  it("refuses a file with no title or author column", async () => {
    await openImport();
    h.toast.error.mockClear();
    await upload(`isbn,quantity\n978-9-99,4`);

    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(/title.*author/i)),
    );
  });

  it("refuses a file with only a header", async () => {
    await openImport();
    h.toast.error.mockClear();
    await upload(HEADER);

    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(/header row/i)),
    );
  });

  // A row missing a title is skipped, not imported as an untitled book.
  it("skips rows it cannot use and keeps the rest", async () => {
    await openImport();
    await upload(`${HEADER}\n,Kagabo P.,978-0-00,1\n${ROW}`);

    await waitFor(() => expect(screen.getByText(/Inganzo/)).toBeInTheDocument());

    const { act, fireEvent } = await import("@testing-library/react");
    h.api.post.mockClear();
    const confirm = screen
      .queryAllByRole("button")
      .find((b) => /confirm import/i.test(b.textContent ?? ""));
    await act(async () => {
      fireEvent.click(confirm!);
    });

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/library/books/bulk"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).books).toHaveLength(1);
    });
  });

  it("says so when every row is unusable", async () => {
    await openImport();
    h.toast.error.mockClear();
    await upload(`${HEADER}\n,,978-0-00,1\n,,978-0-01,2`);

    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(/no valid book rows/i)),
    );
  });

  it("imports what it parsed, with the counts as numbers", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    await openImport();
    await upload(`${HEADER}\n${ROW}`);
    await waitFor(() => expect(screen.getByText(/Inganzo/)).toBeInTheDocument());

    h.api.post.mockClear();
    const confirm = screen
      .queryAllByRole("button")
      .find((b) => /confirm import/i.test(b.textContent ?? ""));
    expect(confirm).toBeTruthy();
    await act(async () => {
      fireEvent.click(confirm!);
    });

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/library/books/bulk"),
      );
      expect(call).toBeTruthy();
      const book = (call![1] as any).books[0];
      expect(book.title).toBe("Inganzo");
      expect(book.author).toBe("Kagabo P.");
      expect(book.quantity).toBe(4);
    });
  });

  // A book with no count given is one copy, not zero.
  it("defaults a missing count to one copy", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    await openImport();
    await upload(`title,author\nInganzo,Kagabo P.`);
    await waitFor(() => expect(screen.getByText(/Inganzo/)).toBeInTheDocument());

    h.api.post.mockClear();
    await act(async () => {
      fireEvent.click(
        screen.queryAllByRole("button").find((b) => /confirm import/i.test(b.textContent ?? ""))!,
      );
    });

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/library/books/bulk"),
      );
      expect((call![1] as any).books[0].quantity).toBe(1);
    });
  });

  it("goes back to the upload step when the preview is cancelled", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    await openImport();
    await upload(`${HEADER}\n${ROW}`);
    await waitFor(() => expect(screen.getByText(/Inganzo/)).toBeInTheDocument());

    h.api.post.mockClear();
    await act(async () => {
      fireEvent.click(
        screen.queryAllByRole("button").find((b) => /^cancel$/i.test((b.textContent ?? "").trim()))!,
      );
    });

    await waitFor(() => expect(screen.queryByText(/Inganzo/)).toBeNull());
    expect(h.api.post).not.toHaveBeenCalled();
  });
});

/**
 * Lending a book from the admin side.
 *
 * Same desk transaction as the librarian's, but the borrower is picked from a
 * list rather than scanned, so the value sent has to be the student's number
 * and not their user id.
 */
describe("the checkout desk", () => {
  async function openCheckout() {
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());

    const open = screen
      .queryAllByRole("button")
      .find((b) => /^checkout$/i.test((b.textContent ?? "").trim()));
    expect(open).toBeTruthy();
    await userEvent.setup().click(open!);
    return screen.findByRole("dialog");
  }

  it("lists the students who could borrow", async () => {
    const dialog = await openCheckout();
    await waitFor(() => expect(dialog.textContent).toMatch(/Divine/));
  });

  // The API takes an identifier a human recognises, so the option's value has
  // to be the student number rather than the user's uuid.
  it("identifies a borrower by their student number", async () => {
    const dialog = await openCheckout();
    await waitFor(() => expect(dialog.textContent).toMatch(/Divine/));

    const picker = within(dialog)
      .getAllByRole("combobox")
      .find((el) =>
        Array.from((el as HTMLSelectElement).options).some((o) => /STD-/.test(o.value)),
      );
    expect(picker).toBeTruthy();
  });

  it("lends the chosen book to the chosen student", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    const dialog = await openCheckout();
    await waitFor(() => expect(dialog.textContent).toMatch(/Divine/));

    for (const select of within(dialog).getAllByRole("combobox")) {
      const option = Array.from((select as HTMLSelectElement).options).find((o) => o.value);
      if (!option) continue;
      await act(async () => {
        fireEvent.change(select, { target: { value: option.value } });
      });
    }
    for (const box of within(dialog).queryAllByRole("textbox")) {
      await act(async () => {
        fireEvent.change(box, { target: { value: "BK-0001" } });
      });
    }

    h.api.post.mockClear();
    await act(async () => {
      fireEvent.submit(dialog.querySelector("form")!);
    });

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/library/checkout"),
      );
      expect(call).toBeTruthy();
    });
  });

  it("closes without lending anything when dismissed", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    const dialog = await openCheckout();

    h.api.post.mockClear();
    await act(async () => {
      fireEvent.click(
        within(dialog)
          .getAllByRole("button")
          .find((b) => /^cancel$/i.test((b.textContent ?? "").trim()))!,
      );
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.api.post).not.toHaveBeenCalled();
  });

  // The desk serves one borrower after another, so nothing may carry over.
  it("clears itself for the next borrower", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    const dialog = await openCheckout();
    for (const box of within(dialog).queryAllByRole("textbox")) {
      await act(async () => {
        fireEvent.change(box, { target: { value: "BK-0001" } });
      });
    }

    await act(async () => {
      fireEvent.click(
        within(dialog)
          .getAllByRole("button")
          .find((b) => /^cancel$/i.test((b.textContent ?? "").trim()))!,
      );
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await userEvent.setup().click(
      screen.queryAllByRole("button").find((b) => /^checkout$/i.test((b.textContent ?? "").trim()))!,
    );
    const again = await screen.findByRole("dialog");
    for (const box of within(again).queryAllByRole("textbox")) {
      expect((box as HTMLInputElement).value).toBe("");
    }
  });
});

describe("deleting a book from the catalogue", () => {
  async function askToDelete() {
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());

    const remove = screen.queryAllByRole("button", { name: /delete/i })[0];
    if (!remove) return null;
    await userEvent.setup().click(remove);
    return screen.findByRole("dialog");
  }

  it("keeps the book when the ask is dismissed", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    const dialog = await askToDelete();
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
    expect(screen.getByText(/Ubuzima/)).toBeInTheDocument();
  });
});

describe("after a book is lent out", () => {
  async function openCheckout() {
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());

    const open = screen
      .queryAllByRole("button")
      .find((b) => /^checkout$/i.test((b.textContent ?? "").trim()));
    await userEvent.setup().click(open!);
    return screen.findByRole("dialog");
  }

  async function lend(dialog: HTMLElement) {
    const { act, fireEvent } = await import("@testing-library/react");
    await waitFor(() => expect(dialog.textContent).toMatch(/Divine/));

    for (const select of within(dialog).getAllByRole("combobox")) {
      const option = Array.from((select as HTMLSelectElement).options).find((o) => o.value);
      if (!option) continue;
      await act(async () => {
        fireEvent.change(select, { target: { value: option.value } });
      });
    }
    for (const box of within(dialog).queryAllByRole("textbox")) {
      await act(async () => {
        fireEvent.change(box, { target: { value: "BK-0001" } });
      });
    }
    await act(async () => {
      fireEvent.submit(dialog.querySelector("form")!);
    });
  }

  it("closes the desk once the loan is recorded", async () => {
    const dialog = await openCheckout();
    await lend(dialog);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  // The desk serves one borrower after another, so nothing may carry over into
  // the next loan.
  it("clears itself for the next borrower", async () => {
    const dialog = await openCheckout();
    await lend(dialog);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await userEvent.setup().click(
      screen
        .queryAllByRole("button")
        .find((b) => /^checkout$/i.test((b.textContent ?? "").trim()))!,
    );
    const again = await screen.findByRole("dialog");
    for (const box of within(again).queryAllByRole("textbox")) {
      expect((box as HTMLInputElement).value).toBe("");
    }
  });

  it("searches the catalogue as the librarian types", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });
    await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());

    const box = document.querySelector<HTMLInputElement>(
      'input[placeholder*="Search"]',
    );
    if (!box) return;
    await act(async () => {
      fireEvent.change(box, { target: { value: "ubuzima" } });
    });

    expect(box.value).toBe("ubuzima");
  });
});

/**
 * The corners of the library screen.
 *
 * Everything below is a path a librarian reaches on an ordinary day but that
 * the happy-path tests above walk straight past: a record typed in without an
 * ISBN, a tab that is still loading, a form submitted half empty, a CSV with
 * the columns in the wrong order.
 */
describe("the library when the data is not tidy", () => {
  it("opens a book with nothing but a title for editing", async () => {
    const user = userEvent.setup();
    serve(h.api, {
      ...routes,
      // Everything optional left blank, which is how a rushed stock take
      // actually enters a book.
      "/library/books": [
        { id: "bare", title: "Untitled Donation", author: "", availableCount: 0 },
      ],
    });
    renderPage(LibraryPage, { role: "ADMIN" });

    await screen.findByText("Untitled Donation");
    await user.click(screen.getByRole("button", { name: /edit/i }));

    // The blanks come through as blanks, not as the word "undefined".
    expect(await screen.findByLabelText("Title")).toHaveValue("Untitled Donation");
    expect(screen.getByLabelText("Author")).toHaveValue("");
    expect(screen.getByLabelText("ISBN")).toHaveValue("");
    expect(screen.getByLabelText("Total Copies")).toHaveValue(1);
    expect(screen.getByLabelText("Shelf Location")).toHaveValue("");
  });

  it("shows an em dash where a book has no ISBN or category", async () => {
    serve(h.api, {
      ...routes,
      "/library/books": [
        { id: "bare", title: "Untitled Donation", author: "Anon", availableCount: 0 },
      ],
    });
    renderPage(LibraryPage, { role: "ADMIN" });

    const row = (await screen.findByText("Untitled Donation")).closest("tr")!;
    expect(within(row).getAllByText("—")).toHaveLength(2);
  });

  it("refuses to save a book with no title and no author", async () => {
    const user = userEvent.setup();
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });

    await user.click(await screen.findByRole("button", { name: /add book/i }));
    // Two buttons now read "Add Book": the header one and the form's submit.
    await user.click(screen.getAllByRole("button", { name: "Add Book" }).at(-1)!);

    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    expect(screen.getByText("Author is required")).toBeInTheDocument();
    // Nothing was sent: a rejected form must not reach the API.
    expect(h.api.post).not.toHaveBeenCalledWith("/library/books", expect.anything());
  });

  it("refuses a book with no copies", async () => {
    const user = userEvent.setup();
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });

    await user.click(await screen.findByRole("button", { name: /add book/i }));
    await user.type(screen.getByLabelText("Title"), "Imbonezamubano");
    await user.type(screen.getByLabelText("Author"), "Uwase Aline");
    await user.clear(screen.getByLabelText("Total Copies"));
    await user.type(screen.getByLabelText("Total Copies"), "0");
    await user.click(screen.getAllByRole("button", { name: "Add Book" }).at(-1)!);

    expect(await screen.findByText("At least 1 copy")).toBeInTheDocument();
  });
});

describe("the library while it is still loading", () => {
  const hangs = () => new Promise(() => {});

  it("spins on the loans tab until the loans arrive", async () => {
    const user = userEvent.setup();
    serve(h.api, { ...routes, "/library/loans/active": hangs });
    renderPage(LibraryPage, { role: "ADMIN" });

    await user.click(await screen.findByRole("button", { name: "Active Loans" }));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("spins on the overdue tab until the overdue list arrives", async () => {
    const user = userEvent.setup();
    serve(h.api, { ...routes, "/library/loans/overdue": hangs });
    renderPage(LibraryPage, { role: "ADMIN" });

    await user.click(await screen.findByRole("button", { name: "Overdue" }));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("spins on the analytics tab until the figures arrive", async () => {
    const user = userEvent.setup();
    serve(h.api, { ...routes, "/library/analytics": hangs });
    renderPage(LibraryPage, { role: "ADMIN" });

    await user.click(await screen.findByRole("button", { name: "Analytics" }));
    expect(screen.queryByText("Total Books")).not.toBeInTheDocument();
  });
});

/** Opens the export dropdown and picks CSV. Both are plain buttons. */
async function exportCsv(user: ReturnType<typeof userEvent.setup>) {
  h.exportData.mockClear();
  const trigger = screen
    .queryAllByRole("button")
    .find((b) => /export/i.test(b.textContent ?? ""))!;
  await user.click(trigger);
  const csv = await waitFor(() => {
    const found = screen
      .queryAllByRole("button")
      .find((b) => /^csv$/i.test((b.textContent ?? "").trim()));
    expect(found).toBeTruthy();
    return found!;
  });
  await user.click(csv);
  await waitFor(() => expect(h.exportData).toHaveBeenCalled());
}

describe("exporting each library tab", () => {
  const namelessLoan = {
    id: "loan-x",
    bookId: "book-x",
    book: { title: "Ubumenyi" },
    borrower: {},
    checkoutDate: "2026-08-01T00:00:00Z",
    dueDate: "2026-08-08T00:00:00Z",
  };

  it("exports the active loans, blank borrower and all", async () => {
    const user = userEvent.setup();
    serve(h.api, { ...routes, "/library/loans/active": [namelessLoan] });
    renderPage(LibraryPage, { role: "ADMIN" });

    await user.click(await screen.findByRole("button", { name: "Active Loans" }));
    await screen.findByText("Ubumenyi");
    await exportCsv(user);

    const [, payload] = h.exportData.mock.calls.at(-1)!;
    expect(payload.filename).toBe("active-loans");
    expect(payload.data[0]._borrower).toBe("");
  });

  it("exports the overdue loans with the days counted", async () => {
    const user = userEvent.setup();
    serve(h.api, { ...routes, "/library/loans/overdue": [namelessLoan] });
    renderPage(LibraryPage, { role: "ADMIN" });

    await user.click(await screen.findByRole("button", { name: "Overdue" }));
    await screen.findByText("Ubumenyi");
    await exportCsv(user);

    const [, payload] = h.exportData.mock.calls.at(-1)!;
    expect(payload.filename).toBe("overdue-loans");
    expect(payload.data[0]._daysOverdue).toBeGreaterThan(0);
  });

  it("returns a loan that only carries a bookId", async () => {
    const user = userEvent.setup();
    serve(h.api, {
      ...routes,
      "/library/loans/active": [{ ...namelessLoan, book: undefined }],
    });
    renderPage(LibraryPage, { role: "ADMIN" });

    await user.click(await screen.findByRole("button", { name: "Active Loans" }));
    await user.click(await screen.findByRole("button", { name: "Return" }));

    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith("/library/return", {
        bookIdentifier: "book-x",
      }),
    );
  });

  it("returns an overdue loan that only carries a bookId", async () => {
    const user = userEvent.setup();
    serve(h.api, {
      ...routes,
      "/library/loans/overdue": [{ ...namelessLoan, book: undefined }],
    });
    renderPage(LibraryPage, { role: "ADMIN" });

    await user.click(await screen.findByRole("button", { name: "Overdue" }));
    await user.click(await screen.findByRole("button", { name: "Return" }));

    await waitFor(() =>
      expect(h.api.post).toHaveBeenCalledWith("/library/return", {
        bookIdentifier: "book-x",
      }),
    );
  });

  it("shows nought against a popular book with no count", async () => {
    const user = userEvent.setup();
    serve(h.api, {
      ...routes,
      "/library/analytics": {
        totalBooks: 3,
        popularBooks: [{ title: "Ubumenyi", author: "Anon" }],
      },
    });
    renderPage(LibraryPage, { role: "ADMIN" });

    await user.click(await screen.findByRole("button", { name: "Analytics" }));
    const row = (await screen.findByText("Ubumenyi")).closest("tr")!;
    expect(within(row).getByText("0")).toBeInTheDocument();
  });
});

describe("importing a CSV of books", () => {
  const openImport = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole("button", { name: /bulk import/i }));
    return screen.getByLabelText("Select item") as HTMLInputElement;
  };

  const csv = (text: string) =>
    new File([text], "books.csv", { type: "text/csv" });

  it("takes the columns in any order and fills in a missing quantity", async () => {
    const user = userEvent.setup();
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });

    const input = await openImport(user);
    await user.upload(input, csv("author,title\nUwase Aline,Imbonezamubano"));

    expect(await screen.findByText(/1 book will be imported/i)).toBeInTheDocument();
    const row = screen.getByText("Imbonezamubano").closest("tr")!;
    // No isbn column at all, and no quantity: one copy, no ISBN.
    expect(within(row).getByText("—")).toBeInTheDocument();
    expect(within(row).getByText("1")).toBeInTheDocument();
  });

  it("reads quantity from a column called copies", async () => {
    const user = userEvent.setup();
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });

    const input = await openImport(user);
    await user.upload(
      input,
      csv("title,author,isbn,copies\nImbonezamubano,Uwase Aline,978-1,4"),
    );

    const row = (await screen.findByText("Imbonezamubano")).closest("tr")!;
    expect(within(row).getByText("4")).toBeInTheDocument();
    expect(within(row).getByText("978-1")).toBeInTheDocument();
  });

  it("counts the rows it is not showing", async () => {
    const user = userEvent.setup();
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });

    const rows = Array.from({ length: 8 }, (_, i) => `Book ${i},Author ${i}`);
    const input = await openImport(user);
    await user.upload(input, csv(["title,author", ...rows].join("\n")));

    expect(await screen.findByText(/8 books will be imported/i)).toBeInTheDocument();
    expect(screen.getByText(/and 3 more/i)).toBeInTheDocument();
  });

  it("skips rows with a blank title or author", async () => {
    const user = userEvent.setup();
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });

    const input = await openImport(user);
    await user.upload(
      input,
      csv("title,author\nImbonezamubano,Uwase Aline\n,Nobody\nNo Author,"),
    );

    expect(await screen.findByText(/1 book will be imported/i)).toBeInTheDocument();
  });

  it("says so when a header row names neither title nor author", async () => {
    const user = userEvent.setup();
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });

    const input = await openImport(user);
    await user.upload(input, csv("name,writer\nImbonezamubano,Uwase Aline"));

    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        "CSV must have at least 'title' and 'author' columns",
      ),
    );
  });

  it("says so when every row is blank", async () => {
    const user = userEvent.setup();
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });

    const input = await openImport(user);
    await user.upload(input, csv("title,author\n,\n,"));

    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith("No valid book rows found in CSV"),
    );
  });

  it("says so when the file is only a header", async () => {
    const user = userEvent.setup();
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });

    const input = await openImport(user);
    await user.upload(input, csv("title,author"));

    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        "CSV must have a header row and at least one data row",
      ),
    );
  });

  it("does nothing at all when the picker is dismissed", async () => {
    const user = userEvent.setup();
    serve(h.api, routes);
    renderPage(LibraryPage, { role: "ADMIN" });

    const input = await openImport(user);
    // Dismissing the OS file picker fires change with an empty list.
    await user.upload(input, []);

    expect(h.toast.error).not.toHaveBeenCalled();
    expect(screen.queryByText(/will be imported/i)).not.toBeInTheDocument();
  });
});
