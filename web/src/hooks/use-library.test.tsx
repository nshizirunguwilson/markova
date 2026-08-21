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
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

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
