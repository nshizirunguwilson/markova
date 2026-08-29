import { describe, expect, it } from "vitest";
import {
  APPLIES_TO_LABEL,
  METHOD_LABEL,
  REFERENCE_LABEL,
  STATUS_BAR,
  STATUS_LABEL,
  STATUS_VARIANT,
  WAIVER_HINT,
  WAIVER_LABEL,
  money,
  settledPercent,
  shortMoney,
  standingSummary,
  type FeeStanding,
} from "./fees";

const standing = (over: Partial<FeeStanding> = {}): FeeStanding => {
  const total = over.total ?? 195000;
  const paid = over.paid ?? 0;
  const waived = over.waived ?? 0;
  const settled = paid + waived;
  return {
    total,
    paid,
    waived,
    balance: Math.max(0, total - settled),
    cleared: settled >= total,
    settledFraction: total <= 0 ? 1 : Math.min(1, settled / total),
    ...over,
  };
};

describe("writing an amount", () => {
  it("groups it in threes with no decimal part", () => {
    expect(money(195000)).toBe("195,000 RWF");
  });

  // The franc has no minor unit, so a fraction is arithmetic rather than an
  // amount anybody can hand over.
  it("rounds to the whole franc", () => {
    expect(money(1999.6)).toBe("2,000 RWF");
  });

  it("writes nothing rather than NaN when there is no figure", () => {
    expect(money(null)).toBe("0 RWF");
    expect(money(undefined)).toBe("0 RWF");
  });
});

/**
 * Only ever for a headline figure with the exact one available beside it: a
 * family checking a row against their own records must see every digit.
 */
describe("shortening an amount for a tile", () => {
  it("writes millions with one decimal", () => {
    expect(shortMoney(1_460_000)).toBe("1.5M RWF");
    expect(shortMoney(1_440_000)).toBe("1.4M RWF");
  });

  // Past ten million the decimal is noise on a figure nobody reads that
  // closely at a glance.
  it("drops the decimal past ten million", () => {
    expect(shortMoney(144_836_000)).toBe("145M RWF");
  });

  it("writes hundreds of thousands in thousands", () => {
    expect(shortMoney(263_500)).toBe("264K RWF");
  });

  it("leaves a smaller amount exact", () => {
    expect(shortMoney(74_000)).toBe("74,000 RWF");
  });

  it("handles nothing", () => {
    expect(shortMoney(0)).toBe("0 RWF");
    expect(shortMoney(null)).toBe("0 RWF");
    expect(shortMoney(undefined)).toBe("0 RWF");
  });
});

describe("naming a status", () => {
  it.each([
    ["CLEARED", "Cleared"],
    ["PART_PAID", "Part paid"],
    ["UNPAID", "Nothing paid"],
    ["NOT_INVOICED", "Not billed"],
  ] as const)("calls %s %s", (status, label) => {
    expect(STATUS_LABEL[status]).toBe(label);
  });

  /*
    Part paid and nothing paid are both "owing" to the report card, but they
    are not the same thing to a bursar chasing money, and one colour for both
    throws away the distinction the register exists to draw.
  */
  it("gives part paid and nothing paid different colours", () => {
    expect(STATUS_VARIANT.PART_PAID).not.toBe(STATUS_VARIANT.UNPAID);
    expect(STATUS_BAR.PART_PAID).not.toBe(STATUS_BAR.UNPAID);
  });

  // A term nobody was billed for is the school's unfinished work, not a
  // family's debt, so it must not be dressed as an alarm.
  it("does not colour an unbilled term as a problem", () => {
    expect(STATUS_VARIANT.NOT_INVOICED).toBe("default");
  });

  it("has a colour and a bar for every status", () => {
    for (const status of Object.keys(STATUS_LABEL)) {
      expect(STATUS_VARIANT[status as keyof typeof STATUS_VARIANT]).toBeTruthy();
      expect(STATUS_BAR[status as keyof typeof STATUS_BAR]).toBeTruthy();
    }
  });
});

describe("naming the rest of it", () => {
  it("names every way money can arrive", () => {
    expect(Object.keys(METHOD_LABEL)).toHaveLength(5);
    expect(METHOD_LABEL.MOBILE_MONEY).toBe("Mobile money");
  });

  /*
    The reference field is a different thing for each method, and one generic
    label ("Reference") is what makes a bursar type the wrong number into it.
  */
  it("asks for the right reference for each method", () => {
    expect(REFERENCE_LABEL.MOBILE_MONEY).toMatch(/transaction/i);
    expect(REFERENCE_LABEL.CHEQUE).toMatch(/cheque/i);
    expect(new Set(Object.values(REFERENCE_LABEL)).size).toBe(5);
  });

  it("names and explains every kind of waiver", () => {
    for (const kind of Object.keys(WAIVER_LABEL)) {
      expect(WAIVER_HINT[kind as keyof typeof WAIVER_HINT]).toBeTruthy();
    }
  });

  it("says who each fee line is charged to", () => {
    expect(APPLIES_TO_LABEL.BOARDER).toBe("Boarders");
    expect(APPLIES_TO_LABEL.DAY).toBe("Day students");
    expect(APPLIES_TO_LABEL.ALL).toBe("Everyone");
  });
});

describe("how far through the bill", () => {
  it("is nothing when nothing has been paid", () => {
    expect(settledPercent(standing())).toBe(0);
  });

  it("is a hundred once the term is cleared", () => {
    expect(settledPercent(standing({ paid: 195000 }))).toBe(100);
  });

  /**
   * A bar reading "100%" beside a balance of 400 RWF is the one thing that
   * makes a family stop reading and start phoning.
   */
  it("never reads a hundred while anything is still owed", () => {
    expect(settledPercent(standing({ total: 195000, paid: 194600 }))).toBe(99);
  });

  it("counts a waiver towards it, as the balance does", () => {
    expect(settledPercent(standing({ paid: 0, waived: 97500 }))).toBe(50);
  });

  it("is nothing when there is no bill at all", () => {
    expect(settledPercent(null)).toBe(0);
  });
});

/**
 * Written from the family's side of the screen: what is left to find, not
 * what the school has collected.
 */
describe("summing a term up in a line", () => {
  it("leads with what is still to pay", () => {
    expect(standingSummary(standing({ paid: 120000 }), "PART_PAID")).toMatch(
      /^75,000 RWF still to pay/,
    );
  });

  it("names the waiver alongside the payments when there is one", () => {
    const line = standingSummary(
      standing({ paid: 95000, waived: 20000 }),
      "PART_PAID",
    );
    expect(line).toContain("95,000 RWF paid and 20,000 RWF waived");
  });

  it("says so plainly when the term is paid off", () => {
    expect(standingSummary(standing({ paid: 195000 }), "CLEARED")).toBe(
      "Paid in full - 195,000 RWF.",
    );
  });

  // A sponsored family has not paid, and telling them they have is wrong.
  it("credits a full bursary rather than calling it paid", () => {
    expect(standingSummary(standing({ waived: 195000 }), "CLEARED")).toBe(
      "Cleared in full by a bursary of 195,000 RWF.",
    );
  });

  it("says the school has not billed yet rather than showing a debt", () => {
    expect(standingSummary(null, "NOT_INVOICED")).toMatch(/not billed/i);
  });

  // A status without a standing behind it cannot be summed up, and inventing
  // a sentence for it would put a figure on screen that nothing supports.
  it("says nothing at all when there is no standing to sum up", () => {
    expect(standingSummary(null, "CLEARED")).toBe("");
  });
});
