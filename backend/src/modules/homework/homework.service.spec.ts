import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { HomeworkService } from './homework.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('HomeworkService', () => {
  let service: HomeworkService;

  const mockPrisma: any = {
    homework: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    homeworkSubmission: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    student: { findUnique: jest.fn(), count: jest.fn() },
    notification: { create: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<HomeworkService>(HomeworkService);
  });

  describe('create()', () => {
    it('creates homework for the resolving teacher', async () => {
      mockPrisma.homework.create.mockResolvedValue({ id: 'hw-1' });
      const result = await service.create(
        {
          subjectId: 'sub-1',
          classSectionId: 'cls-1',
          termId: 't-1',
          title: 'Essay',
          dueDate: '2026-04-01',
        },
        'teacher-1',
        'TEACHER',
      );
      expect(result).toMatchObject({ id: 'hw-1' });
      expect(mockPrisma.homework.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ teacherId: 'teacher-1' }),
        }),
      );
    });

    it('rejects creation with no teacher id', async () => {
      await expect(
        service.create({ title: 'x' } as any, '', undefined),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update()/delete() ownership', () => {
    it('a teacher cannot edit another teacher’s homework', async () => {
      mockPrisma.homework.findUnique.mockResolvedValue({
        id: 'hw-1',
        teacherId: 'other-teacher',
      });
      await expect(
        service.update('hw-1', { title: 'x' } as any, 'teacher-1', 'TEACHER'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('an admin can edit any homework', async () => {
      mockPrisma.homework.findUnique.mockResolvedValue({
        id: 'hw-1',
        teacherId: 'other-teacher',
      });
      mockPrisma.homework.update.mockResolvedValue({ id: 'hw-1' });
      await expect(
        service.update('hw-1', { title: 'x' } as any, '', 'ADMIN'),
      ).resolves.toBeDefined();
    });

    it('throws NotFoundException editing missing homework', async () => {
      mockPrisma.homework.findUnique.mockResolvedValue(null);
      await expect(
        service.update('missing', {} as any, 't', 'ADMIN'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('grade()', () => {
    it('applies a per-day late deduction', async () => {
      mockPrisma.homeworkSubmission.findUnique.mockResolvedValue({
        id: 'sub-1',
        studentId: 's1',
        isLate: true,
        submittedAt: new Date('2026-04-05T00:00:00Z'),
        homework: {
          dueDate: new Date('2026-04-03T00:00:00Z'),
          lateDeductionPerDay: 2,
          maxMarks: 20,
          title: 'Essay',
        },
      });
      mockPrisma.homeworkSubmission.update.mockResolvedValue({ id: 'sub-1' });
      mockPrisma.student.findUnique.mockResolvedValue({ user: { id: 'u1' } });

      await service.grade('sub-1', { marks: 18 }, 'teacher-1');

      // 2 days late * 2/day = 4 deducted -> 14
      const saved = mockPrisma.homeworkSubmission.update.mock.calls[0][0].data;
      expect(saved.marks).toBe(14);
    });

    it('rejects marks above the homework maximum', async () => {
      mockPrisma.homeworkSubmission.findUnique.mockResolvedValue({
        id: 'sub-1',
        studentId: 's1',
        isLate: false,
        submittedAt: new Date(),
        homework: { dueDate: new Date(), maxMarks: 20, lateDeductionPerDay: 0 },
      });
      await expect(
        service.grade('sub-1', { marks: 25 } as any, 'teacher-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for a missing submission', async () => {
      mockPrisma.homeworkSubmission.findUnique.mockResolvedValue(null);
      await expect(
        service.grade('missing', { marks: 1 } as any, 't'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('submit()', () => {
    it('flags a submission after the due date as late', async () => {
      mockPrisma.homework.findUnique.mockResolvedValue({
        id: 'hw-1',
        classSectionId: 'cls-1',
        dueDate: new Date('2020-01-01T00:00:00Z'),
      });
      mockPrisma.student.findUnique.mockResolvedValue({
        classSectionId: 'cls-1',
      });
      mockPrisma.homeworkSubmission.upsert.mockResolvedValue({ id: 'sub-1' });

      await service.submit({ homeworkId: 'hw-1', fileUrl: 'f' }, 's1');

      const arg = mockPrisma.homeworkSubmission.upsert.mock.calls[0][0];
      expect(arg.create.isLate).toBe(true);
    });

    it('M-6: rejects submitting to homework for another class section', async () => {
      mockPrisma.homework.findUnique.mockResolvedValue({
        id: 'hw-1',
        classSectionId: 'cls-OTHER',
        dueDate: new Date(),
      });
      mockPrisma.student.findUnique.mockResolvedValue({
        classSectionId: 'cls-mine',
      });
      await expect(
        service.submit({ homeworkId: 'hw-1' } as any, 's1'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.homeworkSubmission.upsert).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a missing homework', async () => {
      mockPrisma.homework.findUnique.mockResolvedValue(null);
      await expect(
        service.submit({ homeworkId: 'missing' } as any, 's1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
