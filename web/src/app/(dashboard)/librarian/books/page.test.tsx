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
  usePathname: () => "/librarian/books",
  useSearchParams: () => new URLSearchParams(),
}));

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { cellTexts, renderPage, serve, serveFailure } from "@/test/page";
import { book } from "@/test/fixtures";

import BooksPage from "./page";

/**
 * The catalogue a librarian works from.
 *
 * Checking a book out and taking it back are barcode-scanner flows: the field
 * takes whatever the scanner types and the form has to clear itself for the
 * next one, or the queue at the desk stops moving.
 */

const outOfStock = {
  ...book,
  id: "book-2",
  title: "Imigani",
  author: "Anonymous",
  category: null,
  isbn: null,
  quantity: 4,
  availableCount: 0,
};

const routes = {
  // `{ data, meta }` - the envelope PaginatedResponse actually sends. A bare
  // array here is what let this page ship saying "No books found" over a
  // library of 56 while every test passed.
  "/library/books": {
    data: [book, outOfStock],
    meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
  },
  "/library/analytics": {
    totalBooks: 2,
    activeLoans: 4,
    overdueLoans: 1,
    categories: [
      { category: "SCIENCE", count: 1 },
      { category: "LITERATURE", count: 1 },
    ],
  },
  "/library/checkout": { id: "loan-9" },
  "/library/return": { id: "loan-9", returnedAt: "2026-08-22T10:00:00Z" },
};

beforeEach(() => {
  for (const m of Object.values(h.api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
  serve(h.api, routes);
});

async function mount() {
  renderPage(BooksPage, { role: "LIBRARIAN" });
  await waitFor(() => expect(screen.getByText(/Ubuzima/)).toBeInTheDocument());
}

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    fireEvent.click(el as Element);
  });
}

function button(name: RegExp) {
  return screen.queryAllByRole("button").find((b) => name.test((b.textContent ?? "").trim()));
}

/** The filters the catalogue was last asked for. */
function lastBooksQuery() {
  const call = [...h.api.get.mock.calls]
    .reverse()
    .find(([url]) => String(url).startsWith("/library/books?"));
  const qs = String(call?.[0] ?? "").split("?")[1] ?? "";
  return Object.fromEntries(new URLSearchParams(qs).entries());
}

describe("the catalogue", () => {
  it("lists the titles the school holds", async () => {
    await mount();
    expect(screen.getByText(/Imigani/)).toBeInTheDocument();
  });

  it("shows the author and ISBN", async () => {
    await mount();
    const row = screen.getByText(/Ubuzima/).closest("tr")!;
    expect(row.textContent).toMatch(/Mukamana J./);
    expect(row.textContent).toMatch(/978-9970/);
  });

  // Two counts, and they are not the same question: how many the school owns,
  // and how many are on the shelf right now.
  it("shows copies owned and copies available separately", async () => {
    await mount();
    const row = screen.getByText(/Ubuzima/).closest("tr")!;
    expect(row.textContent).toMatch(/5/);
    expect(row.textContent).toMatch(/3/);
  });

  it("shows a title with nothing left as zero available", async () => {
    await mount();
    const row = screen.getByText(/Imigani/).closest("tr")!;
    expect(row.textContent).toMatch(/0/);
  });

  it("leaves a dash where a book has no category or ISBN", async () => {
    await mount();
    const row = screen.getByText(/Imigani/).closest("tr")!;
    expect(cellTexts(row)).toContain("-");
  });

  it("says so when the shelves are empty", async () => {
    serve(h.api, { ...routes, "/library/books": [] });
    renderPage(BooksPage, { role: "LIBRARIAN" });
    await waitFor(() => expect(screen.getByText(/no books found/i)).toBeInTheDocument());
  });

  it("does not go blank when the catalogue fails to load", async () => {
    serveFailure(h.api);
    renderPage(BooksPage, { role: "LIBRARIAN" });
    await waitFor(() => expect(document.body.textContent).not.toBe(""));
  });

  it("shows the library's headline numbers", async () => {
    await mount();
    expect(document.body.textContent).toMatch(/Books out/i);
    expect(document.body.textContent).toMatch(/Overdue/i);
  });
});

