import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LibraryService } from './library.service';
import { NotificationsService } from '../notifications/notifications.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

/**
 * The library desk.
 *
 * The available count is the number a librarian trusts when a student asks
 * whether a book is in. It is derived from nothing: it is stored, and it moves
 * only alongside the loan that moved it. Every test here is about it staying
 * true.
 */
/* The delivery queue. Whether a message is sent is tested where the worker
   lives; here it only has to accept the job. */
const delivery = {
  email: jest.fn().mockResolvedValue(undefined),
  sms: jest.fn().mockResolvedValue(undefined),
};

describe('LibraryService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let notifications: { send: jest.Mock };
  let service: LibraryService;

  beforeEach(() => {
    prisma = createMockPrisma();
    notifications = { send: jest.fn().mockResolvedValue({}) };
    service = new LibraryService(
      prisma,
      notifications as unknown as NotificationsService,
      delivery as never,
    );
    prisma.schoolConfig.findUnique.mockResolvedValue(null);
    prisma.bookLoan.count.mockResolvedValue(0);
    prisma.bookLoan.create.mockResolvedValue({ id: 'loan-1' });
    prisma.book.update.mockResolvedValue({});
  });

  const book = (over: Record<string, unknown> = {}) => ({
    id: 'book-1',
    title: 'Things Fall Apart',
    barcode: 'BK-001',
    quantity: 5,
    availableCount: 3,
    replacementCost: 8000,
    ...over,
  });

  const student = {
    id: 'student-1',
    studentIdNumber: 'STD-2026-001',
    user: { id: 'user-1', firstName: 'Divine', lastName: 'Niyonkuru' },
  };

  describe('the catalogue', () => {
    it('sets a new title fully available', async () => {
      prisma.book.create.mockResolvedValue({});
      await service.createBook({ title: 'X', quantity: 5 } as never);
      expect(prisma.book.create.mock.calls[0][0].data).toMatchObject({
        quantity: 5,
        availableCount: 5,
      });
    });

    /**
     * Copies on loan are already out of the building. Changing the total has
     * to keep them counted, or the shelf number goes wrong the moment
     * somebody buys a replacement copy.
     */
    it('keeps the copies that are out when the total changes', async () => {
      prisma.book.findUnique.mockResolvedValue(
        book({ quantity: 5, availableCount: 3 }),
      );
      await service.updateBook('book-1', { quantity: 8 });
      // Two are out, so eight in stock means six on the shelf.
      expect(prisma.book.update.mock.calls[0][0].data.availableCount).toBe(6);
    });

    it('never lets the shelf count go negative', async () => {
      prisma.book.findUnique.mockResolvedValue(
        book({ quantity: 5, availableCount: 0 }),
      );
      await service.updateBook('book-1', { quantity: 2 });
      expect(prisma.book.update.mock.calls[0][0].data.availableCount).toBe(0);
    });

    it('leaves the shelf count alone when only the title changed', async () => {
      prisma.book.findUnique.mockResolvedValue(book());
      await service.updateBook('book-1', { title: 'Corrected' });
      expect(prisma.book.update.mock.calls[0][0].data.availableCount).toBe(3);
    });

    it('refuses to change a title that does not exist', async () => {
      prisma.book.findUnique.mockResolvedValue(null);
      await expect(service.updateBook('nope', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    // A book somebody is holding cannot be struck off the catalogue, or the
    // loan points at nothing when they bring it back.
    it('refuses to remove a title that is out on loan', async () => {
      prisma.book.findUnique.mockResolvedValue({
        ...book(),
        loans: [{ id: 'l-1' }],
      });
      await expect(service.deleteBook('book-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.book.delete).not.toHaveBeenCalled();
    });

    it('removes one that is all on the shelf', async () => {
      prisma.book.findUnique.mockResolvedValue({ ...book(), loans: [] });
      prisma.book.delete.mockResolvedValue({});
      await expect(service.deleteBook('book-1')).resolves.toBeDefined();
    });

    it('imports a shelf at a time', async () => {
      prisma.book.create.mockResolvedValue({});
      const result = await service.bulkImport({
        books: [
          { title: 'A', quantity: 2 },
          { title: 'B', quantity: 1 },
        ],
      } as never);
      expect(result.count).toBe(2);
    });

    it('searches the title, the author and the ISBN', async () => {
      prisma.book.findMany.mockResolvedValue([]);
      prisma.book.count.mockResolvedValue(0);
      await service.findAll({ search: 'Achebe' });
      const or = JSON.stringify(prisma.book.findMany.mock.calls[0][0].where.OR);
      expect(or).toContain('title');
      expect(or).toContain('author');
      expect(or).toContain('isbn');
    });

    it('shows only what is on the shelf when asked', async () => {
      prisma.book.findMany.mockResolvedValue([]);
      prisma.book.count.mockResolvedValue(0);
      await service.findAll({ available: true });
      expect(
        prisma.book.findMany.mock.calls[0][0].where.availableCount,
      ).toEqual({ gt: 0 });
    });

    it('refuses one title that does not exist', async () => {
      prisma.book.findUnique.mockResolvedValue(null);
      prisma.book.findFirst.mockResolvedValue(null);
      await expect(service.findById('nope')).rejects.toThrow(NotFoundException);
    });
  });

  /**
   * Lending. The count and the loan move together or the shelf number lies.
   */
  describe('lending a book out', () => {
    beforeEach(() => {
      prisma.book.findFirst.mockResolvedValue(book());
      prisma.student.findFirst.mockResolvedValue(student);
    });

    it('refuses a book nobody has', async () => {
      prisma.book.findFirst.mockResolvedValue(null);
      prisma.book.findUnique.mockResolvedValue(null);
      await expect(
        service.checkout({
          bookIdentifier: 'nope',
          studentIdentifier: 'STD-2026-001',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses a book with nothing on the shelf', async () => {
      prisma.book.findFirst.mockResolvedValue(book({ availableCount: 0 }));
      await expect(
        service.checkout({
          bookIdentifier: 'BK-001',
          studentIdentifier: 'STD-2026-001',
        }),
      ).rejects.toThrow(/no copies available/i);
    });

    it('refuses a student nobody has', async () => {
      prisma.student.findFirst.mockResolvedValue(null);
      await expect(
        service.checkout({
          bookIdentifier: 'BK-001',
          studentIdentifier: 'nope',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('takes one off the shelf as the loan is written', async () => {
      await service.checkout({
        bookIdentifier: 'BK-001',
        studentIdentifier: 'STD-2026-001',
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.book.update.mock.calls[0][0].data).toEqual({
        availableCount: { decrement: 1 },
      });
    });

    it('refuses a student already at their limit', async () => {
      prisma.bookLoan.count.mockResolvedValue(3);
      await expect(
        service.checkout({
          bookIdentifier: 'BK-001',
          studentIdentifier: 'STD-2026-001',
        }),
      ).rejects.toThrow(/borrowing limit reached \(3 books\)/i);
    });

    it('uses the limit the school set', async () => {
      prisma.schoolConfig.findUnique.mockResolvedValue({ value: '5' });
      prisma.bookLoan.count.mockResolvedValue(5);
      await expect(
        service.checkout({
          bookIdentifier: 'BK-001',
          studentIdentifier: 'STD-2026-001',
        }),
      ).rejects.toThrow(/\(5 books\)/);
    });

    // Lending to somebody already holding an overdue book is how a library
    // loses its stock one student at a time.
    it('refuses a student holding something overdue', async () => {
      prisma.bookLoan.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
      await expect(
        service.checkout({
          bookIdentifier: 'BK-001',
          studentIdentifier: 'STD-2026-001',
        }),
      ).rejects.toThrow(/has overdue books/i);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('sets a due date the school’s number of days out', async () => {
      prisma.schoolConfig.findUnique.mockResolvedValue({ value: '7' });
      await service.checkout({
        bookIdentifier: 'BK-001',
        studentIdentifier: 'STD-2026-001',
      });
      const due: Date = prisma.bookLoan.create.mock.calls[0][0].data.dueDate;
      const days = Math.round((due.getTime() - Date.now()) / 86400000);
      expect(days).toBe(7);
    });

    it('records what the copy is worth, in case it never comes back', async () => {
      await service.checkout({
        bookIdentifier: 'BK-001',
        studentIdentifier: 'STD-2026-001',
      });
      expect(prisma.bookLoan.create.mock.calls[0][0].data.replacementCost).toBe(
        8000,
      );
    });

    // A barcode is what a scanner sends. An id is what the web sends.
    it('finds a book by its barcode', async () => {
      await service.checkout({
        bookIdentifier: 'BK-001',
        studentIdentifier: 'STD-2026-001',
      });
      expect(prisma.book.findFirst.mock.calls[0][0].where.barcode).toBe(
        'BK-001',
      );
    });

    it('falls back to the id when no barcode matched', async () => {
      prisma.book.findFirst.mockResolvedValue(null);
      prisma.book.findUnique.mockResolvedValue(book());
      await service.checkout({
        bookIdentifier: 'book-1',
        studentIdentifier: 'STD-2026-001',
      });
      expect(prisma.book.findUnique).toHaveBeenCalled();
    });

    // A scanner can send anything. A malformed id must be "not found", not a
    // 500 at the desk with a queue behind it.
    it('says not found rather than failing on a nonsense identifier', async () => {
      prisma.book.findFirst.mockResolvedValue(null);
      prisma.book.findUnique.mockRejectedValue(new Error('Invalid UUID'));
      await expect(
        service.checkout({
          bookIdentifier: '!!!',
          studentIdentifier: 'STD-2026-001',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('taking a book back', () => {
    beforeEach(() => {
      prisma.book.findFirst.mockResolvedValue(book());
      prisma.bookLoan.update.mockResolvedValue({ id: 'loan-1' });
    });

    it('refuses a book nobody has', async () => {
      prisma.book.findFirst.mockResolvedValue(null);
      prisma.book.findUnique.mockResolvedValue(null);
      await expect(
        service.returnBook({ bookIdentifier: 'nope' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses a book that is not out', async () => {
      prisma.bookLoan.findFirst.mockResolvedValue(null);
      await expect(
        service.returnBook({ bookIdentifier: 'BK-001' }),
      ).rejects.toThrow(/no active loan/i);
    });

    it('puts one back on the shelf as the loan is closed', async () => {
      prisma.bookLoan.findFirst.mockResolvedValue({ id: 'loan-1' });
      await service.returnBook({ bookIdentifier: 'BK-001' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.book.update.mock.calls[0][0].data).toEqual({
        availableCount: { increment: 1 },
      });
      expect(prisma.bookLoan.update.mock.calls[0][0].data).toMatchObject({
        status: 'RETURNED',
      });
    });

    /**
     * Several copies of one title can be out at once. Closing the oldest loan
     * first is what keeps the overdue list honest.
     */
    it('closes the oldest loan of that title first', async () => {
      prisma.bookLoan.findFirst.mockResolvedValue({ id: 'loan-1' });
      await service.returnBook({ bookIdentifier: 'BK-001' });
      expect(prisma.bookLoan.findFirst.mock.calls[0][0].orderBy).toEqual({
        checkedOutAt: 'asc',
      });
    });
  });

  describe('a book reported lost', () => {
    it('refuses a loan nobody has', async () => {
      prisma.bookLoan.findUnique.mockResolvedValue(null);
      await expect(service.reportLost('nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses a loan that was already closed', async () => {
      prisma.bookLoan.findUnique.mockResolvedValue({
        id: 'loan-1',
        status: 'RETURNED',
        book: book(),
      });
      await expect(service.reportLost('loan-1')).rejects.toThrow(/not active/i);
    });

    /**
     * A lost copy does not go back on the shelf. Incrementing the count would
     * mean lending a book that is gone.
     */
    it('does not put the copy back on the shelf', async () => {
      prisma.bookLoan.findUnique.mockResolvedValue({
        id: 'loan-1',
        status: 'ACTIVE',
        book: book(),
      });
      prisma.bookLoan.update.mockResolvedValue({});
      await service.reportLost('loan-1');
      expect(prisma.book.update).not.toHaveBeenCalled();
      expect(prisma.bookLoan.update.mock.calls[0][0].data.status).toBe('LOST');
    });

    it('records what the school is owed for it', async () => {
      prisma.bookLoan.findUnique.mockResolvedValue({
        id: 'loan-1',
        status: 'ACTIVE',
        book: book({ replacementCost: 12000 }),
      });
      prisma.bookLoan.update.mockResolvedValue({});
      await service.reportLost('loan-1');
      expect(prisma.bookLoan.update.mock.calls[0][0].data.replacementCost).toBe(
        12000,
      );
    });
  });

  /**
   * There is no OVERDUE status. A loan stays ACTIVE past its due date, so
   * overdue is a date comparison and never a status check.
   */
  describe('what is out and what is late', () => {
    beforeEach(() => prisma.bookLoan.findMany.mockResolvedValue([]));

    it('reads overdue as still out and past its date', async () => {
      await service.getOverdueLoans();
      const where = prisma.bookLoan.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('ACTIVE');
      expect(where.dueDate.lt).toBeInstanceOf(Date);
    });

    it('reads the soonest due first', async () => {
      await service.getActiveLoans();
      expect(prisma.bookLoan.findMany.mock.calls[0][0].orderBy).toEqual({
        dueDate: 'asc',
      });
    });

    it('reads one person’s loans newest first', async () => {
      await service.getUserLoans('user-1');
      expect(prisma.bookLoan.findMany.mock.calls[0][0].orderBy).toEqual({
        checkedOutAt: 'desc',
      });
    });

    // A reminder about a book already overdue is not a reminder. The window
    // is from now to two days out.
    it('reminds about books due within two days, not ones already late', async () => {
      await service.getDueReminders();
      const due = prisma.bookLoan.findMany.mock.calls[0][0].where.dueDate;
      const days = Math.round(
        (due.lte.getTime() - due.gte.getTime()) / 86400000,
      );
      expect(days).toBe(2);
    });

    it('writes to every borrower with something due', async () => {
      prisma.bookLoan.findMany.mockResolvedValue([
        {
          id: 'loan-1',
          borrowerUserId: 'user-1',
          dueDate: new Date('2026-08-25'),
          book: { title: 'Things Fall Apart' },
        },
      ]);
      const result = await service.sendDueReminders();
      expect(result.sent).toBe(1);
      expect(notifications.send.mock.calls[0][0].message).toContain(
        'Things Fall Apart',
      );
    });

    it('sends nothing when nothing is due', async () => {
      const result = await service.sendDueReminders();
      expect(result.sent).toBe(0);
      expect(notifications.send).not.toHaveBeenCalled();
    });
  });

  describe('how the library is used', () => {
    beforeEach(() => {
      prisma.book.count.mockResolvedValue(56);
      prisma.book.aggregate.mockResolvedValue({
        _sum: { quantity: 200, availableCount: 170 },
      });
      prisma.bookLoan.count.mockResolvedValue(0);
      prisma.bookLoan.groupBy.mockResolvedValue([]);
      prisma.book.groupBy.mockResolvedValue([]);
    });

    it('reports the overdue share of what is out', async () => {
      prisma.bookLoan.count
        .mockResolvedValueOnce(24)
        .mockResolvedValueOnce(6)
        .mockResolvedValueOnce(2);
      const stats = await service.getAnalytics();
      expect(stats).toMatchObject({
        activeLoans: 24,
        overdueLoans: 6,
        lostBooks: 2,
        overdueRate: 25,
      });
    });

    it('reports zero rather than dividing by nothing on loan', async () => {
      const stats = await service.getAnalytics();
      expect(stats.overdueRate).toBe(0);
    });

    it('names the most borrowed titles', async () => {
      prisma.bookLoan.groupBy.mockResolvedValue([
        { bookId: 'book-1', _count: 9 },
      ]);
      prisma.book.findUnique.mockResolvedValue({
        title: 'Things Fall Apart',
        author: 'Achebe',
      });
      const stats = await service.getAnalytics();
      expect(stats.popularBooks[0]).toEqual({
        title: 'Things Fall Apart',
        author: 'Achebe',
        loanCount: 9,
      });
    });

    // A shelf with no category set is still a shelf, and dropping it would
    // make the totals disagree with the catalogue.
    it('calls an unset category "Uncategorized" rather than hiding it', async () => {
      prisma.book.groupBy.mockResolvedValue([
        { category: null, _count: 4, _sum: { quantity: 12 } },
      ]);
      const stats = await service.getAnalytics();
      expect(stats.categories[0]).toEqual({
        category: 'Uncategorized',
        count: 4,
        totalCopies: 12,
      });
    });

    it('reports zero copies rather than nothing when a sum is empty', async () => {
      prisma.book.aggregate.mockResolvedValue({
        _sum: { quantity: null, availableCount: null },
      });
      const stats = await service.getAnalytics();
      expect(stats.totalCopies).toBe(0);
      expect(stats.availableCopies).toBe(0);
    });
  });
});

/**
 * The catalogue read back with the filters a librarian uses.
 *
 * A category filter is how somebody finds the science shelf, and a book that
 * has since been removed is what a stale list gives back. Both have to behave
 * rather than throwing at a counter with a queue in front of it.
 */
describe('finding a book, and failing to', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: LibraryService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new LibraryService(
      prisma,
      { send: jest.fn() } as unknown as NotificationsService,
      delivery as never,
    );
    prisma.book.findMany.mockResolvedValue([]);
    prisma.book.count.mockResolvedValue(0);
    prisma.book.findUnique.mockResolvedValue(null);
    prisma.book.findFirst.mockResolvedValue(null);
  });

  it('narrows to one shelf when a category is named', async () => {
    await service.findAll({ category: 'SCIENCE' });

    expect(prisma.book.findMany.mock.calls[0][0].where.category).toBe(
      'SCIENCE',
    );
  });

  it('shows the whole catalogue when none is', async () => {
    await service.findAll({});

    expect(
      prisma.book.findMany.mock.calls[0][0].where.category,
    ).toBeUndefined();
  });

  it('refuses to read a book that is not there', async () => {
    await expect(service.findById('gone')).rejects.toThrow(NotFoundException);
  });

  it('refuses to delete one that is not there', async () => {
    await expect(service.deleteBook('gone')).rejects.toThrow(NotFoundException);
  });

  it('refuses to change one that is not there', async () => {
    await expect(service.updateBook('gone', { title: 'x' })).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('the shelves in a catalogue nobody has categorised', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: LibraryService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new LibraryService(
      prisma,
      { send: jest.fn() } as unknown as NotificationsService,
      delivery as never,
    );
    prisma.book.count.mockResolvedValue(0);
    prisma.book.aggregate.mockResolvedValue({ _sum: {} });
    prisma.bookLoan.count.mockResolvedValue(0);
    prisma.bookLoan.groupBy.mockResolvedValue([]);
    prisma.book.findMany.mockResolvedValue([]);
  });

  it('counts nought copies for a shelf the sum came back empty for', async () => {
    prisma.book.groupBy.mockResolvedValue([
      { category: null, _count: 3, _sum: { quantity: null } },
    ]);

    const stats = await service.getAnalytics();
    expect(stats.categories[0]).toMatchObject({
      category: 'Uncategorized',
      count: 3,
      totalCopies: 0,
    });
  });

  it('counts the copies when the sum came back with a number', async () => {
    prisma.book.groupBy.mockResolvedValue([
      { category: 'SCIENCE', _count: 3, _sum: { quantity: 12 } },
    ]);

    const stats = await service.getAnalytics();
    expect(stats.categories[0]).toMatchObject({
      category: 'SCIENCE',
      totalCopies: 12,
    });
  });

  /**
   * Reminding everybody holding an overdue book.
   *
   * The overdue list has been readable since this module was written, and
   * there was no way to act on it: a librarian could see six books were late
   * and had to chase each borrower by hand.
   */
  describe('chasing overdue books', () => {
    const loan = (id: string, borrowerId: string, title: string, over: Record<string, unknown> = {}) => ({
      id,
      dueDate: new Date('2026-08-01'),
      book: { title, author: 'Somebody' },
      borrower: {
        id: borrowerId,
        firstName: 'Divine',
        lastName: 'Uwase',
        email: `${borrowerId}@markova.edu`,
        phone: '+250788000001',
        ...(over.borrower as object ?? {}),
      },
    });

    beforeEach(() => {
      delivery.email.mockClear();
      delivery.sms.mockClear();
    });

    it('says so plainly when nothing is overdue', async () => {
      prisma.bookLoan.findMany.mockResolvedValue([]);
      const out = await service.remindOverdue();
      expect(out.reminded).toBe(0);
      expect(out.message).toMatch(/Nothing is overdue/i);
      expect(delivery.email).not.toHaveBeenCalled();
    });

    /* One message per person, not per book. A student with three late books
       is one conversation, not three emails. */
    it('sends one message to somebody holding three books', async () => {
      prisma.bookLoan.findMany.mockResolvedValue([
        loan('l-1', 'u-1', 'A Grain of Wheat'),
        loan('l-2', 'u-1', 'Baking Cakes in Kigali'),
        loan('l-3', 'u-1', 'Biology'),
      ]);
      const out = await service.remindOverdue();
      expect(delivery.email).toHaveBeenCalledTimes(1);
      expect(out.reminded).toBe(1);
      expect(out.overdue).toBe(3);
    });

    it('lists every title in that one message', async () => {
      prisma.bookLoan.findMany.mockResolvedValue([
        loan('l-1', 'u-1', 'A Grain of Wheat'),
        loan('l-2', 'u-1', 'Baking Cakes in Kigali'),
      ]);
      await service.remindOverdue();
      const { body } = delivery.email.mock.calls[0][0];
      expect(body).toContain('A Grain of Wheat');
      expect(body).toContain('Baking Cakes in Kigali');
    });

    it('writes to each borrower separately', async () => {
      prisma.bookLoan.findMany.mockResolvedValue([
        loan('l-1', 'u-1', 'A Grain of Wheat'),
        loan('l-2', 'u-2', 'Biology'),
      ]);
      const out = await service.remindOverdue();
      expect(delivery.email).toHaveBeenCalledTimes(2);
      expect(out.reminded).toBe(2);
    });

    /* Most parents here have a phone and no email at all. Skipping them would
       make the feature useless for the families it most needs to reach. */
    it('texts somebody who has no email', async () => {
      prisma.bookLoan.findMany.mockResolvedValue([
        { ...loan('l-1', 'u-1', 'Biology'), borrower: { id: 'u-1', firstName: 'Divine', lastName: 'U', email: null, phone: '+250788100000' } },
      ]);
      await service.remindOverdue();
      expect(delivery.sms).toHaveBeenCalledWith(
        expect.objectContaining({ phone: '+250788100000' }),
      );
      expect(delivery.email).not.toHaveBeenCalled();
    });

    /* Counted rather than skipped in silence: a librarian chasing six books
       needs to know that two of them cannot be chased this way. */
    it('counts a borrower who cannot be reached at all', async () => {
      prisma.bookLoan.findMany.mockResolvedValue([
        { ...loan('l-1', 'u-1', 'Biology'), borrower: { id: 'u-1', firstName: 'Divine', lastName: 'U', email: null, phone: null } },
      ]);
      const out = await service.remindOverdue();
      expect(out.unreachable).toBe(1);
      expect(out.reminded).toBe(0);
    });

    it('says one book rather than 1 books', async () => {
      prisma.bookLoan.findMany.mockResolvedValue([loan('l-1', 'u-1', 'Biology')]);
      const out = await service.remindOverdue();
      expect(out.message).toMatch(/1 book\b/);
      expect(out.message).toMatch(/1 borrower\b/);
    });
  });
});
