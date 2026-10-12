import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertMutation,
  assertQuery,
  resolveAll,
  runMutation,
  type MutationCase,
  type QueryCase,
} from "@/test/hooks";

const h = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/api", () => ({ default: h.api }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import * as library from "./use-library";

const api = h.api;
beforeEach(() => { for (const m of Object.values(api)) m.mockReset(); });

const queries: QueryCase[] = [
  { name: "useBooks", hook: () => library.useBooks({ search: "kinyarwanda" }), url: "/library/books?" },
  { name: "useBook", hook: () => library.useBook("book-1"), url: "/library/books/book-1" },
  { name: "useActiveLoans", hook: () => library.useActiveLoans(), url: "/library/loans/active" },
  { name: "useOverdueLoans", hook: () => library.useOverdueLoans(), url: "/library/loans/overdue" },
  { name: "useMyLoans", hook: () => library.useMyLoans(), url: "/library/loans/my" },
  { name: "useLibraryAnalytics", hook: () => library.useLibraryAnalytics(), url: "/library/analytics" },
];

const mutations: MutationCase[] = [
  { name: "useCreateBook", hook: () => library.useCreateBook(), method: "post", url: "/library/books" },
  { name: "useUpdateBook", hook: () => library.useUpdateBook(), method: "put", url: "/library/books/id-1" },
  { name: "useDeleteBook", hook: () => library.useDeleteBook(), arg: "id-1", method: "delete", url: "/library/books/id-1" },
  { name: "useCheckout", hook: () => library.useCheckout(), method: "post", url: "/library/checkout" },
  { name: "useReturn", hook: () => library.useReturn(), method: "post", url: "/library/return" },
  { name: "useBulkImportBooks", hook: () => library.useBulkImportBooks(), arg: { books: [] }, method: "post", url: "/library/books/bulk" },
];

describe("use-library queries", () => {
  it.each(queries)("$name reads its endpoint and reports failure", async (c) => {
    await assertQuery(api, c);
  });
});

describe("use-library mutations", () => {
  it.each(mutations)("$name writes its endpoint and reports failure", async (c) => {
    await assertMutation(api, c);
  });
});

// The success toast names the book and the borrower. It used to read those
// straight off the response, so a response without them threw inside onSuccess
// and a completed checkout was reported to the user as a failure.
describe("checkout and return survive a thin response", () => {
  it.each([
    ["useCheckout", () => library.useCheckout()],
    ["useReturn", () => library.useReturn()],
  ])("%s succeeds when the response omits book and borrower", async (_name, hook) => {
    resolveAll(api, { id: "loan-1" });
    const result = await runMutation(hook, { bookId: "book-1" });
    expect(result.current.isSuccess).toBe(true);
  });

  it.each([
    ["useCheckout", () => library.useCheckout()],
    ["useReturn", () => library.useReturn()],
  ])("%s succeeds with the full response", async (_name, hook) => {
    resolveAll(api, {
      id: "loan-1",
      book: { title: "Ubuzima" },
      borrower: { firstName: "Divine" },
    });
    const result = await runMutation(hook, { bookId: "book-1" });
    expect(result.current.isSuccess).toBe(true);
  });
});

/**
 * Pulling the rows out of a paginated answer.
 *
 * The library endpoints send `{ data, meta }`, and reading `.length` straight
 * off that envelope gives `undefined` - which every "no results" branch in
 * the app treats as empty. That is how the librarian's catalogue came to say
 * "No books found" over a library of 56, while its own header counted them
 * correctly from a different endpoint.
 */
describe("reading the rows out of a response", () => {
  it("takes the data out of an envelope", () => {
    expect(library.rowsOf({ data: [1, 2], meta: { total: 2 } })).toEqual([1, 2]);
  });

  it("passes a bare array straight through", () => {
    expect(library.rowsOf([1, 2])).toEqual([1, 2]);
  });

  it("gives an empty list for an empty page", () => {
    expect(library.rowsOf({ data: [], meta: { total: 0 } })).toEqual([]);
  });

  // Everything below is what a page gets mid-flight, or from an endpoint
  // answering something unexpected. All of it has to read as "nothing yet"
  // rather than throwing on `.map`.
  it("gives an empty list rather than throwing", () => {
    expect(library.rowsOf(undefined)).toEqual([]);
    expect(library.rowsOf(null)).toEqual([]);
    expect(library.rowsOf({})).toEqual([]);
    expect(library.rowsOf({ data: null })).toEqual([]);
    expect(library.rowsOf({ data: "not a list" })).toEqual([]);
    expect(library.rowsOf("a string")).toEqual([]);
  });
});

/** Chasing late books: the reminders, and who cannot be reached. */
describe("reminding borrowers", () => {
  beforeEach(() => Object.values(toast).forEach((t) => t.mockReset()));

  it.each([
    [0, null],
    [1, "1 borrower has no email or phone on file, so they were not reminded."],
    [3, "3 borrowers have no email or phone on file, so they were not reminded."],
  ])("says what was sent, and %s unreachable", async (unreachable, warned) => {
    h.api.post.mockResolvedValue({
      data: { overdue: 6, reminded: 6 - unreachable, unreachable, message: "Reminded the borrowers" },
    });
    await runMutation(() => library.useRemindOverdue());
    expect(toast.success).toHaveBeenCalledWith("Reminded the borrowers");
    if (warned) expect(toast.warning).toHaveBeenCalledWith(warned);
    else expect(toast.warning).not.toHaveBeenCalled();
  });

  it("says when the reminders could not go", async () => {
    h.api.post.mockRejectedValue(new Error("down"));
    await runMutation(() => library.useRemindOverdue()).catch(() => {});
    expect(toast.error).toHaveBeenCalledWith("Could not send the reminders");
  });
});