describe("finding a book", () => {
  it("searches the catalogue on the server", async () => {
    await mount();
    const box = document.querySelector<HTMLInputElement>('input[type="text"]')!;
    await act(async () => {
      fireEvent.change(box, { target: { value: "ubuzima" } });
    });

    await waitFor(() => expect(lastBooksQuery().search).toBe("ubuzima"));
  });

  // The categories come from the library's own analytics, so the filter can
  // only offer what the school actually holds.
  it("offers the categories the school holds", async () => {
    await mount();
    const category = screen.getByLabelText(/category/i) as HTMLSelectElement;
    const values = Array.from(category.options).map((o) => o.value);
    expect(values).toContain("SCIENCE");
    expect(values).toContain("LITERATURE");
  });

  it("filters by category", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/category/i), {
        target: { value: "SCIENCE" },
      });
    });

    await waitFor(() => expect(lastBooksQuery().category).toBe("SCIENCE"));
  });

  it("asks for everything again when the category is cleared", async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/category/i), { target: { value: "SCIENCE" } });
    });
    await waitFor(() => expect(lastBooksQuery().category).toBe("SCIENCE"));

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/category/i), { target: { value: "" } });
    });
    await waitFor(() => expect(lastBooksQuery().category).toBeUndefined());
  });
});

describe("adding a book", () => {
  async function openForm() {
    await mount();
    await click(button(/add book/i));
    return screen.findByRole("dialog");
  }

  it("opens a form", async () => {
    const dialog = await openForm();
    expect(within(dialog).getByLabelText(/^title$/i)).toBeInTheDocument();
  });

  it("adds it with everything that was filled in", async () => {
    const dialog = await openForm();
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/^title$/i), {
        target: { value: "Inganzo" },
      });
      fireEvent.change(within(dialog).getByLabelText(/^author$/i), {
        target: { value: "Kagabo P." },
      });
      fireEvent.change(within(dialog).getByLabelText(/^isbn$/i), {
        target: { value: "978-9-99" },
      });
    });

    h.api.post.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^add book$/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/library/books"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).title).toBe("Inganzo");
      expect((call![1] as any).author).toBe("Kagabo P.");
    });
  });

  // Copies and cost are numbers. Sent as strings, the running totals on the
  // analytics card become string concatenation.
  it("sends the counts as numbers", async () => {
    const dialog = await openForm();
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/^title$/i), {
        target: { value: "Inganzo" },
      });
      fireEvent.change(within(dialog).getByLabelText(/^quantity$/i), {
        target: { value: "12" },
      });
      fireEvent.change(within(dialog).getByLabelText(/replacement cost/i), {
        target: { value: "8500" },
      });
    });

    h.api.post.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^add book$/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => {
      const body = h.api.post.mock.calls[0][1] as any;
      expect(body.quantity).toBe(12);
      expect(body.replacementCost).toBe(8500);
    });
  });

  it("empties the form for the next book", async () => {
    const dialog = await openForm();
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/^title$/i), {
        target: { value: "Inganzo" },
      });
    });
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^add book$/i.test((b.textContent ?? "").trim())),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await click(button(/add book/i));
    const again = await screen.findByRole("dialog");
    expect((within(again).getByLabelText(/^title$/i) as HTMLInputElement).value).toBe("");
  });

  it("closes without adding anything when dismissed", async () => {
    const dialog = await openForm();
    h.api.post.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^cancel$/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.api.post).not.toHaveBeenCalled();
  });
});

describe("lending a book out", () => {
  async function openCheckout() {
    await mount();
    await click(button(/^checkout$/i));
    return screen.findByRole("dialog");
  }

  // Both halves are scanner fields: a book barcode and a student number.
  it("takes a book and a borrower", async () => {
    const dialog = await openCheckout();
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/book \(barcode/i), {
        target: { value: "BK-0001" },
      });
      fireEvent.change(within(dialog).getByLabelText(/student \(id/i), {
        target: { value: "STD-2025-0001" },
      });
    });

    h.api.post.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^checkout$/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/library/checkout"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).bookIdentifier).toBe("BK-0001");
      expect((call![1] as any).studentIdentifier).toBe("STD-2025-0001");
    });
  });

  // The desk queue keeps moving only if the fields clear themselves.
  it("clears itself for the next borrower", async () => {
    const dialog = await openCheckout();
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/book \(barcode/i), {
        target: { value: "BK-0001" },
      });
    });
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^checkout$/i.test((b.textContent ?? "").trim())),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await click(button(/^checkout$/i));
    const again = await screen.findByRole("dialog");
    expect(
      (within(again).getByLabelText(/book \(barcode/i) as HTMLInputElement).value,
    ).toBe("");
  });

  // A book already out, or a student at their limit, is refused by the server.
  // Keeping the form up means the librarian can fix it at the desk.
  it("stays open when the checkout is refused", async () => {
    const dialog = await openCheckout();
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/book \(barcode/i), {
        target: { value: "BK-0001" },
      });
    });

    h.api.post.mockRejectedValue({
      response: { status: 409, data: { message: "That copy is already out" } },
    });
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^checkout$/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeInTheDocument());
  });
});

