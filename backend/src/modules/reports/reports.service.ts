import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomBytes, randomInt } from 'crypto';
import { existsSync } from 'fs';
import { PhotoAnswer, SubjectScope } from '@prisma/client';
import { photoOnCard } from '../../common/photo-consent';
import * as QRCode from 'qrcode';
import { withPlatform, withSchool } from '../../prisma/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { classDisplayName } from '../../common/class-name';
import {
  STANDING_LABEL,
  pausesOn,
  schoolDay,
  untilWords,
} from '../../common/student-standing';
import {
  TERM_CONDUCT_MARK,
  conductPercentage,
  conductRemark,
  termConduct,
  yearConduct,
} from '../../common/conduct';
import puppeteer, { Browser } from 'puppeteer-core';
import { buildZip, toCsv } from './zip.util';
import {
  competenceForSubject,
  computeSubjectTotal,
  gradeFor,
  MAX_POINTS_PER_SUBJECT,
  overallGrade,
} from '../../common/grading';

/**
 * Inline a logo as a data URI for PDF rendering.
 *
 * The PDF is produced with `page.setContent()`, which has no base URL - so a
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
import {
  escapeHtml,
  logoDataUri,
  sanitizeColor,
  watermark,
} from '../../common/html';
import {
  suggestComments,
  type CommentFacts,
} from '../../common/report-comments';

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

/** What a gate sees when it scans a student's ID card. */
export interface CardCheck {
  valid: boolean;
  reason: string | null;
  suspended?: boolean;
  student?: {
    name: string;
    studentIdNumber: string;
    level: string | null;
    photoUrl: string | null;
    status: string;
  };
  issuedAt?: Date | null;
  /** The school that issued the card, by name. */
  issuedBy?: string;
}

/**
 * What anybody who scans a card sees, signed in or not: enough for a guard
 * to match a face, and no more. The first name only, and the photo unless
 * the family said No to it on cards (B6).
 */
