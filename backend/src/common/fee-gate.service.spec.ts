import { ForbiddenException } from '@nestjs/common';
import {
  FeeGateService,
  FEE_GATE_CONFIG_KEY,
  FEE_REFUSAL_REASON,
} from './fee-gate.service';

/**
 * The rule that decides whether a child is shown their own results.
 *
 * Most of what is worth checking here is the ways it must *not* fire: on a
 * member of staff, on a term nobody was billed for, and in a school that
 * never asked for it. Each of those, wrong, locks people out of records they
 * are entitled to with nothing they can do about it.
 */
describe('FeeGateService', () => {
  const prisma = {
    schoolConfig: { findUnique: jest.fn() },
    feeInvoice: { findUnique: jest.fn(), findMany: jest.fn() },
  };
  const gate = new FeeGateService(prisma as never);

  const owing = {
    total: 195000,
    payments: [{ amount: 120000, voidedAt: null }],
    waivers: [],
  };
  const settled = {
    total: 195000,
    payments: [{ amount: 195000, voidedAt: null }],
    waivers: [],
  };

  beforeEach(() => {
    prisma.schoolConfig.findUnique.mockReset().mockResolvedValue(null);
    prisma.feeInvoice.findUnique.mockReset().mockResolvedValue(owing);
    prisma.feeInvoice.findMany.mockReset().mockResolvedValue([owing]);
  });

  describe('the setting', () => {
    it('is on in a school that has never opened it', async () => {
      expect(await gate.isEnabled()).toBe(true);
    });

    it('is off when the school turned it off', async () => {
      prisma.schoolConfig.findUnique.mockResolvedValue({ value: 'false' });
      expect(await gate.isEnabled()).toBe(false);
    });

    it('is on for any other value', async () => {
      prisma.schoolConfig.findUnique.mockResolvedValue({ value: 'true' });
      expect(await gate.isEnabled()).toBe(true);
    });

    it('reads the one key it owns', async () => {
      await gate.isEnabled();
      expect(prisma.schoolConfig.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { key: FEE_GATE_CONFIG_KEY } }),
      );
    });
  });

  describe('a term', () => {
    it('holds a student who owes on it', async () => {
      const held = await gate.withholdingFor('STUDENT', 'stu-1', 'term-1');
      expect(held?.balance).toBe(75000);
    });

    // The message is what the family acts on, so it names the amount.
    it('says how much is outstanding', async () => {
      const held = await gate.withholdingFor('PARENT', 'stu-1', 'term-1');
      expect(held?.message).toContain('75,000 RWF');
    });

    it('releases a term that has been paid', async () => {
      prisma.feeInvoice.findUnique.mockResolvedValue(settled);
      expect(
        await gate.withholdingFor('STUDENT', 'stu-1', 'term-1'),
      ).toBeNull();
    });

    /**
     * A full bursary clears the term. Without this a sponsored child could
     * never be shown their own results.
     */
    it('releases a term cleared by a waiver rather than a payment', async () => {
      prisma.feeInvoice.findUnique.mockResolvedValue({
        total: 195000,
        payments: [],
        waivers: [{ amount: 195000, revokedAt: null }],
      });
      expect(
        await gate.withholdingFor('STUDENT', 'stu-1', 'term-1'),
      ).toBeNull();
    });

    /**
     * No invoice means the school has not decided anybody owes anything.
     * Withholding on the strength of a bill that was never sent would lock a
     * whole school out of its records the day this is switched on.
     */
    it('releases a term nobody was billed for', async () => {
      prisma.feeInvoice.findUnique.mockResolvedValue(null);
      expect(
        await gate.withholdingFor('STUDENT', 'stu-1', 'term-1'),
      ).toBeNull();
    });

    it('releases everything when the school has turned the rule off', async () => {
      prisma.schoolConfig.findUnique.mockResolvedValue({ value: 'false' });
      expect(
        await gate.withholdingFor('STUDENT', 'stu-1', 'term-1'),
      ).toBeNull();
    });
  });

  /**
   * Staff are never held. A teacher marking a script and a bursar looking at
   * the account both have to see the work; a school whose staff cannot read
   * its own records cannot run.
   */
  describe('who is never held', () => {
    it.each([
      'ADMIN',
      'TEACHER',
      'BURSAR',
      'PATRON',
      'MATRON',
      'NURSE',
      'LIBRARIAN',
    ])('never holds a %s', async (role) => {
      expect(await gate.withholdingFor(role, 'stu-1', 'term-1')).toBeNull();
    });

    // And it does not go to the database to find that out.
    it('does not even look up the invoice for staff', async () => {
      await gate.withholdingFor('TEACHER', 'stu-1', 'term-1');
      expect(prisma.feeInvoice.findUnique).not.toHaveBeenCalled();
    });
  });

  /**
   * An annual report is the three terms added up, so it is held while any of
   * them is owed on - and it reports the whole year's shortfall, because that
   * is what it would take to release it.
   */
  describe('a year', () => {
    it('adds up what is owed across its terms', async () => {
      prisma.feeInvoice.findMany.mockResolvedValue([
        { total: 195000, payments: [{ amount: 120000 }], waivers: [] },
        { total: 195000, payments: [{ amount: 100000 }], waivers: [] },
        { total: 195000, payments: [{ amount: 195000 }], waivers: [] },
      ]);
      const held = await gate.withholdingForYear('PARENT', 'stu-1', 'year-1');
      expect(held?.balance).toBe(170000);
    });

    it('releases a year whose terms are all settled', async () => {
      prisma.feeInvoice.findMany.mockResolvedValue([settled, settled]);
      expect(
        await gate.withholdingForYear('STUDENT', 'stu-1', 'year-1'),
      ).toBeNull();
    });

    it('releases a year with no invoices in it at all', async () => {
      prisma.feeInvoice.findMany.mockResolvedValue([]);
      expect(
        await gate.withholdingForYear('STUDENT', 'stu-1', 'year-1'),
      ).toBeNull();
    });

    it('never holds a year for staff', async () => {
      expect(
        await gate.withholdingForYear('TEACHER', 'stu-1', 'year-1'),
      ).toBeNull();
    });

    it('releases a year when the rule is off', async () => {
      prisma.schoolConfig.findUnique.mockResolvedValue({ value: 'false' });
      expect(
        await gate.withholdingForYear('STUDENT', 'stu-1', 'year-1'),
      ).toBeNull();
    });
  });

  describe('as a guard', () => {
    it('refuses a term that is owed on', async () => {
      await expect(
        gate.assertReleased('STUDENT', 'stu-1', 'term-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets a settled term through', async () => {
      prisma.feeInvoice.findUnique.mockResolvedValue(settled);
      await expect(
        gate.assertReleased('STUDENT', 'stu-1', 'term-1'),
      ).resolves.toBeUndefined();
    });

    it('refuses a year that is owed on', async () => {
      await expect(
        gate.assertYearReleased('PARENT', 'stu-1', 'year-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets a settled year through', async () => {
      prisma.feeInvoice.findMany.mockResolvedValue([settled]);
      await expect(
        gate.assertYearReleased('PARENT', 'stu-1', 'year-1'),
      ).resolves.toBeUndefined();
    });

    /**
     * A report card can be refused for two quite different things - not
     * issued yet, or held over the fees - and they need different screens.
     * The refusal carries a name for itself so the page telling them apart
     * does not have to match on the wording of a sentence.
     */
    it('names the refusal, so a screen can tell it from any other 403', async () => {
      const thrown = await gate
        .assertReleased('STUDENT', 'stu-1', 'term-1')
        .catch((e: { getResponse(): Record<string, unknown> }) =>
          e.getResponse(),
        );
      expect(thrown).toMatchObject({
        reason: FEE_REFUSAL_REASON,
        detail: { balance: 75000 },
      });
    });

    it('names it on a year refusal too', async () => {
      const thrown = await gate
        .assertYearReleased('PARENT', 'stu-1', 'year-1')
        .catch((e: { getResponse(): Record<string, unknown> }) =>
          e.getResponse(),
        );
      expect(thrown).toMatchObject({ reason: FEE_REFUSAL_REASON });
    });
  });
});
