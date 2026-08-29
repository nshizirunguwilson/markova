import {
  amountPaid,
  amountWaived,
  chargesFor,
  feeStanding,
  feeStatus,
  formatRwf,
  invoiceTotal,
  nextReceiptNumber,
  withholdingReason,
} from './fees';

/**
 * The fee arithmetic.
 *
 * This decides whether a child is shown their own report card, so the cases
 * that matter here are the ones where getting it wrong withholds results from
 * a family that owes nothing.
 */
describe('what a class is charged', () => {
  const items = [
    { name: 'Tuition', amount: 85000, appliesTo: 'ALL' },
    { name: 'Boarding', amount: 60000, appliesTo: 'BOARDER' },
    { name: 'Meals', amount: 45000, appliesTo: 'BOARDER' },
    { name: 'Transport', amount: 25000, appliesTo: 'DAY' },
  ];

  it('bills a boarder for the bed and the meals', () => {
    expect(chargesFor(items, true).map((i) => i.name)).toEqual([
      'Tuition',
      'Boarding',
      'Meals',
    ]);
  });

  it('bills a day student for the bus instead', () => {
    expect(chargesFor(items, false).map((i) => i.name)).toEqual([
      'Tuition',
      'Transport',
    ]);
  });

  it('adds the lines up to the bill', () => {
    expect(invoiceTotal(chargesFor(items, true))).toBe(190000);
    expect(invoiceTotal(chargesFor(items, false))).toBe(110000);
  });

  it('asks for nothing when the class has no price list yet', () => {
    expect(invoiceTotal(chargesFor([], true))).toBe(0);
  });
});

describe('what has come in', () => {
  it('adds the payments up', () => {
    expect(amountPaid([{ amount: 50000 }, { amount: 70000 }])).toBe(120000);
  });

  /*
    A receipt entered twice is voided rather than deleted, so the entry is
    still in the book. Counting it would leave a family looking cleared on
    money the school never received.
  */
  it('leaves a voided receipt out of the total', () => {
    const paid = amountPaid([
      { amount: 50000 },
      { amount: 70000, voidedAt: new Date('2026-02-14') },
    ]);
    expect(paid).toBe(50000);
  });

  it('adds the waivers up', () => {
    expect(amountWaived([{ amount: 40000 }, { amount: 10000 }])).toBe(50000);
  });

  it('leaves a revoked waiver out of the total', () => {
    const waived = amountWaived([
      { amount: 40000 },
      { amount: 10000, revokedAt: new Date('2026-03-01') },
    ]);
    expect(waived).toBe(40000);
  });
});

describe('how a term stands', () => {
  it('is cleared when the bill has been paid', () => {
    const standing = feeStanding(195000, [{ amount: 195000 }], []);
    expect(standing).toMatchObject({ balance: 0, cleared: true });
  });

  it('owes the difference when part of it has been paid', () => {
    const standing = feeStanding(195000, [{ amount: 120000 }], []);
    expect(standing).toMatchObject({ balance: 75000, cleared: false });
  });

  /**
   * A waiver counts exactly as a payment does. Without this a sponsored child
   * could never be shown their own results, and the only way round would be
   * to record a payment that never happened.
   */
  it('is cleared by a full bursary with nothing paid', () => {
    const standing = feeStanding(195000, [], [{ amount: 195000 }]);
    expect(standing).toMatchObject({ paid: 0, waived: 195000, cleared: true });
  });

  it('is cleared by a part bursary and the rest paid', () => {
    const standing = feeStanding(
      195000,
      [{ amount: 95000 }],
      [{ amount: 100000 }],
    );
    expect(standing.cleared).toBe(true);
  });

  /*
    An overpayment is money the school owes the family, not a debt. Shown as a
    negative it sits in a column of positives and is read as the opposite of
    what it is.
  */
  it('never reports a negative balance', () => {
    const standing = feeStanding(100000, [{ amount: 120000 }], []);
    expect(standing.balance).toBe(0);
    expect(standing.cleared).toBe(true);
  });

  it('reports how far through the bill the family is', () => {
    expect(feeStanding(200000, [{ amount: 50000 }], []).settledFraction).toBe(
      0.25,
    );
  });

  it('calls a bill of nothing fully settled', () => {
    const standing = feeStanding(0, [], []);
    expect(standing).toMatchObject({ cleared: true, settledFraction: 1 });
  });

  it('does not report more than settled in full after an overpayment', () => {
    expect(feeStanding(100000, [{ amount: 150000 }], []).settledFraction).toBe(
      1,
    );
  });
});

