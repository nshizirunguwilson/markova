import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginatedResponse } from '../../common/dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/dto';
import {
  CreateBookDto,
  UpdateBookDto,
  BulkImportBooksDto,
  CheckoutDto,
  ReturnDto,
  QueryBooksDto,
} from './dto';
import { NotificationSubject } from '../../common/notification-target';

@Injectable()
export class LibraryService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // BOOK CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  async createBook(dto: CreateBookDto) {
    return this.prisma.book.create({
      data: {
        title: dto.title,
        author: dto.author,
        isbn: dto.isbn,
        category: dto.category,
        quantity: dto.quantity,
        availableCount: dto.quantity,
        barcode: dto.barcode,
        shelfLocation: dto.shelfLocation,
        replacementCost: dto.replacementCost,
      },
    });
  }

  async updateBook(id: string, dto: UpdateBookDto) {
    const book = await this.prisma.book.findUnique({ where: { id } });
    if (!book) throw new NotFoundException('Book not found');

    // If quantity changes, adjust available count
    let availableCount = book.availableCount;
    if (dto.quantity !== undefined) {
      const checkedOut = book.quantity - book.availableCount;
      availableCount = Math.max(0, dto.quantity - checkedOut);
    }

    return this.prisma.book.update({
      where: { id },
      data: { ...dto, availableCount },
    });
  }

  async deleteBook(id: string) {
    const book = await this.prisma.book.findUnique({
      where: { id },
      include: { loans: { where: { status: 'ACTIVE' } } },
    });
    if (!book) throw new NotFoundException('Book not found');
    if (book.loans.length > 0) {
      throw new BadRequestException('Cannot delete book with active loans');
    }
    return this.prisma.book.delete({ where: { id } });
  }

  async bulkImport(dto: BulkImportBooksDto) {
    const results = [];
    for (const book of dto.books) {
      const created = await this.prisma.book.create({
        data: {
          title: book.title,
          author: book.author,
          isbn: book.isbn,
          category: book.category,
          quantity: book.quantity,
          availableCount: book.quantity,
          barcode: book.barcode,
          shelfLocation: book.shelfLocation,
          replacementCost: book.replacementCost,
        },
      });
      results.push(created);
    }
    return { count: results.length, books: results };
  }

  async findAll(query: QueryBooksDto) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: any = { isActive: true };
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { author: { contains: query.search, mode: 'insensitive' } },
        { isbn: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.category) where.category = query.category;
    if (query.available) where.availableCount = { gt: 0 };

    const [data, total] = await Promise.all([
      this.prisma.book.findMany({
        where,
        skip,
        take: limit,
        orderBy: { title: 'asc' },
      }),
      this.prisma.book.count({ where }),
    ]);

    return new PaginatedResponse(data, total, page, limit);
  }

  async findById(id: string) {
    const book = await this.prisma.book.findUnique({
      where: { id },
      include: {
        loans: {
          include: {
            borrower: { select: { firstName: true, lastName: true } },
          },
          orderBy: { checkedOutAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!book) throw new NotFoundException('Book not found');
    return book;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHECKOUT / RETURN
  // ═══════════════════════════════════════════════════════════════════════════

  async checkout(dto: CheckoutDto) {
    // Find book by barcode or ID
    const book = await this.findBookByIdentifier(dto.bookIdentifier);
    if (!book) throw new NotFoundException('Book not found');
    if (book.availableCount <= 0) {
      throw new BadRequestException('No copies available');
    }

    // Find student/user
    const student = await this.prisma.student.findFirst({
      where: { studentIdNumber: dto.studentIdentifier },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    // Check borrowing limits
    const borrowingLimit = await this.getBorrowingLimit();
    const activeLoans = await this.prisma.bookLoan.count({
      where: { borrowerUserId: student.user.id, status: 'ACTIVE' },
    });
    if (activeLoans >= borrowingLimit) {
      throw new BadRequestException(
        `Borrowing limit reached (${borrowingLimit} books)`,
      );
    }

    // Check for overdue books
    const overdueLoans = await this.prisma.bookLoan.count({
      where: {
        borrowerUserId: student.user.id,
        status: 'ACTIVE',
        dueDate: { lt: new Date() },
      },
    });
    if (overdueLoans > 0) {
      throw new BadRequestException('Cannot borrow - has overdue books');
    }

    // Calculate due date
    const borrowingDuration = await this.getBorrowingDuration();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + borrowingDuration);

    const [loan] = await this.prisma.$transaction([
      this.prisma.bookLoan.create({
        data: {
          bookId: book.id,
          borrowerUserId: student.user.id,
          dueDate,
          replacementCost: book.replacementCost,
        },
        include: {
          book: { select: { title: true, author: true } },
          borrower: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.book.update({
        where: { id: book.id },
        data: { availableCount: { decrement: 1 } },
      }),
    ]);

    return loan;
  }

  async returnBook(dto: ReturnDto) {
    const book = await this.findBookByIdentifier(dto.bookIdentifier);
    if (!book) throw new NotFoundException('Book not found');

    // Find active loan
    const loan = await this.prisma.bookLoan.findFirst({
      where: { bookId: book.id, status: 'ACTIVE' },
      include: { borrower: { select: { firstName: true, lastName: true } } },
      orderBy: { checkedOutAt: 'asc' }, // Return oldest loan first
    });
    if (!loan)
      throw new NotFoundException('No active loan found for this book');

    const [updatedLoan] = await this.prisma.$transaction([
      this.prisma.bookLoan.update({
        where: { id: loan.id },
        data: { status: 'RETURNED', returnedAt: new Date() },
        include: {
          book: { select: { title: true, author: true } },
          borrower: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.book.update({
        where: { id: book.id },
        data: { availableCount: { increment: 1 } },
      }),
    ]);

    return updatedLoan;
  }

  async reportLost(loanId: string) {
    const loan = await this.prisma.bookLoan.findUnique({
      where: { id: loanId },
      include: { book: true },
    });
    if (!loan) throw new NotFoundException('Loan not found');
    if (loan.status !== 'ACTIVE')
      throw new BadRequestException('Loan is not active');

    return this.prisma.bookLoan.update({
      where: { id: loanId },
      data: {
        status: 'LOST',
        replacementCost: loan.book.replacementCost,
      },
      include: {
        book: { select: { title: true, author: true, replacementCost: true } },
        borrower: { select: { firstName: true, lastName: true } },
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOANS QUERIES
  // ═══════════════════════════════════════════════════════════════════════════

  async getActiveLoans() {
    return this.prisma.bookLoan.findMany({
      where: { status: 'ACTIVE' },
      include: {
        book: { select: { title: true, author: true, barcode: true } },
        borrower: { select: { firstName: true, lastName: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async getOverdueLoans() {
    return this.prisma.bookLoan.findMany({
      where: { status: 'ACTIVE', dueDate: { lt: new Date() } },
      include: {
        book: { select: { title: true, author: true } },
        borrower: { select: { firstName: true, lastName: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async getUserLoans(userId: string) {
    return this.prisma.bookLoan.findMany({
      where: { borrowerUserId: userId },
      include: {
        book: { select: { title: true, author: true, barcode: true } },
      },
      orderBy: { checkedOutAt: 'desc' },
    });
  }

  async getDueReminders() {
    const twoDaysFromNow = new Date();
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);

    return this.prisma.bookLoan.findMany({
      where: {
        status: 'ACTIVE',
        dueDate: {
          gte: new Date(),
          lte: twoDaysFromNow,
        },
      },
      include: {
        book: { select: { title: true } },
        borrower: { select: { firstName: true, lastName: true, email: true } },
      },
    });
  }

  async sendDueReminders() {
    const loans = await this.getDueReminders();
    let sentCount = 0;

    for (const loan of loans) {
      const dueDate = new Date(loan.dueDate).toLocaleDateString();
      await this.notifications.send({
        userId: loan.borrowerUserId,
        title: 'Library Book Due Soon',
        message: `Your borrowed book <strong>"${loan.book.title}"</strong> is due on <strong>${dueDate}</strong>. Please return it on time to avoid penalties.`,
        type: NotificationType.EMAIL,
        relatedEntityType: NotificationSubject.BOOK_LOAN,
        relatedEntityId: loan.id,
      });
      sentCount++;
    }

    return { sent: sentCount };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════════

  async getAnalytics() {
    const totalBooks = await this.prisma.book.count({
      where: { isActive: true },
    });
    const totalCopies = await this.prisma.book.aggregate({
      where: { isActive: true },
      _sum: { quantity: true },
    });
    const availableCopies = await this.prisma.book.aggregate({
      where: { isActive: true },
      _sum: { availableCount: true },
    });
    const activeLoans = await this.prisma.bookLoan.count({
      where: { status: 'ACTIVE' },
    });
    const overdueLoans = await this.prisma.bookLoan.count({
      where: { status: 'ACTIVE', dueDate: { lt: new Date() } },
    });
    const lostBooks = await this.prisma.bookLoan.count({
      where: { status: 'LOST' },
    });

    // Most popular books (by loan count)
    const popularBooks = await this.prisma.bookLoan.groupBy({
      by: ['bookId'],
      _count: true,
      orderBy: { _count: { bookId: 'desc' } },
      take: 10,
    });

    const popularWithDetails = await Promise.all(
      popularBooks.map(async (p) => {
        const book = await this.prisma.book.findUnique({
          where: { id: p.bookId },
          select: { title: true, author: true },
        });
        return { ...book, loanCount: p._count };
      }),
    );

    // Categories breakdown
    const categories = await this.prisma.book.groupBy({
      by: ['category'],
      where: { isActive: true },
      _count: true,
      _sum: { quantity: true },
    });

    return {
      totalBooks,
      totalCopies: totalCopies._sum.quantity || 0,
      availableCopies: availableCopies._sum.availableCount || 0,
      activeLoans,
      overdueLoans,
      lostBooks,
      overdueRate:
        activeLoans > 0 ? Math.round((overdueLoans / activeLoans) * 100) : 0,
      popularBooks: popularWithDetails,
      categories: categories.map((c) => ({
        category: c.category || 'Uncategorized',
        count: c._count,
        totalCopies: c._sum.quantity || 0,
      })),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private async findBookByIdentifier(identifier: string) {
    // Try barcode first, then ID
    let book = await this.prisma.book.findFirst({
      where: { barcode: identifier },
    });
    if (!book) {
      try {
        book = await this.prisma.book.findUnique({ where: { id: identifier } });
      } catch {
        // Invalid UUID, ignore
      }
    }
    return book;
  }

  private async getBorrowingLimit(): Promise<number> {
    const config = await this.prisma.schoolConfig.findUnique({
      where: { key: 'borrowing_limit' },
    });
    return Number(config?.value || '3');
  }

  private async getBorrowingDuration(): Promise<number> {
    const config = await this.prisma.schoolConfig.findUnique({
      where: { key: 'borrowing_duration_days' },
    });
    return Number(config?.value || '14');
  }
}
