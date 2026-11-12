import api from "@/lib/api";
import type { ExportOptions } from "@/lib/export";
import {
  APPLIES_TO_LABEL,
  METHOD_LABEL,
  STATUS_LABEL,
  WAIVER_LABEL,
  money,
} from "@/lib/fees";
import type {
  FeeAccount,
  FeeRegisterRow,
  FeeStructureLevel,
} from "@/hooks/use-finance";

/**
 * What the bursar takes away from the three fee pages.
 *
 * The fee register, the fee structure and a family's fee account had no
 * export, so a bursar who had to send the board the term's arrears copied
 * the screen by hand. Each builder here turns one page's data into the
 * export every other list already has (CSV, Excel, PDF, JSON). Amounts are
 * written as plain numbers so a spreadsheet can add them up; the PDF title
 * says the currency.
 */

const className = (
  section: { name: string; classLevel?: { name: string } | null; trade?: { code: string } | null } | null,
) =>
  section
    ? [section.classLevel?.name, section.trade?.code, section.name]
        .filter(Boolean)
        .join(" ")
    : "";

const day = (iso: string) => iso.slice(0, 10);

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** The whole register for these filters, not only the page on screen. */
export async function wholeRegister(filters: {
  termId: string;
  classSectionId?: string;
  status?: string;
  search?: string;
}): Promise<FeeRegisterRow[]> {
  const limit = 200; // the most the API gives in one page
  const rows: FeeRegisterRow[] = [];
  for (let page = 1; ; page++) {
    const { data } = await api.get("/finance/register", {
      params: { ...filters, page, limit },
    });
    rows.push(...(data.data as FeeRegisterRow[]));
    if (rows.length >= data.total || data.data.length < limit) return rows;
  }
}

export function registerExport(
  rows: FeeRegisterRow[],
  termName: string,
): ExportOptions {
  return {
    filename: `fee-register-${slug(termName)}`,
    title: `Fee register, ${termName} (RWF)`,
    columns: [
      { header: "Student", key: "name" },
      { header: "Student number", key: "number" },
      { header: "Class", key: "className" },
      { header: "Boarder", key: "boarder" },
      { header: "Billed", key: "total" },
      { header: "Paid", key: "paid" },
      { header: "Waived", key: "waived" },
      { header: "Balance", key: "balance" },
      { header: "Status", key: "status" },
    ],
    data: rows.map((r) => ({
      name: `${r.student.firstName} ${r.student.lastName}`,
      number: r.student.studentIdNumber,
      className: className(r.student.classSection),
      boarder: r.student.isBoarder,
      total: r.standing?.total ?? 0,
      paid: r.standing?.paid ?? 0,
      waived: r.standing?.waived ?? 0,
      balance: r.standing?.balance ?? 0,
      status: STATUS_LABEL[r.status],
    })),
  };
}

export function structureExport(
  levels: FeeStructureLevel[],
  termName: string,
): ExportOptions {
  return {
    filename: `fee-structure-${slug(termName)}`,
    title: `Fee structure, ${termName} (RWF)`,
    columns: [
      { header: "Class level", key: "level" },
      { header: "Item", key: "item" },
      { header: "Charged to", key: "appliesTo" },
      { header: "Amount", key: "amount" },
    ],
    data: levels.flatMap((l) => [
      ...l.items.map((i) => ({
        level: l.classLevel.name,
        item: i.name,
        appliesTo: APPLIES_TO_LABEL[i.appliesTo],
        amount: i.amount,
      })),
      { level: l.classLevel.name, item: "Total for a boarder", appliesTo: "", amount: l.boarderTotal },
      { level: l.classLevel.name, item: "Total for a day student", appliesTo: "", amount: l.dayTotal },
    ]),
  };
}

/**
 * One family's account for a term, as a statement: what was billed, every
 * payment and every waiver, in the order they happened. Voided receipts and
 * withdrawn waivers stay on it, marked, because a statement that drops them
 * cannot be reconciled with the receipts a parent holds.
 */
export function accountExport(
  account: FeeAccount,
  termName: string,
): ExportOptions {
  const s = account.student;
  const who = `${s.user.firstName} ${s.user.lastName}`;
  const inv = account.invoice;
  const entries = inv
    ? [
        ...inv.lines.map((l) => ({
          date: day(inv.issuedAt),
          kind: "Charge",
          detail: l.name,
          receipt: "",
          amount: l.amount,
          note: "",
        })),
        ...inv.payments.map((p) => ({
          date: day(p.paidAt),
          kind: "Payment",
          detail: METHOD_LABEL[p.method] + (p.reference ? `, ${p.reference}` : ""),
          receipt: p.receiptNumber,
          amount: -p.amount,
          note: p.voidedAt ? `Voided: ${p.voidReason ?? ""}`.trim() : p.note ?? "",
        })),
        ...inv.waivers.map((w) => ({
          date: day(w.createdAt),
          kind: "Waiver",
          detail: `${WAIVER_LABEL[w.kind]}: ${w.reason}`,
          receipt: "",
          amount: -w.amount,
          note: w.revokedAt ? `Withdrawn: ${w.revokeReason ?? ""}`.trim() : "",
        })),
      ].sort((a, b) => a.date.localeCompare(b.date))
    : [];
  return {
    filename: `fees-${s.studentIdNumber}-${slug(termName)}`,
    title: `${who}, ${s.studentIdNumber}, ${termName}. Balance ${money(account.standing?.balance ?? 0)}`,
    columns: [
      { header: "Date", key: "date" },
      { header: "Entry", key: "kind" },
      { header: "Detail", key: "detail" },
      { header: "Receipt", key: "receipt" },
      { header: "Amount (RWF)", key: "amount" },
      { header: "Note", key: "note" },
    ],
    data: entries,
  };
}

/** "Term 1 2026", from the list the term picker already loaded. */
export function termLabel(
  terms: { id: string; name: string; academicYear?: { name: string } }[] | undefined,
  termId: string,
): string {
  const t = terms?.find((x) => x.id === termId);
  if (!t) return "this term";
  return t.academicYear ? `${t.name} ${t.academicYear.name}` : t.name;
}
