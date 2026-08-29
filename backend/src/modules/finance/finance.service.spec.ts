import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { FinanceService } from './finance.service';

/**
 * The fee ledger.
 *
 * The tests here are about the properties that make the book trustworthy
 * rather than about the happy path: a bill is frozen once it is raised, a
 * receipt number is never reused, nothing is erased, and the office cannot
 * write off more than a family owes.
 */
describe('FinanceService', () => {
  const prisma: any = {
    classLevel: { findMany: jest.fn() },
    term: { findUnique: jest.fn() },
    student: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    parentStudent: { findFirst: jest.fn() },
    feeItem: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      createMany: jest.fn(),
    },
    feeInvoice: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    feePayment: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    feeWaiver: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((fn: any) => fn(prisma)),
  };

  const service = new FinanceService(prisma as never);

  const items = [
    {
      id: 'i-1',
      classLevelId: 'lvl-1',
      name: 'Tuition',
      amount: 85000,
      appliesTo: 'ALL',
      position: 0,
    },
    {
      id: 'i-2',
      classLevelId: 'lvl-1',
      name: 'Boarding',
      amount: 60000,
      appliesTo: 'BOARDER',
      position: 1,
    },
    {
      id: 'i-3',
      classLevelId: 'lvl-1',
      name: 'Transport',
      amount: 25000,
      appliesTo: 'DAY',
      position: 2,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
  });

  // ── The price list ────────────────────────────────────────────────────

  describe('the price list', () => {
    it('shows what a boarder and a day student each pay', async () => {
      prisma.classLevel.findMany.mockResolvedValue([
        { id: 'lvl-1', name: 'Senior 1', order: 1 },
      ]);
      prisma.feeItem.findMany.mockResolvedValue(items);

      const [level] = await service.feeStructure('term-1');
      expect(level.boarderTotal).toBe(145000);
      expect(level.dayTotal).toBe(110000);
    });

    it('refuses a line with no name', async () => {
      await expect(
        service.saveFeeItem({
          termId: 't',
          classLevelId: 'l',
          name: '   ',
          amount: 1000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('trims the name it stores', async () => {
      prisma.feeItem.create.mockResolvedValue({});
      await service.saveFeeItem({
        termId: 't',
        classLevelId: 'l',
        name: '  Tuition  ',
        amount: 1000,
      });
      expect(prisma.feeItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Tuition' }),
        }),
      );
    });

    it('says so when the line being changed is gone', async () => {
      prisma.feeItem.findUnique.mockResolvedValue(null);
      await expect(
        service.saveFeeItem({
          id: 'i-1',
          termId: 't',
          classLevelId: 'l',
          name: 'Tuition',
          amount: 1,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('says so when the line being removed is gone', async () => {
      prisma.feeItem.findUnique.mockResolvedValue(null);
      await expect(service.deleteFeeItem('i-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('copying a price list onto another term', () => {
    it('refuses to copy a term onto itself', async () => {
      await expect(service.copyFeeStructure('t-1', 't-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses when there is nothing to copy', async () => {
      prisma.feeItem.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      await expect(service.copyFeeStructure('t-1', 't-2')).rejects.toThrow(
        BadRequestException,
      );
    });

    // A line the target term already has is left as it is: the copy is a
    // convenience, not a way to silently overwrite this term's prices.
    it('leaves a line the target term already has alone', async () => {
      prisma.feeItem.findMany
        .mockResolvedValueOnce(items)
        .mockResolvedValueOnce([{ classLevelId: 'lvl-1', name: 'Tuition' }]);
      const result = await service.copyFeeStructure('t-1', 't-2');
      expect(result).toEqual({ copied: 2, skipped: 1 });
      expect(prisma.feeItem.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ name: 'Boarding', termId: 't-2' }),
        ]),
      });
    });
  });

  // ── Raising bills ─────────────────────────────────────────────────────

  describe('raising the term’s invoices', () => {
    const boarder = {
      id: 'stu-1',
      isBoarder: true,
      classSection: { classLevelId: 'lvl-1' },
    };
    const dayStudent = {
      id: 'stu-2',
      isBoarder: false,
      classSection: { classLevelId: 'lvl-1' },
    };

    beforeEach(() => {
      prisma.term.findUnique.mockResolvedValue({ id: 'term-1' });
      prisma.student.findMany.mockResolvedValue([boarder, dayStudent]);
      prisma.feeItem.findMany.mockResolvedValue(items);
      prisma.feeInvoice.findMany.mockResolvedValue([]);
      prisma.feeInvoice.create.mockResolvedValue({});
    });

    it('bills each student for what their own lines come to', async () => {
      const result = await service.raiseInvoices('term-1');
      expect(result.raised).toBe(2);
      const totals = prisma.feeInvoice.create.mock.calls.map(
        (c: any[]) => c[0].data.total,
      );
      expect(totals).toEqual([145000, 110000]);
    });

    /*
      The lines are copied onto the invoice, not referenced. A price changed
      in March must not rewrite a bill sent in January.
    */
    it('copies the lines onto the invoice rather than pointing at them', async () => {
      await service.raiseInvoices('term-1');
      const first = prisma.feeInvoice.create.mock.calls[0][0].data;
      expect(first.lines.create).toEqual([
        { name: 'Tuition', amount: 85000, position: 0 },
        { name: 'Boarding', amount: 60000, position: 1 },
      ]);
    });

    /**
     * Re-raising over a bill that already has payments against it would
     * change what a family was asked for after they started paying it, which
     * is the one thing an invoice exists to prevent.
     */
    it('leaves a student who already has an invoice alone', async () => {
      prisma.feeInvoice.findMany.mockResolvedValue([{ studentId: 'stu-1' }]);
      const result = await service.raiseInvoices('term-1');
      expect(result).toMatchObject({ raised: 1, alreadyInvoiced: 1 });
      expect(prisma.feeInvoice.create).toHaveBeenCalledTimes(1);
    });

    /*
      A whole year group with no price list is exactly the sort of thing
      nobody notices until March, so it is counted and reported back.
    */
    it('reports students whose class level has no price list', async () => {
      prisma.student.findMany.mockResolvedValue([
        boarder,
        {
          id: 'stu-3',
          isBoarder: false,
          classSection: { classLevelId: 'lvl-9' },
        },
      ]);
      const result = await service.raiseInvoices('term-1');
      expect(result).toMatchObject({ raised: 1, withoutStructure: 1 });
    });

    it('refuses when the term has no fee lines at all', async () => {
      prisma.feeItem.findMany.mockResolvedValue([]);
      await expect(service.raiseInvoices('term-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('says so when the term does not exist', async () => {
      prisma.term.findUnique.mockResolvedValue(null);
      await expect(service.raiseInvoices('nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('bills one class when asked for one class', async () => {
      await service.raiseInvoices('term-1', 'sec-1');
      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ classSectionId: 'sec-1' }),
        }),
      );
    });
  });

  // ── Money in ──────────────────────────────────────────────────────────

  describe('taking a payment', () => {
    beforeEach(() => {
      prisma.feeInvoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        total: 195000,
      });
      prisma.feePayment.findFirst.mockResolvedValue(null);
      prisma.feePayment.create.mockResolvedValue({ id: 'pay-1' });
    });

    it('refuses when the student has no invoice for that term', async () => {
      prisma.feeInvoice.findUnique.mockResolvedValue(null);
      await expect(
        service.recordPayment(
          {
            studentId: 's',
            termId: 't',
            amount: 1000,
            method: 'CASH',
          } as never,
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('issues the first receipt of the year', async () => {
      await service.recordPayment(
        {
          studentId: 's',
          termId: 't',
          amount: 75000,
          method: 'MOBILE_MONEY',
          paidAt: '2026-02-12',
        } as never,
        'user-1',
      );
      expect(prisma.feePayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ receiptNumber: 'RCT-2026-0001' }),
        }),
      );
    });

    it('follows on from the last receipt issued', async () => {
      prisma.feePayment.findFirst.mockResolvedValue({
        receiptNumber: 'RCT-2026-0340',
      });
      await service.recordPayment(
        {
          studentId: 's',
          termId: 't',
          amount: 1000,
          method: 'CASH',
          paidAt: '2026-02-12',
        } as never,
        'user-1',
      );
      expect(prisma.feePayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ receiptNumber: 'RCT-2026-0341' }),
        }),
      );
    });

    /*
      Drawn inside the write, so two people at the counter cannot be handed
      the same number.
    */
    it('draws the number inside the transaction', async () => {
      await service.recordPayment(
        { studentId: 's', termId: 't', amount: 1000, method: 'CASH' } as never,
        'user-1',
      );
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('records who took it', async () => {
      await service.recordPayment(
        { studentId: 's', termId: 't', amount: 1000, method: 'CASH' } as never,
        'bursar-1',
      );
      expect(prisma.feePayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ recordedByUserId: 'bursar-1' }),
        }),
      );
    });

    it('stores an empty reference as nothing rather than as blank', async () => {
      await service.recordPayment(
        {
          studentId: 's',
          termId: 't',
          amount: 1000,
          method: 'CASH',
          reference: '  ',
        } as never,
        'user-1',
      );
      expect(prisma.feePayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reference: null }),
        }),
      );
    });

    it('refuses a date it cannot read', async () => {
      await expect(
        service.recordPayment(
          {
            studentId: 's',
            termId: 't',
            amount: 1000,
            method: 'CASH',
            paidAt: 'last Tuesday',
          } as never,
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('voiding a receipt', () => {
    it('says so when the receipt is not there', async () => {
      prisma.feePayment.findUnique.mockResolvedValue(null);
      await expect(service.voidPayment('p-1', 'typo', 'u-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    /*
      The second reason would overwrite the first, and the record of what
      happened would be whichever was typed last.
    */
    it('refuses to void a receipt that is already void', async () => {
      prisma.feePayment.findUnique.mockResolvedValue({
        id: 'p-1',
        voidedAt: new Date(),
      });
      await expect(service.voidPayment('p-1', 'again', 'u-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('keeps the entry, with a reason and a name against it', async () => {
      prisma.feePayment.findUnique.mockResolvedValue({
        id: 'p-1',
        voidedAt: null,
      });
      prisma.feePayment.update.mockResolvedValue({});
      await service.voidPayment('p-1', 'Entered twice', 'bursar-1');
      expect(prisma.feePayment.update).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        data: expect.objectContaining({
          voidedByUserId: 'bursar-1',
          voidReason: 'Entered twice',
          voidedAt: expect.any(Date),
        }),
      });
    });
  });

  // ── Amounts not being collected ───────────────────────────────────────

  describe('writing part of a bill off', () => {
    beforeEach(() => {
      prisma.feeInvoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        total: 195000,
        payments: [{ amount: 120000, voidedAt: null }],
        waivers: [],
      });
      prisma.feeWaiver.create.mockResolvedValue({});
    });

    it('records the kind, the amount and who granted it', async () => {
      await service.grantWaiver(
        {
          studentId: 's',
          termId: 't',
          kind: 'BURSARY',
          amount: 75000,
          reason: 'District bursary',
        } as never,
        'bursar-1',
      );
      expect(prisma.feeWaiver.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          kind: 'BURSARY',
          amount: 75000,
          reason: 'District bursary',
          grantedByUserId: 'bursar-1',
        }),
      });
    });

    /**
     * Waiving more than is owed is always a slip, and letting it through
     * leaves the school's written-off total overstated.
     */
    it('refuses to write off more than is still owed', async () => {
      await expect(
        service.grantWaiver(
          {
            studentId: 's',
            termId: 't',
            kind: 'BURSARY',
            amount: 80000,
            reason: 'x',
          } as never,
          'bursar-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('says how much was actually owed when it refuses', async () => {
      await expect(
        service.grantWaiver(
          {
            studentId: 's',
            termId: 't',
            kind: 'BURSARY',
            amount: 80000,
            reason: 'x',
          } as never,
          'bursar-1',
        ),
      ).rejects.toThrow(/75,000/);
    });

    it('allows a waiver for exactly what is owed', async () => {
      await service.grantWaiver(
        {
          studentId: 's',
          termId: 't',
          kind: 'BURSARY',
          amount: 75000,
          reason: 'x',
        } as never,
        'bursar-1',
      );
      expect(prisma.feeWaiver.create).toHaveBeenCalled();
    });

    it('refuses when there is no invoice to write off against', async () => {
      prisma.feeInvoice.findUnique.mockResolvedValue(null);
      await expect(
        service.grantWaiver(
          {
            studentId: 's',
            termId: 't',
            kind: 'BURSARY',
            amount: 1000,
            reason: 'x',
          } as never,
          'u',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('withdrawing a waiver', () => {
    it('says so when it is not there', async () => {
      prisma.feeWaiver.findUnique.mockResolvedValue(null);
      await expect(service.revokeWaiver('w-1', 'x', 'u')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses to withdraw one that is already withdrawn', async () => {
      prisma.feeWaiver.findUnique.mockResolvedValue({ revokedAt: new Date() });
      await expect(service.revokeWaiver('w-1', 'x', 'u')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('keeps the entry, with a reason and a name against it', async () => {
      prisma.feeWaiver.findUnique.mockResolvedValue({ revokedAt: null });
      prisma.feeWaiver.update.mockResolvedValue({});
      await service.revokeWaiver('w-1', 'Sponsor withdrew', 'bursar-1');
      expect(prisma.feeWaiver.update).toHaveBeenCalledWith({
        where: { id: 'w-1' },
        data: expect.objectContaining({
          revokedByUserId: 'bursar-1',
          revokeReason: 'Sponsor withdrew',
        }),
      });
    });
  });

  // ── Reading ───────────────────────────────────────────────────────────

  describe('the register', () => {
    const row = (id: string, invoices: any[]) => ({
      id,
      studentIdNumber: `STD-2026-${id}`,
      isBoarder: true,
      user: { firstName: 'Aline', lastName: 'Uwase', photoUrl: null },
      classSection: { id: 'sec-1', name: 'S1 A' },
      feeInvoices: invoices,
    });

    const invoice = (total: number, paid: number) => ({
      id: 'inv',
      total,
      payments: paid ? [{ amount: paid, voidedAt: null }] : [],
      waivers: [],
    });

    it('gives every student a standing and a status', async () => {
      prisma.student.findMany.mockResolvedValue([
        row('a', [invoice(195000, 195000)]),
        row('b', [invoice(195000, 120000)]),
        row('c', []),
      ]);
      const result = await service.register({ termId: 'term-1' });
      // Ordered by what is owed, so the part-paid account leads.
      expect(result.data.map((r: any) => r.status)).toEqual([
        'PART_PAID',
        'CLEARED',
        'NOT_INVOICED',
      ]);
    });

    /*
      Filtered in code rather than in SQL: the status is worked out from the
      entries, and duplicating that arithmetic in a query is how the two come
      to disagree.
    */
    it('narrows to one status when asked', async () => {
      prisma.student.findMany.mockResolvedValue([
        row('a', [invoice(195000, 195000)]),
        row('b', [invoice(195000, 0)]),
      ]);
      const result = await service.register({
        termId: 'term-1',
        status: 'UNPAID',
      });
      expect(result.total).toBe(1);
      expect(result.data[0].student.id).toBe('b');
    });

    /**
     * A bursar opens this page to find out who to chase, and alphabetical
     * order buries the four families owing two hundred thousand among six
     * hundred who owe nothing.
     */
    it('puts the biggest debts at the top', async () => {
      prisma.student.findMany.mockResolvedValue([
        row('a', [invoice(200000, 190000)]), // owes 10,000
        row('b', [invoice(200000, 0)]), // owes 200,000
        row('c', [invoice(200000, 200000)]), // owes nothing
        row('d', [invoice(200000, 120000)]), // owes 80,000
      ]);
      const result = await service.register({ termId: 'term-1' });
      expect(result.data.map((r: any) => r.standing?.balance)).toEqual([
        200000, 80000, 10000, 0,
      ]);
    });

    /*
      Everybody level on balance keeps the name order the query returned, so a
      page of settled accounts is still something a person can read down.
    */
    it('leaves accounts level on balance in the order they came', async () => {
      prisma.student.findMany.mockResolvedValue([
        row('first', [invoice(1000, 1000)]),
        row('second', [invoice(1000, 1000)]),
        row('third', [invoice(1000, 1000)]),
      ]);
      const result = await service.register({ termId: 'term-1' });
      expect(result.data.map((r: any) => r.student.id)).toEqual([
        'first',
        'second',
        'third',
      ]);
    });

    // A student nobody has billed owes nothing yet, so they sit with the
    // settled accounts rather than at the top of the chasing list.
    it('does not put an unbilled student above a real debt', async () => {
      prisma.student.findMany.mockResolvedValue([
        row('unbilled', []),
        row('owing', [invoice(200000, 0)]),
      ]);
      const result = await service.register({ termId: 'term-1' });
      expect(result.data.map((r: any) => r.student.id)).toEqual([
        'owing',
        'unbilled',
      ]);
    });

    it('pages through the list', async () => {
      // All level on balance, so paging is not tangled up with the ordering.
      prisma.student.findMany.mockResolvedValue(
        ['a', 'b', 'c'].map((id) => row(id, [invoice(1000, 0)])),
      );
      const result = await service.register({
        termId: 'term-1',
        page: 2,
        limit: 2,
      });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(3);
    });

    it('searches by name or student number', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      await service.register({ termId: 'term-1', search: 'Uwase' });
      const where = prisma.student.findMany.mock.calls[0][0].where;
      expect(JSON.stringify(where)).toContain('Uwase');
    });
  });

  describe('the term at a glance', () => {
    it('adds up what was billed, collected, waived and is still out', async () => {
      prisma.feeInvoice.findMany.mockResolvedValue([
        {
          total: 100000,
          payments: [{ amount: 100000, voidedAt: null }],
          waivers: [],
        },
        {
          total: 100000,
          payments: [{ amount: 40000, voidedAt: null }],
          waivers: [],
        },
        {
          total: 100000,
          payments: [],
          waivers: [{ amount: 100000, revokedAt: null }],
        },
      ]);
      prisma.student.count.mockResolvedValue(5);
      prisma.term.findUnique.mockResolvedValue({
        id: 'term-1',
        name: 'Term 1',
      });

      const summary = await service.summary('term-1');
      expect(summary).toMatchObject({
        invoiced: 300000,
        collected: 140000,
        waived: 100000,
        outstanding: 60000,
        cleared: 2,
        owing: 1,
      });
    });

    // The number that says the office has not finished raising the bills.
    it('counts the students with no bill at all', async () => {
      prisma.feeInvoice.findMany.mockResolvedValue([
        { total: 1000, payments: [], waivers: [] },
      ]);
      prisma.student.count.mockResolvedValue(30);
      prisma.term.findUnique.mockResolvedValue({});
      expect((await service.summary('term-1')).notInvoiced).toBe(29);
    });

    it('reports a term nobody was billed for as fully collected', async () => {
      prisma.feeInvoice.findMany.mockResolvedValue([]);
      prisma.student.count.mockResolvedValue(0);
      prisma.term.findUnique.mockResolvedValue({});
      expect((await service.summary('term-1')).collectionRate).toBe(1);
    });
  });

  describe('one account', () => {
    it('says so when the student does not exist', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await expect(service.account('nope', 'term-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('reads as not invoiced when no bill was raised', async () => {
      prisma.student.findUnique.mockResolvedValue({ id: 's' });
      prisma.feeInvoice.findUnique.mockResolvedValue(null);
      const account = await service.account('s', 'term-1');
      expect(account).toMatchObject({ standing: null, status: 'NOT_INVOICED' });
    });
  });

  describe('a student’s whole history', () => {
    it('gives each term its own standing', async () => {
      prisma.feeInvoice.findMany.mockResolvedValue([
        {
          id: 'inv-2',
          total: 100000,
          term: { id: 't-2', name: 'Term 2' },
          payments: [{ amount: 40000, voidedAt: null }],
          waivers: [],
        },
        {
          id: 'inv-1',
          total: 100000,
          term: { id: 't-1', name: 'Term 1' },
          payments: [{ amount: 100000, voidedAt: null }],
          waivers: [],
        },
      ]);
      const history = await service.history('stu-1');
      expect(history.map((h) => h.status)).toEqual(['PART_PAID', 'CLEARED']);
    });
  });

  // ── Who may look ──────────────────────────────────────────────────────

  describe('who may see an account', () => {
    it.each(['ADMIN', 'BURSAR'])('lets a %s see any of them', async (role) => {
      await expect(
        service.assertMayViewAccount('u-1', role, 'stu-1'),
      ).resolves.toBeUndefined();
    });

    it('lets a student see their own', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 'stu-1' });
      await expect(
        service.assertMayViewAccount('u-1', 'STUDENT', 'stu-1'),
      ).resolves.toBeUndefined();
    });

    it('stops a student reading somebody else’s', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 'stu-9' });
      await expect(
        service.assertMayViewAccount('u-1', 'STUDENT', 'stu-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets a parent see their own child’s', async () => {
      prisma.parentStudent.findFirst.mockResolvedValue({ id: 'link-1' });
      await expect(
        service.assertMayViewAccount('u-1', 'PARENT', 'stu-1'),
      ).resolves.toBeUndefined();
    });

    it('stops a parent reading another family’s', async () => {
      prisma.parentStudent.findFirst.mockResolvedValue(null);
      await expect(
        service.assertMayViewAccount('u-1', 'PARENT', 'stu-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    /**
     * Whether a family has paid is not a teacher's business, and the
     * staffroom is exactly where that becomes a child's problem.
     */
    it('stops a teacher reading any of them', async () => {
      await expect(
        service.assertMayViewAccount('u-1', 'TEACHER', 'stu-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
