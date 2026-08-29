/**
 * A fee ledger to test against.
 *
 * Built the way the API builds it: a standing is the arithmetic of an
 * invoice's entries rather than a number typed into the fixture, so a test
 * cannot accidentally assert against a balance that could never occur.
 */

export interface Entry {
  amount: number;
  voidedAt?: string | null;
  revokedAt?: string | null;
}

export function standing(total: number, paid = 0, waived = 0) {
  const settled = paid + waived;
  return {
    total,
    paid,
    waived,
    balance: Math.max(0, total - settled),
    cleared: settled >= total,
    settledFraction: total <= 0 ? 1 : Math.min(1, settled / total),
  };
}

export const statusOf = (s: ReturnType<typeof standing>) =>
  s.cleared ? "CLEARED" : s.paid + s.waived > 0 ? "PART_PAID" : "UNPAID";

export const feeTerms = [
  {
    id: "term-1",
    name: "Term 1",
    isCurrent: true,
    isClosed: false,
    startDate: "2026-09-01",
    academicYear: { id: "year-1", name: "2026-2027" },
  },
  {
    id: "term-0",
    name: "Term 3",
    isCurrent: false,
    isClosed: true,
    startDate: "2026-04-01",
    academicYear: { id: "year-0", name: "2025-2026" },
  },
];

export const feeItems = [
  {
    id: "item-1",
    termId: "term-1",
    classLevelId: "level-1",
    name: "Tuition",
    amount: 82000,
    appliesTo: "ALL",
    position: 0,
  },
  {
    id: "item-2",
    termId: "term-1",
    classLevelId: "level-1",
    name: "Boarding",
    amount: 58000,
    appliesTo: "BOARDER",
    position: 1,
  },
  {
    id: "item-3",
    termId: "term-1",
    classLevelId: "level-1",
    name: "Transport",
    amount: 24000,
    appliesTo: "DAY",
    position: 2,
  },
];

export const feeStructure = [
  {
    classLevel: { id: "level-1", name: "Senior 1", order: 1 },
    items: feeItems,
    boarderTotal: 140000,
    dayTotal: 106000,
  },
  {
    classLevel: { id: "level-2", name: "Senior 2", order: 2 },
    items: [],
    boarderTotal: 0,
    dayTotal: 0,
  },
];

const section = {
  id: "section-1",
  name: "A",
  classLevel: { name: "Senior 1" },
  trade: null,
};

export const registerRows = [
  {
    student: {
      id: "student-1",
      studentIdNumber: "STD-2026-0001",
      isBoarder: true,
      firstName: "Divine",
      lastName: "Niyonkuru",
      photoUrl: null,
      classSection: section,
    },
    standing: standing(140000, 60000),
    status: "PART_PAID",
  },
  {
    student: {
      id: "student-2",
      studentIdNumber: "STD-2026-0002",
      isBoarder: false,
      firstName: "Keza",
      lastName: "Mutesi",
      photoUrl: null,
      classSection: section,
    },
    standing: standing(106000, 106000),
    status: "CLEARED",
  },
  {
    student: {
      id: "student-3",
      studentIdNumber: "STD-2026-0003",
      isBoarder: false,
      firstName: "Shema",
      lastName: "Habimana",
      photoUrl: null,
      classSection: section,
    },
    // Sponsored: nothing paid, and cleared all the same.
    standing: standing(106000, 0, 106000),
    status: "CLEARED",
  },
  {
    student: {
      id: "student-4",
      studentIdNumber: "STD-2026-0004",
      isBoarder: true,
      firstName: "Aline",
      lastName: "Uwase",
      photoUrl: null,
      classSection: section,
    },
    standing: standing(140000, 0),
    status: "UNPAID",
  },
];

/** A student the office has not billed yet: no invoice, and no class on file. */
export const unbilledRow = {
  student: {
    id: "student-5",
    studentIdNumber: "STD-2026-0005",
    isBoarder: false,
    firstName: "Yves",
    lastName: "Rugema",
    photoUrl: null,
    classSection: null,
  },
  standing: null,
  status: "NOT_INVOICED",
};

export const feeRegister = {
  data: registerRows,
  total: registerRows.length,
  page: 1,
  limit: 25,
};

export const feeSummary = {
  term: { id: "term-1", name: "Term 1", academicYear: { name: "2026-2027" } },
  invoiced: 492000,
  collected: 166000,
  waived: 106000,
  outstanding: 220000,
  cleared: 2,
  owing: 2,
  invoiceCount: 4,
  notInvoiced: 0,
  collectionRate: 0.55,
};

export const feePayment = {
  id: "pay-1",
  receiptNumber: "RCT-2026-0001",
  amount: 60000,
  method: "MOBILE_MONEY",
  reference: "MP260212.4471.A18823",
  paidAt: "2026-09-12T00:00:00.000Z",
  note: null,
  voidedAt: null,
  voidReason: null,
  recordedBy: { firstName: "Straton", lastName: "Nsengiyumva" },
  voidedBy: null,
};

export const voidedPayment = {
  ...feePayment,
  id: "pay-2",
  receiptNumber: "RCT-2026-0002",
  amount: 15000,
  voidedAt: "2026-09-14T00:00:00.000Z",
  voidReason: "Entered twice at the counter",
  voidedBy: { firstName: "Straton", lastName: "Nsengiyumva" },
};

export const feeWaiver = {
  id: "waiver-1",
  kind: "BURSARY",
  amount: 20000,
  reason: "District bursary, confirmed by the sector office",
  createdAt: "2026-09-10T00:00:00.000Z",
  revokedAt: null,
  revokeReason: null,
  grantedBy: { firstName: "Straton", lastName: "Nsengiyumva" },
  revokedBy: null,
};

export const feeAccount = {
  student: {
    id: "student-1",
    studentIdNumber: "STD-2026-0001",
    isBoarder: true,
    user: { firstName: "Divine", lastName: "Niyonkuru", photoUrl: null },
    classSection: section,
  },
  invoice: {
    id: "inv-1",
    total: 140000,
    issuedAt: "2026-09-01T00:00:00.000Z",
    lines: [
      { id: "line-1", name: "Tuition", amount: 82000, position: 0 },
      { id: "line-2", name: "Boarding", amount: 58000, position: 1 },
    ],
    payments: [feePayment, voidedPayment],
    waivers: [feeWaiver],
  },
  standing: standing(140000, 60000, 20000),
  status: "PART_PAID",
};

export const feeHistory = [
  {
    term: feeTerms[0],
    invoiceId: "inv-1",
    standing: standing(140000, 60000, 20000),
    status: "PART_PAID",
  },
  {
    term: feeTerms[1],
    invoiceId: "inv-0",
    standing: standing(140000, 140000),
    status: "CLEARED",
  },
];

/** The routes every fee screen reads, ready to spread over. */
export const financeRoutes = {
  "/academic/terms": feeTerms,
  "/finance/register": feeRegister,
  "/finance/summary": feeSummary,
  "/finance/structure": feeStructure,
  "/finance/account/student-1": feeAccount,
  "/finance/history/student-1": feeHistory,
};
