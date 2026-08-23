import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomBytes, randomInt } from 'crypto';
import { existsSync } from 'fs';
import { SubjectScope } from '@prisma/client';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';
import { classDisplayName } from '../../common/class-name';
import puppeteer, { Browser } from 'puppeteer-core';
import { buildZip, toCsv } from './zip.util';
import {
  competenceFor,
  computeSubjectTotal,
  gradeFor,
  overallGrade,
} from '../../common/grading';

/**
 * Inline a logo as a data URI for PDF rendering.
 *
 * The PDF is produced with `page.setContent()`, which has no base URL — so a
 * stored path like `/uploads/branding/x.png` can never be fetched by Chrome.
 * It has to be embedded directly.
 *
 * Falls back to Markova's own mark when the school has not uploaded a logo (or
 * points at a file that no longer exists).
 */
/**
 * puppeteer-core ships no browser, so an executable path is mandatory. Set
 * CHROME_PATH explicitly in any real deployment (backend/Dockerfile does); the
 * fallbacks below only cover the common local-development installs, on Linux
 * as well as macOS.
 */
import { escapeHtml, logoDataUri, sanitizeColor } from '../../common/html';

function resolveChromePath(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates =
    process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
      : [
          '/usr/bin/chromium-browser',
          '/usr/bin/chromium',
          '/usr/bin/google-chrome',
        ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
}

@Injectable()
export class ReportsService implements OnModuleDestroy {
  constructor(private prisma: PrismaService) {}

  /**
   * Chrome launch dominates PDF latency (~3-5s per report when launched
   * per-call), so a single browser is kept alive and reused; each PDF gets
   * its own page. If Chrome dies, the next call relaunches it once.
   */
  private browserPromise: Promise<Browser> | null = null;

  private getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = puppeteer.launch({
        executablePath: resolveChromePath(),
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return this.browserPromise;
  }

  private async newPage() {
    try {
      const browser = await this.getBrowser();
      return await browser.newPage();
    } catch {
      this.browserPromise = null;
      const browser = await this.getBrowser();
      return await browser.newPage();
    }
  }

  async onModuleDestroy() {
    if (!this.browserPromise) return;
    const browser = await this.browserPromise.catch(() => null);
    await browser?.close().catch(() => undefined);
  }

  private async htmlToPdf(
    html: string,
    opts?: { marginMm?: number },
  ): Promise<Buffer> {
    const page = await this.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load' });
      const m = `${opts?.marginMm ?? 10}mm`;
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: opts?.marginMm === 0,
        margin: { top: m, right: m, bottom: m, left: m },
      });
      return Buffer.from(pdf);
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORT CARD DATA (used by PDF generation and web preview)
  // ═══════════════════════════════════════════════════════════════════════════

  async getTermReportData(studentId: string, termId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: { select: { firstName: true, lastName: true, photoUrl: true } },
        classSection: { include: { classLevel: true, trade: true } },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      include: { academicYear: true },
    });
    if (!term) throw new NotFoundException('Term not found');

    const marks = await this.prisma.mark.findMany({
      where: { studentId, termId },
      include: { subject: true, assessmentType: true },
      orderBy: { subject: { name: 'asc' } },
    });

    const termResult = await this.prisma.termResult.findFirst({
      where: { studentId, termId },
    });

    // The permanent code that ties the printed report to this digital one.
    const verification = termResult
      ? await this.ensureVerification(termResult.id)
      : null;

    const classTeacherRole = await this.prisma.teacherRole.findFirst({
      where: { role: 'CLASS_TEACHER', classSectionId: student.classSectionId },
      include: {
        teacher: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    const [attendanceTotal, attendancePresent] = await Promise.all([
      this.prisma.attendance.count({
        where: { studentId, date: { gte: term.startDate, lte: term.endDate } },
      }),
      this.prisma.attendance.count({
        where: {
          studentId,
          date: { gte: term.startDate, lte: term.endDate },
          status: { in: ['PRESENT', 'LATE'] },
        },
      }),
    ]);

    const classResults = await this.prisma.termResult.findMany({
      where: { classSectionId: student.classSectionId, termId },
    });
    const classAverage =
      classResults.length > 0
        ? classResults.reduce((s, r) => s + (r.average || 0), 0) /
          classResults.length
        : null;

    const school = await this.getSchoolInfo();
    const subjectBreakdown = this.groupMarksBySubject(marks);
    const { classLevel, trade } = student.classSection;

    return {
      school,
      student: {
        name: `${student.user.firstName} ${student.user.lastName}`,
        studentIdNumber: student.studentIdNumber,
        photoUrl: student.user.photoUrl,
        class: classDisplayName(student.classSection),
        stage: classLevel.stage,
        trade: trade
          ? { code: trade.code, name: trade.name, sector: trade.sector }
          : null,
        gender: student.gender,
        dateOfBirth: student.dateOfBirth,
        disciplinePoints: student.disciplinePoints,
      },
      term: { name: term.name, academicYear: term.academicYear.name },
      classTeacher: classTeacherRole
        ? `${classTeacherRole.teacher.user.firstName} ${classTeacherRole.teacher.user.lastName}`
        : null,
      attendance: { present: attendancePresent, total: attendanceTotal },
      subjects: subjectBreakdown,
      result: termResult,
      classStats: {
        classAverage,
        totalStudents: classResults.length,
        rank: termResult?.rank || null,
      },
      verification: verification
        ? {
            code: verification.code,
            url: `${this.webBaseUrl()}/verify/${verification.code}`,
            issuedAt: verification.createdAt,
          }
        : null,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORT VERIFICATION (public, code-based)
  // ═══════════════════════════════════════════════════════════════════════════

  private static readonly VERIFY_CODE = /^\d{4}-\d{4}-\d{4}$/;

  private webBaseUrl(): string {
    return (process.env.WEB_URL || 'http://localhost:3001').replace(/\/$/, '');
  }

  // 12 random digits as XXXX-XXXX-XXXX. Uniqueness is guaranteed by the DB
  // unique constraint; a collision (1 in 10^12 per try) just retries.
  private generateVerificationCode(): string {
    const digits = randomInt(0, 1_000_000_000_000).toString().padStart(12, '0');
    return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
  }

  async ensureVerification(termResultId: string) {
    const existing = await this.prisma.reportVerification.findUnique({
      where: { termResultId },
    });
    if (existing) return existing;

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.reportVerification.create({
          data: { code: this.generateVerificationCode(), termResultId },
        });
      } catch (error: any) {
        if (error?.code !== 'P2002') throw error;
        // Either the code collided or a concurrent request already created
        // the record for this result. Reuse the latter if it exists.
        const raced = await this.prisma.reportVerification.findUnique({
          where: { termResultId },
        });
        if (raced) return raced;
      }
    }
    throw new InternalServerErrorException(
      'Could not allocate a verification code',
    );
  }

  async verifyReportByCode(code: string) {
    if (!ReportsService.VERIFY_CODE.test(code)) {
      throw new NotFoundException('Report not found');
    }
    const verification = await this.prisma.reportVerification.findUnique({
      where: { code },
      include: { termResult: true },
    });
    if (!verification) throw new NotFoundException('Report not found');
    const data = await this.getTermReportData(
      verification.termResult.studentId,
      verification.termResult.termId,
    );
    // The rendered sheet ships along so the verify page can show the digital
    // original exactly as it prints.
    const html = this.renderTermReportHtml(
      data,
      await this.verificationQr(data),
    );
    return { ...data, html };
  }

  private async verificationQr(data: any): Promise<string | null> {
    if (!data.verification) return null;
    return QRCode.toDataURL(data.verification.url, {
      errorCorrectionLevel: 'M',
      margin: 0,
      width: 240,
      color: { dark: '#1B4F72', light: '#ffffff' },
    });
  }

  async getYearReportData(studentId: string, academicYearId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: { select: { firstName: true, lastName: true, photoUrl: true } },
        classSection: { include: { classLevel: true, trade: true } },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const academicYear = await this.prisma.academicYear.findUnique({
      where: { id: academicYearId },
    });
    if (!academicYear) throw new NotFoundException('Academic year not found');

    const terms = await this.prisma.term.findMany({
      where: { academicYearId },
      orderBy: { startDate: 'asc' },
    });

    const termResults = await this.prisma.termResult.findMany({
      where: { studentId, termId: { in: terms.map((t) => t.id) } },
      include: { term: true },
      orderBy: { term: { startDate: 'asc' } },
    });

    const yearResult = await this.prisma.yearResult.findFirst({
      where: { studentId, academicYearId },
    });

    // Per-subject across terms
    const allMarks = await this.prisma.mark.findMany({
      where: { studentId, termId: { in: terms.map((t) => t.id) } },
      include: { subject: true, assessmentType: true, term: true },
      orderBy: [{ subject: { name: 'asc' } }, { term: { startDate: 'asc' } }],
    });

    const school = await this.getSchoolInfo();

    return {
      school,
      student: {
        name: `${student.user.firstName} ${student.user.lastName}`,
        studentIdNumber: student.studentIdNumber,
        photoUrl: student.user.photoUrl,
        class: [
          student.classSection.classLevel.name,
          student.classSection.trade?.code,
          student.classSection.name,
        ]
          .filter(Boolean)
          .join(' '),
      },
      academicYear: { name: academicYear.name },
      terms: terms.map((t) => t.name),
      termResults,
      yearResult,
      subjectsByTerm: this.groupMarksBySubjectAndTerm(allMarks, terms),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERATE REPORT HTML (for PDF conversion or web preview)
  // ═══════════════════════════════════════════════════════════════════════════

  async generateTermReportHtml(
    studentId: string,
    termId: string,
  ): Promise<string> {
    const data = await this.getTermReportData(studentId, termId);
    return this.renderTermReportHtml(data, await this.verificationQr(data));
  }

  async generateTermReportPdf(
    studentId: string,
    termId: string,
  ): Promise<Buffer> {
    const html = await this.generateTermReportHtml(studentId, termId);
    // The report template is a full-bleed A4 sheet with its own margins.
    return this.htmlToPdf(html, { marginMm: 0 });
  }

  async generateClassReportCards(classSectionId: string, termId: string) {
    const students = await this.prisma.student.findMany({
      where: { classSectionId, status: 'ACTIVE' },
      select: { id: true },
    });

    const reports = [];
    for (const student of students) {
      const data = await this.getTermReportData(student.id, termId);
      reports.push({ studentId: student.id, data });
    }

    return { count: reports.length, reports };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DOCUMENT GENERATION
  // ═══════════════════════════════════════════════════════════════════════════

  async generateDocument(
    studentId: string,
    type: string,
  ): Promise<{ html: string; title: string }> {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true, phone: true },
        },
        classSection: { include: { classLevel: true, trade: true } },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const school = await this.getSchoolInfo();
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    switch (type) {
      case 'transfer_letter':
        return {
          title: `Transfer Letter - ${student.user.firstName} ${student.user.lastName}`,
          html: this.renderLetterHtml(
            school,
            student,
            'Transfer Letter',
            `This is to certify that ${escapeHtml(student.user.firstName)} ${escapeHtml(student.user.lastName)} (Student ID: ${escapeHtml(student.studentIdNumber)}) was a student of ${school.name} in ${escapeHtml(classDisplayName(student.classSection))}. The student is hereby transferred from our institution as of ${today}.`,
          ),
        };
      case 'enrollment_confirmation':
        return {
          title: `Enrollment Confirmation - ${student.user.firstName} ${student.user.lastName}`,
          html: this.renderLetterHtml(
            school,
            student,
            'Enrollment Confirmation',
            `This is to confirm that ${escapeHtml(student.user.firstName)} ${escapeHtml(student.user.lastName)} (Student ID: ${escapeHtml(student.studentIdNumber)}) is currently enrolled at ${school.name} in ${escapeHtml(classDisplayName(student.classSection))} since ${student.enrollmentDate ? new Date(student.enrollmentDate).toLocaleDateString() : 'N/A'}.`,
          ),
        };
      case 'discipline_report': {
        const incidents = await this.prisma.disciplineIncident.findMany({
          where: { studentId },
          orderBy: { date: 'desc' },
          include: {
            recordedBy: { select: { firstName: true, lastName: true } },
          },
        });
        return {
          title: `Discipline Report - ${student.user.firstName} ${student.user.lastName}`,
          html: this.renderDisciplineReportHtml(school, student, incidents),
        };
      }
      case 'transcript': {
        const termResults = await this.prisma.termResult.findMany({
          where: { studentId },
          include: { term: { include: { academicYear: true } } },
          orderBy: { term: { startDate: 'asc' } },
        });
        return {
          title: `Transcript - ${student.user.firstName} ${student.user.lastName}`,
          html: this.renderTranscriptHtml(school, student, termResults),
        };
      }
      default:
        throw new NotFoundException('Unknown document type');
    }
  }

  async generateIdCardData(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: { select: { firstName: true, lastName: true, photoUrl: true } },
        classSection: { include: { classLevel: true, trade: true } },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const school = await this.getSchoolInfo();

    return {
      school,
      student: {
        name: `${student.user.firstName} ${student.user.lastName}`,
        studentIdNumber: student.studentIdNumber,
        cardId: student.nfcCardId,
        photoUrl: student.user.photoUrl,
        class: classDisplayName(student.classSection),
        qrData: student.nfcCardId || student.studentIdNumber, // QR encodes the card if issued
      },
    };
  }

  async generateBulkIdCards(classSectionId: string) {
    const students = await this.prisma.student.findMany({
      where: { classSectionId, status: 'ACTIVE' },
      select: { id: true },
    });
    const cards = [];
    for (const s of students) {
      cards.push(await this.generateIdCardData(s.id));
    }
    return { count: cards.length, cards };
  }

  // ── ID Card registry / issuance ──────────────────────────────────────────

  /**
   * The number stamped on the physical card, e.g. `4821 7390 5566`.
   *
   * Digits only, grouped in fours the way a bank card is, because it gets read
   * aloud and typed in by people who are not looking at a keyboard. Letters
   * invited O/0 and I/1 mistakes, and the MK prefix meant nothing to anyone
   * holding the card.
   */
  private generateCardId(): string {
    const digits = Array.from(randomBytes(12))
      .map((b) => b % 10)
      .join('');
    return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)}`;
  }

  /** Registry of students with their card status, filterable by section/search/status. */
  async getIdCardRegistry(query: {
    classSectionId?: string;
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const { classSectionId, search, status } = query;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));

    const where: any = { status: 'ACTIVE' };
    if (classSectionId) where.classSectionId = classSectionId;
    if (status === 'issued') where.nfcCardId = { not: null };
    else if (status === 'not_issued') where.nfcCardId = null;
    else if (status === 'suspended') where.cardSuspendedAt = { not: null };
    if (search?.trim()) {
      const s = search.trim();
      where.OR = [
        { studentIdNumber: { contains: s, mode: 'insensitive' } },
        { nfcCardId: { contains: s, mode: 'insensitive' } },
        { user: { firstName: { contains: s, mode: 'insensitive' } } },
        { user: { lastName: { contains: s, mode: 'insensitive' } } },
      ];
    }

    // The counts describe the whole filtered roll, not the page being shown:
    // "6 have a card" out of 773 is the number an admin acts on, and it must
    // not change as they page through.
    const [total, issued, suspended, students] = await Promise.all([
      this.prisma.student.count({ where }),
      this.prisma.student.count({
        where: { ...where, nfcCardId: { not: null } },
      }),
      this.prisma.student.count({
        where: { ...where, cardSuspendedAt: { not: null } },
      }),
      this.prisma.student.findMany({
        where,
        include: {
          user: { select: { firstName: true, lastName: true, photoUrl: true } },
          classSection: { include: { classLevel: true, trade: true } },
        },
        orderBy: [
          { classSection: { classLevel: { order: 'asc' } } },
          { user: { firstName: 'asc' } },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      total,
      issued,
      notIssued: total - issued,
      suspended,
      items: students.map((s) => this.toCardSummary(s)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /** Issue a card for one student (assigns a unique nfcCardId + issue date). */
  async issueIdCard(studentId: string, force = false) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
    });
    if (!student) throw new NotFoundException('Student not found');
    if (student.nfcCardId && !force) {
      return this.idCardSummary(studentId);
    }

    // Generate a unique card id (retry on the rare unique-constraint clash)
    let cardId = this.generateCardId();
    for (let i = 0; i < 5; i++) {
      const clash = await this.prisma.student.findUnique({
        where: { nfcCardId: cardId },
      });
      if (!clash) break;
      cardId = this.generateCardId();
    }

    // The verification code is what the printed QR carries. A fresh one every
    // issue is what makes reissuing a lost card revoke the old one.
    let cardCode = this.generateCardCode();
    for (let i = 0; i < 5; i++) {
      const clash = await this.prisma.student.findUnique({
        where: { cardCode },
      });
      if (!clash) break;
      cardCode = this.generateCardCode();
    }

    await this.prisma.student.update({
      where: { id: studentId },
      data: {
        nfcCardId: cardId,
        cardIssuedAt: new Date(),
        cardCode,
        // A newly issued card starts usable, whatever state the old one was in.
        cardSuspendedAt: null,
      },
    });
    return this.idCardSummary(studentId);
  }

  /** Issue cards for every student in a section that doesn't have one yet. */
  async issueBulkIdCards(classSectionId: string) {
    const students = await this.prisma.student.findMany({
      where: { classSectionId, status: 'ACTIVE', nfcCardId: null },
      select: { id: true },
    });
    for (const s of students) {
      await this.issueIdCard(s.id);
    }
    return { issued: students.length };
  }

  /**
   * An unguessable card code, Crockford base32 so it can be read aloud.
   *
   * I, L, O and U are left out: they are the characters people confuse with
   * 1, 0 and each other when reading a code off a card over the phone.
   */
  private generateCardCode(): string {
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    const bytes = randomBytes(12);
    let code = '';
    for (let i = 0; i < 12; i++) {
      code += alphabet[bytes[i] % alphabet.length];
    }
    return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
  }

  /**
   * What the public verification page shows for a scanned card.
   *
   * Deliberately narrow: enough for someone at a gate to tell whether the card
   * is real and whether the face in front of them matches it. No contact
   * details, no address, nothing that turns a found card into a way to reach
   * a child.
   */
  async verifyCardByCode(code: string) {
    const student = await this.prisma.student.findUnique({
      where: { cardCode: code },
      select: {
        studentIdNumber: true,
        status: true,
        cardIssuedAt: true,
        cardSuspendedAt: true,
        user: { select: { firstName: true, lastName: true, photoUrl: true } },
        classSection: { select: { classLevel: { select: { name: true } } } },
      },
    });

    if (!student) {
      return {
        valid: false,
        reason:
          'This card is not valid. It may have been reissued, or it was never issued by this school.',
      };
    }

    // A suspended card is a real card its holder has temporarily lost the use
    // of, which is a different answer from one that was never issued.
    if (student.cardSuspendedAt) {
      return {
        valid: false,
        reason:
          'This card is suspended. It was reported lost or withheld, and is not valid until the school restores it.',
        suspended: true,
        student: {
          name: `${student.user.firstName} ${student.user.lastName}`,
          studentIdNumber: student.studentIdNumber,
          level: student.classSection?.classLevel?.name ?? null,
          photoUrl: student.user.photoUrl,
          status: student.status,
        },
        issuedAt: student.cardIssuedAt,
      };
    }

    return {
      valid: student.status === 'ACTIVE',
      reason:
        student.status === 'ACTIVE'
          ? null
          : `This student is no longer enrolled (${student.status.toLowerCase()}).`,
      student: {
        name: `${student.user.firstName} ${student.user.lastName}`,
        studentIdNumber: student.studentIdNumber,
        level: student.classSection?.classLevel?.name ?? null,
        photoUrl: student.user.photoUrl,
        status: student.status,
      },
      issuedAt: student.cardIssuedAt,
    };
  }

  /**
   * Suspend a card without destroying it.
   *
   * For a card mislaid rather than lost: it stops verifying immediately, and
   * the same printed card works again once it turns up. Revoking is the
   * permanent version, and forces a reprint.
   */
  async suspendIdCard(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, cardCode: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    if (!student.cardCode) {
      throw new BadRequestException('This student has no card to suspend');
    }
    await this.prisma.student.update({
      where: { id: studentId },
      data: { cardSuspendedAt: new Date() },
    });
    return this.idCardSummary(studentId);
  }

  /** Bring a suspended card back, once it has been found. */
  async restoreIdCard(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    await this.prisma.student.update({
      where: { id: studentId },
      data: { cardSuspendedAt: null },
    });
    return this.idCardSummary(studentId);
  }

  /** Revoke a student's card. */
  async revokeIdCard(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
    });
    if (!student) throw new NotFoundException('Student not found');
    await this.prisma.student.update({
      where: { id: studentId },
      // Clearing the code is the revocation: the old printed card still
      // scans, and the verification page answers that it is not valid.
      data: {
        nfcCardId: null,
        cardIssuedAt: null,
        cardCode: null,
        cardSuspendedAt: null,
      },
    });
    return { success: true };
  }

  private async idCardSummary(studentId: string) {
    const s = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: { select: { firstName: true, lastName: true, photoUrl: true } },
        classSection: { include: { classLevel: true, trade: true } },
      },
    });
    if (!s) throw new NotFoundException('Student not found');
    return this.toCardSummary(s);
  }

  private toCardSummary(s: any) {
    return {
      id: s.id,
      name: `${s.user.firstName} ${s.user.lastName}`,
      studentIdNumber: s.studentIdNumber,
      photoUrl: s.user.photoUrl,
      class: classDisplayName(s.classSection),
      level: s.classSection?.classLevel?.name ?? null,
      classSectionId: s.classSectionId,
      cardId: s.nfcCardId,
      hasCard: !!s.nfcCardId,
      cardIssuedAt: s.cardIssuedAt,
      cardCode: s.cardCode ?? null,
      suspended: !!s.cardSuspendedAt,
      cardSuspendedAt: s.cardSuspendedAt ?? null,
      verifyUrl: s.cardCode
        ? `${this.webBaseUrl()}/verify/card/${s.cardCode}`
        : null,
    };
  }

  /**
   * The card's QR, as a data URI ready to drop into the printed artwork.
   *
   * Pure black on white: tinting a QR, rounding its modules or covering the
   * centre with a logo all cut the scan rate on the cheap handheld readers a
   * school actually buys.
   */
  async cardQr(studentId: string): Promise<string | null> {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { cardCode: true, studentIdNumber: true },
    });
    if (!student?.cardCode) return null;
    return QRCode.toDataURL(
      `${this.webBaseUrl()}/verify/card/${student.cardCode}`,
      {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 360,
        color: { dark: '#000000', light: '#ffffff' },
      },
    );
  }

  // ── Full data export (ZIP of CSVs) ────────────────────────────────────────

  /** Dump every meaningful table to a CSV and bundle them into one ZIP. */
  async exportEverythingZip(): Promise<Buffer> {
    const strip = (rows: any[], omit: string[] = []) =>
      rows.map((r) => {
        const clone: any = { ...r };
        for (const k of omit) delete clone[k];
        return clone;
      });

    const tables: { name: string; rows: any[] }[] = [];
    tables.push({
      name: 'users',
      rows: strip(await this.prisma.user.findMany(), ['passwordHash']),
    });
    tables.push({
      name: 'students',
      rows: await this.prisma.student.findMany(),
    });
    tables.push({
      name: 'teachers',
      rows: await this.prisma.teacher.findMany(),
    });
    tables.push({
      name: 'parent_students',
      rows: await this.prisma.parentStudent.findMany(),
    });
    tables.push({
      name: 'academic_years',
      rows: await this.prisma.academicYear.findMany(),
    });
    tables.push({ name: 'terms', rows: await this.prisma.term.findMany() });
    tables.push({
      name: 'class_levels',
      rows: await this.prisma.classLevel.findMany(),
    });
    tables.push({
      name: 'class_sections',
      rows: await this.prisma.classSection.findMany(),
    });
    tables.push({
      name: 'subjects',
      rows: await this.prisma.subject.findMany(),
    });
    tables.push({
      name: 'assessment_types',
      rows: await this.prisma.assessmentType.findMany(),
    });
    tables.push({
      name: 'timetables',
      rows: await this.prisma.timetable.findMany(),
    });
    tables.push({
      name: 'teacher_roles',
      rows: await this.prisma.teacherRole.findMany(),
    });
    tables.push({
      name: 'teacher_subject_classes',
      rows: await this.prisma.teacherSubjectClass.findMany(),
    });
    tables.push({ name: 'marks', rows: await this.prisma.mark.findMany() });
    tables.push({
      name: 'term_results',
      rows: await this.prisma.termResult.findMany(),
    });
    tables.push({
      name: 'year_results',
      rows: await this.prisma.yearResult.findMany(),
    });
    tables.push({
      name: 'attendance',
      rows: await this.prisma.attendance.findMany(),
    });
    tables.push({
      name: 'teacher_attendance',
      rows: await this.prisma.teacherAttendance.findMany(),
    });
    tables.push({
      name: 'discipline_incidents',
      rows: await this.prisma.disciplineIncident.findMany(),
    });
    tables.push({
      name: 'discipline_appeals',
      rows: await this.prisma.disciplineAppeal.findMany(),
    });
    tables.push({ name: 'books', rows: await this.prisma.book.findMany() });
    tables.push({
      name: 'book_loans',
      rows: await this.prisma.bookLoan.findMany(),
    });
    tables.push({
      name: 'homework',
      rows: await this.prisma.homework.findMany(),
    });
    tables.push({
      name: 'homework_submissions',
      rows: await this.prisma.homeworkSubmission.findMany(),
    });
    tables.push({
      name: 'exam_schedules',
      rows: await this.prisma.examSchedule.findMany(),
    });
    tables.push({
      name: 'school_config',
      rows: await this.prisma.schoolConfig.findMany(),
    });

    const files = tables.map((t) => ({
      name: `${t.name}.csv`,
      content: toCsv(t.rows),
    }));
    // Manifest: a quick index of what's inside and row counts
    files.push({
      name: 'manifest.csv',
      content: toCsv([
        { exportedAt: new Date().toISOString(), tables: tables.length },
        ...tables.map((t) => ({ table: t.name, rows: t.rows.length })),
      ]),
    });

    return buildZip(files);
  }

  // ── Single-dataset CSV export ─────────────────────────────────────────────

  /**
   * One dataset as a readable CSV (names resolved, not raw foreign keys).
   * Built server-side so large tables don't fight the API's pagination cap
   * and rate limit from the browser.
   */
  async exportDatasetCsv(
    dataset: string,
  ): Promise<{ filename: string; csv: string }> {
    const date = new Date().toISOString().slice(0, 10);
    const filename = `${dataset}_export_${date}.csv`;

    const userRow = (u: any) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email ?? '',
      phone: u.phone ?? '',
      role: u.role,
      isActive: u.isActive,
      studentId: u.student?.studentIdNumber ?? '',
      studentStatus: u.student?.status ?? '',
      class: u.student?.classSection
        ? [
            u.student.classSection.classLevel?.name,
            u.student.classSection.trade?.code,
            u.student.classSection.name,
          ]
            .filter(Boolean)
            .join(' ')
        : '',
    });

    const userInclude = {
      student: {
        include: {
          classSection: {
            include: { classLevel: true, trade: true },
          },
        },
      },
    } as const;

    switch (dataset) {
      case 'users': {
        const rows = await this.prisma.user.findMany({
          include: userInclude,
          orderBy: { createdAt: 'asc' },
        });
        return { filename, csv: toCsv(rows.map(userRow)) };
      }
      case 'students':
      case 'teachers': {
        const rows = await this.prisma.user.findMany({
          where: { role: dataset === 'students' ? 'STUDENT' : 'TEACHER' },
          include: userInclude,
          orderBy: { createdAt: 'asc' },
        });
        return { filename, csv: toCsv(rows.map(userRow)) };
      }
      // The two big tables (hundreds of thousands of rows) are fetched flat and
      // joined via lookup maps — nested includes at this scale exhaust memory.
      case 'marks': {
        const [rows, students, subjects, assessmentTypes, terms] =
          await Promise.all([
            this.prisma.mark.findMany({ orderBy: { createdAt: 'asc' } }),
            this.prisma.student.findMany({
              select: {
                id: true,
                studentIdNumber: true,
                user: { select: { firstName: true, lastName: true } },
              },
            }),
            this.prisma.subject.findMany({
              select: { id: true, name: true },
            }),
            this.prisma.assessmentType.findMany({
              select: { id: true, name: true },
            }),
            this.prisma.term.findMany({ select: { id: true, name: true } }),
          ]);
        const studentById = new Map(students.map((s) => [s.id, s]));
        const subjectById = new Map(subjects.map((s) => [s.id, s.name]));
        const atById = new Map(assessmentTypes.map((a) => [a.id, a.name]));
        const termById = new Map(terms.map((t) => [t.id, t.name]));
        return {
          filename,
          csv: toCsv(
            rows.map((m) => {
              const st = studentById.get(m.studentId);
              return {
                studentId: st?.studentIdNumber ?? '',
                student: st?.user
                  ? `${st.user.firstName} ${st.user.lastName}`
                  : '',
                subject: subjectById.get(m.subjectId) ?? '',
                assessment: atById.get(m.assessmentTypeId) ?? '',
                term: termById.get(m.termId) ?? '',
                score: m.score,
                maxScore: m.maxScore,
              };
            }),
          ),
        };
      }
      case 'attendance': {
        const [rows, students] = await Promise.all([
          this.prisma.attendance.findMany({ orderBy: { date: 'asc' } }),
          this.prisma.student.findMany({
            select: {
              id: true,
              studentIdNumber: true,
              user: { select: { firstName: true, lastName: true } },
            },
          }),
        ]);
        const studentById = new Map(students.map((s) => [s.id, s]));
        return {
          filename,
          csv: toCsv(
            rows.map((a) => {
              const st = studentById.get(a.studentId);
              return {
                studentId: st?.studentIdNumber ?? '',
                student: st?.user
                  ? `${st.user.firstName} ${st.user.lastName}`
                  : '',
                date: a.date.toISOString().slice(0, 10),
                status: a.status,
                reason: a.reasonCategory ?? '',
              };
            }),
          ),
        };
      }
      default:
        throw new BadRequestException(
          `Unknown dataset "${dataset}". Valid: users, students, teachers, marks, attendance`,
        );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private async getSchoolInfo() {
    const configs = await this.prisma.schoolConfig.findMany();
    const map: Record<string, string> = {};
    for (const c of configs) map[c.key] = c.value;
    return {
      name: escapeHtml(map['school_name']),
      website: escapeHtml(map['school_website'] || ''),
      motto: escapeHtml(map['school_motto'] || map['motto']),
      address: escapeHtml(map['school_address'] || ''),
      phone: escapeHtml(map['school_phone'] || ''),
      email: escapeHtml(map['school_email'] || ''),
      logoUrl: map['logo_url'] || null,
      stampUrl: map['stamp_url'] || null,
      signatureUrl: map['signature_url'] || null,
      primaryColor: sanitizeColor(map['primary_color']),
    };
  }

  private groupMarksBySubject(marks: any[]) {
    const map = new Map<
      string,
      { subject: string; scope: SubjectScope; assessments: any[] }
    >();
    for (const m of marks) {
      if (!map.has(m.subjectId)) {
        map.set(m.subjectId, {
          subject: m.subject.name,
          scope: m.subject.scope,
          assessments: [],
        });
      }
      map.get(m.subjectId)!.assessments.push({
        type: m.assessmentType.name,
        score: m.score,
        maxScore: m.maxScore,
        pct: Math.round((m.score / m.maxScore) * 100),
      });
    }

    const SCOPE_ORDER: Record<string, number> = {
      O_CORE: 0,
      O_ELECTIVE: 1,
      A_GENERAL: 2,
      A_SPECIFIC: 3,
    };

    return Array.from(map.values())
      .map((val) => {
        const total = computeSubjectTotal(
          val.scope,
          val.assessments.map((a: any) => ({
            assessmentName: a.type,
            score: a.score,
            maxScore: a.maxScore,
          })),
        );
        const band = total !== null ? gradeFor(val.scope, total) : null;
        const practical = val.assessments.find(
          (a: any) => a.type === 'Practical',
        );
        return {
          ...val,
          // Kept for older consumers; equals the weighted term total.
          average: total ?? 0,
          total,
          grade: band?.letter ?? null,
          points: band?.points ?? null,
          remark: band?.remark ?? null,
          competence:
            val.scope === SubjectScope.A_SPECIFIC
              ? competenceFor(practical ? practical.pct : null)
              : null,
        };
      })
      .sort(
        (a, b) =>
          (SCOPE_ORDER[a.scope] ?? 9) - (SCOPE_ORDER[b.scope] ?? 9) ||
          a.subject.localeCompare(b.subject),
      );
  }

  private groupMarksBySubjectAndTerm(marks: any[], terms: any[]) {
    const result: Record<string, Record<string, number>> = {};
    for (const m of marks) {
      if (!result[m.subject.name]) result[m.subject.name] = {};
      const termName = terms.find((t: any) => t.id === m.termId)?.name || '';
      const pct = Math.round((m.score / m.maxScore) * 100);
      if (!result[m.subject.name][termName])
        result[m.subject.name][termName] = pct;
      else
        result[m.subject.name][termName] = Math.round(
          (result[m.subject.name][termName] + pct) / 2,
        );
    }
    return result;
  }

  // The approved A4 report card. One full-bleed 210x297mm sheet; layout,
  // colors and structure are locked to the design signed off in review.
  private renderTermReportHtml(data: any, qrDataUri: string | null): string {
    const navy = data.school.primaryColor || '#1B4F72';
    const logo = logoDataUri(data.school.logoUrl);
    const isALevel = data.student.stage === 'A_LEVEL';

    const initials = (data.school.name || 'MA')
      .split(/\s+/)
      .map((w: string) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    const crest = logo
      ? `<img class="crest-img" src="${logo}" alt="" />`
      : `<div class="crest">${initials}</div>`;

    const regTail = String(data.student.studentIdNumber || '')
      .split('-')
      .pop();
    const issued = new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    const info = (label: string, value: string) =>
      `<div><span>${label}</span><b>${value}</b></div>`;

    const attendance =
      data.attendance && data.attendance.total > 0
        ? `${data.attendance.present} / ${data.attendance.total} days (${Math.round((data.attendance.present / data.attendance.total) * 100)}%)`
        : '–';

    const conduct = (() => {
      const p = data.student.disciplinePoints;
      if (p == null) return '–';
      if (p >= 95) return 'Excellent';
      if (p >= 85) return 'Very Good';
      if (p >= 70) return 'Good';
      if (p >= 50) return 'Fair';
      return 'Poor';
    })();

    const cell = (s: any, name: string) => {
      const a = s.assessments.find((x: any) => x.type === name);
      return `<td class="num">${a ? a.pct : '–'}</td>`;
    };

    const row = (s: any) => `
      <tr>
        <td class="subj">${escapeHtml(s.subject)}</td>
        ${cell(s, 'CAT 1')}${cell(s, 'CAT 2')}${isALevel ? cell(s, 'Practical') : ''}${cell(s, 'End of Term Exam')}
        <td class="tot">${s.total ?? '–'}</td>
        <td class="gr">${s.grade ?? '–'}</td>
        <td class="num">${s.points ?? '–'}</td>
        ${
          isALevel
            ? `<td>${
                s.competence
                  ? s.competence === 'COMPETENT'
                    ? '<span class="chip ok">Competent</span>'
                    : '<span class="chip no">Not Yet Competent</span>'
                  : '–'
              }</td>`
            : `<td class="rem">${s.remark ?? '–'}</td>`
        }
      </tr>`;

    const cols = isALevel ? 9 : 8;
    const groupRow = (label: string, note: string) =>
      `<tr class="group"><td colspan="${cols}">${label} <span class="gnote">(${note})</span></td></tr>`;

    let tableBody = '';
    if (isALevel) {
      const general = data.subjects.filter(
        (s: any) => s.scope !== 'A_SPECIFIC',
      );
      const specific = data.subjects.filter(
        (s: any) => s.scope === 'A_SPECIFIC',
      );
      tableBody =
        groupRow(
          'General modules',
          'CAT 1 20% + CAT 2 20% + Exam 60%, no practical',
        ) +
        general.map(row).join('') +
        groupRow(
          `Specific modules, ${escapeHtml(data.student.trade?.name || '')} ${escapeHtml(data.student.class.split(' ').slice(0, 2).join(' '))}`,
          'CAT 1 15% + CAT 2 15% + Practical 30% + Exam 40%',
        ) +
        specific.map(row).join('');
    } else {
      const core = data.subjects.filter((s: any) => s.scope === 'O_CORE');
      const electives = data.subjects.filter(
        (s: any) => s.scope === 'O_ELECTIVE',
      );
      tableBody =
        groupRow('Core subjects', 'count towards the aggregate') +
        core.map(row).join('') +
        (electives.length
          ? groupRow(
              'Elective subjects',
              'graded on the stricter non-core scale',
            ) + electives.map(row).join('')
          : '');
    }

    const headCols = isALevel
      ? `<th style="text-align:left">Module</th><th>CAT 1</th><th>CAT 2</th><th>Practical</th><th>Exam</th><th>Total<br>/100</th><th>Grade</th><th>Points</th><th>Competence</th>`
      : `<th style="text-align:left">Subject</th><th>CAT 1<br>(20%)</th><th>CAT 2<br>(20%)</th><th>Exam<br>(60%)</th><th>Total<br>/100</th><th>Grade</th><th>Points</th><th style="text-align:left">Remark</th>`;

    const totalMax = data.subjects.length * 100;
    const overall = data.result ? overallGrade(data.result.average || 0) : null;
    const specificSubjects = data.subjects.filter(
      (s: any) => s.scope === 'A_SPECIFIC',
    );
    const competentCount = specificSubjects.filter(
      (s: any) => s.competence === 'COMPETENT',
    ).length;

    const summaryCell = (label: string, big: string, small: string) =>
      `<div class="cell"><span>${label}</span><b>${big}</b> <small>${small}</small></div>`;

    const summary = [
      summaryCell(
        'Total marks',
        `${Math.round(data.result?.totalMarks ?? 0)}`,
        `/ ${totalMax}`,
      ),
      summaryCell('Average', `${(data.result?.average ?? 0).toFixed(1)}%`, ''),
      summaryCell(
        'Overall grade',
        data.result?.letterGrade || '–',
        overall?.remark || '',
      ),
      summaryCell(
        'Aggregate',
        `${data.result?.aggregate ?? '–'}`,
        `/ ${data.result?.aggregateMax ?? '–'}`,
      ),
      summaryCell(
        'Position',
        `${data.result?.rank ?? '–'}`,
        `of ${data.classStats.totalStudents}`,
      ),
      isALevel
        ? summaryCell(
            'Practicals',
            `${competentCount} / ${specificSubjects.length}`,
            'Competent',
          )
        : summaryCell('Conduct', conduct, ''),
    ].join('');

    const aggregateNote = isALevel
      ? `Aggregate = sum of points over all ${data.subjects.length} modules taken this term (${data.subjects.length} × 6 = ${data.result?.aggregateMax ?? ''}). In national examinations NESA counts a fixed set of papers with a maximum aggregate of 60.`
      : 'Aggregate = sum of points from the 9 core subjects only, as in national examinations (maximum 54).';

    const scaleTable = (title: string, rows: string[][]) => `
      <div>
        <h4>${title}</h4>
        <table class="scale">
          ${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}
        </table>
      </div>`;

    const coreScaleRows = [
      [
        'Marks %',
        '70-100',
        '65-69',
        '60-64',
        '50-59',
        '40-49',
        '20-39',
        '0-19',
      ],
      ['Grade', 'A', 'B', 'C', 'D', 'E', 'S', 'F'],
      ['Points', '6', '5', '4', '3', '2', '1', '0'],
    ];
    const electiveScaleRows = [
      [
        'Marks %',
        '80-100',
        '75-79',
        '70-74',
        '65-69',
        '60-64',
        '50-59',
        '0-49',
      ],
      ['Grade', 'A', 'B', 'C', 'D', 'E', 'S', 'F'],
      ['Points', '6', '5', '4', '3', '2', '1', '0'],
    ];

    const legend = isALevel
      ? scaleTable('Module scale (all modules)', coreScaleRows) +
        `<div class="note"><h4>Competence</h4>Practical mark 70-100 = Competent.<br>Below 70 = Not Yet Competent.<br>Certificates require at least grade E in practicals.</div>`
      : scaleTable('Core subject scale', coreScaleRows) +
        scaleTable('Elective (non-core) scale', electiveScaleRows);

    const verifyStrip = data.verification
      ? `
      <div class="verify-strip">
        <div class="qr">${qrDataUri ? `<img src="${qrDataUri}" alt="QR code linking to the digital report" />` : ''}</div>
        <div class="vtext">
          <h4>Report verification</h4>
          <p>Scan the QR code or open the link to view the digital original of this report. A printed copy is valid only
          if it matches the digital version. Each code is unique to one report and is never reused.</p>
          <a href="${data.verification.url}">${data.verification.url.replace(/^https?:\/\//, '')}</a>
        </div>
        <div class="vcode">
          <span>Verification code</span>
          <b>${data.verification.code}</b>
        </div>
      </div>`
      : '';

    const stageTitle = isALevel ? 'Advanced Level (TVET)' : 'Ordinary Level';
    const sectorLine = isALevel
      ? ` &nbsp;•&nbsp; Sector of ${escapeHtml(data.student.trade?.sector || '')}`
      : '';

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{ box-sizing:border-box; margin:0; padding:0; }
      @page{ size:A4; margin:0; }
      body{
        font-family:Poppins,'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;
        color:#1c2733; background:#fff; width:210mm;
      }
      .sheet{ width:210mm; height:296.5mm; overflow:hidden; padding:8mm 12mm 7mm; display:flex; flex-direction:column; }
      .sheet *{ line-height:1.35; }
      .off{ display:flex; align-items:center; gap:14px; padding-bottom:10px; border-bottom:3px double ${navy}; }
      .crest{ width:50px; height:50px; border-radius:50%; flex:0 0 50px; background:${navy}; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:18px; }
      .crest-img{ width:50px; height:50px; object-fit:contain; flex:0 0 50px; }
      .off-lines{ flex:1; }
      .off-lines .rep{ font-size:10.5px; text-transform:uppercase; letter-spacing:.14em; color:#5b6b7b; }
      .off-lines .school{ font-size:17.5px; font-weight:700; color:${navy}; }
      .off-lines .addr{ font-size:11px; color:#5b6b7b; }
      .doc-no{ text-align:right; font-size:10.5px; color:#5b6b7b; }
      .doc-no b{ display:block; color:#1c2733; font-size:11.5px; }
      .title-band{ margin:10px 0 12px; background:#eef4f9; border:1px solid rgba(21,37,54,.09); text-align:center; padding:7px 12px; border-radius:4px; }
      .title-band .t{ font-size:14.5px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:${navy}; }
      .title-band .s{ font-size:11px; color:#5b6b7b; margin-top:2px; }
      .info{ display:grid; grid-template-columns:repeat(4,1fr); gap:8px 18px; font-size:11.5px; margin-bottom:12px; }
      .info div span{ display:block; font-size:9.5px; text-transform:uppercase; letter-spacing:.1em; color:#5b6b7b; margin-bottom:2px; }
      .info div b{ font-weight:600; }
      table.marks{ border-collapse:collapse; width:100%; font-size:11.5px; }
      table.marks th, table.marks td{ border:1px solid rgba(21,37,54,.16); padding:3px 7px; }
      table.marks thead th{ background:${navy}; color:#fff; font-weight:600; font-size:10.5px; text-transform:uppercase; letter-spacing:.06em; text-align:center; }
      table.marks td{ text-align:center; font-variant-numeric:tabular-nums; }
      table.marks td.subj{ text-align:left; font-weight:500; }
      table.marks td.num{ color:#33414e; }
      table.marks td.tot{ font-weight:700; }
      table.marks td.gr{ font-weight:700; color:${navy}; }
      table.marks td.rem{ font-size:11px; color:#5b6b7b; text-align:left; }
      tr.group td{ background:#eef4f9; color:${navy}; font-weight:600; text-align:left; font-size:10.5px; text-transform:uppercase; letter-spacing:.08em; }
      tr.group .gnote{ text-transform:none; letter-spacing:0; }
      .core{ color:#2E86C1; font-weight:700; }
      .chip{ font-size:10px; font-weight:600; white-space:nowrap; }
      .chip.ok{ color:#1a7f45; }
      .chip.no{ color:#b3261e; }
      .foot-note{ font-size:10px; color:#5b6b7b; margin-top:4px; }
      .summary{ display:grid; grid-template-columns:repeat(6,1fr); gap:8px; margin:10px 0 3px; }
      .cell{ border:1px solid rgba(21,37,54,.09); border-radius:4px; padding:6px 8px; text-align:center; background:#f8fbfd; }
      .cell span{ display:block; font-size:9px; text-transform:uppercase; letter-spacing:.1em; color:#5b6b7b; margin-bottom:3px; }
      .cell b{ font-size:15px; font-weight:700; color:${navy}; font-variant-numeric:tabular-nums; }
      .cell small{ font-size:10px; color:#5b6b7b; font-weight:500; }
      .comments{ display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:10px; font-size:11px; }
      .comments .box{ border:1px solid rgba(21,37,54,.09); border-radius:4px; padding:7px 10px; }
      .comments .box span{ display:block; font-size:9.5px; text-transform:uppercase; letter-spacing:.1em; color:#5b6b7b; margin-bottom:4px; }
      .sigs{ display:grid; grid-template-columns:repeat(3,1fr); gap:22px; margin-top:10px; font-size:10.5px; color:#5b6b7b; text-align:center; }
      .sigs div{ border-top:1px dotted rgba(21,37,54,.16); padding-top:6px; }
      .legend{ margin-top:auto; border-top:1px solid rgba(21,37,54,.09); padding-top:6px; display:flex; gap:14px; align-items:flex-start; }
      .legend > div{ flex:1 1 0; min-width:0; }
      table.scale{ width:100%; }
      .legend h4, .note h4{ margin:0 0 6px; font-size:9.5px; text-transform:uppercase; letter-spacing:.1em; color:#5b6b7b; font-weight:600; }
      table.scale{ border-collapse:collapse; font-size:10px; }
      table.scale td{ border:1px solid rgba(21,37,54,.09); padding:3px 7px; text-align:center; font-variant-numeric:tabular-nums; }
      table.scale tr:first-child td{ background:#eef4f9; font-weight:600; color:${navy}; }
      .legend .note{ font-size:10.5px; color:#5b6b7b; max-width:26ch; }
      .verify-strip{ margin-top:6px; display:none; gap:12px; align-items:center; border:1px solid rgba(21,37,54,.09); border-radius:4px; padding:6px 10px; background:#f8fbfd; }
      .verify-strip .qr{ width:17mm; height:17mm; flex:0 0 17mm; }
      .verify-strip .qr img{ width:100%; height:100%; display:block; }
      .verify-strip h4{ margin:0 0 3px; font-size:9.5px; text-transform:uppercase; letter-spacing:.1em; color:${navy}; font-weight:600; }
      .verify-strip p{ margin:0; font-size:9.5px; color:#5b6b7b; line-height:1.5; max-width:62ch; }
      .verify-strip .vtext{ flex:1; }
      .verify-strip a{ font-size:10.5px; color:#2E86C1; font-weight:600; word-break:break-all; text-decoration:none; }
      .verify-strip .vcode{ text-align:right; }
      .verify-strip .vcode span{ display:block; font-size:9px; text-transform:uppercase; letter-spacing:.1em; color:#5b6b7b; margin-bottom:3px; }
      .verify-strip .vcode b{ font-size:11.5px; color:#1c2733; letter-spacing:.05em; font-variant-numeric:tabular-nums; white-space:nowrap; }
      /* Verification only matters on paper: shown in print and the generated
         PDF, hidden in on-screen previews. */
      @media print{ .verify-strip{ display:flex; } }
    </style></head><body>
    <div class="sheet">
      <div class="off">
        ${crest}
        <div class="off-lines">
          <div class="rep">Republic of Rwanda &nbsp;•&nbsp; Ministry of Education</div>
          <div class="school">${data.school.name}</div>
          <div class="addr">${data.school.address || ''}${data.school.email ? ` &nbsp;•&nbsp; ${data.school.email}` : ''}${data.school.phone ? ` &nbsp;•&nbsp; ${data.school.phone}` : ''}</div>
        </div>
        <div class="doc-no"><b>No ${initials}/RC/${new Date().getFullYear()}/${regTail}</b>Issued: ${issued}</div>
      </div>

      <div class="title-band">
        <div class="t">End of ${escapeHtml(data.term.name)} Report Card, ${stageTitle}</div>
        <div class="s">${escapeHtml(data.term.academicYear)} School Year${sectorLine}</div>
      </div>

      <div class="info">
        ${info('Student name', escapeHtml(data.student.name))}
        ${info('Registration No', escapeHtml(data.student.studentIdNumber))}
        ${info('Class', escapeHtml(data.student.class))}
        ${info('Class size', `${data.classStats.totalStudents} students`)}
        ${isALevel ? info('Trade section', `${escapeHtml(data.student.trade?.name || '')} (${escapeHtml(data.student.trade?.code || '')})`) : info('Level', 'Ordinary Level (O-Level)')}
        ${info('Term', escapeHtml(data.term.name))}
        ${info('Class teacher', data.classTeacher ? escapeHtml(data.classTeacher) : '–')}
        ${info('Attendance', attendance)}
      </div>

      <table class="marks">
        <thead><tr>${headCols}</tr></thead>
        <tbody>${tableBody}</tbody>
      </table>
      <div class="foot-note">${
        isALevel
          ? 'Competence follows the practical mark: 70% and above = Competent. All modules are graded on the core scale.'
          : 'Total = (CAT 1 × 0.2) + (CAT 2 × 0.2) + (Exam × 0.6), rounded.'
      }</div>

      <div class="summary">${summary}</div>
      <div class="foot-note">${aggregateNote}</div>

      <div class="comments">
        <div class="box"><span>Class teacher's comment</span>${escapeHtml(data.result?.teacherComment) || '&nbsp;'}</div>
        <div class="box"><span>Head teacher's comment</span>${escapeHtml(data.result?.headmasterComment) || '&nbsp;'}</div>
      </div>

      <div class="sigs">
        <div>Class Teacher${data.classTeacher ? `<br>${escapeHtml(data.classTeacher)}` : ''}</div>
        <div>Head Teacher</div>
        <div>Parent / Guardian</div>
      </div>

      <div class="legend">${legend}</div>
      ${verifyStrip}
    </div>
    </body></html>`;
  }

  /**
   * One A4 sheet, shared by every document the school issues.
   *
   * The report card was already a full-bleed 210x297mm page with the school's
   * own crest, stamp and signature; the letters were Arial on a 40px margin
   * and looked like a different school had written them. This is the same
   * sheet, so a transfer letter and a report card sit in the same folder
   * without one of them looking improvised.
   */
  private renderDocumentShell(
    school: any,
    opts: {
      title: string;
      subtitle?: string;
      reference?: string;
      body: string;
      signOff?: boolean;
    },
  ): string {
    const navy = school.primaryColor || '#1B4F72';
    const logo = logoDataUri(school.logoUrl);
    const stamp = logoDataUri(school.stampUrl);
    const signature = logoDataUri(school.signatureUrl);
    const today = new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const crest = logo
      ? `<img class="crest-img" src="${logo}" alt="" />`
      : `<div class="crest">${escapeHtml((school.name || 'S').slice(0, 2).toUpperCase())}</div>`;

    const contact = [school.address, school.phone, school.email, school.website]
      .filter(Boolean)
      .join(' &nbsp;•&nbsp; ');

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{ box-sizing:border-box; margin:0; padding:0; }
      @page{ size:A4; margin:0; }
      body{
        font-family:Poppins,'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;
        color:#1c2733; background:#fff; width:210mm;
      }
      .sheet{ width:210mm; min-height:296.5mm; padding:14mm 16mm 12mm; display:flex; flex-direction:column; }
      .sheet *{ line-height:1.45; }
      .off{ display:flex; align-items:center; gap:14px; padding-bottom:10px; border-bottom:3px double ${navy}; }
      .crest{ width:52px; height:52px; border-radius:50%; flex:0 0 52px; background:${navy}; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:18px; }
      .crest-img{ width:52px; height:52px; object-fit:contain; flex:0 0 52px; }
      .off-lines{ flex:1; }
      .off-lines .school{ font-size:18px; font-weight:700; color:${navy}; }
      .off-lines .motto{ font-size:11px; color:#5b6b7b; font-style:italic; }
      .off-lines .addr{ font-size:10.5px; color:#5b6b7b; margin-top:2px; }
      .doc-no{ text-align:right; font-size:10.5px; color:#5b6b7b; }
      .doc-no b{ display:block; color:#1c2733; font-size:11.5px; }
      .title-band{ margin:14px 0 16px; background:#eef4f9; border:1px solid rgba(21,37,54,.09); text-align:center; padding:8px 12px; border-radius:4px; }
      .title-band .t{ font-size:15px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:${navy}; }
      .title-band .s{ font-size:11px; color:#5b6b7b; margin-top:2px; }
      .content{ flex:1; font-size:12.5px; }
      .content p{ margin-bottom:11px; text-align:justify; }
      table.doc{ border-collapse:collapse; width:100%; font-size:11.5px; margin:10px 0; }
      table.doc th{ background:#eef4f9; color:${navy}; text-align:left; padding:6px 8px; border:1px solid rgba(21,37,54,.12); font-size:10.5px; text-transform:uppercase; letter-spacing:.06em; }
      table.doc td{ padding:6px 8px; border:1px solid rgba(21,37,54,.12); }
      table.doc tr:nth-child(even) td{ background:#fafcfd; }
      .signoff{ margin-top:auto; padding-top:18px; display:flex; justify-content:space-between; align-items:flex-end; }
      .sig-block{ text-align:center; font-size:11px; color:#5b6b7b; }
      .sig-img{ height:42px; object-fit:contain; display:block; margin:0 auto 2px; }
      .sig-line{ border-top:1px solid #1c2733; width:170px; padding-top:3px; margin-top:20px; }
      .stamp-img{ height:82px; object-fit:contain; opacity:.9; }
      .foot{ margin-top:14px; padding-top:8px; border-top:1px solid rgba(21,37,54,.12); font-size:9.5px; color:#5b6b7b; text-align:center; }
    </style></head><body>
      <div class="sheet">
        <div class="off">
          ${crest}
          <div class="off-lines">
            <div class="school">${school.name}</div>
            ${school.motto ? `<div class="motto">${school.motto}</div>` : ''}
            ${contact ? `<div class="addr">${contact}</div>` : ''}
          </div>
          <div class="doc-no">
            ${opts.reference ? `<b>${escapeHtml(opts.reference)}</b>` : ''}
            ${today}
          </div>
        </div>

        <div class="title-band">
          <div class="t">${escapeHtml(opts.title)}</div>
          ${opts.subtitle ? `<div class="s">${escapeHtml(opts.subtitle)}</div>` : ''}
        </div>

        <div class="content">${opts.body}</div>

        ${
          opts.signOff === false
            ? ''
            : `<div class="signoff">
                 <div class="sig-block">
                   ${signature ? `<img class="sig-img" src="${signature}" alt="" />` : ''}
                   <div class="sig-line">Head Teacher</div>
                 </div>
                 ${stamp ? `<img class="stamp-img" src="${stamp}" alt="" />` : ''}
                 <div class="sig-block">
                   <div class="sig-line">Date: ${today}</div>
                 </div>
               </div>`
        }

        <div class="foot">
          Issued by ${school.name}${school.website ? ` &nbsp;•&nbsp; ${school.website}` : ''}
        </div>
      </div>
    </body></html>`;
  }

  private renderLetterHtml(
    school: any,
    student: any,
    title: string,
    body: string,
  ): string {
    const details = `
      <table class="doc">
        <tr><th>Student</th><td>${escapeHtml(student.user.firstName)} ${escapeHtml(student.user.lastName)}</td>
            <th>Student number</th><td>${escapeHtml(student.studentIdNumber)}</td></tr>
        <tr><th>Class</th><td>${escapeHtml(classDisplayName(student.classSection))}</td>
            <th>Status</th><td>${escapeHtml(String(student.status ?? '').toLowerCase())}</td></tr>
      </table>`;
    return this.renderDocumentShell(school, {
      title,
      subtitle: `${student.user.firstName} ${student.user.lastName}`,
      reference: student.studentIdNumber,
      body: `${details}<p>${body}</p>`,
    });
  }

  private renderDisciplineReportHtml(
    school: any,
    student: any,
    incidents: any[],
  ): string {
    const rows = incidents.length
      ? incidents
          .map(
            (i) =>
              `<tr><td>${new Date(i.date).toLocaleDateString('en-GB')}</td><td>${escapeHtml(i.description)}</td><td>-${i.pointsDeducted}</td><td>${escapeHtml(i.actionTaken)}</td></tr>`,
          )
          .join('')
      : `<tr><td colspan="4" style="text-align:center;color:#5b6b7b">No incidents recorded.</td></tr>`;

    const body = `
      <table class="doc">
        <tr><th>Student</th><td>${escapeHtml(student.user.firstName)} ${escapeHtml(student.user.lastName)}</td>
            <th>Student number</th><td>${escapeHtml(student.studentIdNumber)}</td></tr>
        <tr><th>Class</th><td>${escapeHtml(classDisplayName(student.classSection))}</td>
            <th>Conduct points</th><td>${student.disciplinePoints}</td></tr>
      </table>
      <table class="doc">
        <thead><tr><th>Date</th><th>Incident</th><th>Points</th><th>Action taken</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;

    return this.renderDocumentShell(school, {
      title: 'Discipline Report',
      subtitle: `${student.user.firstName} ${student.user.lastName}`,
      reference: student.studentIdNumber,
      body,
    });
  }

  private renderTranscriptHtml(
    school: any,
    student: any,
    termResults: any[],
  ): string {
    const rows = termResults.length
      ? termResults
          .map(
            (tr) =>
              `<tr><td>${escapeHtml(tr.term.academicYear.name)}</td><td>${escapeHtml(tr.term.name)}</td><td>${tr.average?.toFixed(1) ?? '—'}%</td><td>${escapeHtml(tr.letterGrade ?? '') || '—'}</td><td>${tr.rank ?? '—'}</td></tr>`,
          )
          .join('')
      : `<tr><td colspan="5" style="text-align:center;color:#5b6b7b">No published results yet.</td></tr>`;

    const body = `
      <table class="doc">
        <tr><th>Student</th><td>${escapeHtml(student.user.firstName)} ${escapeHtml(student.user.lastName)}</td>
            <th>Student number</th><td>${escapeHtml(student.studentIdNumber)}</td></tr>
        <tr><th>Class</th><td>${escapeHtml(classDisplayName(student.classSection))}</td>
            <th>Terms recorded</th><td>${termResults.length}</td></tr>
      </table>
      <table class="doc">
        <thead><tr><th>Year</th><th>Term</th><th>Average</th><th>Grade</th><th>Position</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;

    return this.renderDocumentShell(school, {
      title: 'Academic Transcript',
      subtitle: `${student.user.firstName} ${student.user.lastName}`,
      reference: student.studentIdNumber,
      body,
    });
  }
}
