import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RecordPaymentDto, UpdatePaymentDto, QueryFeesDto } from './dto';
import puppeteer from 'puppeteer-core';

@Injectable()
export class FeesService {
  constructor(private prisma: PrismaService) {}

  async recordPayment(dto: RecordPaymentDto) {
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
    const where: any = {};
    if (query.studentId) where.studentId = query.studentId;
    if (query.academicYearId) where.academicYearId = query.academicYearId;
    if (query.termId) where.termId = query.termId;
    if (query.status) where.status = query.status;

    return this.prisma.feeRecord.findMany({
      where,
      include: {
        student: { include: { user: { select: { firstName: true, lastName: true } }, classSection: { include: { classLevel: true } } } },
        term: { select: { name: true } },
        academicYear: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
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

    const records = await this.prisma.feeRecord.findMany({ where });

    const totalDue = records.reduce((s, r) => s + r.amountDue, 0);
    const totalPaid = records.reduce((s, r) => s + r.amountPaid, 0);
    const paid = records.filter((r) => r.status === 'PAID').length;
    const partial = records.filter((r) => r.status === 'PARTIAL').length;
    const unpaid = records.filter((r) => r.status === 'UNPAID').length;

    return { totalStudents: records.length, totalDue, totalPaid, totalBalance: totalDue - totalPaid, paid, partial, unpaid, collectionRate: totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0 };
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
      <div class="header"><h1>${map['school_name'] || ''}</h1><h2>Payment Receipt</h2></div>
      <table>
        <tr><td><strong>Receipt #</strong></td><td>${record.receiptNumber || record.id.slice(0, 8)}</td></tr>
        <tr><td><strong>Student</strong></td><td>${record.student.user.firstName} ${record.student.user.lastName}</td></tr>
        <tr><td><strong>Class</strong></td><td>${record.student.classSection.classLevel.name} ${record.student.classSection.name}</td></tr>
        <tr><td><strong>Term</strong></td><td>${record.term.name} — ${record.academicYear.name}</td></tr>
        <tr><td><strong>Amount Due</strong></td><td>${record.amountDue.toLocaleString()}</td></tr>
        <tr><td><strong>Amount Paid</strong></td><td>${record.amountPaid.toLocaleString()}</td></tr>
        <tr><td><strong>Balance</strong></td><td>${record.balance.toLocaleString()}</td></tr>
        <tr><td><strong>Method</strong></td><td>${record.paymentMethod}</td></tr>
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
