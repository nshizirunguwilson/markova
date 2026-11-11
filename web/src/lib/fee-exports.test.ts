import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: { get: h.get } }));

import {
  accountExport,
  registerExport,
  structureExport,
  termLabel,
  wholeRegister,
} from "./fee-exports";

const student = {
  id: "s-1",
  studentIdNumber: "STD-2026-4417",
  isBoarder: true,
  firstName: "Keza",
  lastName: "Ingabire",
  photoUrl: null,
  classSection: { id: "c-1", name: "A", classLevel: { name: "S2" }, trade: null },
};

const row = (over: object = {}) => ({
  student,
  standing: { total: 185000, paid: 64500, waived: 0, balance: 120500, cleared: false, settledFraction: 0.35 },
  status: "PART_PAID" as const,
  ...over,
});

beforeEach(() => h.get.mockReset());

describe("the fee register export", () => {
  it("writes one row per family, with plain numbers a spreadsheet can add", () => {
    const out = registerExport([row()], "Term 1 2026");
    expect(out.title).toBe("Fee register, Term 1 2026 (RWF)");
    expect(out.filename).toBe("fee-register-term-1-2026");
    expect(out.data[0]).toMatchObject({
      name: "Keza Ingabire",
      number: "STD-2026-4417",
      className: "S2 A",
      boarder: true,
      total: 185000,
      paid: 64500,
      balance: 120500,
    });
  });

  it("writes a family not yet invoiced as zero, not blank", () => {
    const out = registerExport([row({ standing: null, status: "NOT_INVOICED" })], "Term 1 2026");
    expect(out.data[0]).toMatchObject({ total: 0, balance: 0 });
  });

  // The register is paged at 50 on screen; the export is every row.
  it("fetches every page for the filters, not the one on screen", async () => {
    const page = (n: number, count: number) => ({
      data: {
        data: Array.from({ length: count }, (_, i) => row({ student: { ...student, id: `s-${n}-${i}` } })),
        total: 450,
      },
    });
    h.get
      .mockResolvedValueOnce(page(1, 200))
      .mockResolvedValueOnce(page(2, 200))
      .mockResolvedValueOnce(page(3, 50));
    const all = await wholeRegister({ termId: "t-1", status: "UNPAID" });
    expect(all).toHaveLength(450);
    expect(h.get).toHaveBeenCalledTimes(3);
    expect(h.get.mock.calls[2][1].params).toMatchObject({ termId: "t-1", status: "UNPAID", page: 3, limit: 200 });
  });
});

describe("the fee structure export", () => {
  it("lists every item and both totals for each level", () => {
    const out = structureExport(
      [
        {
          classLevel: { id: "l-1", name: "S1", order: 1 },
          items: [
            { id: "i-1", termId: "t", classLevelId: "l-1", name: "Tuition", amount: 120000, appliesTo: "ALL", position: 1 },
            { id: "i-2", termId: "t", classLevelId: "l-1", name: "Boarding", amount: 65000, appliesTo: "BOARDER", position: 2 },
          ],
          boarderTotal: 185000,
          dayTotal: 120000,
        },
      ],
      "Term 1 2026",
    );
    expect(out.data.map((r) => r.item)).toEqual([
      "Tuition",
      "Boarding",
      "Total for a boarder",
      "Total for a day student",
    ]);
    expect(out.data[3].amount).toBe(120000);
  });
});

describe("one family's statement", () => {
  const account = {
    student: { ...student, user: { firstName: "Keza", lastName: "Ingabire", photoUrl: null } },
    invoice: {
      id: "inv-1",
      total: 185000,
      issuedAt: "2026-01-05T08:00:00Z",
      lines: [{ id: "l-1", name: "Tuition", amount: 185000, position: 1 }],
      payments: [
        {
          id: "p-2", receiptNumber: "RCT-2026-0193", amount: 40000, method: "MOBILE_MONEY", reference: "MP4821",
          paidAt: "2026-02-11T09:00:00Z", note: null, voidedAt: null, voidReason: null, recordedBy: null, voidedBy: null,
        },
        {
          id: "p-1", receiptNumber: "RCT-2026-0041", amount: 24500, method: "CASH", reference: null,
          paidAt: "2026-01-20T09:00:00Z", note: null, voidedAt: "2026-01-21T09:00:00Z", voidReason: "Entered twice",
          recordedBy: null, voidedBy: null,
        },
      ],
      waivers: [],
    },
    standing: { total: 185000, paid: 40000, waived: 0, balance: 145000, cleared: false, settledFraction: 0.2 },
    status: "PART_PAID" as const,
  } as any;

  it("lists charges and payments in the order they happened", () => {
    const out = accountExport(account, "Term 1 2026");
    expect(out.data.map((r) => r.date)).toEqual(["2026-01-05", "2026-01-20", "2026-02-11"]);
    expect(out.data[2]).toMatchObject({ kind: "Payment", receipt: "RCT-2026-0193", amount: -40000 });
  });

  // A statement without the voided receipt cannot be reconciled with the
  // paper receipt the parent is holding.
  it("keeps a voided receipt on the statement, marked", () => {
    const out = accountExport(account, "Term 1 2026");
    expect(out.data[1].note).toBe("Voided: Entered twice");
  });

  it("names the family and the balance in the title", () => {
    expect(accountExport(account, "Term 1 2026").title).toContain("Keza Ingabire, STD-2026-4417, Term 1 2026");
  });
});

