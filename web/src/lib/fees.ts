/**
 * How money is written and named on screen.
 *
 * The arithmetic itself lives on the API - a balance a client works out is a
 * balance that can disagree with the one the gate uses, and the gate is what
 * decides whether a child sees their results. What is here is presentation:
 * the words, the colours and the shapes a reader needs to take it in.
 */

/** Where a student's term stands, as the API reports it. */
export type FeeStatus = "CLEARED" | "PART_PAID" | "UNPAID" | "NOT_INVOICED";

export interface FeeStanding {
  total: number;
  paid: number;
  waived: number;
  balance: number;
  cleared: boolean;
  settledFraction: number;
}

/**
 * Rwandan francs, written the way they are written on a receipt.
 *
 * Grouped in threes and with no decimal part: the franc has no minor unit,
 * and "195,000.00 RWF" is not a sum anybody in Kigali writes down.
 */
export function money(amount: number | null | undefined): string {
  return `${Math.round(amount ?? 0).toLocaleString("en-RW")} RWF`;
}

/**
 * The same amount, shortened for a figure that has to fit in a tile.
 *
 * A term's takings run to eight digits, and "144,836,000 RWF" across a
 * summary strip crowds out the label that says what it is. Only ever for a
 * headline figure with the exact one available beside it - never on a row a
 * family is checking against their own records.
 */
export function shortMoney(amount: number | null | undefined): string {
  const value = Math.round(amount ?? 0);
  if (Math.abs(value) >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${millions.toFixed(millions >= 10 ? 0 : 1)}M RWF`;
  }
  if (Math.abs(value) >= 100_000) {
    return `${Math.round(value / 1000)}K RWF`;
  }
  return money(value);
}

/** What a status is called in front of a parent. */
export const STATUS_LABEL: Record<FeeStatus, string> = {
  CLEARED: "Cleared",
  PART_PAID: "Part paid",
  UNPAID: "Nothing paid",
  NOT_INVOICED: "Not billed",
};

/**
 * How a status looks, as one of the badge variants the rest of the app uses.
 *
 * `PART_PAID` and `UNPAID` are both "owing" as far as the report card is
 * concerned, but they are not the same thing to a bursar chasing money, and
 * washing them into one colour would throw away the distinction the register
 * exists to draw. Amber for a family part way there, red for one that has not
 * started - and a plain grey, not red, for a term nobody has been billed for,
 * which is the school's own unfinished work rather than a family's debt.
 */
export const STATUS_VARIANT: Record<
  FeeStatus,
  "success" | "warning" | "danger" | "default"
> = {
  CLEARED: "success",
  PART_PAID: "warning",
  UNPAID: "danger",
  NOT_INVOICED: "default",
};

/** The colour of the filled part of a progress bar, matching the status. */
export const STATUS_BAR: Record<FeeStatus, string> = {
  CLEARED: "bg-success",
  PART_PAID: "bg-warning",
  UNPAID: "bg-danger",
  NOT_INVOICED: "bg-muted",
};

/** How money reached the school. */
export type PaymentMethod =
  | "CASH"
  | "BANK_DEPOSIT"
  | "BANK_TRANSFER"
  | "MOBILE_MONEY"
  | "CHEQUE";

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_DEPOSIT: "Bank deposit",
  BANK_TRANSFER: "Bank transfer",
  MOBILE_MONEY: "Mobile money",
  CHEQUE: "Cheque",
};

/** What the reference field is called, which differs by how they paid. */
export const REFERENCE_LABEL: Record<PaymentMethod, string> = {
  CASH: "Office receipt book number",
  BANK_DEPOSIT: "Deposit slip number",
  BANK_TRANSFER: "Transfer reference",
  MOBILE_MONEY: "Transaction ID",
  CHEQUE: "Cheque number",
};

/** Why a family is not being asked for part of the fee. */
export type WaiverKind =
  | "BURSARY"
  | "SCHOLARSHIP"
  | "SPONSORSHIP"
  | "HARDSHIP"
  | "STAFF_CHILD";

export const WAIVER_LABEL: Record<WaiverKind, string> = {
  BURSARY: "School bursary",
  SCHOLARSHIP: "Scholarship",
  SPONSORSHIP: "Outside sponsor",
  HARDSHIP: "Hardship",
  STAFF_CHILD: "Staff or sibling",
};

export const WAIVER_HINT: Record<WaiverKind, string> = {
  BURSARY: "The school's own, usually means-tested",
  SCHOLARSHIP: "A place earned on merit",
  SPONSORSHIP: "A district, government or NGO sponsor pays instead",
  HARDSHIP: "A one-off remission after something happened",
  STAFF_CHILD: "Staff children, and second and third siblings",
};

/** Who a fee line is charged to. */
export type FeeAppliesTo = "ALL" | "BOARDER" | "DAY";

export const APPLIES_TO_LABEL: Record<FeeAppliesTo, string> = {
  ALL: "Everyone",
  BOARDER: "Boarders",
  DAY: "Day students",
};

/**
 * How far through the bill a family is, as a whole percentage.
 *
 * Rounded towards the nearest whole number but never up to 100 from short of
 * it: a bar reading "100%" beside a balance of 400 RWF is the one thing that
 * makes a family stop reading and start phoning.
 */
export function settledPercent(standing: FeeStanding | null): number {
  if (!standing) return 0;
  if (standing.cleared) return 100;
  return Math.min(99, Math.floor(standing.settledFraction * 100));
}

/**
 * What to say about a term in one line.
 *
 * Written from the family's side of the screen: what is left to find, not
 * what has been collected. A parent opening this page has one question.
 */
export function standingSummary(
  standing: FeeStanding | null,
  status: FeeStatus,
): string {
  if (status === "NOT_INVOICED") {
    return "The school has not billed this term yet.";
  }
  if (!standing) return "";
  if (standing.cleared) {
    return standing.waived > 0 && standing.paid === 0
      ? `Cleared in full by a bursary of ${money(standing.waived)}.`
      : `Paid in full - ${money(standing.total)}.`;
  }
  const paidPart =
    standing.waived > 0
      ? `${money(standing.paid)} paid and ${money(standing.waived)} waived`
      : `${money(standing.paid)} paid`;
  return `${money(standing.balance)} still to pay - ${paidPart} of ${money(
    standing.total,
  )}.`;
}