function seenAtTheGate(student: {
  studentIdNumber: string;
  status: string;
  photoForId: PhotoAnswer;
  user: { firstName: string; photoUrl: string | null };
  classSection: { classLevel: { name: string } | null } | null;
}): NonNullable<CardCheck['student']> {
  return {
    name: student.user.firstName,
    studentIdNumber: student.studentIdNumber,
    level: student.classSection?.classLevel?.name ?? null,
    photoUrl: photoOnCard(student.photoForId) ? student.user.photoUrl : null,
    status: student.status,
  };
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

  /**
   * The margin is the caller's, in millimetres. A margin of nought hands the
   * page over to the sheet's own CSS, which is how the full-bleed report card
   * keeps its layout.
   */
  private async htmlToPdf(html: string, marginMm: number): Promise<Buffer> {
    const page = await this.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load' });
      const m = `${marginMm}mm`;
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: marginMm === 0,
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

    /* The teacher of the class they sat in that term, by the same argument
       as the class size below. */
    const classTeacherRole = await this.prisma.teacherRole.findFirst({
      where: {
        role: 'CLASS_TEACHER',
        classSectionId: termResult?.classSectionId ?? student.classSectionId,
      },
      include: {
        teacher: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                signatureUrl: true,
              },
            },
          },
        },
      },
    });

    /*
      The head teacher who signs. One post, so one active holder of the role;
      a school between head teachers prints the line and no name, which is
      what an unsigned card should look like rather than a blank the reader
      cannot account for.
    */
    const headTeacher = await this.prisma.user.findFirst({
      where: { role: 'HEAD_TEACHER', isActive: true },
      select: { firstName: true, lastName: true, signatureUrl: true },
      orderBy: { createdAt: 'asc' },
    });

    /*
      The family's own signature, where one has been given.

      A parent's line on a report card means something different from the
      two above it: the school is not certifying anything by it, the family
      is acknowledging they have seen the term. That is why it is the only
      one of the three that is normally signed in ink, at home, and why a
      card printed with the line empty is still a finished card.

      Where a parent has uploaded one it is printed, which is what makes the
      digital copy a complete record of an acknowledgement that happened.
      The first linked guardian: a child with two parents on the system has
      one line to sign, and the school asks whoever collects the card.
    */
    const guardian = await this.prisma.parentStudent.findFirst({
      where: { studentId },
      include: {
        parent: {
          select: { firstName: true, lastName: true, signatureUrl: true },
        },
      },
      orderBy: { id: 'asc' },
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

    /*
      Conduct, for this term rather than as a running total across the year.

      Read from what actually happened in the term - incidents off, merits
      back on - rather than from the field on the student, which is a single
      number for the whole year. A parent reading the Term 3 report needs to
      know about Term 3; a student who lost points in September should not
      still be carrying them in July.
    */
    const [deducted, restored] = await Promise.all([
      this.prisma.disciplineIncident.aggregate({
        where: { studentId, termId },
        _sum: { pointsDeducted: true },
      }),
      this.prisma.meritAward.aggregate({
        where: { studentId, termId },
        _sum: { points: true },
      }),
    ]);
    const conductPoints = termConduct(
      deducted._sum.pointsDeducted ?? 0,
      restored._sum.points ?? 0,
    );

    /*
      The class this child was actually in that term, not the one they are in
      now.

      `student.classSectionId` is their current place, so a report card for a
      past year counted the class they were promoted into: a Senior 3 card
      printed "1 of 30" because the reader is now in a Senior 4 of thirty,
      while the ranks on that same sheet ran 1 to 26. The result carries the
      section it was computed against, and that is the one to count.
    */
    const classSectionId = termResult?.classSectionId ?? student.classSectionId;
    const classResults = await this.prisma.termResult.findMany({
      where: { classSectionId, termId },
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
        // Not where the family said No to the photo on cards (B6).
        photoUrl: photoOnCard(student.photoForId)
          ? student.user.photoUrl
          : null,
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
      /*
        Each signature comes off its own owner's profile, never off the
        school's branding settings. The school has one signature, which is
        right for a letter the school sends; a report card carries two
        different people's marks, and one file shared between them would put
        the same hand under both names.
      */
      signatures: {
        classTeacher: classTeacherRole?.teacher.user.signatureUrl ?? null,
        headTeacher: headTeacher?.signatureUrl ?? null,
        guardian: guardian?.parent.signatureUrl ?? null,
      },
      headTeacher: headTeacher
        ? `${headTeacher.firstName} ${headTeacher.lastName}`
        : null,
      guardian: guardian
        ? `${guardian.parent.firstName} ${guardian.parent.lastName}`
        : null,
      attendance: { present: attendancePresent, total: attendanceTotal },
      /*
        This term's conduct, out of forty. `outOf` travels with it so the
        sheet never has to assume the mark: a school that sets a different
        ceiling changes one number rather than every place it is printed.
      */
      conduct: {
        points: conductPoints,
        outOf: TERM_CONDUCT_MARK,
        percentage: conductPercentage(conductPoints, TERM_CONDUCT_MARK),
      },
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
    /*
      The code is checked across every school, because whoever scans it has
      no school to give, but that lookup answers only which school issued it.
      Everything else is read inside that school: the report carries the
      school's own name, crest and signatures, and read above the wall those
      would be every school's at once.
    */
    const issuer = await withPlatform(() =>
      this.prisma.reportVerification.findUnique({
        where: { code },
        select: { schoolId: true, school: { select: { name: true } } },
      }),
    );
    if (!issuer) throw new NotFoundException('Report not found');

    return withSchool(issuer.schoolId, async () => {
      const verification = await this.prisma.reportVerification.findUnique({
        where: { code },
        include: { termResult: true },
      });
      if (!verification) throw new NotFoundException('Report not found');
      const data = await this.getTermReportData(
        verification.termResult.studentId,
        verification.termResult.termId,
      );
      // The rendered sheet ships along so the verify page can show the
      // digital original exactly as it prints.
      const html = this.renderTermReportHtml(
        data,
        await this.verificationQr(data),
      );
      return { ...data, html, issuedBy: issuer.school.name };
    });
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

    /*
      Conduct across the whole year: each term's mark out of forty, added up.

      Read from what happened in each term rather than from the running field
      on the student, and counted only over the terms being reported on - a
      year read in Term 1 should not show a student two thirds of the way to
      nothing for terms that have not happened.
    */
    const conductByTerm = await Promise.all(
      terms.map(async (term) => {
        const [off, back] = await Promise.all([
          this.prisma.disciplineIncident.aggregate({
            where: { studentId, termId: term.id },
            _sum: { pointsDeducted: true },
          }),
          this.prisma.meritAward.aggregate({
            where: { studentId, termId: term.id },
            _sum: { points: true },
          }),
        ]);
        return {
          term: term.name,
          points: termConduct(
            off._sum.pointsDeducted ?? 0,
            back._sum.points ?? 0,
          ),
        };
      }),
    );
    const conductYear = yearConduct(conductByTerm.map((t) => t.points));

    const school = await this.getSchoolInfo();

    return {
      school,
      student: {
        name: `${student.user.firstName} ${student.user.lastName}`,
        studentIdNumber: student.studentIdNumber,
        photoUrl: photoOnCard(student.photoForId)
          ? student.user.photoUrl
          : null,
        stage: student.classSection.classLevel.stage,
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
      conduct: {
        byTerm: conductByTerm,
        points: conductYear.points,
        outOf: conductYear.outOf,
        percentage: conductPercentage(conductYear.points, conductYear.outOf),
      },
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

  /**
   * Has the school issued this student's report card for this term?
   *
   * The marks module gates its own report card route on this, and these
   * routes have to ask the same question: a student who cannot open the card
   * on one page must not be able to fetch the very same document as HTML or
   * PDF from another.
   */
  async isReportCardIssued(studentId: string, termId: string) {
    const issued = await this.prisma.termResult.findFirst({
      where: { studentId, termId, reportCardPublished: true },
      select: { id: true },
    });
    return !!issued;
  }

  async generateTermReportPdf(
    studentId: string,
    termId: string,
  ): Promise<Buffer> {
    const html = await this.generateTermReportHtml(studentId, termId);
    // The report template is a full-bleed A4 sheet with its own margins.
    return this.htmlToPdf(html, 0);
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
    const name = `${escapeHtml(student.user.firstName)} ${escapeHtml(student.user.lastName)}`;
    const className = escapeHtml(classDisplayName(student.classSection));
    const particulars = this.studentParticulars(student);
    const today = new Date().toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const enrolled = student.enrollmentDate
      ? new Date(student.enrollmentDate).toLocaleDateString('en-GB', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : null;

    switch (type) {
      case 'transfer_letter': {
        // What a receiving school actually needs to admit a child: who they
        // are, how long they were here, what class they leave from and
        // therefore join, and that they leave in good standing with nothing
        // outstanding. The previous version was one sentence.
        const body = `
          <p>This is to certify that ${particulars} was a bona fide student of
          ${school.name}${enrolled ? `, admitted on ${enrolled}` : ''}, and was
          enrolled in <strong>${className}</strong> at the time of leaving.</p>

          <p>The student is hereby transferred from this institution with effect
          from <strong>${today}</strong>.${
            typeof student.disciplinePoints === 'number'
              ? ` Their conduct while with us stands at <strong>${student.disciplinePoints}</strong> points out of the school's full mark, and they`
              : ' They'
          } leave in good standing with no disciplinary matter pending against
          them.</p>

          <p>All school property issued to the student has been returned and no
          financial obligation to this school remains outstanding. Their
          academic records for the period of study are available on request and
          will be released directly to the admitting institution.</p>

          <p>We kindly request the receiving institution to admit
          ${name} into the class following ${escapeHtml(
            student.classSection?.classLevel?.name || className,
          )}, and to accord them every assistance in settling into their new
          school.</p>

          <p>Any query concerning this letter may be addressed to the
          undersigned${school.phone ? ` on ${school.phone}` : ''}${school.email ? ` or at ${school.email}` : ''},
          quoting the reference above.</p>`;
        return {
          title: `Transfer Letter - ${student.user.firstName} ${student.user.lastName}`,
          html: this.renderLetterHtml(
            school,
            student,
            'Transfer Letter',
            body,
            {
              addressee: ['THE HEAD TEACHER', 'RECEIVING INSTITUTION'],
            },
          ),
        };
      }
      case 'enrollment_confirmation': {
        const body = `
          <p>This is to confirm that ${particulars} is a currently enrolled,
          full-time student of ${school.name}${enrolled ? `, admitted on ${enrolled}` : ''}.</p>

          <p>The student is presently following the programme of study offered
          in <strong>${className}</strong> and is in regular attendance. As at
          <strong>${today}</strong> their registration with this school is
          active and in good standing.</p>

          <p>This letter is issued at the request of the student's parent or
          guardian for whatever lawful purpose it may serve, including
          application for a bursary, travel document, insurance or bank
          facility, and it carries no financial obligation on the part of this
          school.</p>

          <p>Should confirmation of the above be required, the undersigned may
          be contacted${school.phone ? ` on ${school.phone}` : ''}${school.email ? ` or at ${school.email}` : ''},
          quoting the reference above.</p>`;
        return {
          title: `Enrollment Confirmation - ${student.user.firstName} ${student.user.lastName}`,
          html: this.renderLetterHtml(
            school,
            student,
            'Confirmation of Enrolment',
            body,
          ),
        };
      }
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

  /**
   * The same letter, rendered to A4 PDF.
   *
   * The Documents tab used to "download" the raw HTML file, which opened in a
   * browser rather than a reader and printed at whatever size the browser
   * felt like. Every letter is already a full-bleed 210x297mm sheet with its
   * own margins, so it goes through the same zero-margin path the report cards
   * use.
   */
  async generateDocumentPdf(
    studentId: string,
    type: string,
  ): Promise<{ pdf: Buffer; title: string }> {
    const { html, title } = await this.generateDocument(studentId, type);
    return { pdf: await this.htmlToPdf(html, 0), title };
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
        photoUrl: photoOnCard(student.photoForId)
          ? student.user.photoUrl
          : null,
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
      include: { user: { select: { isActive: true } } },
    });
    if (!student) throw new NotFoundException('Student not found');

    // A card is a key: it opens the gate, borrows books and identifies the
    // holder as a student here. The bulk route has always filtered on ACTIVE;
    // the single one did not, so a card could be issued to somebody who had
    // graduated or transferred out - with no expiry on it, that card works
    // for ever.
    if (student.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Cannot issue a card to a student who is ${STANDING_LABEL[student.status].toLowerCase()}. Readmit them first.`,
      );
    }
    if (!student.user?.isActive) {
      throw new BadRequestException(
        'Cannot issue a card against a deactivated account',
      );
    }
    // The printed card carries the class. Issuing one to a student who has
    // not been placed produces a card with a blank line where it should be.
    if (!student.classSectionId) {
      throw new BadRequestException(
        'Place the student in a class before issuing their card',
      );
    }

    if (student.nfcCardId && !force) {
      return this.idCardSummary(studentId);
    }

    // Generate a unique card id (retry on the rare unique-constraint clash)
    let cardId = this.generateCardId();
    for (let i = 0; i < 5; i++) {
      const clash = await this.prisma.student.findFirst({
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
  async verifyCardByCode(code: string): Promise<CardCheck> {
    /* Which school issued it, across every school; then the rest inside
       that school, as for a report. */
    const issuer = await withPlatform(() =>
      this.prisma.student.findUnique({
        where: { cardCode: code },
        select: { schoolId: true, school: { select: { name: true } } },
      }),
    );
    if (!issuer) {
      return {
        valid: false,
        reason:
          'This card is not valid. It may have been reissued, or it was never issued by a school on Markova.',
      };
    }
    return withSchool(issuer.schoolId, async () => ({
      ...(await this.checkCard(code)),
      issuedBy: issuer.school.name,
    }));
  }

  private async checkCard(code: string): Promise<CardCheck> {
    const student = await this.prisma.student.findUnique({
      where: { cardCode: code },
      select: {
        id: true,
        studentIdNumber: true,
        status: true,
        cardIssuedAt: true,
        cardSuspendedAt: true,
        photoForId: true,
        user: { select: { firstName: true, photoUrl: true } },
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
        student: seenAtTheGate(student),
        issuedAt: student.cardIssuedAt,
      };
    }

    /* Suspended for these days: the card is real and comes back to life on
       the first day back, with nothing for anybody to restore. */
    const pause =
      student.status === 'ACTIVE'
        ? (await pausesOn(this.prisma, [student.id], schoolDay())).get(
            student.id,
          )
        : undefined;
    if (pause?.kind === 'SUSPENDED') {
      return {
        valid: false,
        // A suspension always has its last day.
        reason: `This student is suspended ${untilWords(pause.endsOn)}, and is not to be let in.`,
        suspended: true,
        student: seenAtTheGate(student),
        issuedAt: student.cardIssuedAt,
      };
    }

    return {
      valid: student.status === 'ACTIVE',
      reason:
        student.status === 'ACTIVE'
          ? null
          : `This student is no longer enrolled (${STANDING_LABEL[student.status].toLowerCase()}).`,
      student: seenAtTheGate(student),
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
      // The card prints without the photo where the family said No (B6).
      photoUrl: photoOnCard(s.photoForId) ? s.user.photoUrl : null,
      photoForId: s.photoForId,
      hasPhoto: !!s.user.photoUrl,
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
    // Columns nobody outside this server may ever see, dropped before the row
    // reaches a CSV.
    const strip = (rows: any[], omit: string[]) =>
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
      // joined via lookup maps - nested includes at this scale exhaust memory.
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
      // Both are printed on every letter: the head teacher signs it, and a
      // receiving school checks the registration number. Optional, because a
      // school that has not filled them in still has to be able to issue one.
      headTeacher: escapeHtml(map['head_teacher_name'] || ''),
      registrationNumber: escapeHtml(map['registration_number'] || ''),
      primaryColor: sanitizeColor(map['primary_color']),
    };
  }

  /**
   * Two drafted comments for one report card.
   *
   * Assembled from `getTermReportData`, which is the same call that renders
   * the sheet. That is the whole point of putting this here rather than in
   * the marks module: a comment that reflects "what is on the report card"
   * has to be built from what is on the report card, and a second reading of
   * the marks is a second reading that can disagree with the first.
   *
   * The previous term's average is the one fact the card itself does not
   * carry, and it is worth fetching: a 58% that was 48% last term is a
   * different conversation from a 58% that was 68%.
   */
  async suggestReportComments(studentId: string, termId: string) {
    const data = await this.getTermReportData(studentId, termId);

    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      select: { startDate: true, academicYearId: true },
    });
    const previous = term
      ? await this.prisma.termResult.findFirst({
          where: {
            studentId,
            term: {
              academicYearId: term.academicYearId,
              startDate: { lt: term.startDate },
            },
          },
          orderBy: { term: { startDate: 'desc' } },
          select: { average: true },
        })
      : null;

    const facts: CommentFacts = {
      studentId,
      // The name the child is spoken to by, not the whole record.
      firstName:
        String(data.student.name || '').split(/\s+/)[0] || 'This student',
      average: data.result?.average ?? null,
      letterGrade: data.result?.letterGrade ?? null,
      rank: data.result?.rank ?? null,
      classSize: data.classStats.totalStudents,
      aggregate: data.result?.aggregate ?? null,
      aggregateMax: data.result?.aggregateMax ?? null,
      previousAverage: previous?.average ?? null,
      subjects: data.subjects.map((s: any) => ({
        name: s.subject,
        total: s.total,
        grade: s.grade,
        competence: s.competence,
      })),
      conduct:
        data.conduct?.points === null || data.conduct?.points === undefined
          ? null
          : { points: data.conduct.points, outOf: data.conduct.outOf },
    };

    return suggestComments(facts);
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
          // Every subject, not only the practical modules: the curriculum
          // asks whether a learner can do the thing, and that question is as
          // real in English as it is in a workshop.
          competence: competenceForSubject(
            val.scope,
            total,
            practical ? practical.pct : null,
          ),
        };
      })
      .sort(
        (a, b) =>
          (SCOPE_ORDER[a.scope] ?? 9) - (SCOPE_ORDER[b.scope] ?? 9) ||
          a.subject.localeCompare(b.subject),
      );
  }

  /**
   * Each subject's mark in each term of a year.
   *
   * Every term's figure is the same weighted total the term report card
   * prints - CAT 1, CAT 2, the practical where there is one, and the exam, at
   * the weights for that subject's scope. It has to be: a parent holding the
   * annual report beside the three term reports must read the same number
   * three times, and anything else looks like the school cannot add up.
   *
   * This used to fold marks together as `(running + next) / 2`, which is not
   * an average of anything - the last mark of a term counted for half of it,
   * the one before for a quarter, and a CAT counted as much as the exam.
   */
  private groupMarksBySubjectAndTerm(marks: any[], terms: any[]) {
    // subject -> term -> the assessments recorded for it
    const gathered = new Map<
      string,
      { scope: SubjectScope; byTerm: Map<string, any[]> }
    >();

    for (const m of marks) {
      const subject = m.subject.name;
      if (!gathered.has(subject)) {
        gathered.set(subject, {
          scope: m.subject.scope as SubjectScope,
          byTerm: new Map(),
        });
      }
      const termName = terms.find((t: any) => t.id === m.termId)?.name || '';
      const forSubject = gathered.get(subject)!;
      if (!forSubject.byTerm.has(termName)) forSubject.byTerm.set(termName, []);
      forSubject.byTerm.get(termName)!.push({
        assessmentName: m.assessmentType?.name ?? '',
        score: m.score,
        maxScore: m.maxScore,
      });
    }

    const result: Record<
      string,
      {
        scope: SubjectScope;
        terms: Record<string, number | null>;
        average: number | null;
      }
    > = {};

    for (const [subject, { scope, byTerm }] of gathered) {
      const perTerm: Record<string, number | null> = {};
      for (const term of terms) {
        const assessments = byTerm.get(term.name) ?? [];
        perTerm[term.name] = assessments.length
          ? computeSubjectTotal(scope, assessments)
          : null;
      }

      // The year's mark for a subject is the mean of the terms it was
      // actually taught in - a subject dropped after Term 2 is not a subject
      // the student scored zero in for Term 3.
      const marked = Object.values(perTerm).filter(
        (v): v is number => v !== null,
      );
      result[subject] = {
        scope,
        terms: perTerm,
        average: marked.length
          ? Math.round(marked.reduce((a, b) => a + b, 0) / marked.length)
          : null,
      };
    }

    return result;
  }

  // The approved A4 report card. One full-bleed 210x297mm sheet; layout,
  // colors and structure are locked to the design signed off in review.
  private renderTermReportHtml(data: any, qrDataUri: string | null): string {
    const mark = watermark(data.school?.stampUrl);
    // Already defaulted by sanitizeColor when the school set nothing.
    const navy = data.school.primaryColor;
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

    /*
      The child's own photograph, inlined rather than linked. A remote fetch
      inside the PDF renderer is the slowest and least reliable moment to
      discover a file has moved, and the crest already refuses to take one.
      No fallback portrait: initials in the frame say "we have no photograph
      of this child" honestly, where a silhouette says nothing at all.
    */
    const portrait = logoDataUri(data.student.photoUrl, { fallback: null });
    /* First name and family name, not the first two words: plenty of Rwandan
       students carry two given names, and "Kevin Hirwa Kwizera" initialled
       from the left reads KH rather than KK. */
    const nameWords = String(data.student.name || '')
      .split(/\s+/)
      .filter(Boolean);
    const studentInitials = [nameWords[0], nameWords[nameWords.length - 1]]
      .filter(Boolean)
      .map((w: string) => w[0])
      .join('')
      .toUpperCase();

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

    /*
      A signature block: the mark above the line, the name and the role below
      it. The image sits in a fixed box whether or not there is one to draw,
      so the three blocks stay level and a card with two signatures on it is
      not a card with a step in the middle.

      A person who has uploaded nothing gets the line and their name, which is
      a card waiting to be signed by hand - still a valid document, and the
      form every one of these was before the system existed.
    */
    const signedBy = (
      role: string,
      person: string | null,
      signature: string | null | undefined,
    ) => {
      const inked = signature
        ? logoDataUri(signature, { fallback: null })
        : null;
      return `<div class="sig">
        <div class="ink">${inked ? `<img src="${inked}" alt="" />` : ''}</div>
        <div class="line">${escapeHtml(role)}${person ? `<b>${escapeHtml(person)}</b>` : ''}</div>
      </div>`;
    };

    /*
      Attendance is no longer printed here. It is a record of the term, not a
      fact about who this child is, and it sat in the identity fields saying
      neither. The register still holds it and the year report still carries
      it; the card is the wrong place to read it from.
    */

    /*
      Conduct as a mark out of forty and as a percentage, rather than as a
      bare word. "Good" tells a parent nothing they can act on; "32 / 40" and
      "80%" tell them where their child stands and by how much.
    */
    const conductPoints = data.conduct?.points ?? null;
    const conductOutOf = data.conduct?.outOf ?? TERM_CONDUCT_MARK;
    const conductWord = conductRemark(
      conductPoints === null
        ? null
        : conductPercentage(conductPoints, conductOutOf),
    );

    const cell = (s: any, name: string) => {
      const a = s.assessments.find((x: any) => x.type === name);
      return `<td class="num">${a ? a.pct : '-'}</td>`;
    };

    /*
      Competent or not, for every subject rather than only the practical
      modules. A dash where nothing has been marked: "not yet competent" is a
      judgement, and a subject nobody has marked has not been judged.
    */
    const competenceCell = (s: any) =>
      `<td>${
        s.competence
          ? s.competence === 'COMPETENT'
            ? '<span class="chip ok">Competent</span>'
            : '<span class="chip no">Not yet competent</span>'
          : '-'
      }</td>`;

    const row = (s: any) => `
      <tr>
        <td class="subj">${escapeHtml(s.subject)}</td>
        ${cell(s, 'CAT 1')}${cell(s, 'CAT 2')}${isALevel ? cell(s, 'Practical') : ''}${cell(s, 'End of Term Exam')}
        <td class="tot">${s.total ?? '-'}</td>
        <td class="gr">${s.grade ?? '-'}</td>
        <td class="num">${s.points ?? '-'}</td>
        ${competenceCell(s)}
        ${isALevel ? '' : `<td class="rem">${s.remark ?? '-'}</td>`}
      </tr>`;

    /*
      Conduct is no longer a row of this table.

      It was put there because it is marked out of forty like everything else
      on the sheet, and that reasoning held until the columns beside it were
      counted: a discipline row has no CAT, no exam, no points and no
      competence, so it printed six dashes across a table whose whole job is
      to be read in columns. It is one number, and it now sits with the other
      single numbers in the summary below.

      The annual report is different and keeps its row - see
      `renderYearReportHtml`. There the table is one row per subject with a
      column per term, so conduct across three terms is exactly the shape the
      table is already in.
    */

    // O-Level keeps its written remark alongside; A-Level never had one.
    const cols = isALevel ? 9 : 9;
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
      tableBody +=
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
      tableBody +=
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
      : `<th style="text-align:left">Subject</th><th>CAT 1<br>(20%)</th><th>CAT 2<br>(20%)</th><th>Exam<br>(60%)</th><th>Total<br>/100</th><th>Grade</th><th>Points</th><th>Competence</th><th style="text-align:left">Remark</th>`;

    const totalMax = data.subjects.length * 100;
    const overall = data.result ? overallGrade(data.result.average || 0) : null;
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
        data.result?.letterGrade || '-',
        overall?.remark || '',
      ),
      summaryCell(
        'Aggregate',
        `${data.result?.aggregate ?? '-'}`,
        `/ ${data.result?.aggregateMax ?? '-'}`,
      ),
      summaryCell(
        'Position',
        `${data.result?.rank ?? '-'}`,
        `of ${data.classStats.totalStudents}`,
      ),
      /*
        Conduct, where the competence tally used to be.

        The tally said "10 / 12 subjects" beside a table that already prints
        Competent or Not yet competent on every row - so it counted, in a
        summary cell, something the reader could see for themselves three
        inches above. Conduct is the opposite: one number that appears
        nowhere else on the sheet, and the thing a family most often asks
        about after the average.
      */
      summaryCell(
        'Conduct',
        conductPoints === null ? '-' : `${conductPoints} / ${conductOutOf}`,
        conductPoints === null ? '' : conductWord,
      ),
    ].join('');

    const aggregateNote = isALevel
      ? `Aggregate = sum of points over all ${data.subjects.length} modules taken this term (${data.subjects.length} × 6 = ${data.result?.aggregateMax ?? ''}). In national examinations NESA counts a fixed set of papers with a maximum aggregate of 60.`
      : 'Aggregate = sum of points from the 9 core subjects only, as in national examinations (maximum 54).';

    /*
      The grading scale is no longer printed here.

      It is identical on every card the school will ever issue, so a fifth of
      each sheet went on something that never changes, and a reader wanting
      it had to find a card first. Worse, it was a second copy of the numbers:
      literal arrays typed out beside the arithmetic that produced the grades
      on the same page, which is exactly how a printed scale comes to
      disagree with the marks above it.

      It now lives at /grading, built from the same constants the marks are
      computed with, and the room it freed is what keeps this sheet to one
      page with the signatures on it.
    */

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
      /*
        Who this card belongs to, as one block rather than as two of eight
        equal fields.

        A card is handed over in a stack of thirty, and the first thing a
        parent does is confirm it is their child's. The name previously
        carried exactly the weight of "Class size", which made identity the
        hardest thing on the sheet to find and the wrong card the easiest
        mistake to make. The photograph settles it without reading.
      */
      /* No fill behind it. The stamp is printed across the middle of the
         sheet, and a panel with a background of its own punched a white
         rectangle through the middle of the watermark. The rule down the
         left marks the block just as well and lets the mark through. */
      .ident{ display:flex; align-items:center; gap:14px; margin-bottom:12px; padding:8px 12px; border:1px solid rgba(21,37,54,.09); border-left:4px solid ${navy}; border-radius:4px; }
      /* Square, because the frame it appears in everywhere else is round and
         a portrait taller than it is wide crops to a different picture on
         the card than it does in the topbar. */
      .portrait{ width:24mm; height:24mm; flex:0 0 24mm; border:1px solid rgba(21,37,54,.16); border-radius:3px; overflow:hidden; display:flex; align-items:center; justify-content:center; }
      .portrait img{ width:100%; height:100%; object-fit:cover; display:block; }
      .portrait span{ font-size:22px; font-weight:700; color:${navy}; letter-spacing:.04em; }
      .who{ flex:1; min-width:0; }
      .who .nm{ font-size:22px; font-weight:700; color:${navy}; letter-spacing:.01em; line-height:1.15; margin-bottom:8px; }
      .info{ display:grid; grid-template-columns:repeat(3,1fr); gap:7px 18px; font-size:11.5px; }
      .info div span{ display:block; font-size:9.5px; text-transform:uppercase; letter-spacing:.1em; color:#5b6b7b; margin-bottom:2px; }
      .info div b{ font-weight:600; }
      /* 10px rather than 11.5. The table is the densest thing on the sheet
         and the only one that grows with the curriculum: an A-Level student
         taking thirteen modules was the case that decided this. */
      table.marks{ border-collapse:collapse; width:100%; font-size:10px; }
      table.marks th, table.marks td{ border:1px solid rgba(21,37,54,.16); padding:3px 7px; }
      table.marks thead th{ background:${navy}; color:#fff; font-weight:600; font-size:9.5px; text-transform:uppercase; letter-spacing:.06em; text-align:center; }
      table.marks td{ text-align:center; font-variant-numeric:tabular-nums; }
      table.marks td.subj{ text-align:left; font-weight:500; }
      table.marks td.num{ color:#33414e; }
      table.marks td.tot{ font-weight:700; }
      table.marks td.gr{ font-weight:700; color:${navy}; }
      table.marks td.rem{ font-size:9.5px; color:#5b6b7b; text-align:left; }
      tr.group td{ background:#eef4f9; color:${navy}; font-weight:600; text-align:left; font-size:9.5px; text-transform:uppercase; letter-spacing:.08em; }
      tr.group .gnote{ text-transform:none; letter-spacing:0; }
      .core{ color:#2E86C1; font-weight:700; }
      .chip{ font-size:9px; font-weight:600; white-space:nowrap; }
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
      /* The ink box is a fixed height whether or not it holds anything, so
         three blocks stay level and a signed card has no step in the middle. */
      .sigs .ink{ height:13mm; display:flex; align-items:flex-end; justify-content:center; }
      .sigs .ink img{ max-height:13mm; max-width:100%; object-fit:contain; display:block; }
      .sigs .line{ border-top:1px dotted rgba(21,37,54,.16); padding-top:6px; }
      .sigs .line b{ display:block; color:#1c2733; font-weight:600; margin-top:1px; }
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
    ${mark.css}
    </style></head><body>
    ${mark.html}
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

      <div class="ident">
        <div class="portrait">${
          portrait
            ? `<img src="${portrait}" alt="" />`
            : `<span>${escapeHtml(studentInitials)}</span>`
        }</div>
        <div class="who">
          <div class="nm">${escapeHtml(data.student.name)}</div>
          <div class="info">
            ${info('Registration No', escapeHtml(data.student.studentIdNumber))}
            ${info('Class', escapeHtml(data.student.class))}
            ${isALevel ? info('Trade section', `${escapeHtml(data.student.trade?.name || '')} (${escapeHtml(data.student.trade?.code || '')})`) : info('Level', 'Ordinary Level (O-Level)')}
            ${info('Term', escapeHtml(data.term.name))}
            ${info('Class teacher', data.classTeacher ? escapeHtml(data.classTeacher) : '-')}
          </div>
        </div>
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
        ${signedBy('Class Teacher', data.classTeacher, data.signatures?.classTeacher)}
        ${signedBy('Head Teacher', data.headTeacher, data.signatures?.headTeacher)}
        ${signedBy('Parent / Guardian', data.guardian, data.signatures?.guardian)}
      </div>

      ${verifyStrip}
    </div>
    </body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // THE ANNUAL REPORT
  // ═══════════════════════════════════════════════════════════════════════════

  async generateYearReportHtml(
    studentId: string,
    academicYearId: string,
  ): Promise<string> {
    const data = await this.getYearReportData(studentId, academicYearId);
    return this.renderYearReportHtml(data);
  }

  async generateYearReportPdf(
    studentId: string,
    academicYearId: string,
  ): Promise<Buffer> {
    const html = await this.generateYearReportHtml(studentId, academicYearId);
    // A full-bleed A4 sheet with its own margins, like the term card.
    return this.htmlToPdf(html, 0);
  }

  /**
   * The whole year on one sheet.
   *
   * A term report answers "how was this term"; this answers "how was the
   * year, and what happens next" - which is the question a parent actually
   * has in July and the one a promotion decision is argued from. So it is
   * laid out as one row per subject with a column per term, because that is
   * the shape you read a trend in: three numbers side by side show whether a
   * child climbed or slid in a way three separate sheets never can.
   *
   * Every term column is the same weighted total that term's report card
   * printed. A parent holding all four documents must read the same number
   * in all four.
   */
  private renderYearReportHtml(data: any): string {
    const mark = watermark(data.school?.stampUrl);
    const navy = data.school.primaryColor;
    const logo = logoDataUri(data.school.logoUrl);
    const terms: string[] = data.terms ?? [];
    const year = data.yearResult;

    const subjects = Object.entries(
      data.subjectsByTerm as Record<
        string,
        { terms: Record<string, number | null>; average: number | null }
      >,
    ).sort(([a], [b]) => a.localeCompare(b));

    const num = (v: number | null | undefined) =>
      v === null || v === undefined ? '-' : String(v);

    const subjectRows = subjects
      .map(([name, marks]) => {
        const band =
          marks.average !== null ? overallGrade(marks.average) : null;
        return `
      <tr>
        <td class="subj">${escapeHtml(name)}</td>
        ${terms.map((t) => `<td class="num">${num(marks.terms[t])}</td>`).join('')}
        <td class="tot">${num(marks.average)}</td>
        <td class="gr">${band?.letter ?? '-'}</td>
      </tr>`;
      })
      .join('');

    /*
      Conduct gets the same treatment it gets on a term card: a row of the
      marks table, above the subjects, because it is marked out of something
      just as they are.
    */
    const conductRow = `
      <tr class="conduct">
        <td class="subj">Discipline</td>
        ${terms
          .map((t) => {
            const found = (data.conduct?.byTerm ?? []).find(
              (c: any) => c.term === t,
            );
            return `<td class="num">${found ? `${found.points}/${TERM_CONDUCT_MARK}` : '-'}</td>`;
          })
          .join('')}
        <td class="tot">${data.conduct?.points ?? '-'} / ${data.conduct?.outOf ?? '-'}</td>
        <td class="gr">${data.conduct?.percentage === null || data.conduct?.percentage === undefined ? '-' : `${data.conduct.percentage}%`}</td>
      </tr>`;

    const cell = (label: string, big: string, small: string) =>
      `<div class="cell"><span>${label}</span><b>${big}</b> <small>${small}</small></div>`;

    const yearAverage = year?.yearlyAverage ?? null;
    const decision = year
      ? year.isPromoted
        ? 'PROMOTED'
        : 'REPEATING'
      : 'NOT YET DECIDED';

    /*
      The year's own totals, worked out from the subject rows above rather
      than stored: a YearResult carries averages and a position, not a mark
      count, and summing what the sheet already prints keeps the two from
      ever disagreeing.
    */
    const marked = subjects
      .map(([, m]) => m.average)
      .filter((a): a is number => a !== null && a !== undefined);
    const totalMarks = marked.reduce((sum, a) => sum + a, 0);
    const yearAggregate = marked.reduce(
      (sum, a) => sum + overallGrade(a).points,
      0,
    );

    /*
      Five cells, and conduct is not one of them: it is a row of the table
      above, with a column per term, which is the shape a year's conduct
      actually has. Printing it twice would be printing the year's total in
      the strip beside the three terms it came from.
    */
    const summary = [
      cell(
        'Year average',
        yearAverage === null ? '-' : `${yearAverage.toFixed(1)}%`,
        yearAverage === null ? '' : overallGrade(yearAverage).remark,
      ),
      cell(
        'Total marks',
        marked.length ? String(Math.round(totalMarks)) : '-',
        marked.length ? `/ ${marked.length * 100}` : '',
      ),
      cell('Overall grade', year?.letterGrade ?? '-', ''),
      cell(
        'Aggregate',
        marked.length ? String(yearAggregate) : '-',
        marked.length ? `/ ${marked.length * MAX_POINTS_PER_SUBJECT}` : '',
      ),
      cell(
        'Position',
        year?.rank ? String(year.rank) : '-',
        year?.rank ? 'in class' : '',
      ),
    ].join('');

    /*
      The decision, said plainly and once. A parent reading this sheet in July
      is reading it for one sentence, and burying that sentence in a table of
      averages is how a school ends up explaining it on the phone instead.
    */
    const decisionNote = year
      ? year.isPromoted
        ? `${escapeHtml(data.student.name)} has met the requirements for promotion and moves up next year.`
        : `${escapeHtml(data.student.name)} has not met the requirements for promotion and repeats the year.`
      : 'The school has not yet finalised promotion for this year.';

    const initials = (data.school.name || 'MA')
      .split(/\s+/)
      .map((w: string) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{ box-sizing:border-box; margin:0; padding:0; }
      @page{ size:A4; margin:0; }
      body{
        font-family:Poppins,'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;
        color:#1c2733; background:#fff; width:210mm;
      }
      .sheet{ width:210mm; min-height:297mm; padding:14mm 13mm; }
      .head{ display:flex; align-items:center; gap:12px; border-bottom:2px solid ${navy}; padding-bottom:10px; }
      .crest{ width:52px; height:52px; object-fit:contain; }
      .crest-fallback{ width:52px; height:52px; border-radius:50%; background:${navy}; color:#fff;
        display:flex; align-items:center; justify-content:center; font-weight:700; font-size:17px; }
      .school{ flex:1; }
      .school h1{ font-size:17px; color:${navy}; letter-spacing:.01em; }
      .school p{ font-size:9.5px; color:#5b6b7b; margin-top:2px; }
      .doc{ text-align:right; }
      .doc b{ display:block; font-size:12px; color:${navy}; letter-spacing:.09em; }
      .doc span{ font-size:9.5px; color:#5b6b7b; }

      .who{ display:flex; gap:18px; margin-top:12px; font-size:10.5px; }
      .who div{ flex:1; }
      .who span{ color:#5b6b7b; }
      .who b{ color:#1c2733; }

      table{ width:100%; border-collapse:collapse; margin-top:12px; font-size:10px; }
      th{ background:${navy}; color:#fff; font-weight:600; padding:6px 5px; font-size:9.5px; }
      td{ padding:5px; border-bottom:1px solid #e6ecf1; text-align:center; }
      td.subj{ text-align:left; font-weight:500; }
      td.tot{ font-weight:700; }
      td.gr{ font-weight:700; color:${navy}; }
      tr.conduct td{ font-weight:600; background:rgba(21,37,54,.035); }

      .summary{ display:flex; gap:8px; margin-top:14px; }
      .cell{ flex:1; border:1px solid #e6ecf1; border-radius:6px; padding:8px 10px; }
      .cell span{ display:block; font-size:8.5px; color:#5b6b7b; text-transform:uppercase; letter-spacing:.07em; }
      .cell b{ font-size:15px; color:${navy}; }
      .cell small{ font-size:9px; color:#5b6b7b; }

      .decision{ margin-top:14px; border:1px solid ${navy}; border-radius:6px; padding:10px 12px; }
      .decision b{ display:block; font-size:12px; letter-spacing:.08em; color:${navy}; }
      .decision p{ font-size:10px; color:#3c4a58; margin-top:3px; }

      .sigs{ display:flex; gap:26px; margin-top:26px; font-size:9.5px; color:#5b6b7b; }
      .sigs div{ flex:1; border-top:1px solid #a9b6c2; padding-top:5px; text-align:center; }
      .note{ margin-top:12px; font-size:8.5px; color:#7c8b99; }
    ${mark.css}
    </style></head><body>
    ${mark.html}
    <div class="sheet">
      <div class="head">
        ${logo ? `<img class="crest" src="${logo}" alt="">` : `<div class="crest-fallback">${initials}</div>`}
        <div class="school">
          <h1>${escapeHtml(data.school.name)}</h1>
          <p>${escapeHtml(data.school.address || '')}</p>
        </div>
        <div class="doc">
          <b>ANNUAL REPORT</b>
          <span>${escapeHtml(data.academicYear.name)}</span>
        </div>
      </div>

      <div class="who">
        <div><span>Student</span><br><b>${escapeHtml(data.student.name)}</b></div>
        <div><span>Student number</span><br><b>${escapeHtml(data.student.studentIdNumber || '-')}</b></div>
        <div><span>Class</span><br><b>${escapeHtml(data.student.class)}</b></div>
      </div>

      <table>
        <thead><tr>
          <th style="text-align:left">Subject</th>
          ${terms.map((t) => `<th>${escapeHtml(t)}</th>`).join('')}
          <th>Year</th><th>Grade</th>
        </tr></thead>
        <tbody>${conductRow}${subjectRows}</tbody>
      </table>

      <div class="summary">${summary}</div>

      <div class="decision">
        <b>${decision}</b>
        <p>${decisionNote}</p>
      </div>

      <div class="sigs">
        <div>Class Teacher</div>
        <div>Head Teacher</div>
        <div>Parent / Guardian</div>
      </div>

      <div class="note">Each term column is the weighted total that term's report card carried. The year mark is the mean of the terms the subject was taught in. Conduct is marked out of ${TERM_CONDUCT_MARK} a term, ${data.conduct?.outOf ?? ''} across the year.</div>
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
  /**
   * The letterhead every official document is printed on.
   *
   * Laid out as a letter rather than a form: reference line, addressee,
   * subject, salutation, prose, and a closing signed by a named head teacher
   * beside the school stamp. The previous version put the signature and stamp
   * in a footer strip alongside a date, which read as a website footer at the
   * bottom of a piece of school stationery.
   *
   * Each one names a student and carries their student number as its
   * reference, so both are required rather than optional: a letter with
   * neither is not a document a school would issue.
   */
  private renderDocumentShell(
    school: any,
    opts: {
      title: string;
      subtitle: string;
      reference: string;
      body: string;
      /** Lines above the salutation: who the letter is addressed to. */
      addressee?: string[];
      salutation?: string;
      /** What sits between the closing line and the signature. */
      closing?: string;
    },
  ): string {
    // Already defaulted by sanitizeColor when the school set nothing.
    const navy = school.primaryColor;
    const logo = logoDataUri(school.logoUrl);
    const mark = watermark(school.stampUrl);
    // No house-logo fallback for these two. A school that has uploaded neither
    // had Markova's mark printed where the stamp and the signature belong, so
    // every letter went out signed by a logo, twice.
    const stamp = logoDataUri(school.stampUrl, { fallback: null });
    const signature = logoDataUri(school.signatureUrl, { fallback: null });
    const today = new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const crest = logo
      ? `<img class="crest-img" src="${logo}" alt="" />`
      : `<div class="crest">${escapeHtml((school.name || 'S').slice(0, 2).toUpperCase())}</div>`;

    const contactLines = [
      school.address,
      [school.phone, school.email].filter(Boolean).join(' &nbsp;·&nbsp; '),
      school.website,
    ].filter(Boolean);

    const addressee = (opts.addressee ?? ['TO WHOM IT MAY CONCERN'])
      .map((line) => `<div>${escapeHtml(line)}</div>`)
      .join('');

    // The reference a receiving school or the district quotes back. Built from
    // the student's number and today's date so two letters for the same
    // student in the same year are still distinguishable.
    const ref = `Ref: ${escapeHtml(opts.reference)}/${new Date().getFullYear()}`;

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{ box-sizing:border-box; margin:0; padding:0; }
      @page{ size:A4; margin:0; }
      body{
        font-family:Poppins,'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;
        color:#1c2733; background:#fff; width:210mm;
      }
      .sheet{ width:210mm; min-height:296.5mm; padding:16mm 18mm 14mm; display:flex; flex-direction:column; }
      .sheet *{ line-height:1.55; }

      /* ── letterhead ───────────────────────────────────────────────────── */
      .off{ display:flex; align-items:center; gap:16px; padding-bottom:12px; border-bottom:3px double ${navy}; }
      .crest{ width:60px; height:60px; border-radius:50%; flex:0 0 60px; background:${navy}; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:20px; }
      .crest-img{ width:60px; height:60px; object-fit:contain; flex:0 0 60px; }
      .off-lines{ flex:1; }
      .off-lines .school{ font-size:20px; font-weight:700; color:${navy}; letter-spacing:.01em; }
      .off-lines .motto{ font-size:11px; color:#5b6b7b; font-style:italic; }
      .off-lines .addr{ font-size:10.5px; color:#5b6b7b; margin-top:3px; }
      .off-lines .reg{ font-size:10px; color:#8394a4; margin-top:1px; }

      /* ── reference line ───────────────────────────────────────────────── */
      .refline{ display:flex; justify-content:space-between; font-size:11px; color:#41535f; margin-top:10px; }
      .refline b{ font-weight:600; }

      /* ── the letter itself ────────────────────────────────────────────── */
      .addressee{ margin-top:18px; font-size:12px; color:#1c2733; }
      .addressee div{ line-height:1.5; }
      .subject{ margin:16px 0 4px; font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:${navy}; }
      .subject-rule{ width:100%; border-bottom:1.5px solid ${navy}; margin-bottom:14px; }
      .salutation{ font-size:12.5px; margin-bottom:10px; }
      .content{ flex:1; font-size:12.5px; }
      .content p{ margin-bottom:11px; text-align:justify; }
      table.doc{ border-collapse:collapse; width:100%; font-size:11.5px; margin:12px 0 14px; }
      table.doc th{ background:#eef4f9; color:${navy}; text-align:left; padding:7px 9px; border:1px solid rgba(21,37,54,.12); font-size:10.5px; text-transform:uppercase; letter-spacing:.06em; white-space:nowrap; }
      table.doc td{ padding:7px 9px; border:1px solid rgba(21,37,54,.12); }
      table.doc tr:nth-child(even) td{ background:#fafcfd; }

      /* ── closing: a letter ends with a signature, not a footer ────────── */
      .closing{ margin-top:20px; font-size:12.5px; }
      .sign-area{ margin-top:6px; position:relative; display:inline-block; min-width:230px; padding-right:120px; }
      .sig-img{ height:52px; object-fit:contain; display:block; margin-bottom:-6px; }
      .sig-gap{ height:46px; }
      .sign-rule{ border-top:1px solid #1c2733; width:230px; padding-top:4px; }
      .sign-name{ font-size:12.5px; font-weight:600; }
      .sign-role{ font-size:11px; color:#5b6b7b; }
      /* Beside the signature, not on top of it: a wet stamp goes next to the
         name, and overlapping the rule made the letter look damaged. */
      .stamp-img{ position:absolute; right:0; bottom:2px; height:96px; object-fit:contain; opacity:.85; }
      .stamp-placeholder{ position:absolute; right:6px; bottom:2px; width:92px; height:92px; border:1px dashed rgba(21,37,54,.28); border-radius:50%; display:flex; align-items:center; justify-content:center; text-align:center; font-size:8.5px; letter-spacing:.08em; color:#a3b1bd; text-transform:uppercase; }

      .foot{ margin-top:auto; padding-top:10px; border-top:1px solid rgba(21,37,54,.12); font-size:9px; color:#8394a4; display:flex; justify-content:space-between; }
    ${mark.css}
    </style></head><body>
      ${mark.html}
      <div class="sheet">
        <div class="off">
          ${crest}
          <div class="off-lines">
            <div class="school">${school.name}</div>
            ${school.motto ? `<div class="motto">${school.motto}</div>` : ''}
            ${contactLines.map((l: string) => `<div class="addr">${l}</div>`).join('')}
            ${school.registrationNumber ? `<div class="reg">Registration No. ${school.registrationNumber}</div>` : ''}
          </div>
        </div>

        <div class="refline">
          <span><b>${ref}</b></span>
          <span>${escapeHtml(school.address ? school.address.split(',').slice(-2).join(',').trim() : '')}${school.address ? ', ' : ''}${today}</span>
        </div>

        <div class="addressee">${addressee}</div>

        <div class="subject">RE: ${escapeHtml(opts.title)}${opts.subtitle ? ` - ${escapeHtml(opts.subtitle)}` : ''}</div>
        <div class="subject-rule"></div>

        <div class="salutation">${escapeHtml(opts.salutation ?? 'Dear Sir / Madam,')}</div>

        <div class="content">${opts.body}</div>

        <div class="closing">
          <div>${escapeHtml(opts.closing ?? 'Yours faithfully,')}</div>
          <div class="sign-area">
            ${
              signature
                ? `<img class="sig-img" src="${signature}" alt="" />`
                : '<div class="sig-gap"></div>'
            }
            <div class="sign-rule">
              <div class="sign-name">${school.headTeacher || '&nbsp;'}</div>
              <div class="sign-role">Head Teacher, ${school.name}</div>
            </div>
            ${
              stamp
                ? `<img class="stamp-img" src="${stamp}" alt="" />`
                : '<div class="stamp-placeholder">School stamp</div>'
            }
          </div>
        </div>

        <div class="foot">
          <span>${ref}</span>
          <span>Issued ${today}${school.website ? ` &nbsp;·&nbsp; ${school.website}` : ''}</span>
        </div>
      </div>
    </body></html>`;
  }

  /**
   * A student's particulars, as a sentence rather than a grid.
   *
   * These letters used to open with a four-cell table repeating the name,
   * number, class and status the prose then said again. A letter a family
   * carries to another school reads as a letter, so the particulars are woven
   * into the first paragraph and only genuinely tabular records (results,
   * incidents) keep a table.
   */
  private studentParticulars(student: any): string {
    const name = `${escapeHtml(student.user.firstName)} ${escapeHtml(student.user.lastName)}`;
    const parts = [
      `<strong>${name}</strong>`,
      `student number <strong>${escapeHtml(student.studentIdNumber)}</strong>`,
    ];
    if (student.dateOfBirth) {
      // "a male student born 4 March 2010", not "born 4 March 2010, male" -
      // this reads inside a sentence, not down a column of a form.
      const article = student.gender
        ? `a ${String(student.gender).toLowerCase()} student `
        : '';
      parts.push(
        `${article}born ${new Date(student.dateOfBirth).toLocaleDateString(
          'en-GB',
          {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          },
        )}`,
      );
    } else if (student.gender) {
      parts.push(`a ${String(student.gender).toLowerCase()} student`);
    }
    return parts.join(', ');
  }

  private renderLetterHtml(
    school: any,
    student: any,
    title: string,
    body: string,
    opts: { addressee?: string[]; closing?: string } = {},
  ): string {
    return this.renderDocumentShell(school, {
      title,
      subtitle: `${student.user.firstName} ${student.user.lastName}`,
      reference: student.studentIdNumber,
      body,
      addressee: opts.addressee,
      closing: opts.closing,
    });
  }

  private renderDisciplineReportHtml(
    school: any,
    student: any,
    incidents: any[],
  ): string {
    const particulars = this.studentParticulars(student);
    const className = escapeHtml(classDisplayName(student.classSection));
    const deducted = incidents.reduce(
      (sum, i) => sum + (i.pointsDeducted || 0),
      0,
    );

    const rows = incidents.length
      ? incidents
          .map(
            (i) =>
              `<tr><td>${new Date(i.date).toLocaleDateString('en-GB')}</td><td>${escapeHtml(i.description)}</td><td style="text-align:center">-${i.pointsDeducted}</td><td>${escapeHtml(i.actionTaken)}</td><td>${escapeHtml(
                i.recordedBy
                  ? `${i.recordedBy.firstName} ${i.recordedBy.lastName}`
                  : '',
              )}</td></tr>`,
          )
          .join('')
      : `<tr><td colspan="5" style="text-align:center;color:#5b6b7b">No incidents have been recorded against this student.</td></tr>`;

    const summary = incidents.length
      ? `<p>${incidents.length} matter${incidents.length === 1 ? ' has' : 's have'} been
         recorded, accounting for ${deducted} point${deducted === 1 ? '' : 's'}
         deducted. Each is set out below with the date it occurred, the action
         taken and the member of staff who recorded it.</p>`
      : `<p>No disciplinary matter has been recorded against this student for
         the whole of their time at this school, and their conduct mark stands
         at the full starting figure.</p>`;

    const body = `
      <p>This report sets out the conduct record held by ${school.name} for
      ${particulars}, presently in <strong>${className}</strong>.</p>

      <p>Conduct at this school is marked out of a starting allocation from
      which points are deducted for recorded incidents.${
        typeof student.disciplinePoints === 'number'
          ? ` This student's standing is currently <strong>${student.disciplinePoints}</strong> points.`
          : ''
      }</p>

      ${summary}

      <table class="doc">
        <thead><tr><th>Date</th><th>Incident</th><th>Points</th><th>Action taken</th><th>Recorded by</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <p>This report is issued from the school's own records and is accurate as
      at the date above. It is provided in confidence and should be read
      alongside the student's academic record rather than on its own.</p>`;

    return this.renderDocumentShell(school, {
      title: 'Student Conduct Report',
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
    const particulars = this.studentParticulars(student);
    const className = escapeHtml(classDisplayName(student.classSection));

    const rows = termResults.length
      ? termResults
          .map(
            (tr) =>
              `<tr><td>${escapeHtml(tr.term.academicYear.name)}</td><td>${escapeHtml(tr.term.name)}</td><td style="text-align:center">${tr.average?.toFixed(1) ?? '-'}%</td><td style="text-align:center">${escapeHtml(tr.letterGrade ?? '') || '-'}</td><td style="text-align:center">${
                tr.aggregate != null && tr.aggregateMax != null
                  ? `${tr.aggregate}/${tr.aggregateMax}`
                  : '-'
              }</td><td style="text-align:center">${tr.rank ?? '-'}</td></tr>`,
          )
          .join('')
      : `<tr><td colspan="6" style="text-align:center;color:#5b6b7b">No results have been published for this student yet.</td></tr>`;

    const averages = termResults
      .map((tr) => tr.average)
      .filter((a): a is number => typeof a === 'number');
    const overall = averages.length
      ? averages.reduce((a, b) => a + b, 0) / averages.length
      : null;

    const years = new Set(
      termResults.map((tr) => tr.term.academicYear.name as string),
    );

    const body = `
      <p>This transcript sets out the complete academic record held by
      ${school.name} for ${particulars}, presently in
      <strong>${className}</strong>.</p>

      <p>It covers ${termResults.length} assessed term${termResults.length === 1 ? '' : 's'}
      across ${years.size} academic year${years.size === 1 ? '' : 's'}. Each
      term's average is the mean of the student's subject totals, where every
      subject total is the weighted combination of its continuous assessments,
      practical work and end-of-term examination.${
        overall != null
          ? ` Taken together, the student's cumulative average across the whole record is <strong>${overall.toFixed(1)}%</strong>.`
          : ''
      }</p>

      <table class="doc">
        <thead><tr><th>Academic year</th><th>Term</th><th>Average</th><th>Grade</th><th>Aggregate</th><th>Position</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <p>Position is the student's rank within their own class for that term.
      Aggregate, where shown, is the points total counted for national
      certification. Only results that have been published by the school appear
      here.</p>

      <p>This document is issued from the school's own records and is valid only
      when it carries the school stamp and the signature of the undersigned.</p>`;

    return this.renderDocumentShell(school, {
      title: 'Academic Transcript',
      subtitle: `${student.user.firstName} ${student.user.lastName}`,
      reference: student.studentIdNumber,
      body,
    });
  }
}
