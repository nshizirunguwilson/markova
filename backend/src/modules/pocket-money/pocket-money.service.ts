import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PocketMoneyKind, Role } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * The school's pocket money ledger.
 *
 * A boarding school holds cash for its students: a parent hands it over on
 * visiting day, and the student draws it down at the canteen. Today that lives
 * in an exercise book, which is why nobody can answer a parent asking where
 * the money went.
 *
 * Three rules follow from it being someone else's money:
 *
 *  - **The balance is derived, never stored.** It is the sum of the entries. A
 *    stored balance that drifts from its transactions is how money disappears.
 *  - **Nothing is edited or deleted.** A mistake is corrected with a reversing
 *    entry, so the ledger stands up as evidence months later.
 *  - **No overdraft.** It is the child's own money; there is nothing to lend.
 */
@Injectable()
export class PocketMoneyService {
  constructor(private prisma: PrismaService) {}

  /** Entries that add to a balance. Everything else takes away. */
  private static readonly CREDITS: PocketMoneyKind[] = [
    PocketMoneyKind.DEPOSIT,
    PocketMoneyKind.ADJUSTMENT,
  ];

  private signOf(kind: PocketMoneyKind, amount: number): number {
    return PocketMoneyService.CREDITS.includes(kind) ? amount : -amount;
  }

  /**
   * The account, created on first use.
   *
   * A student who has never been given money has no account, and making one
   * lazily means the roll does not carry hundreds of empty rows.
   */
  private async accountFor(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Student not found');

    return this.prisma.pocketMoneyAccount.upsert({
      where: { studentId },
      create: { studentId },
      update: {},
    });
  }

  /**
   * Balance and today's spending, worked out from the entries themselves.
   *
   * Reversals are included like any other entry: reversing a withdrawal adds
   * the money back, which is exactly what a correction should do.
   */
  private async balanceOf(accountId: string) {
    const rows = await this.prisma.pocketMoneyTransaction.findMany({
      where: { accountId },
      // `id` is needed to tell whether this entry is itself one that was
      // reversed; without it the check below silently never matches.
      select: {
        id: true,
        kind: true,
        amount: true,
        createdAt: true,
        reversesId: true,
      },
    });

    const reversed = new Set(
      rows.map((r) => r.reversesId).filter((id): id is string => !!id),
    );

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    let balance = 0;
    let spentToday = 0;
    for (const r of rows) {
      // A reversal and the entry it undoes cancel out, so counting the pair is
      // the same as counting neither. Skipping both keeps "spent today" honest
      // when a mistake is corrected the same day.
      if (r.reversesId) continue;
      if (reversed.has(r.id)) continue;

      balance += this.signOf(r.kind, r.amount);
      if (
        r.kind === PocketMoneyKind.WITHDRAWAL &&
        r.createdAt >= startOfToday
      ) {
        spentToday += r.amount;
      }
    }
    return { balance, spentToday };
  }

