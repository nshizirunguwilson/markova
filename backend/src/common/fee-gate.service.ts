import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { feeStanding, formatRwf, withholdingReason } from './fees';

/** The setting that turns the whole thing off. */
export const FEE_GATE_CONFIG_KEY = 'fees_block_results';

/**
 * What a refusal over fees is called on the wire.
 *
 * Clients switch on this rather than on the message, so the sentence can be
 * reworded - or translated - without breaking the screen that reads it.
 */
export const FEE_REFUSAL_REASON = 'FEES_OUTSTANDING';

/**
 * Whether a term's results may be read yet.
 *
 * A Rwandan school withholds a report card until the term's fees are settled,
 * and this is that rule. It is deliberately narrow: it answers one question,
 * for one student, for one term, and it is the only place in the system that
 * decides it - a rule this consequential must not be re-implemented once per
 * endpoint that needs it.
 *
 * Three things it will not do:
 *
 *  - **It never gates staff.** A teacher marking a script and a bursar looking
 *    at an account both need to see the work. Withholding results from the
 *    people who produce them would make the school unable to run.
 *  - **It never gates a term nobody was billed for.** No invoice means the
 *    school has not decided anybody owes anything, so there is nothing to
 *    withhold and no way for a family to put it right.
 *  - **It can be switched off entirely.** Not every school ties the two
 *    together, and one that does not should not have to raise invoices for
 *    nothing to get its report cards out.
 *
 * Lives in `common/` rather than in the finance module because reports and
 * marks both need it, and neither should have to depend on the ledger to ask
 * a yes-or-no question.
 */
@Injectable()
export class FeeGateService {
  constructor(private prisma: PrismaService) {}

  /** Roles whose reading of a report card is never held up by money. */
  private static readonly UNGATED = new Set([
    'ADMIN',
    'HEAD_TEACHER',
    'TEACHER',
    'BURSAR',
    'PATRON',
    'MATRON',
    'NURSE',
    'LIBRARIAN',
  ]);

  /** Whether the school withholds results over fees at all. Default yes. */
  async isEnabled(): Promise<boolean> {
    const row = await this.prisma.schoolConfig.findUnique({
      where: { key: FEE_GATE_CONFIG_KEY },
      select: { value: true },
    });
    /* Absent means on. The school that installs this and never opens the
       setting gets the behaviour it was installed for. */
    return row?.value !== 'false';
  }

  /**
   * What is holding this term's results up, or null when nothing is.
   *
   * Returned rather than thrown so a screen can say "your Term 1 report card
   * is waiting on 75,000 RWF" instead of showing a bare padlock. A family
   * told only that they are blocked cannot act on it.
   */
  async withholdingFor(
    role: string,
    studentId: string,
    termId: string,
  ): Promise<{ balance: number; message: string } | null> {
    if (FeeGateService.UNGATED.has(role)) return null;
    if (!(await this.isEnabled())) return null;

    const invoice = await this.prisma.feeInvoice.findUnique({
      where: { studentId_termId: { studentId, termId } },
      select: {
        total: true,
        payments: { select: { amount: true, voidedAt: true } },
        waivers: { select: { amount: true, revokedAt: true } },
      },
    });
    const standing = invoice
      ? feeStanding(invoice.total, invoice.payments, invoice.waivers)
      : null;

    const reason = withholdingReason(standing);
    if (!reason) return null;

    return {
      balance: reason.balance,
      message: `This term’s results are held until the school fees are settled. ${formatRwf(
        reason.balance,
      )} is still outstanding - the fees page shows what has been paid, and the school office can help.`,
    };
  }

  /**
   * The same question, as a guard on an endpoint.
   *
   * The refusal carries a `reason` as well as a sentence. A report card can
   * be refused for two quite different things - not issued yet, or held over
   * the fees - and the screen that catches it has to tell a family which,
   * without matching on the wording of a message somebody may reword.
   */
  async assertReleased(role: string, studentId: string, termId: string) {
    const withheld = await this.withholdingFor(role, studentId, termId);
    if (withheld) throw this.refusal(withheld);
  }

  private refusal(withheld: { balance: number; message: string }) {
    return new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      message: withheld.message,
      reason: FEE_REFUSAL_REASON,
      detail: { balance: withheld.balance },
    });
  }

  /**
   * The same question for a whole year, which is three terms at once.
   *
   * An annual report is built out of the three term results, so a year owed
   * on in any one of its terms is a year whose report card is held. Reporting
   * the total rather than the first term found: a family owing on two terms
   * needs to know what it would take to clear the year, not what it would
   * take to clear January.
   */
  async withholdingForYear(
    role: string,
    studentId: string,
    academicYearId: string,
  ): Promise<{ balance: number; message: string } | null> {
    if (FeeGateService.UNGATED.has(role)) return null;
    if (!(await this.isEnabled())) return null;

    const invoices = await this.prisma.feeInvoice.findMany({
      where: { studentId, term: { academicYearId } },
      select: {
        total: true,
        payments: { select: { amount: true, voidedAt: true } },
        waivers: { select: { amount: true, revokedAt: true } },
      },
    });

    const owed = invoices.reduce(
      (sum, invoice) =>
        sum +
        feeStanding(invoice.total, invoice.payments, invoice.waivers).balance,
      0,
    );
    if (owed <= 0) return null;

    return {
      balance: owed,
      message: `This year’s report is held until the school fees are settled. ${formatRwf(
        owed,
      )} is still outstanding across the year - the fees page shows what has been paid, and the school office can help.`,
    };
  }

  async assertYearReleased(
    role: string,
    studentId: string,
    academicYearId: string,
  ) {
    const withheld = await this.withholdingForYear(
      role,
      studentId,
      academicYearId,
    );
    if (withheld) throw this.refusal(withheld);
  }
}
