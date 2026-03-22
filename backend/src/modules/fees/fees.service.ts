import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginatedResponse } from '../../common/dto';
import { RecordPaymentDto, UpdatePaymentDto, QueryFeesDto } from './dto';
import puppeteer from 'puppeteer-core';

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

@Injectable()
export class FeesService {
  constructor(private prisma: PrismaService) {}

  async recordPayment(dto: RecordPaymentDto) {
    // Check for duplicate payment record
    const existing = await this.prisma.feeRecord.findFirst({
      where: {
        studentId: dto.studentId,
        termId: dto.termId,
        academicYearId: dto.academicYearId,
      },
    });
    if (existing) {
      throw new ConflictException(
        'A fee record already exists for this student and term. Use the update endpoint instead.',
      );
    }

    const balance = dto.amountDue - dto.amountPaid;
    const status = balance <= 0 ? 'PAID' : dto.amountPaid > 0 ? 'PARTIAL' : 'UNPAID';

    return this.prisma.feeRecord.create({
      data: {
        studentId: dto.studentId,
        academicYearId: dto.academicYearId,
        termId: dto.termId,
        amountDue: dto.amountDue,
        amountPaid: dto.amountPaid,
        balance: Math.max(0, balance),
        status: status as any,
        paymentMethod: (dto.paymentMethod as any) || null,
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
        receiptNumber: dto.receiptNumber,
        notes: dto.notes,
      },
      include: {
        student: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
  }

  async updatePayment(id: string, dto: UpdatePaymentDto) {
    const record = await this.prisma.feeRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Fee record not found');

    const amountPaid = dto.amountPaid ?? record.amountPaid;
    const balance = record.amountDue - amountPaid;
    const status = balance <= 0 ? 'PAID' : amountPaid > 0 ? 'PARTIAL' : 'UNPAID';

    return this.prisma.feeRecord.update({
      where: { id },
      data: {
        ...(dto.amountPaid !== undefined && { amountPaid, balance: Math.max(0, balance), status: status as any }),
        ...(dto.paymentMethod && { paymentMethod: dto.paymentMethod as any }),
        ...(dto.receiptNumber && { receiptNumber: dto.receiptNumber }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async findAll(query: QueryFeesDto) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.studentId) where.studentId = query.studentId;
    if (query.academicYearId) where.academicYearId = query.academicYearId;
    if (query.termId) where.termId = query.termId;
    if (query.status) where.status = query.status;

    const [data, total] = await Promise.all([
      this.prisma.feeRecord.findMany({
        where,
        skip,
        take: limit,
        include: {
          student: { include: { user: { select: { firstName: true, lastName: true } }, classSection: { include: { classLevel: true } } } },
          term: { select: { name: true } },
          academicYear: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.feeRecord.count({ where }),
    ]);

    return new PaginatedResponse(data, total, page, limit);
  }

  async getStudentFees(studentId: string) {
    const records = await this.prisma.feeRecord.findMany({
      where: { studentId },
      include: {
        term: { select: { name: true } },
        academicYear: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalDue = records.reduce((s, r) => s + r.amountDue, 0);
    const totalPaid = records.reduce((s, r) => s + r.amountPaid, 0);

    return { records, totalDue, totalPaid, totalBalance: totalDue - totalPaid };
  }

  async getSummary(academicYearId?: string, termId?: string) {
    const where: any = {};
    if (academicYearId) where.academicYearId = academicYearId;
    if (termId) where.termId = termId;

    const [agg, statusCounts] = await Promise.all([
      this.prisma.feeRecord.aggregate({
        where,
        _sum: { amountDue: true, amountPaid: true },
        _count: true,
      }),
      this.prisma.feeRecord.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),
    ]);

    const totalDue = agg._sum.amountDue || 0;
    const totalPaid = agg._sum.amountPaid || 0;
    const statusMap: Record<string, number> = {};
    for (const s of statusCounts) {
      statusMap[s.status] = s._count;
    }

    return {
      totalStudents: agg._count,
      totalDue,
      totalPaid,
      totalBalance: totalDue - totalPaid,
      paid: statusMap['PAID'] || 0,
      partial: statusMap['PARTIAL'] || 0,
      unpaid: statusMap['UNPAID'] || 0,
      collectionRate: totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0,
    };
  }

  async generateReceiptHtml(id: string): Promise<string> {
    const record = await this.prisma.feeRecord.findUnique({
      where: { id },
      include: {
        student: { include: { user: { select: { firstName: true, lastName: true } }, classSection: { include: { classLevel: true } } } },
        term: { select: { name: true } },
        academicYear: { select: { name: true } },
      },
    });
    if (!record) throw new NotFoundException('Fee record not found');

    const configs = await this.prisma.schoolConfig.findMany();
    const map: Record<string, string> = {};
    for (const c of configs) map[c.key] = c.value;

    return `<!DOCTYPE html><html><head><style>
      body { font-family: Arial; margin: 40px; }
      .header { text-align: center; }
      table { width: 100%; margin: 20px 0; border-collapse: collapse; }
      td { padding: 8px; border-bottom: 1px solid #eee; }
    </style></head><body>
      <div class="header"><h1>${escapeHtml(map['school_name'])}</h1><h2>Payment Receipt</h2></div>
      <table>
        <tr><td><strong>Receipt #</strong></td><td>${escapeHtml(record.receiptNumber) || escapeHtml(record.id.slice(0, 8))}</td></tr>
        <tr><td><strong>Student</strong></td><td>${escapeHtml(record.student.user.firstName)} ${escapeHtml(record.student.user.lastName)}</td></tr>
        <tr><td><strong>Class</strong></td><td>${escapeHtml(record.student.classSection.classLevel.name)} ${escapeHtml(record.student.classSection.name)}</td></tr>
        <tr><td><strong>Term</strong></td><td>${escapeHtml(record.term.name)} — ${escapeHtml(record.academicYear.name)}</td></tr>
        <tr><td><strong>Amount Due</strong></td><td>${record.amountDue.toLocaleString()}</td></tr>
        <tr><td><strong>Amount Paid</strong></td><td>${record.amountPaid.toLocaleString()}</td></tr>
        <tr><td><strong>Balance</strong></td><td>${record.balance.toLocaleString()}</td></tr>
        <tr><td><strong>Method</strong></td><td>${escapeHtml(record.paymentMethod)}</td></tr>
        <tr><td><strong>Date</strong></td><td>${record.paymentDate ? new Date(record.paymentDate).toLocaleDateString() : ''}</td></tr>
      </table>
    </body></html>`;
  }

  async generateReceiptPdf(id: string): Promise<Buffer> {
    const html = await this.generateReceiptHtml(id);
    const browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
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
}
