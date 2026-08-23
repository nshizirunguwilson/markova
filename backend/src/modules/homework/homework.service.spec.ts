import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { HomeworkService } from './homework.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

/**
 * Assessments: homework, assignments and quizzes.
 *
 * Two things carry real consequence. A student may only hand in work set for
 * their own class, or anybody with an id could submit into another class's
 * marking. And the late deduction is arithmetic on a mark that goes onto a
 * record, so it has to floor at zero rather than going negative.
 */
describe('HomeworkService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: HomeworkService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new HomeworkService(prisma);
    prisma.homework.create.mockResolvedValue({ id: 'hw-1' });
    prisma.homework.update.mockResolvedValue({});
    prisma.homework.delete.mockResolvedValue({});
    prisma.homeworkSubmission.upsert.mockResolvedValue({ id: 'sub-1' });
    prisma.homeworkSubmission.update.mockResolvedValue({ id: 'sub-1' });
    prisma.notification.create.mockResolvedValue({});
    prisma.student.count.mockResolvedValue(32);
  });

  const homework = {
    subjectId: 'subject-1',
    classSectionId: 'section-1',
    termId: 'term-1',
    title: 'Chapter 4 essay',
    dueDate: '2026-08-30',
    maxMarks: 20,
  };

  describe('setting work', () => {
    it('records who set it and when it is due', async () => {
      await service.create(homework as never, 'teacher-1');
      const data = prisma.homework.create.mock.calls[0][0].data;
      expect(data.teacherId).toBe('teacher-1');
      expect(data.dueDate).toBeInstanceOf(Date);
    });

    it('refuses when nobody can be named as having set it', async () => {
      await expect(
        service.create(homework as never, ''),
      ).rejects.toThrow(ForbiddenException);
    });

    // Not every piece of work carries a late penalty, and the absence of one
    // has to mean zero rather than undefined arithmetic later.
    it('carries no late penalty unless one was set', async () => {
      await service.create(homework as never, 'teacher-1');
      expect(
        prisma.homework.create.mock.calls[0][0].data.lateDeductionPerDay,
      ).toBe(0);
    });
  });

  /**
   * A teacher owns what they set. An admin can step in when a teacher has
   * left mid-term, which does happen.
   */
  describe('whose work it is', () => {
    beforeEach(() =>
      prisma.homework.findUnique.mockResolvedValue({
        id: 'hw-1',
        teacherId: 'teacher-1',
      }),
    );

    it('lets the teacher who set it change it', async () => {
      await expect(
        service.update('hw-1', { title: 'X' } as never, 'teacher-1'),
      ).resolves.toBeDefined();
    });

    it('refuses another teacher', async () => {
      await expect(
        service.update('hw-1', { title: 'X' } as never, 'teacher-9'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets an admin change anybody’s', async () => {
      await expect(
        service.update('hw-1', { title: 'X' } as never, '', 'ADMIN'),
      ).resolves.toBeDefined();
    });

    it('refuses another teacher withdrawing it', async () => {
      await expect(service.delete('hw-1', 'teacher-9')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.homework.delete).not.toHaveBeenCalled();
    });

    it('refuses work that does not exist', async () => {
      prisma.homework.findUnique.mockResolvedValue(null);
      await expect(service.update('nope', {} as never, 'teacher-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('accepts clearing the description rather than ignoring it', async () => {
      await service.update('hw-1', { description: '' } as never, 'teacher-1');
      expect(prisma.homework.update.mock.calls[0][0].data).toEqual({
        description: '',
      });
    });
  });

  /**
   * The list. Unpaged for the teacher and student views, which read it as a
   * plain list, and paged for the admin screen where a whole school runs to
   * hundreds of rows.
   */
  describe('listing what has been set', () => {
    beforeEach(() => {
      prisma.homework.findMany.mockResolvedValue([]);
      prisma.homework.count.mockResolvedValue(0);
    });

    it('answers with a plain list when nobody asked for a page', async () => {
      const result = await service.findAll({} as never);
      expect(Array.isArray(result)).toBe(true);
      expect(prisma.homework.count).not.toHaveBeenCalled();
    });

    it('answers with a page when one was asked for', async () => {
      prisma.homework.count.mockResolvedValue(45);
      const result: any = await service.findAll({ page: 2, limit: 20 } as never);
      expect(result.meta).toEqual({
        total: 45,
        page: 2,
        limit: 20,
        totalPages: 3,
      });
      expect(prisma.homework.findMany.mock.calls[0][0].skip).toBe(20);
    });

    it('refuses a page size big enough to pull the whole school', async () => {
      await service.findAll({ limit: 5000 } as never);
      expect(prisma.homework.findMany.mock.calls[0][0].take).toBe(100);
    });

    it('treats nonsense paging as the first page', async () => {
      await service.findAll({ page: -3, limit: 0 } as never);
      expect(prisma.homework.findMany.mock.calls[0][0].skip).toBe(0);
      expect(prisma.homework.findMany.mock.calls[0][0].take).toBe(20);
    });

    it('always reports at least one page, even when empty', async () => {
      const result: any = await service.findAll({ page: 1 } as never);
      expect(result.meta.totalPages).toBe(1);
    });

    it('narrows by class, term, subject, teacher and kind', async () => {
      await service.findAll({
        classSectionId: 'section-1',
        termId: 'term-1',
        subjectId: 'subject-1',
        teacherId: 'teacher-1',
        kind: 'QUIZ',
      } as never);
      expect(prisma.homework.findMany.mock.calls[0][0].where).toEqual({
        classSectionId: 'section-1',
        termId: 'term-1',
        subjectId: 'subject-1',
        teacherId: 'teacher-1',
        kind: 'QUIZ',
      });
    });

    it('reads the soonest deadline first', async () => {
      await service.findAll({} as never);
      expect(prisma.homework.findMany.mock.calls[0][0].orderBy).toEqual({
        dueDate: 'desc',
      });
    });

    it('refuses one piece of work that does not exist', async () => {
      prisma.homework.findUnique.mockResolvedValue(null);
      await expect(service.findById('nope')).rejects.toThrow(NotFoundException);
    });

    it('says how many students the work was set for', async () => {
      prisma.homework.findUnique.mockResolvedValue({
        id: 'hw-1',
        classSectionId: 'section-1',
      });
      const result: any = await service.findById('hw-1');
      expect(result.totalStudents).toBe(32);
    });
  });

  /**
   * Handing work in. Without the class check, anybody holding an id could
   * submit into another class's marking.
   */
  describe('handing work in', () => {
    beforeEach(() => {
      prisma.homework.findUnique.mockResolvedValue({
        id: 'hw-1',
        classSectionId: 'section-1',
        dueDate: new Date('2026-08-30'),
      });
      prisma.student.findUnique.mockResolvedValue({
        classSectionId: 'section-1',
      });
    });

    it('refuses work that does not exist', async () => {
      prisma.homework.findUnique.mockResolvedValue(null);
      await expect(
        service.submit({ homeworkId: 'nope' } as never, 'student-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses a student from another class', async () => {
      prisma.student.findUnique.mockResolvedValue({
        classSectionId: 'other-section',
      });
      await expect(
        service.submit({ homeworkId: 'hw-1' } as never, 'student-1'),
      ).rejects.toThrow(/only submit homework assigned to your class/i);
      expect(prisma.homeworkSubmission.upsert).not.toHaveBeenCalled();
    });

    it('refuses a student who does not exist', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await expect(
        service.submit({ homeworkId: 'hw-1' } as never, 'nobody'),
      ).rejects.toThrow(ForbiddenException);
    });

    // Handing in again is how a student replaces a wrong file, and it must
    // not collide with the unique key.
    it('replaces an earlier submission rather than failing', async () => {
      await service.submit({ homeworkId: 'hw-1' } as never, 'student-1');
      const call = prisma.homeworkSubmission.upsert.mock.calls[0][0];
      expect(call.where.homeworkId_studentId).toEqual({
        homeworkId: 'hw-1',
        studentId: 'student-1',
      });
    });

    it('marks work handed in after the deadline as late', async () => {
      prisma.homework.findUnique.mockResolvedValue({
        id: 'hw-1',
        classSectionId: 'section-1',
        dueDate: new Date('2020-01-01'),
      });
      await service.submit({ homeworkId: 'hw-1' } as never, 'student-1');
      expect(prisma.homeworkSubmission.upsert.mock.calls[0][0].create.isLate).toBe(
        true,
      );
    });

    it('does not mark work handed in before the deadline as late', async () => {
      prisma.homework.findUnique.mockResolvedValue({
        id: 'hw-1',
        classSectionId: 'section-1',
        dueDate: new Date('2099-01-01'),
      });
      await service.submit({ homeworkId: 'hw-1' } as never, 'student-1');
      expect(prisma.homeworkSubmission.upsert.mock.calls[0][0].create.isLate).toBe(
        false,
      );
    });
  });

  /**
   * Marking, and the late penalty. This is arithmetic on a number that goes
   * onto a record, so the edges matter.
   */
  describe('marking work', () => {
    const submission = (over: Record<string, unknown> = {}) => ({
      id: 'sub-1',
      studentId: 'student-1',
      isLate: false,
      submittedAt: new Date('2026-08-30'),
      homework: {
        title: 'Chapter 4 essay',
        dueDate: new Date('2026-08-30'),
        maxMarks: 20,
        lateDeductionPerDay: 2,
      },
      ...over,
    });

    beforeEach(() => {
      prisma.homeworkSubmission.findUnique.mockResolvedValue(submission());
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        user: { id: 'user-1' },
      });
    });

    it('refuses a submission that does not exist', async () => {
      prisma.homeworkSubmission.findUnique.mockResolvedValue(null);
      await expect(
        service.grade('nope', { marks: 17 } as never, 'teacher-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('records the mark and who gave it', async () => {
      await service.grade('sub-1', { marks: 17 } as never, 'teacher-1');
      expect(prisma.homeworkSubmission.update.mock.calls[0][0].data).toMatchObject(
        { marks: 17, gradedByUserId: 'teacher-1' },
      );
    });

    it('takes the penalty off for each day late', async () => {
      prisma.homeworkSubmission.findUnique.mockResolvedValue(
        submission({
          isLate: true,
          submittedAt: new Date('2026-09-02'),
        }),
      );
      // Three days at two points a day.
      await service.grade('sub-1', { marks: 18 } as never, 'teacher-1');
      expect(prisma.homeworkSubmission.update.mock.calls[0][0].data.marks).toBe(
        12,
      );
    });

    /**
     * A student who handed in very late and did poorly would otherwise end up
     * with a negative mark, which is not a thing a report card can carry.
     */
    it('never takes a mark below zero', async () => {
      prisma.homeworkSubmission.findUnique.mockResolvedValue(
        submission({
          isLate: true,
          submittedAt: new Date('2026-10-30'),
        }),
      );
      await service.grade('sub-1', { marks: 5 } as never, 'teacher-1');
      expect(prisma.homeworkSubmission.update.mock.calls[0][0].data.marks).toBe(
        0,
      );
    });

    it('takes nothing off when the work carried no late penalty', async () => {
      prisma.homeworkSubmission.findUnique.mockResolvedValue(
        submission({
          isLate: true,
          submittedAt: new Date('2026-09-05'),
          homework: {
            title: 'X',
            dueDate: new Date('2026-08-30'),
            maxMarks: 20,
            lateDeductionPerDay: 0,
          },
        }),
      );
      await service.grade('sub-1', { marks: 18 } as never, 'teacher-1');
      expect(prisma.homeworkSubmission.update.mock.calls[0][0].data.marks).toBe(
        18,
      );
    });

    it('refuses a mark above what the work was out of', async () => {
      await expect(
        service.grade('sub-1', { marks: 25 } as never, 'teacher-1'),
      ).rejects.toThrow(/exceed maximum of 20/i);
      expect(prisma.homeworkSubmission.update).not.toHaveBeenCalled();
    });

    it('accepts any mark on work with no maximum set', async () => {
      prisma.homeworkSubmission.findUnique.mockResolvedValue(
        submission({
          homework: {
            title: 'X',
            dueDate: new Date('2026-08-30'),
            maxMarks: null,
            lateDeductionPerDay: 0,
          },
        }),
      );
      await expect(
        service.grade('sub-1', { marks: 99 } as never, 'teacher-1'),
      ).resolves.toBeDefined();
    });

    it('tells the student their work has been marked', async () => {
      await service.grade('sub-1', { marks: 17 } as never, 'teacher-1');
      const message = prisma.notification.create.mock.calls[0][0].data.message;
      expect(message).toContain('Chapter 4 essay');
      expect(message).toContain('17/20');
    });

    // The mark is the record. A message that would not send is not a reason
    // to lose it.
    it('records the mark even when the student cannot be told', async () => {
      prisma.notification.create.mockRejectedValue(new Error('offline'));
      await expect(
        service.grade('sub-1', { marks: 17 } as never, 'teacher-1'),
      ).resolves.toBeDefined();
    });

    it('records the mark even when the student has since left', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await expect(
        service.grade('sub-1', { marks: 17 } as never, 'teacher-1'),
      ).resolves.toBeDefined();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });

  /**
   * A student's own list. "Have I handed this in" is one question, so their
   * own submission is flattened onto each row.
   */
  describe('what one student has been set', () => {
    it('flattens their own submission onto each piece of work', async () => {
      prisma.homework.findMany.mockResolvedValue([
        { id: 'hw-1', submissions: [{ id: 'sub-1', marks: 17 }] },
        { id: 'hw-2', submissions: [] },
      ]);
      const result = await service.getStudentHomework('student-1', 'section-1');
      expect(result[0].submission).toEqual({ id: 'sub-1', marks: 17 });
      expect(result[1].submission).toBeNull();
    });

    it('reads only their own submission, not the whole class’s', async () => {
      prisma.homework.findMany.mockResolvedValue([]);
      await service.getStudentHomework('student-1', 'section-1');
      expect(
        prisma.homework.findMany.mock.calls[0][0].include.submissions.where,
      ).toEqual({ studentId: 'student-1' });
    });

    it('reads the work set for their class', async () => {
      prisma.homework.findMany.mockResolvedValue([]);
      await service.getStudentHomework('student-1', 'section-1');
      expect(prisma.homework.findMany.mock.calls[0][0].where).toEqual({
        classSectionId: 'section-1',
      });
    });
  });
});
