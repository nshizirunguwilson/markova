/**
 * What a family owes, and whether the term is settled.
 *
 * The arithmetic lives here, apart from the database, because it is the part
 * that decides whether a child is shown their own results. Rules that carry
 * that weight should be readable end to end and testable without a schema.
 *
 * Money is held in Rwandan francs, which have no minor unit — there are no
 * centimes to lose, and every amount in this file is a whole franc.
 */

/** What one line of a bill costs, and who it is charged to. */
export type FeeCharge = {
  amount: number;
  /** `ALL`, `BOARDER` or `DAY`, as stored on the fee item. */
  appliesTo: string;
};

/** A payment as it stands in the book. A voided one still stands there. */
export type FeeCredit = {
  amount: number;
  voidedAt?: Date | null;
};

/** A waiver as it stands in the book. A revoked one still stands there. */
export type FeeRelief = {
  amount: number;
  revokedAt?: Date | null;
};

/**
 * The lines of a class's price list that a particular student is charged.
 *
 * A boarder pays for the bed and the meals; a day student pays for the bus.
 * One structure describes the class, and where the student sleeps decides
 * which of its lines they see — so moving a student into the dormitory in
 * March changes what their next invoice says without anybody editing a price.
 */
export function chargesFor<T extends FeeCharge>(
  items: T[],
  isBoarder: boolean,
): T[] {
  return items.filter(
    (item) =>
      item.appliesTo === 'ALL' ||
      item.appliesTo === (isBoarder ? 'BOARDER' : 'DAY'),
  );
}

/** What the school is asking this student for, before anything is paid. */
export function invoiceTotal(charges: FeeCharge[]): number {
  return charges.reduce((sum, charge) => sum + charge.amount, 0);
}

/** What has actually come in. Voided receipts do not count. */
export function amountPaid(payments: FeeCredit[]): number {
  return payments
    .filter((p) => !p.voidedAt)
    .reduce((sum, p) => sum + p.amount, 0);
}

/** What the school has decided not to collect. Revoked waivers do not count. */
export function amountWaived(waivers: FeeRelief[]): number {
  return waivers
    .filter((w) => !w.revokedAt)
    .reduce((sum, w) => sum + w.amount, 0);
}

/** How a term's account stands. */
export type FeeStanding = {
  /** What the invoice was raised at. */
  total: number;
  paid: number;
  waived: number;
  /** What is left to find. Never negative — an overpayment is not a debt. */
  balance: number;
  /** Paid, waived, or a mixture that covers the whole invoice. */
  cleared: boolean;
  /** Money in, as a share of the bill. 1 when there is nothing to pay. */
  settledFraction: number;
};

/**
 * Add the account up.
 *
 * A waiver counts exactly as a payment does. That is the whole point of
 * having them: without it a sponsored child could never be shown their own
 * results, and the only way round would be to record a payment that never
 * happened — which is worse than the problem it solves.
 *
 * The balance is floored at zero. An overpayment is a credit the school owes
 * the family, not a debt, and showing it as a negative balance beside four
 * hundred positive ones is how a bursar misreads a column.
 */
export function feeStanding(
  total: number,
  payments: FeeCredit[],
  waivers: FeeRelief[],
): FeeStanding {
  const paid = amountPaid(payments);
  const waived = amountWaived(waivers);
  const settled = paid + waived;
  const balance = Math.max(0, total - settled);
  return {
    total,
    paid,
    waived,
    balance,
    cleared: settled >= total,
    settledFraction: total <= 0 ? 1 : Math.min(1, settled / total),
  };
}

/**
 * Why a term's results are being withheld, or `null` when they are not.
 *
 * Two decisions are worth spelling out, because both of them are about
 * failing in the safe direction:
 *
 * **No invoice means no gate.** A school that has not raised this term's bills
 * has not decided anybody owes anything. Withholding results on the strength
 * of a bill that was never sent would lock a whole school out of its own
 * records the day this feature is switched on, and the family would have no
 * way to put it right.
 *
 * **A zero invoice is cleared.** A term charged at nothing is settled by
 * definition, not owed in perpetuity.
 */
export function withholdingReason(
  standing: FeeStanding | null,
): { balance: number } | null {
  if (!standing) return null;
  if (standing.cleared) return null;
  return { balance: standing.balance };
}

/**
 * Where a student's account sits, for a list that has to be read at a glance.
 *
 * `CLEARED` and `OWING` are the two that matter to the gate. `PART_PAID`
 * exists because a bursar chasing money needs to tell the family who has paid
 * most of it from the family who has paid nothing, and both of those are
 * "owing" as far as the report card is concerned.
 */
export type FeeStatus = 'CLEARED' | 'PART_PAID' | 'UNPAID' | 'NOT_INVOICED';

export function feeStatus(standing: FeeStanding | null): FeeStatus {
  if (!standing) return 'NOT_INVOICED';
  if (standing.cleared) return 'CLEARED';
  return standing.paid + standing.waived > 0 ? 'PART_PAID' : 'UNPAID';
}

/**
 * Rwandan francs, written the way they are written on a receipt.
 *
 * Grouped in threes and with no decimal part, because the franc has no minor
 * unit and "195,000.00 RWF" is not a sum anybody in Kigali writes down.
 */
export function formatRwf(amount: number): string {
  return `${Math.round(amount).toLocaleString('en-RW')} RWF`;
}

/**
 * The next receipt number, from the last one issued.
 *
 * `RCT-<year>-<n>`, matching the shape every other identifier in the system
 * takes (`STD-`, `TCH-`, `PAR-`). Numbered within the year and never reused,
 * because a family quotes this back to the school for years afterwards.
 */
export function nextReceiptNumber(
  lastIssued: string | null | undefined,
  year: number,
): string {
  const prefix = `RCT-${year}-`;
  const seq =
    lastIssued && lastIssued.startsWith(prefix)
      ? Number(lastIssued.slice(prefix.length))
      : 0;
  const next = Number.isFinite(seq) && seq > 0 ? seq + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}
