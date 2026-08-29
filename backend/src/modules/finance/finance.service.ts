import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FeeAppliesTo, PaymentMethod, WaiverKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  chargesFor,
  feeStanding,
  feeStatus,
  invoiceTotal,
  nextReceiptNumber,
  type FeeStanding,
} from '../../common/fees';
import type {
  FeeItemDto,
  FeeRegisterQueryDto,
  GrantWaiverDto,
  RecordPaymentDto,
} from './dto';

/**
 * The school's fee ledger.
 *
 * A term's bill is raised once from the class price list and then frozen: the
 * lines are copied onto the invoice rather than referenced, so a price
 * changed in March cannot rewrite a bill sent in January. Everything after
 * that is entries against it — money in, and amounts the school has decided
 * not to collect.
 *
 * Nothing here edits or deletes an entry. A receipt typed twice is voided and
 * a bursary withdrawn is revoked, both with a reason and a name against them,
 * because the book has to stand up to somebody asking about it a year later.
 */
@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  // ── The price list ──────────────────────────────────────────────────────

  /** Every line the school charges in a term, by class level. */
  async feeStructure(termId: string) {
    const [levels, items] = await Promise.all([
      this.prisma.classLevel.findMany({ orderBy: { order: 'asc' } }),
      this.prisma.feeItem.findMany({
        where: { termId },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
      }),
    ]);

    return levels.map((level) => {
      const own = items.filter((i) => i.classLevelId === level.id);
      return {
        classLevel: { id: level.id, name: level.name, order: level.order },
        items: own,
        /* Both totals, because the difference between them is the question a
           bursar is actually asked at the gate in January. */
        boarderTotal: invoiceTotal(chargesFor(own, true)),
        dayTotal: invoiceTotal(chargesFor(own, false)),
      };
    });
  }

  async saveFeeItem(dto: FeeItemDto) {
    const data = {
      termId: dto.termId,
      classLevelId: dto.classLevelId,
      name: dto.name.trim(),
      amount: dto.amount,
      appliesTo: dto.appliesTo ?? FeeAppliesTo.ALL,
      position: dto.position ?? 0,
    };
    if (!data.name) throw new BadRequestException('A fee line needs a name');

    if (dto.id) {
      const existing = await this.prisma.feeItem.findUnique({
        where: { id: dto.id },
      });
      if (!existing) throw new NotFoundException('Fee line not found');
      return this.prisma.feeItem.update({ where: { id: dto.id }, data });
    }
    return this.prisma.feeItem.create({ data });
  }

  /**
   * Remove a line from the price list.
   *
   * Invoices already raised are untouched, because their lines are copies.
   * A family is never re-billed for a price the school has since dropped.
   */
  async deleteFeeItem(id: string) {
    const existing = await this.prisma.feeItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Fee line not found');
    await this.prisma.feeItem.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Copy a whole term's price list onto another term.
   *
   * Fees change a little between terms and not at all between most of them,
   * so the alternative is typing forty lines again and getting one wrong.
   * Lines the target term already has under the same name are left alone
   * rather than overwritten.
   */
  async copyFeeStructure(fromTermId: string, toTermId: string) {
    if (fromTermId === toTermId) {
      throw new BadRequestException('Choose a different term to copy into');
    }
    const [source, existing] = await Promise.all([
      this.prisma.feeItem.findMany({ where: { termId: fromTermId } }),
      this.prisma.feeItem.findMany({
        where: { termId: toTermId },
        select: { classLevelId: true, name: true },
      }),
    ]);
    if (source.length === 0) {
      throw new BadRequestException('That term has no fee lines to copy');
    }

    const taken = new Set(existing.map((e) => `${e.classLevelId}::${e.name}`));
    const fresh = source.filter(
      (i) => !taken.has(`${i.classLevelId}::${i.name}`),
    );
    await this.prisma.feeItem.createMany({
      data: fresh.map((i) => ({
        termId: toTermId,
        classLevelId: i.classLevelId,
        name: i.name,
        amount: i.amount,
        appliesTo: i.appliesTo,
        position: i.position,
      })),
    });
    return { copied: fresh.length, skipped: source.length - fresh.length };
  }

  // ── Raising the bills ───────────────────────────────────────────────────

  /**
   * Raise this term's invoices.
   *
   * Only for students who do not already have one. Re-raising over a bill
   * that has payments against it would change what a family was asked for
   * after they had started paying it, which is the one thing an invoice
   * exists to prevent.
   */
  async raiseInvoices(termId: string, classSectionId?: string) {
    const term = await this.prisma.term.findUnique({ where: { id: termId } });
    if (!term) throw new NotFoundException('Term not found');

    const students = await this.prisma.student.findMany({
      where: {
        status: 'ACTIVE',
        ...(classSectionId ? { classSectionId } : {}),
      },
      select: {
        id: true,
        isBoarder: true,
        classSection: { select: { classLevelId: true } },
      },
    });

    const [items, already] = await Promise.all([
      this.prisma.feeItem.findMany({
        where: { termId },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.feeInvoice.findMany({
        where: { termId, studentId: { in: students.map((s) => s.id) } },
        select: { studentId: true },
      }),
    ]);
    if (items.length === 0) {
      throw new BadRequestException(
        'Set the fee structure for this term before raising invoices',
      );
    }

    const billed = new Set(already.map((a) => a.studentId));
    let raised = 0;
    /* Students whose class level has no price list at all. Reported rather
       than silently skipped: a whole year group missing from the register is
       exactly the sort of thing nobody notices until March. */
    const withoutStructure: string[] = [];

    for (const student of students) {
      if (billed.has(student.id)) continue;
      const forLevel = items.filter(
        (i) => i.classLevelId === student.classSection.classLevelId,
      );
      if (forLevel.length === 0) {
        withoutStructure.push(student.id);
        continue;
      }

      const charges = chargesFor(forLevel, student.isBoarder);
      await this.prisma.feeInvoice.create({
        data: {
          studentId: student.id,
          termId,
          total: invoiceTotal(charges),
          lines: {
            create: charges.map((c, index) => ({
              name: c.name,
              amount: c.amount,
              position: c.position ?? index,
            })),
          },
        },
      });
      raised += 1;
    }

    return {
      raised,
      alreadyInvoiced: billed.size,
      withoutStructure: withoutStructure.length,
    };
  }

  // ── Reading an account ──────────────────────────────────────────────────

  /** How one student's term stands, or null when no bill was ever raised. */
  async standingFor(
    studentId: string,
    termId: string,
  ): Promise<FeeStanding | null> {
    const invoice = await this.prisma.feeInvoice.findUnique({
      where: { studentId_termId: { studentId, termId } },
      include: {
        payments: { select: { amount: true, voidedAt: true } },
        waivers: { select: { amount: true, revokedAt: true } },
      },
    });
    if (!invoice) return null;
    return feeStanding(invoice.total, invoice.payments, invoice.waivers);
  }

  /** One student's term in full: the bill, what came in, and what was let go. */
  async account(studentId: string, termId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        studentIdNumber: true,
        isBoarder: true,
        user: { select: { firstName: true, lastName: true, photoUrl: true } },
        classSection: { select: { id: true, name: true } },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const invoice = await this.prisma.feeInvoice.findUnique({
      where: { studentId_termId: { studentId, termId } },
      include: {
        lines: { orderBy: { position: 'asc' } },
        payments: {
          orderBy: { paidAt: 'desc' },
          include: {
            recordedBy: { select: { firstName: true, lastName: true } },
            voidedBy: { select: { firstName: true, lastName: true } },
          },
        },
        waivers: {
          orderBy: { createdAt: 'desc' },
          include: {
            grantedBy: { select: { firstName: true, lastName: true } },
            revokedBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    const standing = invoice
      ? feeStanding(invoice.total, invoice.payments, invoice.waivers)
      : null;

    return {
      student,
      invoice,
      standing,
      status: feeStatus(standing),
    };
  }

  /**
   * Every term a student has been billed for.
   *
   * What a parent opens the page to see: the year so far, and which term is
   * holding a report card up.
   */
  async history(studentId: string) {
    const invoices = await this.prisma.feeInvoice.findMany({
      where: { studentId },
      include: {
        term: {
          select: {
            id: true,
            name: true,
            isCurrent: true,
            startDate: true,
            academicYear: { select: { id: true, name: true } },
          },
        },
        payments: { select: { amount: true, voidedAt: true } },
        waivers: { select: { amount: true, revokedAt: true } },
      },
      orderBy: { term: { startDate: 'desc' } },
    });

    return invoices.map((invoice) => {
      const standing = feeStanding(
        invoice.total,
        invoice.payments,
        invoice.waivers,
      );
      return {
        term: invoice.term,
        invoiceId: invoice.id,
        standing,
        status: feeStatus(standing),
      };
    });
  }

  /**
   * Every student's standing for a term, which is the bursar's main screen.
   *
   * Deliberately per student rather than per class: the questions asked at
   * the office are "has this child paid" and "who has not", and a page of
   * class totals answers neither.
   */
  async register(query: FeeRegisterQueryDto) {
    const { termId, classSectionId, status, search } = query;
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 50;

    const students = await this.prisma.student.findMany({
      where: {
        status: 'ACTIVE',
        ...(classSectionId ? { classSectionId } : {}),
        ...(search
          ? {
              OR: [
                { studentIdNumber: { contains: search, mode: 'insensitive' } },
                {
                  user: {
                    OR: [
                      { firstName: { contains: search, mode: 'insensitive' } },
                      { lastName: { contains: search, mode: 'insensitive' } },
                    ],
                  },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        studentIdNumber: true,
        isBoarder: true,
        user: { select: { firstName: true, lastName: true, photoUrl: true } },
        classSection: { select: { id: true, name: true } },
        feeInvoices: {
          where: { termId },
          select: {
            id: true,
            total: true,
            payments: { select: { amount: true, voidedAt: true } },
            waivers: { select: { amount: true, revokedAt: true } },
          },
        },
      },
      orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
    });

    const rows = students.map((student) => {
      const invoice = student.feeInvoices[0];
      const standing = invoice
        ? feeStanding(invoice.total, invoice.payments, invoice.waivers)
        : null;
      return {
        student: {
          id: student.id,
          studentIdNumber: student.studentIdNumber,
          isBoarder: student.isBoarder,
          firstName: student.user.firstName,
          lastName: student.user.lastName,
          photoUrl: student.user.photoUrl,
          classSection: student.classSection,
        },
        standing,
        status: feeStatus(standing),
      };
    });

    /* Filtered here rather than in the query: the status is worked out from
       the entries, so the database cannot select on it without duplicating
       the arithmetic in SQL and letting the two drift apart. */
    const matching = status ? rows.filter((r) => r.status === status) : rows;

    return {
      data: matching.slice((page - 1) * limit, page * limit),
      total: matching.length,
      page,
      limit,
    };
  }

  /** The term at a glance: what was billed, what came in, what is still out. */
  async summary(termId: string) {
    const invoices = await this.prisma.feeInvoice.findMany({
      where: { termId },
      select: {
        total: true,
        payments: { select: { amount: true, voidedAt: true } },
        waivers: { select: { amount: true, revokedAt: true } },
      },
    });

    const [activeStudents, term] = await Promise.all([
      this.prisma.student.count({ where: { status: 'ACTIVE' } }),
      this.prisma.term.findUnique({
        where: { id: termId },
        select: {
          id: true,
          name: true,
          academicYear: { select: { name: true } },
        },
      }),
    ]);

    const totals = invoices.reduce(
      (acc, invoice) => {
        const standing = feeStanding(
          invoice.total,
          invoice.payments,
          invoice.waivers,
        );
        acc.invoiced += standing.total;
        acc.collected += standing.paid;
        acc.waived += standing.waived;
        acc.outstanding += standing.balance;
        acc[standing.cleared ? 'cleared' : 'owing'] += 1;
        return acc;
      },
      {
        invoiced: 0,
        collected: 0,
        waived: 0,
        outstanding: 0,
        cleared: 0,
        owing: 0,
      },
    );

    return {
      term,
      ...totals,
      invoiceCount: invoices.length,
      /* Students with no bill at all. The number that says the office has not
         finished raising the term's invoices yet. */
      notInvoiced: Math.max(0, activeStudents - invoices.length),
      collectionRate:
        totals.invoiced <= 0
          ? 1
          : Math.min(1, (totals.collected + totals.waived) / totals.invoiced),
    };
  }

  // ── Money in ────────────────────────────────────────────────────────────

  private async invoiceFor(studentId: string, termId: string) {
    const invoice = await this.prisma.feeInvoice.findUnique({
      where: { studentId_termId: { studentId, termId } },
    });
    if (!invoice) {
      throw new BadRequestException(
        'This student has no invoice for that term yet. Raise the term’s invoices first.',
      );
    }
    return invoice;
  }

  /**
   * Take a payment, and issue the receipt for it.
   *
   * The number is drawn inside the write so two people at the counter cannot
   * be handed the same one.
   */
  async recordPayment(dto: RecordPaymentDto, userId: string) {
    const invoice = await this.invoiceFor(dto.studentId, dto.termId);
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    if (Number.isNaN(paidAt.getTime())) {
      throw new BadRequestException('That payment date cannot be read');
    }

    return this.prisma.$transaction(async (tx) => {
      const year = paidAt.getFullYear();
      const last = await tx.feePayment.findFirst({
        where: { receiptNumber: { startsWith: `RCT-${year}-` } },
        orderBy: { receiptNumber: 'desc' },
        select: { receiptNumber: true },
      });

      return tx.feePayment.create({
        data: {
          invoiceId: invoice.id,
          receiptNumber: nextReceiptNumber(last?.receiptNumber, year),
          amount: dto.amount,
          method: dto.method as PaymentMethod,
          reference: dto.reference?.trim() || null,
          paidAt,
          note: dto.note?.trim() || null,
          recordedByUserId: userId,
        },
      });
    });
  }

  /**
   * Void a receipt.
   *
   * It stops counting and stays in the book. Voiding a voided receipt is
   * refused rather than ignored, because the second reason would overwrite
   * the first and the record of what actually happened would be the one that
   * was typed last.
   */
  async voidPayment(paymentId: string, reason: string, userId: string) {
    const payment = await this.prisma.feePayment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.voidedAt) {
      throw new BadRequestException('That receipt has already been voided');
    }

    return this.prisma.feePayment.update({
      where: { id: paymentId },
      data: {
        voidedAt: new Date(),
        voidedByUserId: userId,
        voidReason: reason.trim(),
      },
    });
  }

  // ── Amounts not being collected ─────────────────────────────────────────

  /**
   * Write off part of a bill.
   *
   * Capped at what is actually outstanding: waiving more than the family owes
   * is always a slip, and letting it through would leave a term reading as
   * over-settled and the school's written-off total overstated.
   */
  async grantWaiver(dto: GrantWaiverDto, userId: string) {
    const invoice = await this.invoiceFor(dto.studentId, dto.termId);
    const standing = await this.standingFor(dto.studentId, dto.termId);
    if (standing && dto.amount > standing.balance) {
      throw new BadRequestException(
        `That is more than the ${standing.balance.toLocaleString('en-RW')} RWF still owed on this term`,
      );
    }

    return this.prisma.feeWaiver.create({
      data: {
        invoiceId: invoice.id,
        kind: dto.kind as WaiverKind,
        amount: dto.amount,
        reason: dto.reason.trim(),
        grantedByUserId: userId,
      },
    });
  }

  async revokeWaiver(waiverId: string, reason: string, userId: string) {
    const waiver = await this.prisma.feeWaiver.findUnique({
      where: { id: waiverId },
    });
    if (!waiver) throw new NotFoundException('Waiver not found');
    if (waiver.revokedAt) {
      throw new BadRequestException('That waiver has already been withdrawn');
    }

    return this.prisma.feeWaiver.update({
      where: { id: waiverId },
      data: {
        revokedAt: new Date(),
        revokedByUserId: userId,
        revokeReason: reason.trim(),
      },
    });
  }

  // ── Who may look ────────────────────────────────────────────────────────

  /**
   * A family sees its own account; the office sees all of them.
   *
   * A teacher is not on this list. Whether a family has paid is not a
   * teacher's business, and a staffroom is exactly where that becomes a
   * child's problem.
   */
  async assertMayViewAccount(userId: string, role: string, studentId: string) {
    if (role === 'ADMIN' || role === 'BURSAR') return;

    if (role === 'STUDENT') {
      const student = await this.prisma.student.findFirst({
        where: { userId },
        select: { id: true },
      });
      if (student?.id === studentId) return;
    }

    if (role === 'PARENT') {
      const link = await this.prisma.parentStudent.findFirst({
        where: { parentUserId: userId, studentId },
        select: { id: true },
      });
      if (link) return;
    }

    throw new ForbiddenException(
      'Access denied: you can only see your own fee account',
    );
  }
}
