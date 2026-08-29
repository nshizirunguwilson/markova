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
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({ toast: h.toast }));

import * as finance from "./use-finance";

const api = h.api;

beforeEach(() => {
  for (const m of Object.values(api)) m.mockReset();
  for (const m of Object.values(h.toast)) m.mockReset();
});

const queries: QueryCase[] = [
  {
    name: "useFeeStructure",
    hook: () => finance.useFeeStructure("term-1"),
    url: "/finance/structure",
  },
  {
    name: "useFeeRegister",
    hook: () => finance.useFeeRegister({ termId: "term-1" }),
    url: "/finance/register",
  },
  {
    name: "useFeeSummary",
    hook: () => finance.useFeeSummary("term-1"),
    url: "/finance/summary",
  },
  {
    name: "useFeeAccount",
    hook: () => finance.useFeeAccount("student-1", "term-1"),
    url: "/finance/account/student-1",
  },
  {
    name: "useFeeHistory",
    hook: () => finance.useFeeHistory("student-1"),
    url: "/finance/history/student-1",
  },
];

const mutations: MutationCase[] = [
  {
    name: "useSaveFeeItem",
    hook: () => finance.useSaveFeeItem(),
    arg: { termId: "t", classLevelId: "l", name: "Tuition", amount: 1000 },
    method: "put",
    url: "/finance/structure/item",
  },
  {
    name: "useDeleteFeeItem",
    hook: () => finance.useDeleteFeeItem(),
    arg: "item-1",
    method: "delete",
    url: "/finance/structure/item/item-1",
  },
  {
    name: "useCopyFeeStructure",
    hook: () => finance.useCopyFeeStructure(),
    arg: { fromTermId: "t-1", toTermId: "t-2" },
    method: "post",
    url: "/finance/structure/copy",
  },
  {
    name: "useRaiseInvoices",
    hook: () => finance.useRaiseInvoices(),
    arg: { termId: "term-1" },
    method: "post",
    url: "/finance/invoices/raise",
  },
  {
    name: "useRecordPayment",
    hook: () => finance.useRecordPayment(),
    arg: { studentId: "s", termId: "t", amount: 1000, method: "CASH" },
    method: "post",
    url: "/finance/payments",
  },
  {
    name: "useVoidPayment",
    hook: () => finance.useVoidPayment(),
    arg: { paymentId: "p-1", reason: "twice" },
    method: "post",
    url: "/finance/payments/void",
  },
  {
    name: "useGrantWaiver",
    hook: () => finance.useGrantWaiver(),
    arg: { studentId: "s", termId: "t", kind: "BURSARY", amount: 1, reason: "x" },
    method: "post",
    url: "/finance/waivers",
  },
  {
    name: "useRevokeWaiver",
    hook: () => finance.useRevokeWaiver(),
    arg: { waiverId: "w-1", reason: "gone" },
    method: "post",
    url: "/finance/waivers/revoke",
  },
];

describe("use-finance queries", () => {
  it.each(queries)("$name reads its endpoint and reports failure", async (c) => {
    await assertQuery(api, c);
  });
});

describe("use-finance mutations", () => {
  it.each(mutations)("$name writes its endpoint and reports failure", async (c) => {
    await assertMutation(api, c);
  });
});

/**
 * What each write says afterwards.
 *
 * A bursar acts on these sentences: they are the confirmation that the money
 * is in the book, and the number a family is then given. Two of them also
 * carry the promise the whole ledger rests on - that nothing is erased.
 */
