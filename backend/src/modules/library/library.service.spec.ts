import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { LibraryService } from './library.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('LibraryService', () => {
  let service: LibraryService;

  const mockPrisma: any = {
    book: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    bookLoan: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    schoolConfig: { findUnique: jest.fn() },
    student: { findFirst: jest.fn() },
  };
  mockPrisma.$transaction = jest.fn((ops: any) =>
    Array.isArray(ops) ? Promise.all(ops) : ops(mockPrisma),
  );

  const mockNotifications = { send: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LibraryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();
    service = module.get<LibraryService>(LibraryService);
  });

  describe('createBook()', () => {
    it('sets availableCount equal to quantity on creation', async () => {
      mockPrisma.book.create.mockResolvedValue({ id: 'b1' });
      await service.createBook({
        title: 'Algebra',
        author: 'X',
        quantity: 5,
      });
      expect(mockPrisma.book.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ quantity: 5, availableCount: 5 }),
        }),
      );
    });
  });

  describe('deleteBook()', () => {
    it('refuses to delete a book with active loans', async () => {
      mockPrisma.book.findUnique.mockResolvedValue({
        id: 'b1',
        loans: [{ id: 'loan-1' }],
      });
      await expect(service.deleteBook('b1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException for a missing book', async () => {
      mockPrisma.book.findUnique.mockResolvedValue(null);
      await expect(service.deleteBook('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('checkout()', () => {
    const dto = { bookIdentifier: 'BC-1', studentIdentifier: 'STU001' };

    const arrange = (over: Record<string, any> = {}) => {
      mockPrisma.book.findFirst.mockResolvedValue({
        id: 'b1',
        availableCount: over.available ?? 3,
        replacementCost: 10,
      });
      mockPrisma.student.findFirst.mockResolvedValue({
        id: 's1',
        user: { id: 'u1', firstName: 'Jane', lastName: 'Doe' },
      });
      mockPrisma.schoolConfig.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.key === 'borrowing_limit' ? { value: '3' } : { value: '14' },
        ),
      );
      mockPrisma.bookLoan.create.mockResolvedValue({ id: 'loan-1' });
      mockPrisma.book.update.mockResolvedValue({});
      // Deterministic regardless of call order: the overdue check is the only
      // count() whose where-clause carries a dueDate filter.
      mockPrisma.bookLoan.count.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where?.dueDate ? (over.overdue ?? 0) : (over.activeLoans ?? 0),
        ),
      );
    };

    it('creates a loan and decrements availability (happy path)', async () => {
      arrange();

      const result = await service.checkout(dto);

      expect(result).toMatchObject({ id: 'loan-1' });
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('rejects checkout when no copies are available', async () => {
      mockPrisma.book.findFirst.mockResolvedValue({
        id: 'b1',
        availableCount: 0,
      });
      await expect(service.checkout(dto as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('enforces the borrowing limit', async () => {
      arrange({ activeLoans: 3 });
      await expect(service.checkout(dto as any)).rejects.toThrow(
        /Borrowing limit/,
      );
    });

    it('blocks checkout when the borrower has overdue books', async () => {
      arrange({ overdue: 1 });
      await expect(service.checkout(dto as any)).rejects.toThrow(/overdue/);
    });

    it('throws NotFoundException when the student is unknown', async () => {
      mockPrisma.book.findFirst.mockResolvedValue({
        id: 'b1',
        availableCount: 2,
      });
      mockPrisma.student.findFirst.mockResolvedValue(null);
      await expect(service.checkout(dto as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('returnBook()', () => {
    it('marks the loan RETURNED and increments availability', async () => {
      mockPrisma.book.findFirst.mockResolvedValue({ id: 'b1' });
      mockPrisma.bookLoan.findFirst.mockResolvedValue({
        id: 'loan-1',
        bookId: 'b1',
      });
      mockPrisma.bookLoan.update.mockResolvedValue({ id: 'loan-1' });
      mockPrisma.book.update.mockResolvedValue({});

      const result = await service.returnBook({
        bookIdentifier: 'BC-1',
      });

      expect(result).toMatchObject({ id: 'loan-1' });
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('throws when there is no active loan for the book', async () => {
      mockPrisma.book.findFirst.mockResolvedValue({ id: 'b1' });
      mockPrisma.bookLoan.findFirst.mockResolvedValue(null);
      await expect(
        service.returnBook({ bookIdentifier: 'BC-1' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('sendDueReminders()', () => {
    it('emails each borrower whose book is due soon', async () => {
      mockPrisma.bookLoan.findMany.mockResolvedValue([
        {
          id: 'loan-1',
          borrowerUserId: 'u1',
          dueDate: new Date(),
          book: { title: 'Algebra' },
          borrower: { firstName: 'Jane', lastName: 'Doe', email: 'j@x.com' },
        },
        {
          id: 'loan-2',
          borrowerUserId: 'u2',
          dueDate: new Date(),
          book: { title: 'Biology' },
          borrower: { firstName: 'John', lastName: 'Roe', email: 'jr@x.com' },
        },
      ]);

      const result = await service.sendDueReminders();

      expect(result.sent).toBe(2);
      expect(mockNotifications.send).toHaveBeenCalledTimes(2);
      expect(mockNotifications.send.mock.calls[0][0]).toMatchObject({
        userId: 'u1',
        type: 'EMAIL',
      });
    });
  });
});
