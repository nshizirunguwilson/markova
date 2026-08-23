import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PocketMoneyService } from './pocket-money.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * The pocket money ledger.
 *
 * This is a child's money held by their school, so the tests are about the
 * properties that make it trustworthy rather than about the happy path: the
 * balance is always the sum of the entries, nothing is ever erased, and a
 * student cannot spend what they do not have.
 */

const ACCOUNT = { id: 'acct-1', studentId: 'student-1', dailyLimit: null, lowBalanceAlert: null, isFrozen: false };

describe('PocketMoneyService', () => {
  let service: PocketMoneyService;

  const prisma: any = {
    student: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    pocketMoneyAccount: { upsert: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    pocketMoneyTransaction: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    parentStudent: { findFirst: jest.fn() },
  };

  /** The ledger this account currently holds. */
  function ledger(rows: any[]) {
    prisma.pocketMoneyTransaction.findMany.mockResolvedValue(
      rows.map((r, i) => ({ id: r.id ?? `t-${i}`, createdAt: new Date(), reversesId: null, ...r })),
    );
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.student.findUnique.mockResolvedValue({ id: 'student-1', studentIdNumber: 'STD-1', user: { firstName: 'Divine', lastName: 'Niyonkuru', photoUrl: null }, classSection: null });
    prisma.pocketMoneyAccount.upsert.mockResolvedValue({ ...ACCOUNT });
    prisma.pocketMoneyTransaction.create.mockResolvedValue({});
    ledger([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [PocketMoneyService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(PocketMoneyService);
  });

  describe('the balance', () => {
    it('is zero on an account nobody has used', async () => {
      const account = await service.getAccount('student-1');
      expect(account.balance).toBe(0);
    });

    it('is the sum of what went in and what came out', async () => {
      ledger([
        { kind: 'DEPOSIT', amount: 10000 },
        { kind: 'WITHDRAWAL', amount: 1500 },
        { kind: 'WITHDRAWAL', amount: 500 },
      ]);
      const account = await service.getAccount('student-1');
      expect(account.balance).toBe(8000);
    });

    it('counts a refund as money leaving', async () => {
      ledger([
        { kind: 'DEPOSIT', amount: 10000 },
        { kind: 'REFUND', amount: 4000 },
      ]);
      expect((await service.getAccount('student-1')).balance).toBe(6000);
    });

    it('counts an adjustment as money arriving', async () => {
      ledger([
        { kind: 'DEPOSIT', amount: 5000 },
        { kind: 'ADJUSTMENT', amount: 200 },
      ]);
      expect((await service.getAccount('student-1')).balance).toBe(5200);
    });

    // A reversal and the entry it undoes cancel out, so the balance returns to
    // where it was before the mistake.
    it('is unchanged by a reversed entry', async () => {
      ledger([
        { id: 't-a', kind: 'DEPOSIT', amount: 10000 },
        { id: 't-b', kind: 'WITHDRAWAL', amount: 3000 },
        { id: 't-c', kind: 'REVERSAL', amount: 3000, reversesId: 't-b' },
      ]);
      expect((await service.getAccount('student-1')).balance).toBe(10000);
    });
  });

  describe("today's spending", () => {
    it('counts only what was drawn today', async () => {
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      prisma.pocketMoneyTransaction.findMany.mockResolvedValue([
        { id: 't-1', kind: 'DEPOSIT', amount: 20000, createdAt: lastWeek, reversesId: null },
        { id: 't-2', kind: 'WITHDRAWAL', amount: 4000, createdAt: lastWeek, reversesId: null },
        { id: 't-3', kind: 'WITHDRAWAL', amount: 700, createdAt: new Date(), reversesId: null },
      ]);
      const account = await service.getAccount('student-1');
      expect(account.spentToday).toBe(700);
      expect(account.balance).toBe(15300);
    });

    // Correcting a mistake the same day has to give the allowance back too, or
    // a student is punished twice for the counter's error.
    it('gives back today’s allowance when a withdrawal is reversed', async () => {
      prisma.pocketMoneyTransaction.findMany.mockResolvedValue([
        { id: 't-1', kind: 'DEPOSIT', amount: 10000, createdAt: new Date(), reversesId: null },
        { id: 't-2', kind: 'WITHDRAWAL', amount: 2000, createdAt: new Date(), reversesId: null },
        { id: 't-3', kind: 'REVERSAL', amount: 2000, createdAt: new Date(), reversesId: 't-2' },
      ]);
      expect((await service.getAccount('student-1')).spentToday).toBe(0);
    });
  });

  describe('taking money in', () => {
    it('records the deposit against the account', async () => {
      await service.deposit('student-1', 5000, 'Visiting day', 'user-1');
      expect(prisma.pocketMoneyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ kind: 'DEPOSIT', amount: 5000, recordedByUserId: 'user-1' }),
        }),
      );
    });

    it('refuses a deposit of nothing', async () => {
      await expect(service.deposit('student-1', 0, undefined, 'user-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    // A negative deposit is a withdrawal in disguise, and would slip past the
    // balance and limit checks entirely.
    it('refuses a negative deposit', async () => {
      await expect(service.deposit('student-1', -5000, undefined, 'user-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('paying money out', () => {
    beforeEach(() => {
      ledger([{ kind: 'DEPOSIT', amount: 10000 }]);
    });

    it('records the withdrawal', async () => {
      await service.withdraw('student-1', 1500, 'Canteen', 'user-1');
      expect(prisma.pocketMoneyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ kind: 'WITHDRAWAL', amount: 1500 }),
        }),
      );
    });

    // It is the child's own money, so there is nothing to lend them.
    it('refuses more than the balance', async () => {
      await expect(
        service.withdraw('student-1', 12000, undefined, 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.pocketMoneyTransaction.create).not.toHaveBeenCalled();
    });

    // The refusal happens at a counter with a queue, so it has to say what the
    // balance actually is rather than merely "insufficient funds".
    it('says how much is actually left when it refuses', async () => {
      await expect(
        service.withdraw('student-1', 12000, undefined, 'user-1'),
      ).rejects.toThrow(/10000/);
    });

    it('allows drawing the balance down to exactly zero', async () => {
      await service.withdraw('student-1', 10000, undefined, 'user-1');
      expect(prisma.pocketMoneyTransaction.create).toHaveBeenCalled();
    });

    it('refuses a withdrawal of nothing', async () => {
      await expect(service.withdraw('student-1', 0, undefined, 'user-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses to pay out of a frozen account', async () => {
      prisma.pocketMoneyAccount.upsert.mockResolvedValue({ ...ACCOUNT, isFrozen: true });
      await expect(
        service.withdraw('student-1', 100, undefined, 'user-1'),
      ).rejects.toThrow(/frozen/i);
    });

    it('still lets money be paid into a frozen account', async () => {
      prisma.pocketMoneyAccount.upsert.mockResolvedValue({ ...ACCOUNT, isFrozen: true });
      await service.deposit('student-1', 5000, undefined, 'user-1');
      expect(prisma.pocketMoneyTransaction.create).toHaveBeenCalled();
    });
  });

  /**
   * The cap exists so a term's money lasts a term. It is the parent's setting,
   * not the school's.
   */
  describe('the daily limit', () => {
    beforeEach(() => {
      prisma.pocketMoneyAccount.upsert.mockResolvedValue({ ...ACCOUNT, dailyLimit: 2000 });
    });

    it('allows a withdrawal inside the cap', async () => {
      ledger([{ kind: 'DEPOSIT', amount: 10000 }]);
      await service.withdraw('student-1', 1500, undefined, 'user-1');
      expect(prisma.pocketMoneyTransaction.create).toHaveBeenCalled();
    });

    it('refuses a single withdrawal over the cap', async () => {
      ledger([{ kind: 'DEPOSIT', amount: 10000 }]);
      await expect(
        service.withdraw('student-1', 2500, undefined, 'user-1'),
      ).rejects.toThrow(/limit/i);
    });

    // The cap is for the day, not per transaction, or a student takes it out in
    // five small trips.
    it('counts what has already been drawn today', async () => {
      prisma.pocketMoneyTransaction.findMany.mockResolvedValue([
        { id: 't-1', kind: 'DEPOSIT', amount: 10000, createdAt: new Date(), reversesId: null },
        { id: 't-2', kind: 'WITHDRAWAL', amount: 1800, createdAt: new Date(), reversesId: null },
      ]);
      await expect(
        service.withdraw('student-1', 500, undefined, 'user-1'),
      ).rejects.toThrow(/already been drawn/i);
    });

    it('says how much of today is left when it refuses', async () => {
      prisma.pocketMoneyTransaction.findMany.mockResolvedValue([
        { id: 't-1', kind: 'DEPOSIT', amount: 10000, createdAt: new Date(), reversesId: null },
        { id: 't-2', kind: 'WITHDRAWAL', amount: 1800, createdAt: new Date(), reversesId: null },
      ]);
      await expect(
        service.withdraw('student-1', 500, undefined, 'user-1'),
      ).rejects.toThrow(/200/);
    });

    it('reports what is left of today alongside the balance', async () => {
      prisma.pocketMoneyTransaction.findMany.mockResolvedValue([
        { id: 't-1', kind: 'DEPOSIT', amount: 10000, createdAt: new Date(), reversesId: null },
        { id: 't-2', kind: 'WITHDRAWAL', amount: 1200, createdAt: new Date(), reversesId: null },
      ]);
      const account = await service.getAccount('student-1');
      expect(account.remainingToday).toBe(800);
    });

    it('reports no remaining figure when there is no cap', async () => {
      prisma.pocketMoneyAccount.upsert.mockResolvedValue({ ...ACCOUNT });
      const account = await service.getAccount('student-1');
      expect(account.remainingToday).toBeNull();
    });
  });

  describe('a refund to the family', () => {
    it('refuses to return more than is held', async () => {
      ledger([{ kind: 'DEPOSIT', amount: 3000 }]);
      await expect(
        service.refund('student-1', 5000, undefined, 'user-1'),
      ).rejects.toThrow(/3000/);
    });

    it('returns what is there', async () => {
      ledger([{ kind: 'DEPOSIT', amount: 3000 }]);
      await service.refund('student-1', 3000, 'End of year', 'user-1');
      expect(prisma.pocketMoneyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ kind: 'REFUND' }) }),
      );
    });
  });

  /**
   * A correction is a second entry, never an edit. That is what lets the ledger
   * be read as evidence months later.
   */
  describe('correcting a mistake', () => {
    it('writes a reversing entry rather than changing the original', async () => {
      prisma.pocketMoneyTransaction.findUnique.mockResolvedValue({
        id: 't-1',
        accountId: 'acct-1',
        kind: 'WITHDRAWAL',
        amount: 2000,
        reversedBy: null,
        account: { studentId: 'student-1' },
      });

      await service.reverse('t-1', 'Entered twice', 'user-1');

      expect(prisma.pocketMoneyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: 'REVERSAL',
            amount: 2000,
            reversesId: 't-1',
            note: 'Entered twice',
          }),
        }),
      );
    });

    // Reversing twice would credit the money back twice over.
    it('refuses to reverse the same entry twice', async () => {
      prisma.pocketMoneyTransaction.findUnique.mockResolvedValue({
        id: 't-1',
        accountId: 'acct-1',
        kind: 'WITHDRAWAL',
        amount: 2000,
        reversedBy: { id: 't-2' },
        account: { studentId: 'student-1' },
      });
      await expect(service.reverse('t-1', 'again', 'user-1')).rejects.toThrow(
        /already been reversed/i,
      );
    });

    it('refuses to reverse a reversal', async () => {
      prisma.pocketMoneyTransaction.findUnique.mockResolvedValue({
        id: 't-2',
        accountId: 'acct-1',
        kind: 'REVERSAL',
        amount: 2000,
        reversedBy: null,
        account: { studentId: 'student-1' },
      });
      await expect(service.reverse('t-2', 'undo the undo', 'user-1')).rejects.toThrow(
        /cannot itself be reversed/i,
      );
    });

    it('records who made the correction', async () => {
      prisma.pocketMoneyTransaction.findUnique.mockResolvedValue({
        id: 't-1',
        accountId: 'acct-1',
        kind: 'DEPOSIT',
        amount: 1000,
        reversedBy: null,
        account: { studentId: 'student-1' },
      });
      await service.reverse('t-1', 'Counted wrong', 'user-9');
      expect(prisma.pocketMoneyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ recordedByUserId: 'user-9' }),
        }),
      );
    });
  });

  describe('a low balance', () => {
    it('is flagged once it drops to the warning level', async () => {
      prisma.pocketMoneyAccount.upsert.mockResolvedValue({ ...ACCOUNT, lowBalanceAlert: 1000 });
      ledger([{ kind: 'DEPOSIT', amount: 900 }]);
      expect((await service.getAccount('student-1')).isLow).toBe(true);
    });

    it('is not flagged above it', async () => {
      prisma.pocketMoneyAccount.upsert.mockResolvedValue({ ...ACCOUNT, lowBalanceAlert: 1000 });
      ledger([{ kind: 'DEPOSIT', amount: 4000 }]);
      expect((await service.getAccount('student-1')).isLow).toBe(false);
    });

    it('is never flagged when no warning was asked for', async () => {
      ledger([]);
      expect((await service.getAccount('student-1')).isLow).toBe(false);
    });
  });

  describe('finding a student at the counter', () => {
    it('accepts a scanned card code', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 'student-1' });
      await service.findByIdentifier('H0M2-H949-MPPX');
      expect(prisma.student.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ cardCode: 'H0M2-H949-MPPX' }]),
          }),
        }),
      );
    });

    it('accepts a typed student number', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 'student-1' });
      const result = await service.findByIdentifier('STD-2025-231419-167');
      expect(result.studentId).toBe('student-1');
    });

    it('says which code failed when nobody matches', async () => {
      prisma.student.findFirst.mockResolvedValue(null);
      await expect(service.findByIdentifier('NOPE')).rejects.toThrow(/NOPE/);
    });

    it('refuses an empty scan', async () => {
      await expect(service.findByIdentifier('   ')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  /**
   * Who may look. Narrow on purpose: a child's money is not staffroom
   * information.
   */
  describe('who may see an account', () => {
    it.each(['ADMIN', 'PATRON', 'MATRON'])('lets %s see any student', async (role) => {
      await expect(
        service.assertMayView('user-1', role as any, 'student-1'),
      ).resolves.toBeUndefined();
    });

    it('lets a student see their own', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 'student-1' });
      await expect(
        service.assertMayView('user-1', 'STUDENT' as any, 'student-1'),
      ).resolves.toBeUndefined();
    });

    it('stops a student seeing someone else', async () => {
      prisma.student.findFirst.mockResolvedValue(null);
      await expect(
        service.assertMayView('user-1', 'STUDENT' as any, 'student-2'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets a parent see their own child', async () => {
      prisma.parentStudent.findFirst.mockResolvedValue({ id: 'ps-1' });
      await expect(
        service.assertMayView('user-1', 'PARENT' as any, 'student-1'),
      ).resolves.toBeUndefined();
    });

    it('stops a parent seeing another family', async () => {
      prisma.parentStudent.findFirst.mockResolvedValue(null);
      await expect(
        service.assertMayView('user-1', 'PARENT' as any, 'student-2'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    // A teacher has no business in a child's finances.
    it('stops a teacher entirely', async () => {
      await expect(
        service.assertMayView('user-1', 'TEACHER' as any, 'student-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('stops a librarian entirely', async () => {
      await expect(
        service.assertMayView('user-1', 'LIBRARIAN' as any, 'student-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('the statement', () => {
    it('shows each entry with the direction the money went', async () => {
      prisma.pocketMoneyTransaction.count.mockResolvedValue(2);
      prisma.pocketMoneyTransaction.findMany.mockResolvedValue([
        { id: 't-2', kind: 'WITHDRAWAL', amount: 1500, note: 'Canteen', createdAt: new Date(), recordedBy: { firstName: 'Aline', lastName: 'Uwase' }, reversesId: null, reversedBy: null },
        { id: 't-1', kind: 'DEPOSIT', amount: 10000, note: null, createdAt: new Date(), recordedBy: null, reversesId: null, reversedBy: null },
      ]);

      const statement = await service.getStatement('student-1');
      expect(statement.data[0].signedAmount).toBe(-1500);
      expect(statement.data[1].signedAmount).toBe(10000);
    });

    it('names who was at the counter', async () => {
      prisma.pocketMoneyTransaction.count.mockResolvedValue(1);
      prisma.pocketMoneyTransaction.findMany.mockResolvedValue([
        { id: 't-1', kind: 'DEPOSIT', amount: 5000, note: null, createdAt: new Date(), recordedBy: { firstName: 'Aline', lastName: 'Uwase' }, reversesId: null, reversedBy: null },
      ]);
      const statement = await service.getStatement('student-1');
      expect(statement.data[0].recordedBy).toBe('Aline Uwase');
    });

    // A reversed entry stays on the statement, marked. Hiding it would make the
    // ledger disagree with itself.
    it('keeps a reversed entry visible and marks it', async () => {
      prisma.pocketMoneyTransaction.count.mockResolvedValue(1);
      prisma.pocketMoneyTransaction.findMany.mockResolvedValue([
        { id: 't-1', kind: 'WITHDRAWAL', amount: 2000, note: null, createdAt: new Date(), recordedBy: null, reversesId: null, reversedBy: { id: 't-2', createdAt: new Date() } },
      ]);
      const statement = await service.getStatement('student-1');
      expect(statement.data).toHaveLength(1);
      expect(statement.data[0].isReversed).toBe(true);
    });
  });

  describe('the limits a parent sets', () => {
    it('refuses a negative daily cap', async () => {
      await expect(
        service.updateLimits('student-1', { dailyLimit: -100 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts removing the cap', async () => {
      prisma.pocketMoneyAccount.update.mockResolvedValue({});
      await service.updateLimits('student-1', { dailyLimit: null });
      expect(prisma.pocketMoneyAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ dailyLimit: null }) }),
      );
    });
  });

  /**
   * Giving a balance back to the family, which happens when a student leaves.
   */
  describe('returning money to the family', () => {
    beforeEach(() => {
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        studentIdNumber: 'STD-2026-001',
        user: { firstName: 'Divine', lastName: 'Niyonkuru', photoUrl: null },
        classSection: { classLevel: { name: 'Senior 1' } },
      });
      prisma.pocketMoneyAccount.upsert.mockResolvedValue(ACCOUNT);
      prisma.pocketMoneyTransaction.create.mockResolvedValue({});
    });

    it('refuses a refund of nothing', async () => {
      await expect(
        service.refund('student-1', 0, undefined, 'admin-1'),
      ).rejects.toThrow(/more than zero/i);
    });

    it('refuses a refund of a negative amount', async () => {
      await expect(
        service.refund('student-1', -500, undefined, 'admin-1'),
      ).rejects.toThrow(/more than zero/i);
    });

    // Handing back more than the school holds would take it from somebody
    // else's child.
    it('refuses more than the school is holding, and says how much that is', async () => {
      prisma.pocketMoneyTransaction.findMany.mockResolvedValue([
        { id: 't-1', kind: 'DEPOSIT', amount: 2000, createdAt: new Date(), reversesId: null },
      ]);
      await expect(
        service.refund('student-1', 5000, undefined, 'admin-1'),
      ).rejects.toThrow(/Only 2000 RWF is held/);
      expect(prisma.pocketMoneyTransaction.create).not.toHaveBeenCalled();
    });

    it('records the whole balance going back', async () => {
      prisma.pocketMoneyTransaction.findMany.mockResolvedValue([
        { id: 't-1', kind: 'DEPOSIT', amount: 5000, createdAt: new Date(), reversesId: null },
      ]);
      await service.refund('student-1', 5000, 'Left the school', 'admin-1');
      expect(prisma.pocketMoneyTransaction.create.mock.calls[0][0].data).toMatchObject(
        { kind: 'REFUND', amount: 5000, note: 'Left the school' },
      );
    });
  });

  /**
   * The counter's roll of every account. The number at the top has to be the
   * whole filtered roll: "the school is holding 38,000 RWF" would be a lie if
   * it counted only the three students on screen.
   */
  describe('the roll of accounts', () => {
    beforeEach(() => {
      prisma.student.count.mockResolvedValue(0);
      prisma.student.findMany.mockResolvedValue([]);
      prisma.pocketMoneyAccount.findMany.mockResolvedValue([]);
      prisma.pocketMoneyTransaction.findMany.mockResolvedValue([]);
    });

    it('shows only students still on the roll', async () => {
      await service.overview({});
      expect(prisma.student.count.mock.calls[0][0].where).toMatchObject({
        status: 'ACTIVE',
      });
    });

    it('narrows to one class', async () => {
      await service.overview({ classSectionId: 'section-1' });
      expect(prisma.student.count.mock.calls[0][0].where.classSectionId).toBe(
        'section-1',
      );
    });

    it('searches the number and the name', async () => {
      await service.overview({ search: 'Divine' });
      const or = JSON.stringify(prisma.student.count.mock.calls[0][0].where.OR);
      expect(or).toContain('studentIdNumber');
      expect(or).toContain('firstName');
    });

    it('ignores a search of nothing but spaces', async () => {
      await service.overview({ search: '   ' });
      expect(prisma.student.count.mock.calls[0][0].where).not.toHaveProperty('OR');
    });

    it('refuses a page size big enough to pull the whole school', async () => {
      await service.overview({ limit: 5000 });
      expect(prisma.student.findMany.mock.calls[0][0].take).toBe(100);
    });

    it('treats nonsense paging as the first page', async () => {
      await service.overview({ page: -2, limit: 0 });
      expect(prisma.student.findMany.mock.calls[0][0].skip).toBe(0);
      expect(prisma.student.findMany.mock.calls[0][0].take).toBe(25);
    });

    it('always reports at least one page', async () => {
      const result = await service.overview({});
      expect(result.meta.totalPages).toBe(1);
    });

    it('shows a student who has never been given money as holding nothing', async () => {
      prisma.student.findMany.mockResolvedValue([
        {
          id: 'student-1',
          studentIdNumber: 'STD-1',
          user: { firstName: 'Divine', lastName: 'Niyonkuru' },
          classSection: { name: 'A', classLevel: { name: 'Senior 1' } },
          pocketMoney: null,
        },
      ]);
      const result = await service.overview({});
      expect(result.items[0]).toMatchObject({
        balance: 0,
        hasAccount: false,
        dailyLimit: null,
        isFrozen: false,
      });
    });

    it('works each balance out from that account’s own entries', async () => {
      prisma.student.findMany.mockResolvedValue([
        {
          id: 'student-1',
          studentIdNumber: 'STD-1',
          user: { firstName: 'Divine', lastName: 'Niyonkuru' },
          classSection: { name: 'A', classLevel: { name: 'Senior 1' } },
          pocketMoney: { id: 'acct-1', dailyLimit: 2000, isFrozen: false },
        },
      ]);
      prisma.pocketMoneyTransaction.findMany.mockResolvedValue([
        { id: 't-1', accountId: 'acct-1', kind: 'DEPOSIT', amount: 10000, reversesId: null },
        { id: 't-2', accountId: 'acct-1', kind: 'WITHDRAWAL', amount: 1500, reversesId: null },
      ]);
      const result = await service.overview({});
      expect(result.items[0].balance).toBe(8500);
    });

    // A reversed entry and the reversal that undid it both drop out, or the
    // correction would be counted twice.
    it('leaves a corrected entry and its correction out of the balance', async () => {
      prisma.student.findMany.mockResolvedValue([
        {
          id: 'student-1',
          studentIdNumber: 'STD-1',
          user: { firstName: 'D', lastName: 'N' },
          classSection: null,
          pocketMoney: { id: 'acct-1', dailyLimit: null, isFrozen: false },
        },
      ]);
      prisma.pocketMoneyTransaction.findMany.mockResolvedValue([
        { id: 't-1', accountId: 'acct-1', kind: 'DEPOSIT', amount: 10000, reversesId: null },
        { id: 't-2', accountId: 'acct-1', kind: 'WITHDRAWAL', amount: 500, reversesId: null },
        { id: 't-3', accountId: 'acct-1', kind: 'REVERSAL', amount: 500, reversesId: 't-2' },
      ]);
      const result = await service.overview({});
      expect(result.items[0].balance).toBe(10000);
    });

    it('copes with a student whose class was never set', async () => {
      prisma.student.findMany.mockResolvedValue([
        {
          id: 'student-1',
          studentIdNumber: 'STD-1',
          user: { firstName: 'D', lastName: 'N' },
          classSection: null,
          pocketMoney: null,
        },
      ]);
      const result = await service.overview({});
      expect(result.items[0].class).toBeNull();
    });

    it('asks for no entries at all when nobody has an account', async () => {
      prisma.student.findMany.mockResolvedValue([
        {
          id: 'student-1',
          studentIdNumber: 'STD-1',
          user: { firstName: 'D', lastName: 'N' },
          classSection: null,
          pocketMoney: null,
        },
      ]);
      await service.overview({});
      // Only the total's own lookup, and it short-circuits on no accounts.
      expect(prisma.pocketMoneyTransaction.findMany).not.toHaveBeenCalled();
    });

    /**
     * The total is across the whole filtered roll, and it is summed from the
     * accounts rather than from the page.
     */
    it('totals the whole roll, not the page on screen', async () => {
      prisma.student.count.mockResolvedValue(739);
      prisma.pocketMoneyAccount.findMany.mockResolvedValue([
        { id: 'acct-1' },
        { id: 'acct-2' },
      ]);
      prisma.pocketMoneyTransaction.findMany.mockResolvedValue([
        { id: 't-1', kind: 'DEPOSIT', amount: 2000, reversesId: null },
        { id: 't-2', kind: 'DEPOSIT', amount: 3000, reversesId: null },
      ]);
      const result = await service.overview({ limit: 3 });
      expect(result.totalHeld).toBe(5000);
      expect(result.meta.total).toBe(739);
    });

    it('totals nothing when no account exists at all', async () => {
      const result = await service.overview({});
      expect(result.totalHeld).toBe(0);
    });

    it('leaves corrections out of the total too', async () => {
      prisma.pocketMoneyAccount.findMany.mockResolvedValue([{ id: 'acct-1' }]);
      prisma.pocketMoneyTransaction.findMany.mockResolvedValue([
        { id: 't-1', kind: 'DEPOSIT', amount: 10000, reversesId: null },
        { id: 't-2', kind: 'WITHDRAWAL', amount: 500, reversesId: null },
        { id: 't-3', kind: 'REVERSAL', amount: 500, reversesId: 't-2' },
      ]);
      const result = await service.overview({});
      expect(result.totalHeld).toBe(10000);
    });
  });

  /**
   * Resolving whoever is standing at the counter, from a card or a typed
   * number. Handing money to the wrong child is the failure this prevents.
   */
  describe('finding who is at the counter', () => {
    it('refuses an empty scan', async () => {
      await expect(service.findByIdentifier('   ')).rejects.toThrow(
        /nothing was scanned/i,
      );
    });

    it('accepts the student number, the card code or the card itself', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 'student-1' });
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        studentIdNumber: 'STD-2026-001',
        user: { firstName: 'Divine', lastName: 'Niyonkuru', photoUrl: null },
        classSection: { classLevel: { name: 'Senior 1' } },
      });
      prisma.pocketMoneyAccount.upsert.mockResolvedValue(ACCOUNT);
      prisma.pocketMoneyTransaction.findMany.mockResolvedValue([]);

      await service.findByIdentifier('STD-2026-001');
      const or = prisma.student.findFirst.mock.calls[0][0].where.OR;
      expect(JSON.stringify(or)).toContain('studentIdNumber');
      expect(JSON.stringify(or)).toContain('cardCode');
      expect(JSON.stringify(or)).toContain('nfcCardId');
    });

    it('says which code it could not find', async () => {
      prisma.student.findFirst.mockResolvedValue(null);
      await expect(service.findByIdentifier('ABCD-1234')).rejects.toThrow(
        /No student found for "ABCD-1234"/,
      );
    });

    it('ignores stray spaces around a typed number', async () => {
      prisma.student.findFirst.mockResolvedValue(null);
      await expect(service.findByIdentifier('  STD-1  ')).rejects.toThrow(
        /"STD-1"/,
      );
    });
  });
});