describe("what the office is told", () => {
  it("names the receipt it just issued", async () => {
    resolveAll(api, { receiptNumber: "RCT-2026-0341" });
    await runMutation(() => finance.useRecordPayment(), {
      studentId: "s",
      termId: "t",
      amount: 1000,
      method: "CASH",
    });
    expect(h.toast.success).toHaveBeenCalledWith("Receipt RCT-2026-0341 issued");
  });

  it("says a voided receipt stays in the book", async () => {
    resolveAll(api, { receiptNumber: "RCT-2026-0341" });
    await runMutation(() => finance.useVoidPayment(), {
      paymentId: "p-1",
      reason: "twice",
    });
    expect(h.toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/stays in the book/i),
    );
  });

  it("says a withdrawn waiver stays in the book", async () => {
    resolveAll(api, {});
    await runMutation(() => finance.useRevokeWaiver(), {
      waiverId: "w-1",
      reason: "gone",
    });
    expect(h.toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/stays in the book/i),
    );
  });

  // Removing a price must not read as removing a bill.
  it("says invoices already raised are unchanged when a line is removed", async () => {
    resolveAll(api, { deleted: true });
    await runMutation(() => finance.useDeleteFeeItem(), "item-1");
    expect(h.toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/already raised are unchanged/i),
    );
  });

  it("confirms a waiver plainly", async () => {
    resolveAll(api, { id: "w-1" });
    await runMutation(() => finance.useGrantWaiver(), {
      studentId: "s",
      termId: "t",
      kind: "BURSARY",
      amount: 1,
      reason: "x",
    });
    expect(h.toast.success).toHaveBeenCalledWith("Waiver granted");
  });

  it("confirms a saved fee line", async () => {
    resolveAll(api, { id: "item-1" });
    await runMutation(() => finance.useSaveFeeItem(), {
      termId: "t",
      classLevelId: "l",
      name: "Tuition",
      amount: 1000,
    });
    expect(h.toast.success).toHaveBeenCalledWith("Fee line saved");
  });
});

/**
 * Copying and raising both report counts, and both have a case where the
 * plain number would mislead: lines that were already there, and students
 * whose class level had no price list to bill from.
 */
describe("counts that need explaining", () => {
  it("says how many lines were copied", async () => {
    resolveAll(api, { copied: 6, skipped: 0 });
    await runMutation(() => finance.useCopyFeeStructure(), {
      fromTermId: "a",
      toTermId: "b",
    });
    expect(h.toast.success).toHaveBeenCalledWith("6 lines copied.");
  });

  it("says which lines were left alone", async () => {
    resolveAll(api, { copied: 4, skipped: 2 });
    await runMutation(() => finance.useCopyFeeStructure(), {
      fromTermId: "a",
      toTermId: "b",
    });
    expect(h.toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/2 were already there and were left alone/),
    );
  });

  it("says how many invoices were raised", async () => {
    resolveAll(api, { raised: 12, alreadyInvoiced: 0, withoutStructure: 0 });
    await runMutation(() => finance.useRaiseInvoices(), { termId: "t" });
    expect(h.toast.success).toHaveBeenCalledWith("12 invoices raised.");
  });

  /**
   * A whole year group missing from the register is the sort of thing nobody
   * notices until March, so it is said rather than counted as a clean run.
   */
  it("warns about students with no fee structure to bill from", async () => {
    resolveAll(api, { raised: 8, alreadyInvoiced: 0, withoutStructure: 4 });
    await runMutation(() => finance.useRaiseInvoices(), { termId: "t" });
    expect(h.toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/4 students were skipped/),
    );
  });

  // Nothing happened, so it is not reported as a success.
  it("says so plainly when everybody had already been billed", async () => {
    resolveAll(api, { raised: 0, alreadyInvoiced: 16, withoutStructure: 0 });
    await runMutation(() => finance.useRaiseInvoices(), { termId: "t" });
    expect(h.toast.info).toHaveBeenCalled();
    expect(h.toast.success).not.toHaveBeenCalled();
  });
});

/**
 * Queries that cannot answer yet do not ask.
 *
 * Each of these needs an id it may not have on the first render, and firing
 * without one asks the API for `/finance/account/undefined`.
 */
describe("what is not asked for", () => {
  it.each([
    ["the structure without a term", () => finance.useFeeStructure(undefined)],
    ["the register without a term", () => finance.useFeeRegister({})],
    ["the summary without a term", () => finance.useFeeSummary(undefined)],
    ["an account without a student", () => finance.useFeeAccount(undefined, "t")],
    ["an account without a term", () => finance.useFeeAccount("s", undefined)],
    ["a history without a student", () => finance.useFeeHistory(undefined)],
  ])("does not ask for %s", async (_name, hook) => {
    resolveAll(api, []);
    const { renderHook } = await import("@testing-library/react");
    const { Providers } = await import("@/test/harness");
    renderHook(hook as () => unknown, { wrapper: Providers });
    expect(api.get).not.toHaveBeenCalled();
  });
});
