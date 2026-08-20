import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import puppeteer from 'puppeteer-core';
import { buildZip, toCsv } from './zip.util';

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeColor(color: string | null | undefined): string {
  if (!color) return '#1B4F72';
  return /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/.test(color) ? color : '#1B4F72';
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private async htmlToPdf(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
      executablePath:
        process.env.CHROME_PATH ||
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
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
        classSection: { include: { classLevel: true } },
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

    return {
      school,
      student: {
        name: `${student.user.firstName} ${student.user.lastName}`,
        studentIdNumber: student.studentIdNumber,
        photoUrl: student.user.photoUrl,
        class: `${student.classSection.classLevel.name} ${student.classSection.name}`,
        gender: student.gender,
        dateOfBirth: student.dateOfBirth,
      },
      term: { name: term.name, academicYear: term.academicYear.name },
      subjects: subjectBreakdown,
      result: termResult,
      classStats: {
        classAverage,
        totalStudents: classResults.length,
        rank: termResult?.rank || null,
      },
    };
  }

  async getYearReportData(studentId: string, academicYearId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: { select: { firstName: true, lastName: true, photoUrl: true } },
        classSection: { include: { classLevel: true } },
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
        class: `${student.classSection.classLevel.name} ${student.classSection.name}`,
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
    return this.renderTermReportHtml(data);
  }

  async generateTermReportPdf(
    studentId: string,
    termId: string,
  ): Promise<Buffer> {
    const html = await this.generateTermReportHtml(studentId, termId);
    return this.htmlToPdf(html);
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
        classSection: { include: { classLevel: true } },
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
            `This is to certify that ${escapeHtml(student.user.firstName)} ${escapeHtml(student.user.lastName)} (Student ID: ${escapeHtml(student.studentIdNumber)}) was a student of ${school.name} in ${escapeHtml(student.classSection.classLevel.name)} ${escapeHtml(student.classSection.name)}. The student is hereby transferred from our institution as of ${today}.`,
          ),
        };
      case 'enrollment_confirmation':
        return {
          title: `Enrollment Confirmation - ${student.user.firstName} ${student.user.lastName}`,
          html: this.renderLetterHtml(
            school,
            student,
            'Enrollment Confirmation',
            `This is to confirm that ${escapeHtml(student.user.firstName)} ${escapeHtml(student.user.lastName)} (Student ID: ${escapeHtml(student.studentIdNumber)}) is currently enrolled at ${school.name} in ${escapeHtml(student.classSection.classLevel.name)} ${escapeHtml(student.classSection.name)} since ${student.enrollmentDate ? new Date(student.enrollmentDate).toLocaleDateString() : 'N/A'}.`,
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
        classSection: { include: { classLevel: true } },
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
        class: `${student.classSection.classLevel.name} ${student.classSection.name}`,
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

  private generateCardId(): string {
    // e.g. MK-3F9A2B7C1D — a printable, unique physical-card identifier
    return 'MK-' + randomBytes(5).toString('hex').toUpperCase();
  }

  /** Registry of students with their card status, filterable by section/search/status. */
  async getIdCardRegistry(query: {
    classSectionId?: string;
    search?: string;
    status?: string;
  }) {
    const { classSectionId, search, status } = query;
    const where: any = { status: 'ACTIVE' };
    if (classSectionId) where.classSectionId = classSectionId;
    if (status === 'issued') where.nfcCardId = { not: null };
    else if (status === 'not_issued') where.nfcCardId = null;
    if (search?.trim()) {
      const s = search.trim();
      where.OR = [
        { studentIdNumber: { contains: s, mode: 'insensitive' } },
        { nfcCardId: { contains: s, mode: 'insensitive' } },
        { user: { firstName: { contains: s, mode: 'insensitive' } } },
        { user: { lastName: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const students = await this.prisma.student.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true, photoUrl: true } },
        classSection: { include: { classLevel: true } },
      },
      orderBy: [
        { classSection: { classLevel: { order: 'asc' } } },
        { user: { firstName: 'asc' } },
      ],
    });

    const items = students.map((s) => this.toCardSummary(s));
    return {
      total: items.length,
      issued: items.filter((i) => i.hasCard).length,
      notIssued: items.filter((i) => !i.hasCard).length,
      items,
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

    await this.prisma.student.update({
      where: { id: studentId },
      data: { nfcCardId: cardId, cardIssuedAt: new Date() },
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

  /** Revoke a student's card. */
  async revokeIdCard(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
    });
    if (!student) throw new NotFoundException('Student not found');
    await this.prisma.student.update({
      where: { id: studentId },
      data: { nfcCardId: null, cardIssuedAt: null },
    });
    return { success: true };
  }

  private async idCardSummary(studentId: string) {
    const s = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: { select: { firstName: true, lastName: true, photoUrl: true } },
        classSection: { include: { classLevel: true } },
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
      class: `${s.classSection.classLevel.name} ${s.classSection.name}`,
      classSectionId: s.classSectionId,
      cardId: s.nfcCardId,
      hasCard: !!s.nfcCardId,
      cardIssuedAt: s.cardIssuedAt,
    };
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
    tables.push({ name: 'students', rows: await this.prisma.student.findMany() });
    tables.push({ name: 'teachers', rows: await this.prisma.teacher.findMany() });
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
    tables.push({ name: 'subjects', rows: await this.prisma.subject.findMany() });
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
    tables.push({ name: 'homework', rows: await this.prisma.homework.findMany() });
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

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private async getSchoolInfo() {
    const configs = await this.prisma.schoolConfig.findMany();
    const map: Record<string, string> = {};
    for (const c of configs) map[c.key] = c.value;
    return {
      name: escapeHtml(map['school_name']),
      motto: escapeHtml(map['motto']),
      logoUrl: map['logo_url'] || null,
      stampUrl: map['stamp_url'] || null,
      signatureUrl: map['signature_url'] || null,
      primaryColor: sanitizeColor(map['primary_color']),
    };
  }

  private groupMarksBySubject(marks: any[]) {
    const map = new Map<
      string,
      { subject: string; assessments: any[]; average: number }
    >();
    for (const m of marks) {
      if (!map.has(m.subjectId)) {
        map.set(m.subjectId, {
          subject: m.subject.name,
          assessments: [],
          average: 0,
        });
      }
      map.get(m.subjectId)!.assessments.push({
        type: m.assessmentType.name,
        score: m.score,
        maxScore: m.maxScore,
        pct: Math.round((m.score / m.maxScore) * 100),
      });
    }
    for (const [, val] of map) {
      const total = val.assessments.reduce((s: number, a: any) => s + a.pct, 0);
      val.average =
        val.assessments.length > 0
          ? Math.round(total / val.assessments.length)
          : 0;
    }
    return Array.from(map.values());
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

  private renderTermReportHtml(data: any): string {
    // Build assessment type headers dynamically
    const allTypes = new Set<string>();
    data.subjects.forEach((s: any) =>
      s.assessments.forEach((a: any) => allTypes.add(a.type)),
    );
    const typeHeaders = Array.from(allTypes);

    const subjectRows = data.subjects
      .map((s: any) => {
        const typeScores = typeHeaders
          .map((t) => {
            const a = s.assessments.find((a: any) => a.type === t);
            return `<td style="text-align:center">${a ? a.score : '—'}</td>`;
          })
          .join('');
        return `<tr><td>${escapeHtml(s.subject)}</td>${typeScores}<td style="text-align:center;font-weight:bold">${s.average}%</td></tr>`;
      })
      .join('');

    const gradeKey = `<div style="margin:10px 0;font-size:12px;color:#666">
      <strong>Grading:</strong> A (90-100) | B (80-89) | C (70-79) | D (60-69) | E (50-59) | F (0-49)
    </div>`;

    return `<!DOCTYPE html><html><head><style>
      @media print { body { margin: 0; } @page { margin: 15mm; } }
      body { font-family: 'Segoe UI', Arial, sans-serif; margin: 30px; color: #333; background: #fff; max-width: 800px; margin: 30px auto; }
      .header { text-align: center; margin-bottom: 25px; border-bottom: 3px solid ${data.school.primaryColor}; padding-bottom: 15px; }
      .header h1 { color: ${data.school.primaryColor}; margin: 5px 0; font-size: 28px; }
      .header h2 { color: ${data.school.primaryColor}; margin: 8px 0; font-size: 18px; letter-spacing: 2px; }
      .header p { margin: 3px 0; color: #666; font-size: 14px; }
      .info { display: flex; justify-content: space-between; margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px; }
      .info div { font-size: 14px; line-height: 1.8; }
      table { width: 100%; border-collapse: collapse; margin: 20px 0; }
      th, td { border: 1px solid #ddd; padding: 10px 12px; text-align: left; font-size: 13px; }
      th { background: ${data.school.primaryColor}; color: white; font-weight: 600; text-align: center; }
      th:first-child { text-align: left; }
      tr:nth-child(even) { background: #f8f9fa; }
      .comments { margin: 20px 0; padding: 15px; border: 1px solid #e0e0e0; border-radius: 8px; }
      .comments p { margin: 8px 0; font-size: 14px; }
      .footer { margin-top: 40px; display: flex; justify-content: space-between; padding-top: 15px; border-top: 2px solid #e0e0e0; font-size: 13px; color: #666; }
      .signature { margin-top: 50px; display: flex; justify-content: space-between; }
      .signature div { text-align: center; width: 200px; }
      .signature .line { border-top: 1px solid #333; margin-top: 40px; padding-top: 5px; font-size: 12px; }
    </style></head><body>
      <div class="header">
        <h1>${data.school.name}</h1>
        <p>${data.school.motto}</p>
        <h2>TERM REPORT CARD</h2>
        <p>${escapeHtml(data.term.name)} — Academic Year ${escapeHtml(data.term.academicYear)}</p>
      </div>
      <div class="info">
        <div>
          <strong>Name:</strong> ${escapeHtml(data.student.name)}<br>
          <strong>Student ID:</strong> ${escapeHtml(data.student.studentIdNumber)}<br>
          <strong>Class:</strong> ${escapeHtml(data.student.class)}
        </div>
        <div style="text-align:right">
          <strong>Average:</strong> ${data.result?.average?.toFixed(1) || '—'}%<br>
          <strong>Grade:</strong> ${data.result?.letterGrade || '—'}<br>
          <strong>Rank:</strong> ${data.result?.rank || '—'} of ${data.classStats.totalStudents}
        </div>
      </div>
      <table>
        <thead><tr><th style="width:30%">Subject</th>${typeHeaders.map((t) => `<th>${escapeHtml(t)}</th>`).join('')}<th>Average</th></tr></thead>
        <tbody>${subjectRows}</tbody>
      </table>
      ${gradeKey}
      <div class="comments">
        <p><strong>Class Teacher's Comment:</strong> ${escapeHtml(data.result?.teacherComment) || '_______________________________________________'}</p>
        <p><strong>Headmaster's Remark:</strong> ${escapeHtml(data.result?.headmasterComment) || '_______________________________________________'}</p>
      </div>
      <div class="footer">
        <div>Class Average: ${data.classStats.classAverage?.toFixed(1) || '—'}%</div>
        <div>Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
      </div>
      <div class="signature">
        <div><div class="line">Class Teacher</div></div>
        <div><div class="line">Headmaster</div></div>
        <div><div class="line">School Stamp</div></div>
      </div>
    </body></html>`;
  }

  private renderLetterHtml(
    school: any,
    student: any,
    title: string,
    body: string,
  ): string {
    return `<!DOCTYPE html><html><head><style>
      body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
      .header { text-align: center; margin-bottom: 30px; }
      .header h1 { color: ${school.primaryColor}; }
      .content { margin: 30px 0; line-height: 1.8; }
      .footer { margin-top: 60px; }
    </style></head><body>
      <div class="header"><h1>${school.name}</h1><p>${school.motto}</p><h2>${escapeHtml(title)}</h2></div>
      <div class="content"><p>${body}</p></div>
      <div class="footer"><p>Authorized Signature: _______________</p><p>Date: ${new Date().toLocaleDateString()}</p></div>
    </body></html>`;
  }

  private renderDisciplineReportHtml(
    school: any,
    student: any,
    incidents: any[],
  ): string {
    const rows = incidents
      .map(
        (i) =>
          `<tr><td>${new Date(i.date).toLocaleDateString()}</td><td>${escapeHtml(i.description)}</td><td>${i.pointsDeducted}</td><td>${escapeHtml(i.actionTaken)}</td></tr>`,
      )
      .join('');
    return `<!DOCTYPE html><html><head><style>
      body { font-family: Arial, sans-serif; margin: 40px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #ddd; padding: 8px; }
      th { background: ${school.primaryColor}; color: white; }
    </style></head><body>
      <h1 style="color:${school.primaryColor}">${school.name}</h1>
      <h2>Discipline Report — ${escapeHtml(student.user.firstName)} ${escapeHtml(student.user.lastName)}</h2>
      <p>ID: ${escapeHtml(student.studentIdNumber)} | Class: ${escapeHtml(student.classSection.classLevel.name)} ${escapeHtml(student.classSection.name)} | Points: ${student.disciplinePoints}</p>
      <table><thead><tr><th>Date</th><th>Description</th><th>Points</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>
    </body></html>`;
  }

  private renderTranscriptHtml(
    school: any,
    student: any,
    termResults: any[],
  ): string {
    const rows = termResults
      .map(
        (tr) =>
          `<tr><td>${escapeHtml(tr.term.academicYear.name)}</td><td>${escapeHtml(tr.term.name)}</td><td>${tr.average?.toFixed(1) || '—'}%</td><td>${escapeHtml(tr.letterGrade) || '—'}</td><td>${tr.rank || '—'}</td></tr>`,
      )
      .join('');
    return `<!DOCTYPE html><html><head><style>
      body { font-family: Arial, sans-serif; margin: 40px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #ddd; padding: 8px; }
      th { background: ${school.primaryColor}; color: white; }
    </style></head><body>
      <h1 style="color:${school.primaryColor}">${school.name}</h1>
      <h2>Academic Transcript</h2>
      <p>${escapeHtml(student.user.firstName)} ${escapeHtml(student.user.lastName)} | ID: ${escapeHtml(student.studentIdNumber)}</p>
      <table><thead><tr><th>Year</th><th>Term</th><th>Average</th><th>Grade</th><th>Rank</th></tr></thead><tbody>${rows}</tbody></table>
    </body></html>`;
  }
}