  /**
   * Everything a counter needs before handing money over.
   *
   * `spentToday` is here because a daily limit is meaningless without it: the
   * person at the counter has to see how much is left of today's allowance,
   * not just what is in the account.
   */
  async getAccount(studentId: string) {
    const account = await this.accountFor(studentId);
    const { balance, spentToday } = await this.balanceOf(account.id);

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        studentIdNumber: true,
        user: { select: { firstName: true, lastName: true, photoUrl: true } },
        classSection: { select: { classLevel: { select: { name: true } } } },
      },
    });

    return {
      studentId,
      student: student && {
        name: `${student.user.firstName} ${student.user.lastName}`,
        studentIdNumber: student.studentIdNumber,
        level: student.classSection?.classLevel?.name ?? null,
        photoUrl: student.user.photoUrl,
      },
      balance,
      spentToday,
      dailyLimit: account.dailyLimit,
      remainingToday:
        account.dailyLimit === null
          ? null
          : Math.max(0, account.dailyLimit - spentToday),
      lowBalanceAlert: account.lowBalanceAlert,
      isFrozen: account.isFrozen,
      isLow:
        account.lowBalanceAlert !== null && balance <= account.lowBalanceAlert,
    };
  }

  /** The statement a parent reads, newest first. */
  async getStatement(studentId: string, page = 1, limit = 50) {
    const account = await this.accountFor(studentId);
    const take = Math.min(200, Math.max(1, limit));
    const skip = (Math.max(1, page) - 1) * take;

    const [total, rows] = await Promise.all([
      this.prisma.pocketMoneyTransaction.count({
        where: { accountId: account.id },
      }),
      this.prisma.pocketMoneyTransaction.findMany({
        where: { accountId: account.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          recordedBy: { select: { firstName: true, lastName: true } },
          reversedBy: { select: { id: true, createdAt: true } },
        },
      }),
    ]);

    return {
      data: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        amount: r.amount,
        // The sign the reader should see, so a statement does not require
        // knowing which kinds are credits.
        signedAmount: this.signOf(r.kind, r.amount),
        note: r.note,
        createdAt: r.createdAt,
        recordedBy: r.recordedBy
          ? `${r.recordedBy.firstName} ${r.recordedBy.lastName}`
          : null,
        reversesId: r.reversesId,
        isReversed: !!r.reversedBy,
      })),
      meta: {
        total,
        page: Math.max(1, page),
        limit: take,
        totalPages: Math.max(1, Math.ceil(total / take)),
      },
    };
  }

  /** A parent hands money in. */
  async deposit(
    studentId: string,
    amount: number,
    note: string | undefined,
    recordedByUserId: string,
    idempotencyKey?: string,
  ) {
    if (amount <= 0) {
      throw new BadRequestException('A deposit has to be more than zero');
    }

    /* A repeat of the same request is the same deposit. This is money at a
       counter with a queue behind it, and a double entry here is money the
       school did not receive. */
    if (idempotencyKey) {
      const already = await this.prisma.pocketMoneyTransaction.findUnique({
        where: { idempotencyKey },
      });
      if (already) return this.getAccount(studentId);
    }

    const account = await this.accountFor(studentId);
    await this.writeOnce(idempotencyKey, () =>
      this.prisma.pocketMoneyTransaction.create({
        data: {
          accountId: account.id,
          kind: PocketMoneyKind.DEPOSIT,
          amount,
          note,
          recordedByUserId,
          idempotencyKey: idempotencyKey || null,
        },
      }),
    );
    return this.getAccount(studentId);
  }

  /**
   * Write it, and treat a unique clash as the retry it is.
   *
   * The read above catches the ordinary repeat. This catches the race it
   * cannot see: two requests in flight at once on two different instances,
   * neither committed when the other looked. Postgres refuses the second, and
   * the right answer is to carry on rather than show an error to somebody
   * whose money did in fact go in.
   */
  private async writeOnce(
    idempotencyKey: string | undefined,
    write: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await write();
    } catch (error) {
      const clash =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002';
      if (clash && idempotencyKey) return;
      throw error;
    }
  }

  /**
   * The student draws money at the counter.
   *
   * Every refusal here is a refusal at a counter with a queue behind it, so
   * each one says exactly what is wrong and what the number actually is.
   */
  async withdraw(
    studentId: string,
    amount: number,
    note: string | undefined,
    recordedByUserId: string,
  ) {
    if (amount <= 0) {
      throw new BadRequestException('A withdrawal has to be more than zero');
    }
    const account = await this.accountFor(studentId);

    if (account.isFrozen) {
      throw new BadRequestException(
        'This account is frozen. The office has to unfreeze it before anything can be drawn.',
      );
    }

    const { balance, spentToday } = await this.balanceOf(account.id);

    if (amount > balance) {
      throw new BadRequestException(
        `Only ${balance.toFixed(0)} RWF left, which is less than the ${amount.toFixed(0)} RWF asked for.`,
      );
    }

    if (account.dailyLimit !== null) {
      const remaining = account.dailyLimit - spentToday;
      if (amount > remaining) {
        throw new BadRequestException(
          `Today's limit is ${account.dailyLimit.toFixed(0)} RWF and ${spentToday.toFixed(0)} RWF has already been drawn, leaving ${Math.max(0, remaining).toFixed(0)} RWF.`,
        );
      }
    }

    await this.prisma.pocketMoneyTransaction.create({
      data: {
        accountId: account.id,
        kind: PocketMoneyKind.WITHDRAWAL,
        amount,
        note,
        recordedByUserId,
      },
    });
    return this.getAccount(studentId);
  }

  /** Money handed back to the family, usually at the end of a year. */
  async refund(
    studentId: string,
    amount: number,
    note: string | undefined,
    recordedByUserId: string,
  ) {
    if (amount <= 0) {
      throw new BadRequestException('A refund has to be more than zero');
    }
    const account = await this.accountFor(studentId);
    const { balance } = await this.balanceOf(account.id);
    if (amount > balance) {
      throw new BadRequestException(
        `Only ${balance.toFixed(0)} RWF is held, which is less than the ${amount.toFixed(0)} RWF asked for.`,
      );
    }
    await this.prisma.pocketMoneyTransaction.create({
      data: {
        accountId: account.id,
        kind: PocketMoneyKind.REFUND,
        amount,
        note,
        recordedByUserId,
      },
    });
    return this.getAccount(studentId);
  }

  /**
   * Undo an entry without erasing it.
   *
   * The original stays exactly as it was written and a second entry cancels
   * it. That is what makes the ledger evidence rather than a running total
   * somebody can quietly rewrite.
   */
  async reverse(
    transactionId: string,
    reason: string,
    recordedByUserId: string,
  ) {
    const original = await this.prisma.pocketMoneyTransaction.findUnique({
      where: { id: transactionId },
      include: { reversedBy: true, account: true },
    });
    if (!original) throw new NotFoundException('Entry not found');
    if (original.reversedBy) {
      throw new BadRequestException('That entry has already been reversed');
    }
    if (original.kind === PocketMoneyKind.REVERSAL) {
      throw new BadRequestException(
        'A reversal cannot itself be reversed. Record a fresh entry instead.',
      );
    }

    await this.prisma.pocketMoneyTransaction.create({
      data: {
        accountId: original.accountId,
        kind: PocketMoneyKind.REVERSAL,
        amount: original.amount,
        note: reason,
        recordedByUserId,
        reversesId: original.id,
      },
    });
    return this.getAccount(original.account.studentId);
  }

  /** The parent's controls: a daily cap and a low-balance warning. */
  async updateLimits(
    studentId: string,
    data: {
      dailyLimit?: number | null;
      lowBalanceAlert?: number | null;
      isFrozen?: boolean;
    },
  ) {
    const account = await this.accountFor(studentId);
    if (
      data.dailyLimit !== undefined &&
      data.dailyLimit !== null &&
      data.dailyLimit < 0
    ) {
      throw new BadRequestException('A daily limit cannot be negative');
    }
    await this.prisma.pocketMoneyAccount.update({
      where: { id: account.id },
      data,
    });
    return this.getAccount(studentId);
  }

  /**
   * What the counter and the office look at: every account with money in it.
   *
   * Balances are computed in one pass over the whole ledger rather than a
   * query per student, because the alternative is 700 round trips to draw one
   * screen.
   */
  async overview(query: {
    classSectionId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const where: any = { status: 'ACTIVE' };
    if (query.classSectionId) where.classSectionId = query.classSectionId;
    if (query.search?.trim()) {
      const s = query.search.trim();
      where.OR = [
        { studentIdNumber: { contains: s, mode: 'insensitive' } },
        { user: { firstName: { contains: s, mode: 'insensitive' } } },
        { user: { lastName: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));

    const [total, students] = await Promise.all([
      this.prisma.student.count({ where }),
      this.prisma.student.findMany({
        where,
        select: {
          id: true,
          studentIdNumber: true,
          user: { select: { firstName: true, lastName: true } },
          classSection: {
            select: { name: true, classLevel: { select: { name: true } } },
          },
          pocketMoney: {
            select: { id: true, dailyLimit: true, isFrozen: true },
          },
        },
        orderBy: [{ user: { firstName: 'asc' } }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const accountIds = students
      .map((s) => s.pocketMoney?.id)
      .filter((id): id is string => !!id);

    const entries = accountIds.length
      ? await this.prisma.pocketMoneyTransaction.findMany({
          where: { accountId: { in: accountIds } },
          select: {
            id: true,
            accountId: true,
            kind: true,
            amount: true,
            reversesId: true,
          },
        })
      : [];

    const reversed = new Set(
      entries.map((e) => e.reversesId).filter((id): id is string => !!id),
    );
    const balances = new Map<string, number>();
    for (const e of entries) {
      if (e.reversesId || reversed.has(e.id)) continue;
      balances.set(
        e.accountId,
        (balances.get(e.accountId) ?? 0) + this.signOf(e.kind, e.amount),
      );
    }

    const items = students.map((s) => ({
      studentId: s.id,
      name: `${s.user.firstName} ${s.user.lastName}`,
      studentIdNumber: s.studentIdNumber,
      class: s.classSection
        ? `${s.classSection.classLevel?.name ?? ''} ${s.classSection.name}`.trim()
        : null,
      balance: s.pocketMoney ? (balances.get(s.pocketMoney.id) ?? 0) : 0,
      dailyLimit: s.pocketMoney?.dailyLimit ?? null,
      isFrozen: s.pocketMoney?.isFrozen ?? false,
      hasAccount: !!s.pocketMoney,
    }));

    return {
      items,
      // Across the whole filtered roll, not this page. "The school is holding
      // 38,000 RWF" would be a lie if it only counted the three students
      // currently on screen.
      totalHeld: await this.totalHeld(where),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /**
   * What the school is holding across a whole filtered roll.
   *
   * Summed in the database rather than by walking every account, because the
   * office asks this on every page of a list of hundreds.
   */
  private async totalHeld(studentWhere: any): Promise<number> {
    const accounts = await this.prisma.pocketMoneyAccount.findMany({
      where: { student: studentWhere },
      select: { id: true },
    });
    if (accounts.length === 0) return 0;

    const entries = await this.prisma.pocketMoneyTransaction.findMany({
      where: { accountId: { in: accounts.map((a) => a.id) } },
      select: { id: true, kind: true, amount: true, reversesId: true },
    });

    const reversed = new Set(
      entries.map((e) => e.reversesId).filter((id): id is string => !!id),
    );
    return entries.reduce(
      (sum, e) =>
        e.reversesId || reversed.has(e.id)
          ? sum
          : sum + this.signOf(e.kind, e.amount),
      0,
    );
  }

  /**
   * Resolve a student from whatever the counter scanned or typed.
   *
   * The same identifiers the gate and the library already accept: the student
   * number, or the code on their ID card.
   */
  async findByIdentifier(identifier: string) {
    const value = identifier.trim();
    if (!value) throw new BadRequestException('Nothing was scanned');

    const student = await this.prisma.student.findFirst({
      where: {
        OR: [
          { studentIdNumber: value },
          { cardCode: value },
          { nfcCardId: value },
        ],
      },
      select: { id: true },
    });
    if (!student) {
      throw new NotFoundException(`No student found for "${value}"`);
    }
    return this.getAccount(student.id);
  }

  /**
   * Whether this user may see this student's money.
   *
   * Narrow on purpose: the people at the counter, the office, the student, and
   * their own parents. A teacher has no business in a child's finances.
   */
  async assertMayView(userId: string, role: Role, studentId: string) {
    if (role === Role.ADMIN || role === Role.PATRON || role === Role.MATRON) {
      return;
    }

    if (role === Role.STUDENT) {
      const own = await this.prisma.student.findFirst({
        where: { id: studentId, userId },
        select: { id: true },
      });
      if (own) return;
    }

    if (role === Role.PARENT) {
      const link = await this.prisma.parentStudent.findFirst({
        where: { parentUserId: userId, studentId },
        select: { id: true },
      });
      if (link) return;
    }

    throw new ForbiddenException(
      'Pocket money is visible to the student, their parents and the boarding staff only',
    );
  }
}
