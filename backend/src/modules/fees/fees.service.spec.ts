import { Test, TestingModule } from '@nestjs/testing';
import { FeesService } from './fees.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('FeesService', () => {
  let service: FeesService;
  let prisma: any;

  const mockPrisma = {
    feeRecord: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    schoolConfig: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<FeesService>(FeesService);
    prisma = module.get(PrismaService);
    jest.clearAllMocks();
  });

  describe('recordPayment', () => {
    it('should calculate PAID status when amountPaid >= amountDue', async () => {
      const dto = {
        studentId: 'student-1',
        academicYearId: 'year-1',
        termId: 'term-1',
        amountDue: 100000,
        amountPaid: 100000,
        paymentMethod: 'CASH',
      };

      mockPrisma.feeRecord.create.mockResolvedValue({
        id: 'fee-1',
        ...dto,
        balance: 0,
        status: 'PAID',
      });

      await service.recordPayment(dto as any);

      expect(mockPrisma.feeRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PAID',
            balance: 0,
          }),
        }),
      );
    });

    it('should calculate PARTIAL status when amountPaid < amountDue', async () => {
      const dto = {
        studentId: 'student-1',
        academicYearId: 'year-1',
        termId: 'term-1',
        amountDue: 100000,
        amountPaid: 50000,
        paymentMethod: 'MOMO',
      };

      mockPrisma.feeRecord.create.mockResolvedValue({
        id: 'fee-1',
        ...dto,
        balance: 50000,
        status: 'PARTIAL',
      });

      await service.recordPayment(dto as any);

      expect(mockPrisma.feeRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PARTIAL',
            balance: 50000,
          }),
        }),
      );
    });

    it('should calculate UNPAID status when amountPaid is 0', async () => {
      const dto = {
        studentId: 'student-1',
        academicYearId: 'year-1',
        termId: 'term-1',
        amountDue: 100000,
        amountPaid: 0,
        paymentMethod: 'CASH',
      };

      mockPrisma.feeRecord.create.mockResolvedValue({
        id: 'fee-1',
        ...dto,
        balance: 100000,
        status: 'UNPAID',
      });

      await service.recordPayment(dto as any);

      expect(mockPrisma.feeRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'UNPAID',
            balance: 100000,
          }),
        }),
      );
    });
  });

  describe('updatePayment', () => {
    it('should throw NotFoundException when record not found', async () => {
      mockPrisma.feeRecord.findUnique.mockResolvedValue(null);

      await expect(service.updatePayment('nonexistent', {} as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should recalculate status on payment update', async () => {
      mockPrisma.feeRecord.findUnique.mockResolvedValue({
        id: 'fee-1',
        amountDue: 100000,
        amountPaid: 50000,
      });

      mockPrisma.feeRecord.update.mockResolvedValue({
        id: 'fee-1',
        status: 'PAID',
      });

      await service.updatePayment('fee-1', { amountPaid: 100000 } as any);

      expect(mockPrisma.feeRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PAID',
            balance: 0,
          }),
        }),
      );
    });
  });

  describe('getSummary', () => {
    it('should calculate summary correctly', async () => {
      mockPrisma.feeRecord.findMany.mockResolvedValue([
        { amountDue: 100000, amountPaid: 100000, status: 'PAID' },
        { amountDue: 100000, amountPaid: 50000, status: 'PARTIAL' },
        { amountDue: 100000, amountPaid: 0, status: 'UNPAID' },
      ]);

      const result = await service.getSummary();

      expect(result.totalStudents).toBe(3);
      expect(result.totalDue).toBe(300000);
      expect(result.totalPaid).toBe(150000);
      expect(result.totalBalance).toBe(150000);
      expect(result.paid).toBe(1);
      expect(result.partial).toBe(1);
      expect(result.unpaid).toBe(1);
      expect(result.collectionRate).toBe(50);
    });

    it('should return 0 collection rate when no records', async () => {
      mockPrisma.feeRecord.findMany.mockResolvedValue([]);

      const result = await service.getSummary();

      expect(result.totalStudents).toBe(0);
      expect(result.collectionRate).toBe(0);
    });
  });

  describe('generateReceiptHtml', () => {
    it('should throw NotFoundException for invalid ID', async () => {
      mockPrisma.feeRecord.findUnique.mockResolvedValue(null);

      await expect(service.generateReceiptHtml('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return HTML string with receipt data', async () => {
      mockPrisma.feeRecord.findUnique.mockResolvedValue({
        id: 'fee-1',
        receiptNumber: 'REC-001',
        amountDue: 100000,
        amountPaid: 100000,
        balance: 0,
        paymentMethod: 'CASH',
        paymentDate: new Date('2026-01-15'),
        student: {
          user: { firstName: 'John', lastName: 'Doe' },
          classSection: { name: 'A', classLevel: { name: 'S1' } },
        },
        term: { name: 'Term 1' },
        academicYear: { name: '2025-2026' },
      });
      mockPrisma.schoolConfig.findMany.mockResolvedValue([
        { key: 'school_name', value: 'Test School' },
      ]);

      const html = await service.generateReceiptHtml('fee-1');

      expect(html).toContain('Test School');
      expect(html).toContain('John Doe');
      expect(html).toContain('REC-001');
      expect(html).toContain('S1 A');
    });
  });
});