/**
 * The gate itself. Both of these are about failing in the safe direction:
 * withholding a report card from a family that was never billed is a fault
 * the family cannot put right.
 */
describe('whether results are withheld', () => {
  it('withholds them, with the amount, when the term is owed on', () => {
    const standing = feeStanding(195000, [{ amount: 120000 }], []);
    expect(withholdingReason(standing)).toEqual({ balance: 75000 });
  });

  it('releases them once the term is cleared', () => {
    expect(withholdingReason(feeStanding(195000, [{ amount: 195000 }], []))).toBeNull();
  });

  it('releases them when the school has raised no bill at all', () => {
    expect(withholdingReason(null)).toBeNull();
  });

  it('releases them when the term was charged at nothing', () => {
    expect(withholdingReason(feeStanding(0, [], []))).toBeNull();
  });
});

describe('the status shown in a list', () => {
  it.each([
    ['nothing invoiced', null, 'NOT_INVOICED'],
    ['paid in full', feeStanding(100000, [{ amount: 100000 }], []), 'CLEARED'],
    ['part paid', feeStanding(100000, [{ amount: 40000 }], []), 'PART_PAID'],
    ['nothing paid', feeStanding(100000, [], []), 'UNPAID'],
  ])('reads %s as %s', (_name, standing, expected) => {
    expect(feeStatus(standing as never)).toBe(expected);
  });

  // A part bursary with nothing paid is still money off the bill, and a
  // bursar chasing debts needs to see it as different from an untouched one.
  it('counts a part waiver as part paid', () => {
    expect(feeStatus(feeStanding(100000, [], [{ amount: 40000 }]))).toBe(
      'PART_PAID',
    );
  });
});

describe('writing an amount down', () => {
  it('groups it in threes with no decimal part', () => {
    expect(formatRwf(195000)).toBe('195,000 RWF');
  });

  // The franc has no minor unit, so a fraction is an artefact of arithmetic
  // rather than an amount anybody can hand over.
  it('rounds to the whole franc', () => {
    expect(formatRwf(1999.6)).toBe('2,000 RWF');
  });

  it('writes nothing as nothing', () => {
    expect(formatRwf(0)).toBe('0 RWF');
  });
});

/**
 * Receipt numbers are quoted back to the school for years, so they are unique
 * and never reused.
 */
describe('numbering a receipt', () => {
  it('starts the year at one', () => {
    expect(nextReceiptNumber(null, 2026)).toBe('RCT-2026-0001');
  });

  it('follows on from the last one issued', () => {
    expect(nextReceiptNumber('RCT-2026-0340', 2026)).toBe('RCT-2026-0341');
  });

  // A new year starts its own run rather than continuing last year's.
  it('starts again in a new year', () => {
    expect(nextReceiptNumber('RCT-2026-0340', 2027)).toBe('RCT-2027-0001');
  });

  it('starts at one when the last number cannot be read', () => {
    expect(nextReceiptNumber('RCT-2026-oops', 2026)).toBe('RCT-2026-0001');
  });

  it('keeps counting past four digits rather than wrapping', () => {
    expect(nextReceiptNumber('RCT-2026-9999', 2026)).toBe('RCT-2026-10000');
  });
});