describe("the term's name", () => {
  it("joins the term and its year", () => {
    expect(termLabel([{ id: "t-1", name: "Term 1", academicYear: { name: "2026" } }], "t-1")).toBe("Term 1 2026");
  });
  it("falls back when the term list has not loaded", () => {
    expect(termLabel(undefined, "t-1")).toBe("this term");
  });
});

describe("the records that do not fit the usual shape", () => {
  it("writes a student with no class as a blank class, and a trade into the name", () => {
    const out = registerExport(
      [
        row({ student: { ...student, classSection: null } }),
        row({ student: { ...student, classSection: { id: "c-2", name: "B", classLevel: { name: "L4" }, trade: { code: "SOD" } } } }),
      ],
      "Term 2 2026",
    );
    expect(out.data[0].className).toBe("");
    expect(out.data[1].className).toBe("L4 SOD B");
  });

  it("gives an empty statement for a family not yet invoiced", () => {
    const out = accountExport(
      {
        student: { ...student, user: { firstName: "Keza", lastName: "Ingabire", photoUrl: null } },
        invoice: null,
        standing: null,
        status: "NOT_INVOICED",
      } as any,
      "Term 1 2026",
    );
    expect(out.data).toEqual([]);
    expect(out.title).toContain("Balance");
  });

  it("marks a withdrawn waiver and a payment with no reference or reason", () => {
    const out = accountExport(
      {
        student: { ...student, user: { firstName: "Keza", lastName: "Ingabire", photoUrl: null } },
        invoice: {
          id: "inv-1",
          total: 185000,
          issuedAt: "2026-01-05T08:00:00Z",
          lines: [],
          payments: [
            {
              id: "p-1", receiptNumber: "RCT-2026-0007", amount: 5000, method: "CASH", reference: null,
              paidAt: "2026-01-09T09:00:00Z", note: "Visiting day", voidedAt: "2026-01-10T09:00:00Z", voidReason: null,
              recordedBy: null, voidedBy: null,
            },
            {
              id: "p-2", receiptNumber: "RCT-2026-0008", amount: 7000, method: "CASH", reference: null,
              paidAt: "2026-01-11T09:00:00Z", note: "Visiting day", voidedAt: null, voidReason: null,
              recordedBy: null, voidedBy: null,
            },
          ],
          waivers: [
            {
              id: "w-1", kind: "STAFF_CHILD", amount: 30000, reason: "Child of a teacher", createdAt: "2026-01-06T09:00:00Z",
              revokedAt: "2026-01-12T09:00:00Z", revokeReason: null, grantedBy: null, revokedBy: null,
            },
            {
              id: "w-2", kind: "STAFF_CHILD", amount: 30000, reason: "Child of a teacher", createdAt: "2026-01-13T09:00:00Z",
              revokedAt: null, revokeReason: null, grantedBy: null, revokedBy: null,
            },
          ],
        },
        standing: { total: 185000, paid: 0, waived: 0, balance: 185000, cleared: false, settledFraction: 0 },
        status: "UNPAID",
      } as any,
      "Term 1 2026",
    );
    const byDate = Object.fromEntries(out.data.map((r) => [r.date, r]));
    expect(byDate["2026-01-09"].note).toBe("Voided:");
    expect(byDate["2026-01-11"].note).toBe("Visiting day");
    expect(byDate["2026-01-12"]).toBeUndefined();
    expect(byDate["2026-01-06"].note).toBe("Withdrawn:");
    expect(byDate["2026-01-13"].note).toBe("");
  });

  it("names a term that has no year by its name alone", () => {
    expect(termLabel([{ id: "t-1", name: "Term 3" }], "t-1")).toBe("Term 3");
  });

  it("stops after one short page", async () => {
    h.get.mockResolvedValueOnce({ data: { data: [row()], total: 1 } });
    expect(await wholeRegister({ termId: "t-1" })).toHaveLength(1);
    expect(h.get).toHaveBeenCalledTimes(1);
  });
});
