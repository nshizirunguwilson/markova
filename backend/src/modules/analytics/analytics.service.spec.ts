import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  const mockPrisma: any = {
    student: { count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
    teacher: { count: jest.fn() },
    parentStudent: { groupBy: jest.fn() },
    classLevel: { count: jest.fn() },
    user: { count: jest.fn() },
    subject: { count: jest.fn() },
    teacherSubjectClass: { findMany: jest.fn() },
    mark: { findMany: jest.fn() },
    termResult: { findMany: jest.fn(), findFirst: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<AnalyticsService>(AnalyticsService);
  });

  describe('getAdminDashboard()', () => {
    it('aggregates the headline counts', async () => {
      mockPrisma.student.count.mockResolvedValue(330);
      mockPrisma.teacher.count.mockResolvedValue(30);
      mockPrisma.parentStudent.groupBy.mockResolvedValue([{}, {}]);
      mockPrisma.classLevel.count.mockResolvedValue(6);
      mockPrisma.user.count.mockResolvedValue(562);
      mockPrisma.subject.count.mockResolvedValue(15);

      const result = await service.getAdminDashboard();
      expect(result).toMatchObject({
        totalStudents: 330,
        totalTeachers: 30,
        totalParents: 2,
        totalUsers: 562,
        totalSubjects: 15,
      });
    });
  });

  describe('getTeacherClassAnalytics() — M-9 scoping', () => {
    it('rejects a teacher who is not assigned to the requested section', async () => {
      mockPrisma.teacherSubjectClass.findMany.mockResolvedValue([]); // no assignment

      await expect(
        service.getTeacherClassAnalytics('teacher-x', 'cls-not-mine', 'term-1'),
      ).rejects.toThrow(ForbiddenException);

      // Must not have leaked other students' term results
      expect(mockPrisma.termResult.findMany).not.toHaveBeenCalled();
    });

    it('returns analytics for a section the teacher is assigned to', async () => {
      mockPrisma.teacherSubjectClass.findMany.mockResolvedValue([
        { subjectId: 'sub-1', subject: { name: 'Math' } },
      ]);
      mockPrisma.student.findMany.mockResolvedValue([
        { id: 's1', user: { firstName: 'A', lastName: 'B' } },
      ]);
      mockPrisma.mark.findMany.mockResolvedValue([
        { score: 80 },
        { score: 60 },
      ]);
      mockPrisma.termResult.findMany.mockResolvedValue([]);

      const result = await service.getTeacherClassAnalytics(
        'teacher-1',
        'cls-1',
        'term-1',
      );
      expect(result.subjectAnalytics[0]).toMatchObject({
        subjectName: 'Math',
        averageScore: 70,
      });
    });
  });
});
