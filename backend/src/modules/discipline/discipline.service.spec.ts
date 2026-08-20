import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { DisciplineService } from './discipline.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnershipService } from '../../common/ownership.service';

describe('DisciplineService', () => {
  let service: DisciplineService;

  const mockPrisma: any = {
    student: { findUnique: jest.fn(), update: jest.fn() },
    disciplineIncident: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    disciplineAppeal: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    notification: { create: jest.fn() },
    parentStudent: { findMany: jest.fn().mockResolvedValue([]) },
    schoolConfig: { findUnique: jest.fn() },
  };
  mockPrisma.$transaction = jest.fn((ops: any) =>
    Array.isArray(ops) ? Promise.all(ops) : ops(mockPrisma),
  );

  const mockOwnership = { verifyStudentAccess: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisciplineService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OwnershipService, useValue: mockOwnership },
      ],
    }).compile();
    service = module.get<DisciplineService>(DisciplineService);
  });

  describe('createIncident()', () => {
    const dto = {
      studentId: 's1',
      termId: 't1',
      date: '2026-03-01',
      description: 'Late to class',
      pointsDeducted: 5,
      actionTaken: 'VERBAL_WARNING',
    };

    it('deducts points and records the incident in a transaction', async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        id: 's1',
        disciplinePoints: 100,
        user: { firstName: 'Jane', lastName: 'Doe' },
      });
      mockPrisma.disciplineIncident.create.mockResolvedValue({ id: 'inc-1' });
      mockPrisma.student.update.mockResolvedValue({});

      const result = await service.createIncident(dto as any, 'teacher-1');

      expect(result.newDisciplinePoints).toBe(95);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('floors discipline points at 0', async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        id: 's1',
        disciplinePoints: 3,
        user: { firstName: 'Jane', lastName: 'Doe' },
      });
      mockPrisma.disciplineIncident.create.mockResolvedValue({ id: 'inc-2' });
      mockPrisma.student.update.mockResolvedValue({});

      const result = await service.createIncident(
        { ...dto, pointsDeducted: 50 } as any,
        'teacher-1',
      );
      expect(result.newDisciplinePoints).toBe(0);
    });

    it('throws NotFoundException for a missing student', async () => {
      mockPrisma.student.findUnique.mockResolvedValue(null);
      await expect(
        service.createIncident(dto as any, 'teacher-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createAppeal()', () => {
    const dto = { incidentId: 'inc-1', statement: 'Please reconsider' };

    it('M-4: verifies the submitter owns/parents the incident student before creating', async () => {
      mockPrisma.disciplineIncident.findUnique.mockResolvedValue({
        id: 'inc-1',
        studentId: 's1',
        appeals: [],
      });
      mockPrisma.disciplineAppeal.create.mockResolvedValue({ id: 'ap-1' });

      await service.createAppeal(dto, 'parent-1', 'PARENT');

      expect(mockOwnership.verifyStudentAccess).toHaveBeenCalledWith(
        'parent-1',
        'PARENT',
        's1',
      );
    });

    it('M-4: rejects an appeal on a student the submitter is not linked to', async () => {
      mockPrisma.disciplineIncident.findUnique.mockResolvedValue({
        id: 'inc-1',
        studentId: 's-other',
        appeals: [],
      });
      mockOwnership.verifyStudentAccess.mockRejectedValueOnce(
        new ForbiddenException('not linked'),
      );

      await expect(
        service.createAppeal(dto as any, 'parent-1', 'PARENT'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.disciplineAppeal.create).not.toHaveBeenCalled();
    });

    it('rejects a second pending appeal for the same incident', async () => {
      mockPrisma.disciplineIncident.findUnique.mockResolvedValue({
        id: 'inc-1',
        studentId: 's1',
        appeals: [{ status: 'PENDING' }],
      });

      await expect(
        service.createAppeal(dto as any, 'parent-1', 'PARENT'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for a missing incident', async () => {
      mockPrisma.disciplineIncident.findUnique.mockResolvedValue(null);
      await expect(
        service.createAppeal(dto as any, 'parent-1', 'PARENT'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('reviewAppeal()', () => {
    it('restores points when an appeal is APPROVED', async () => {
      mockPrisma.disciplineAppeal.findUnique.mockResolvedValue({
        id: 'ap-1',
        status: 'PENDING',
        incident: { studentId: 's1', pointsDeducted: 5 },
      });
      mockPrisma.disciplineAppeal.update.mockResolvedValue({ id: 'ap-1' });
      mockPrisma.student.update.mockResolvedValue({});

      await service.reviewAppeal(
        'ap-1',
        { status: 'APPROVED' } as any,
        'admin-1',
      );

      expect(mockPrisma.student.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { disciplinePoints: { increment: 5 } },
      });
    });

    it('rejects reviewing an already-reviewed appeal', async () => {
      mockPrisma.disciplineAppeal.findUnique.mockResolvedValue({
        id: 'ap-1',
        status: 'APPROVED',
        incident: { studentId: 's1', pointsDeducted: 5 },
      });
      await expect(
        service.reviewAppeal('ap-1', { status: 'REJECTED' } as any, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteIncident()', () => {
    it('restores deducted points when an incident is deleted', async () => {
      mockPrisma.disciplineIncident.findUnique.mockResolvedValue({
        id: 'inc-1',
        studentId: 's1',
        pointsDeducted: 8,
      });
      mockPrisma.student.update.mockResolvedValue({});
      mockPrisma.disciplineIncident.delete.mockResolvedValue({});

      await service.deleteIncident('inc-1');

      expect(mockPrisma.student.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { disciplinePoints: { increment: 8 } },
      });
    });
  });
});
