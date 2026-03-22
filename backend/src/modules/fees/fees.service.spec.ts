import { Test, TestingModule } from '@nestjs/testing';
import { FeesService } from './fees.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictException } from '@nestjs/common';

describe('FeesService', () => {
  let service: FeesService;

  const mockPrisma = {
    feeRecord: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn(),
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
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // recordPayment()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('recordPayment()', () => {
    const baseDto = {
      studentId: 'student-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      amountDue: 100000,
      amountPaid: 0,
      paymentMethod: 'CASH',
    };

    beforeEach(() => {
      // No existing record by default
      mockPrisma.feeRecord.findFirst.mockResolvedValue(null);
      mockPrisma.feeRecord.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'fee-1', ...data }),
      );
    });

    it('should set status PAID when amountPaid >= amountDue', async () => {
      const dto = { ...baseDto, amountPaid: 100000 };

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

    it('should set status PARTIAL when 0 < amountPaid < amountDue', async () => {
      const dto = { ...baseDto, amountPaid: 50000 };

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

    it('should set status UNPAID when amountPaid is 0', async () => {
      const dto = { ...baseDto, amountPaid: 0 };

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

    it('should calculate balance correctly (amountDue - amountPaid, min 0)', async () => {
      // Overpayment case: balance should be 0, not negative
      const dto = { ...baseDto, amountPaid: 120000 };

      await service.recordPayment(dto as any);

      expect(mockPrisma.feeRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            balance: 0, // Math.max(0, 100000 - 120000) = 0
            status: 'PAID',
          }),
        }),
      );
    });

    it('should throw ConflictException for duplicate student+term+year', async () => {
      mockPrisma.feeRecord.findFirst.mockResolvedValue({
        id: 'existing-fee',
        studentId: 'student-1',
        termId: 'term-1',
        academicYearId: 'year-1',
      });

      await expect(service.recordPayment(baseDto as any)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrisma.feeRecord.create).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getSummary()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getSummary()', () => {
    it('should calculate totals and collectionRate correctly', async () => {
      mockPrisma.feeRecord.aggregate.mockResolvedValue({
        _sum: { amountDue: 300000, amountPaid: 150000 },
        _count: 3,
      });
      mockPrisma.feeRecord.groupBy.mockResolvedValue([
        { status: 'PAID', _count: 1 },
        { status: 'PARTIAL', _count: 1 },
        { status: 'UNPAID', _count: 1 },
      ]);

      const result = await service.getSummary();

      expect(result.totalStudents).toBe(3);
      expect(result.totalDue).toBe(300000);
      expect(result.totalPaid).toBe(150000);
      expect(result.totalBalance).toBe(150000);
      expect(result.paid).toBe(1);
      expect(result.partial).toBe(1);
      expect(result.unpaid).toBe(1);
      expect(result.collectionRate).toBe(50); // 150000/300000 * 100
    });

    it('should return 0 collectionRate when no records exist', async () => {
      mockPrisma.feeRecord.aggregate.mockResolvedValue({
        _sum: { amountDue: null, amountPaid: null },
        _count: 0,
      });
      mockPrisma.feeRecord.groupBy.mockResolvedValue([]);

      const result = await service.getSummary();

      expect(result.totalStudents).toBe(0);
      expect(result.totalDue).toBe(0);
      expect(result.totalPaid).toBe(0);
      expect(result.collectionRate).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getStudentFees()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getStudentFees()', () => {
    it('should return records for specific student with totals', async () => {
      const records = [
        { id: 'fee-1', amountDue: 100000, amountPaid: 100000, status: 'PAID', term: { name: 'Term 1' }, academicYear: { name: '2025-2026' } },
        { id: 'fee-2', amountDue: 100000, amountPaid: 50000, status: 'PARTIAL', term: { name: 'Term 2' }, academicYear: { name: '2025-2026' } },
      ];
      mockPrisma.feeRecord.findMany.mockResolvedValue(records);

      const result = await service.getStudentFees('student-1');

      expect(mockPrisma.feeRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { studentId: 'student-1' },
        }),
      );
      expect(result.records).toHaveLength(2);
      expect(result.totalDue).toBe(200000);
      expect(result.totalPaid).toBe(150000);
      expect(result.totalBalance).toBe(50000);
    });
  });
});