describe("taking a book back", () => {
  async function openReturn() {
    await mount();
    await click(button(/^return$/i));
    return screen.findByRole("dialog");
  }

  it("takes it back by barcode", async () => {
    const dialog = await openReturn();
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/book \(barcode/i), {
        target: { value: "BK-0001" },
      });
    });

    h.api.post.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^return$/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => {
      const call = h.api.post.mock.calls.find(([url]: any[]) =>
        String(url).includes("/library/return"),
      );
      expect(call).toBeTruthy();
      expect((call![1] as any).bookIdentifier).toBe("BK-0001");
    });
  });

  it("clears itself for the next one", async () => {
    const dialog = await openReturn();
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText(/book \(barcode/i), {
        target: { value: "BK-0001" },
      });
    });
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^return$/i.test((b.textContent ?? "").trim())),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await click(button(/^return$/i));
    const again = await screen.findByRole("dialog");
    expect(
      (within(again).getByLabelText(/book \(barcode/i) as HTMLInputElement).value,
    ).toBe("");
  });
});

describe("removing a book", () => {
  // A title deleted by accident takes its loan history with it.
  it("asks first", async () => {
    await mount();
    h.api.delete.mockClear();
    await click(screen.getAllByRole("button", { name: /^delete$/i })[0]);

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(h.api.delete).not.toHaveBeenCalled();
  });

  it("deletes nothing when the ask is dismissed", async () => {
    await mount();
    await click(screen.getAllByRole("button", { name: /^delete$/i })[0]);
    const dialog = await screen.findByRole("dialog");

    h.api.delete.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^cancel$/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.api.delete).not.toHaveBeenCalled();
  });

  it("deletes that book once confirmed", async () => {
    await mount();
    await click(screen.getAllByRole("button", { name: /^delete$/i })[0]);
    const dialog = await screen.findByRole("dialog");

    h.api.delete.mockClear();
    await click(
      within(dialog)
        .getAllByRole("button")
        .find((b) => /^confirm$/i.test((b.textContent ?? "").trim())),
    );

    await waitFor(() => expect(h.api.delete).toHaveBeenCalledWith("/library/books/book-1"));
  });
});

/**
 * The catalogue said "No books found" over a library of 56.
 *
 * `/library/books` answers `{ data, meta }`, and this page read `.length`
 * straight off that envelope - `undefined`, which the empty branch treats as
 * nothing. Its own header counted the books correctly the whole time, from a
 * different endpoint, so the page contradicted itself.
 */
describe("the catalogue against the envelope the API really sends", () => {
  it("lists the books inside a paginated response", async () => {
    serve(h.api, routes);
    renderPage(BooksPage, { role: "LIBRARIAN" });
    expect(await screen.findByText(book.title)).toBeInTheDocument();
    expect(screen.queryByText("No books found")).toBeNull();
  });

  it("still says so when the library really is empty", async () => {
    serve(h.api, {
      ...routes,
      "/library/books": { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } },
    });
    renderPage(BooksPage, { role: "LIBRARIAN" });
    expect(await screen.findByText("No books found")).toBeInTheDocument();
  });

  // Tolerant of a bare array too, so an un-paginated endpoint keeps working.
  it("copes with a bare array", async () => {
    serve(h.api, { ...routes, "/library/books": [book] });
    renderPage(BooksPage, { role: "LIBRARIAN" });
    expect(await screen.findByText(book.title)).toBeInTheDocument();
  });
});
