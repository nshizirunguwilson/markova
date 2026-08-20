import { Test, TestingModule } from '@nestjs/testing';
import { MarksService } from './marks.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('MarksService', () => {
  let service: MarksService;

  const mockTx = {
    student: { findMany: jest.fn() },
    mark: { findMany: jest.fn() },
    termResult: { upsert: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    term: { findMany: jest.fn() },
    yearResult: { upsert: jest.fn(), update: jest.fn() },
  };

  const mockPrisma = {
    term: { findUnique: jest.fn(), findMany: jest.fn() },
    subject: { findUnique: jest.fn() },
    teacherSubjectClass: { findFirst: jest.fn() },
    mark: {
      create: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    student: { findMany: jest.fn() },
    schoolConfig: { findUnique: jest.fn(), findMany: jest.fn() },
    termResult: { upsert: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((cb: (tx: any) => Promise<any>) => cb(mockTx)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarksService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MarksService>(MarksService);
    jest.clearAllMocks();
    // Reset $transaction to default behavior
    mockPrisma.$transaction.mockImplementation(
      (cb: (tx: any) => Promise<any>) => cb(mockTx),
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // create()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('create()', () => {
    const baseDto = {
      studentId: 'student-1',
      subjectId: 'subject-1',
      classSectionId: 'class-1',
      termId: 'term-1',
      assessmentTypeId: 'assess-1',
      score: 75,
      maxScore: undefined as number | undefined,
    };

    it('should upsert a mark with correct data (create branch)', async () => {
      mockPrisma.term.findUnique.mockResolvedValue({
        id: 'term-1',
        isClosed: false,
      });
      mockPrisma.subject.findUnique.mockResolvedValue({
        id: 'subject-1',
        maxMarks: 100,
      });
      mockPrisma.mark.upsert.mockResolvedValue({
        id: 'mark-1',
        ...baseDto,
        maxScore: 100,
        teacherId: 'teacher-1',
      });

      const result = await service.create(baseDto, 'teacher-1', 'TEACHER');

      // create() upserts on the unique (student, subject, term, assessment) key
      // so re-entering a score updates it instead of throwing a duplicate.
      expect(mockPrisma.mark.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            studentId_subjectId_termId_assessmentTypeId: {
              studentId: 'student-1',
              subjectId: 'subject-1',
              termId: 'term-1',
              assessmentTypeId: 'assess-1',
            },
          },
          update: expect.objectContaining({
            score: 75,
            maxScore: 100,
            teacherId: 'teacher-1',
          }),
          create: expect.objectContaining({
            studentId: 'student-1',
            subjectId: 'subject-1',
            classSectionId: 'class-1',
            termId: 'term-1',
            assessmentTypeId: 'assess-1',
            score: 75,
            maxScore: 100,
            teacherId: 'teacher-1',
          }),
        }),
      );
      expect(result.id).toBe('mark-1');
    });

    it('should reject score exceeding maxScore', async () => {
      mockPrisma.term.findUnique.mockResolvedValue({
        id: 'term-1',
        isClosed: false,
      });
      mockPrisma.subject.findUnique.mockResolvedValue({
        id: 'subject-1',
        maxMarks: 100,
      });

      const dto = { ...baseDto, score: 150 };

      await expect(
        service.create(dto as any, 'teacher-1', 'TEACHER'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when term is closed', async () => {
      mockPrisma.term.findUnique.mockResolvedValue({
        id: 'term-1',
        isClosed: true,
      });

      await expect(
        service.create(baseDto as any, 'teacher-1', 'TEACHER'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // batchEntry()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('batchEntry()', () => {
    const batchDto = {
      subjectId: 'subject-1',
      classSectionId: 'class-1',
      termId: 'term-1',
      assessmentTypeId: 'assess-1',
      marks: [
        { studentId: 'student-1', score: 80 },
        { studentId: 'student-2', score: 90 },
      ],
    };

    it('should create multiple marks', async () => {
      mockPrisma.term.findUnique.mockResolvedValue({
        id: 'term-1',
        isClosed: false,
      });
      mockPrisma.subject.findUnique.mockResolvedValue({
        id: 'subject-1',
        maxMarks: 100,
      });
      mockPrisma.mark.upsert
        .mockResolvedValueOnce({ id: 'mark-1', score: 80 })
        .mockResolvedValueOnce({ id: 'mark-2', score: 90 });

      const result = await service.batchEntry(batchDto, 'teacher-1', 'TEACHER');

      expect(result.count).toBe(2);
      expect(result.marks).toHaveLength(2);
      expect(mockPrisma.mark.upsert).toHaveBeenCalledTimes(2);
    });

    it('should validate all scores before creating any', async () => {
      mockPrisma.term.findUnique.mockResolvedValue({
        id: 'term-1',
        isClosed: false,
      });
      mockPrisma.subject.findUnique.mockResolvedValue({
        id: 'subject-1',
        maxMarks: 100,
      });

      const invalidDto = {
        ...batchDto,
        marks: [
          { studentId: 'student-1', score: 80 },
          { studentId: 'student-2', score: 150 }, // exceeds max
        ],
      };

      await expect(
        service.batchEntry(invalidDto as any, 'teacher-1', 'TEACHER'),
      ).rejects.toThrow(BadRequestException);

      // No marks should have been created since validation happens first
      expect(mockPrisma.mark.upsert).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // calculateTermResults()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('calculateTermResults()', () => {
    const dto = { classSectionId: 'class-1', termId: 'term-1' };

    beforeEach(() => {
      // Default grading scale config: A:80,B:70,C:60,D:50,F:0
      mockPrisma.schoolConfig.findUnique.mockResolvedValue({
        key: 'grading_scale',
        value: 'A:80,B:70,C:60,D:50,F:0',
      });
    });

    it('should compute correct subject averages', async () => {
      mockTx.student.findMany.mockResolvedValue([
        { id: 'student-1', status: 'ACTIVE' },
      ]);

      // Student has 2 marks in the same subject (two assessment types)
      // score/maxScore * maxMarks: 80/100*100 = 80, 60/100*100 = 60
      // Subject average = (80+60)/2 = 70
      // Overall average = 70
      mockTx.mark.findMany.mockResolvedValue([
        {
          subjectId: 'subject-1',
          score: 80,
          maxScore: 100,
          subject: { maxMarks: 100 },
        },
        {
          subjectId: 'subject-1',
          score: 60,
          maxScore: 100,
          subject: { maxMarks: 100 },
        },
      ]);

      const upsertedResult = {
        id: 'result-1',
        studentId: 'student-1',
        average: 70,
        letterGrade: 'B',
        totalMarks: 70,
      };
      mockTx.termResult.upsert.mockResolvedValue(upsertedResult);
      mockTx.termResult.update.mockResolvedValue({
        ...upsertedResult,
        rank: 1,
      });

      const result = await service.calculateTermResults(dto);

      expect(mockTx.termResult.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            average: 70,
            totalMarks: 70,
          }),
        }),
      );
      expect(result.count).toBe(1);
    });

    it('should assign correct letter grades from grading scale', async () => {
      mockTx.student.findMany.mockResolvedValue([
        { id: 'student-1', status: 'ACTIVE' },
      ]);

      // Student average will be 85 => grade A (>= 80)
      mockTx.mark.findMany.mockResolvedValue([
        {
          subjectId: 'subject-1',
          score: 85,
          maxScore: 100,
          subject: { maxMarks: 100 },
        },
      ]);

      mockTx.termResult.upsert.mockResolvedValue({
        id: 'result-1',
        studentId: 'student-1',
        average: 85,
        letterGrade: 'A',
      });
      mockTx.termResult.update.mockResolvedValue({});

      await service.calculateTermResults(dto);

      expect(mockTx.termResult.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            letterGrade: 'A',
          }),
        }),
      );
    });

    it('should rank students by average descending', async () => {
      mockTx.student.findMany.mockResolvedValue([
        { id: 'student-1', status: 'ACTIVE' },
        { id: 'student-2', status: 'ACTIVE' },
      ]);

      // student-1: average 60, student-2: average 90
      mockTx.mark.findMany
        .mockResolvedValueOnce([
          {
            subjectId: 'sub-1',
            score: 60,
            maxScore: 100,
            subject: { maxMarks: 100 },
          },
        ])
        .mockResolvedValueOnce([
          {
            subjectId: 'sub-1',
            score: 90,
            maxScore: 100,
            subject: { maxMarks: 100 },
          },
        ]);

      mockTx.termResult.upsert
        .mockResolvedValueOnce({
          id: 'r1',
          studentId: 'student-1',
          average: 60,
        })
        .mockResolvedValueOnce({
          id: 'r2',
          studentId: 'student-2',
          average: 90,
        });
      mockTx.termResult.update.mockResolvedValue({});

      await service.calculateTermResults(dto);

      // After sorting by average desc, student-2 (90) gets rank 1, student-1 (60) gets rank 2
      const updateCalls = mockTx.termResult.update.mock.calls;
      expect(updateCalls[0][0]).toEqual(
        expect.objectContaining({
          where: { id: 'r2' },
          data: { rank: 1 },
        }),
      );
      expect(updateCalls[1][0]).toEqual(
        expect.objectContaining({
          where: { id: 'r1' },
          data: { rank: 2 },
        }),
      );
    });

    it('should return correct grade for boundary values (getLetterGrade)', async () => {
      mockTx.student.findMany.mockResolvedValue([
        { id: 'student-1', status: 'ACTIVE' },
      ]);

      // Exactly 80 => should be 'A' (>= 80)
      mockTx.mark.findMany.mockResolvedValue([
        {
          subjectId: 'sub-1',
          score: 80,
          maxScore: 100,
          subject: { maxMarks: 100 },
        },
      ]);

      mockTx.termResult.upsert.mockResolvedValue({
        id: 'r1',
        studentId: 'student-1',
        average: 80,
        letterGrade: 'A',
      });
      mockTx.termResult.update.mockResolvedValue({});

      await service.calculateTermResults(dto);

      expect(mockTx.termResult.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            letterGrade: 'A',
            average: 80,
          }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // calculateYearResults()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('calculateYearResults()', () => {
    const dto = { classSectionId: 'class-1', academicYearId: 'year-1' };

    beforeEach(() => {
      // Mock terms
      mockPrisma.term.findUnique.mockImplementation(({ where }: any) => {
        if (where?.key === 'pass_threshold') return { value: '50' };
        if (where?.key === 'grading_scale')
          return { value: 'A:80,B:70,C:60,D:50,F:0' };
        if (where?.key === 'starting_discipline_points')
          return { value: '100' };
        return null;
      });
      mockPrisma.schoolConfig.findUnique.mockImplementation(
        ({ where }: any) => {
          if (where?.key === 'grading_scale')
            return Promise.resolve({ value: 'A:80,B:70,C:60,D:50,F:0' });
          if (where?.key === 'pass_threshold')
            return Promise.resolve({ value: '50' });
          if (where?.key === 'starting_discipline_points')
            return Promise.resolve({ value: '100' });
          return Promise.resolve(null);
        },
      );

      mockPrisma.mark.findMany.mockResolvedValue([]);
    });

    it('should average across available terms', async () => {
      mockPrisma.term.findMany.mockResolvedValue([
        { id: 'term-1' },
        { id: 'term-2' },
        { id: 'term-3' },
      ]);

      mockTx.student.findMany.mockResolvedValue([
        { id: 'student-1', status: 'ACTIVE', disciplinePoints: 90 },
      ]);

      // Student has results for term1 (70) and term2 (80), no term3
      mockTx.termResult.findMany.mockResolvedValue([
        { average: 70 },
        { average: 80 },
      ]);

      mockTx.yearResult.upsert.mockResolvedValue({
        id: 'yr-1',
        studentId: 'student-1',
        yearlyAverage: 75,
        isPromoted: true,
      });
      mockTx.yearResult.update.mockResolvedValue({});

      const result = await service.calculateYearResults(dto);

      expect(mockTx.yearResult.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            yearlyAverage: 75, // (70+80)/2
            isPromoted: true, // 75 >= 50
          }),
        }),
      );
      expect(result.count).toBe(1);
    });

    it('should determine promotion based on pass threshold (>= threshold = promoted)', async () => {
      mockPrisma.term.findMany.mockResolvedValue([{ id: 'term-1' }]);

      mockTx.student.findMany.mockResolvedValue([
        { id: 'student-1', status: 'ACTIVE', disciplinePoints: 80 },
        { id: 'student-2', status: 'ACTIVE', disciplinePoints: 80 },
      ]);

      // student-1: average 50 (exactly at threshold), student-2: average 40 (below)
      mockTx.termResult.findMany
        .mockResolvedValueOnce([{ average: 50 }])
        .mockResolvedValueOnce([{ average: 40 }]);

      mockTx.yearResult.upsert
        .mockResolvedValueOnce({
          id: 'yr-1',
          studentId: 'student-1',
          yearlyAverage: 50,
          isPromoted: true,
        })
        .mockResolvedValueOnce({
          id: 'yr-2',
          studentId: 'student-2',
          yearlyAverage: 40,
          isPromoted: false,
        });
      mockTx.yearResult.update.mockResolvedValue({});

      await service.calculateYearResults(dto);

      const upsertCalls = mockTx.yearResult.upsert.mock.calls;

      // student-1: exactly at threshold => promoted
      expect(upsertCalls[0][0].update.isPromoted).toBe(true);
      expect(upsertCalls[0][0].update.yearlyAverage).toBe(50);

      // student-2: below threshold => not promoted
      expect(upsertCalls[1][0].update.isPromoted).toBe(false);
      expect(upsertCalls[1][0].update.yearlyAverage).toBe(40);
    });
  });
});
