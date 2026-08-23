import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MarksService } from './marks.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

/**
 * Marks, and the results built from them.
 *
 * A mark is the most consequential number a school publishes about a child.
 * Three rules run through everything here: a closed term cannot be edited, a
 * teacher edits their own marks and nobody else's, and a score can never
 * exceed what the paper was out of.
 */
describe('MarksService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: MarksService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new MarksService(prisma);
    prisma.term.findUnique.mockResolvedValue({ id: 'term-1', isClosed: false });
    prisma.subject.findUnique.mockResolvedValue({
      id: 'subject-1',
      maxMarks: 20,
      scope: 'O_CORE',
    });
    prisma.mark.upsert.mockResolvedValue({ id: 'mark-1' });
    prisma.mark.update.mockResolvedValue({ id: 'mark-1' });
    prisma.mark.delete.mockResolvedValue({ id: 'mark-1' });
    prisma.schoolConfig.findUnique.mockResolvedValue(null);
  });

  const mark = {
    studentId: 'student-1',
    subjectId: 'subject-1',
    classSectionId: 'section-1',
    termId: 'term-1',
    assessmentTypeId: 'assess-1',
    score: 17,
  };

  /**
   * Closing a term is what stops a mark changing after the report card went
   * home. Without it, the printed sheet and the system could disagree and
   * nothing would say which was right.
   */
  describe('a closed term', () => {
    beforeEach(() =>
      prisma.term.findUnique.mockResolvedValue({ id: 'term-1', isClosed: true }),
    );

    it('refuses a new mark', async () => {
      await expect(
        service.create(mark as never, 'teacher-1'),
      ).rejects.toThrow(/term is closed/i);
    });

    it('refuses a correction', async () => {
      prisma.mark.findUnique.mockResolvedValue({
        id: 'mark-1',
        termId: 'term-1',
        teacherId: 'teacher-1',
        maxScore: 20,
      });
      await expect(
        service.update('mark-1', { score: 18 } as never, 'teacher-1'),
      ).rejects.toThrow(/term is closed/i);
    });

    it('refuses a deletion', async () => {
      prisma.mark.findUnique.mockResolvedValue({
        id: 'mark-1',
        termId: 'term-1',
        teacherId: 'teacher-1',
      });
      await expect(service.delete('mark-1', 'teacher-1')).rejects.toThrow(
        /term is closed/i,
      );
      expect(prisma.mark.delete).not.toHaveBeenCalled();
    });

    it('refuses a whole class at once', async () => {
      await expect(
        service.batchEntry(
          { ...mark, marks: [{ studentId: 's-1', score: 10 }] } as never,
          'teacher-1',
        ),
      ).rejects.toThrow(/term is closed/i);
    });

    it('refuses a term that does not exist at all', async () => {
      prisma.term.findUnique.mockResolvedValue(null);
      await expect(
        service.create(mark as never, 'teacher-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  /**
   * A score above the maximum is a typo, and a typo in a mark travels onto a
   * report card and into a promotion decision.
   */
  describe('a score that cannot be right', () => {
    it('refuses one above the subject maximum', async () => {
      await expect(
        service.create({ ...mark, score: 25 } as never, 'teacher-1'),
      ).rejects.toThrow(/exceeds max 20/);
    });

    it('refuses one above the maximum the paper was set at', async () => {
      await expect(
        service.create({ ...mark, score: 60, maxScore: 50 } as never, 'teacher-1'),
      ).rejects.toThrow(/exceeds max 50/);
    });

    it('accepts a score exactly at the maximum', async () => {
      await expect(
        service.create({ ...mark, score: 20 } as never, 'teacher-1'),
      ).resolves.toBeDefined();
    });

    it('names the student when a batch has a bad score in it', async () => {
      await expect(
        service.batchEntry(
          {
            ...mark,
            marks: [
              { studentId: 's-1', score: 10 },
              { studentId: 's-2', score: 99 },
            ],
          } as never,
          'teacher-1',
        ),
      ).rejects.toThrow(/exceeds max 20 for student s-2/);
    });

    // The check runs over the whole batch first. Writing half a class and
    // then refusing would leave the register half entered.
    it('writes nothing at all when one score in a batch is wrong', async () => {
      await expect(
        service.batchEntry(
          {
            ...mark,
            marks: [
              { studentId: 's-1', score: 10 },
              { studentId: 's-2', score: 99 },
            ],
          } as never,
          'teacher-1',
        ),
      ).rejects.toThrow();
      expect(prisma.mark.upsert).not.toHaveBeenCalled();
    });

    it('refuses a subject that does not exist', async () => {
      prisma.subject.findUnique.mockResolvedValue(null);
      await expect(
        service.create(mark as never, 'teacher-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  /**
   * Re-entering a score is the normal way a teacher corrects a slip, so it
   * has to update rather than collide with the unique key.
   */
  describe('entering a mark', () => {
    it('replaces an existing score rather than failing', async () => {
      await service.create(mark as never, 'teacher-1');
      const call = prisma.mark.upsert.mock.calls[0][0];
      expect(call.where.studentId_subjectId_termId_assessmentTypeId).toEqual({
        studentId: 'student-1',
        subjectId: 'subject-1',
        termId: 'term-1',
        assessmentTypeId: 'assess-1',
      });
      expect(call.update.score).toBe(17);
    });

    it('falls back to the subject maximum when the paper set none', async () => {
      await service.create(mark as never, 'teacher-1');
      expect(prisma.mark.upsert.mock.calls[0][0].update.maxScore).toBe(20);
    });

    it('attributes the mark to the teacher who entered it', async () => {
      await service.create(mark as never, 'teacher-1');
      expect(prisma.mark.upsert.mock.calls[0][0].update.teacherId).toBe(
        'teacher-1',
      );
    });

    /**
     * An admin has no teacher record, so a mark they enter would otherwise
     * have nobody attached. It is attributed to whoever teaches that subject
     * to that class, which is who a parent would ask about it.
     */
    it('attributes an admin’s entry to whoever teaches the class', async () => {
      prisma.teacherSubjectClass.findFirst.mockResolvedValue({
        teacherId: 'teacher-9',
      });
      await service.create(mark as never, null, 'ADMIN');
      expect(prisma.mark.upsert.mock.calls[0][0].update.teacherId).toBe(
        'teacher-9',
      );
    });

    it('refuses when nobody teaches that subject to that class', async () => {
      prisma.teacherSubjectClass.findFirst.mockResolvedValue(null);
      await expect(
        service.create(mark as never, null, 'ADMIN'),
      ).rejects.toThrow(/no teacher found/i);
    });

    it('refuses a teacher with no teacher record behind them', async () => {
      await expect(
        service.create(mark as never, null, 'TEACHER'),
      ).rejects.toThrow(/no teacher found/i);
    });

    it('enters a whole class in one pass', async () => {
      const result = await service.batchEntry(
        {
          ...mark,
          marks: [
            { studentId: 's-1', score: 10 },
            { studentId: 's-2', score: 12 },
          ],
        } as never,
        'teacher-1',
      );
      expect(result.count).toBe(2);
    });
  });

  /**
   * A teacher owns their own marks. Without this, any teacher could rewrite
   * another's marking, and the class teacher's comment would be defending
   * numbers they never entered.
   */
  describe('whose mark it is', () => {
    beforeEach(() =>
      prisma.mark.findUnique.mockResolvedValue({
        id: 'mark-1',
        termId: 'term-1',
        teacherId: 'teacher-1',
        maxScore: 20,
      }),
    );

    it('lets the teacher who entered it correct it', async () => {
      await expect(
        service.update('mark-1', { score: 18 } as never, 'teacher-1'),
      ).resolves.toBeDefined();
    });

    it('refuses another teacher', async () => {
      await expect(
        service.update('mark-1', { score: 18 } as never, 'teacher-9'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses another teacher deleting it', async () => {
      await expect(service.delete('mark-1', 'teacher-9')).rejects.toThrow(
        ForbiddenException,
      );
    });

    // An admin corrects a mark when a teacher has left the school, which is
    // a real thing that happens mid-term.
    it('lets an admin correct anybody’s', async () => {
      await expect(
        service.update('mark-1', { score: 18 } as never, null, 'ADMIN'),
      ).resolves.toBeDefined();
    });

    it('refuses a mark that does not exist', async () => {
      prisma.mark.findUnique.mockResolvedValue(null);
      await expect(
        service.update('nope', { score: 18 } as never, 'teacher-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses to delete a mark that does not exist', async () => {
      prisma.mark.findUnique.mockResolvedValue(null);
      await expect(service.delete('nope', 'teacher-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /**
   * How much of a class is still unmarked. This is the number that tells a
   * head of department who has not finished before a deadline.
   */
  describe('what is left to mark', () => {
    it('counts who has a mark and who has not', async () => {
      prisma.student.findMany.mockResolvedValue([
        { id: 's-1', studentIdNumber: 'A', user: { firstName: 'A', lastName: 'X' } },
        { id: 's-2', studentIdNumber: 'B', user: { firstName: 'B', lastName: 'X' } },
        { id: 's-3', studentIdNumber: 'C', user: { firstName: 'C', lastName: 'X' } },
      ]);
      prisma.mark.findMany.mockResolvedValue([{ studentId: 's-1', score: 15 }]);

      const result = await service.getCompletionTracker(
        'section-1',
        'term-1',
        'subject-1',
        'assess-1',
      );
      expect(result).toMatchObject({
        total: 3,
        graded: 1,
        remaining: 2,
        percentage: 33,
      });
      expect(result.students[0].isGraded).toBe(true);
      expect(result.students[1].isGraded).toBe(false);
    });

    it('reports zero rather than dividing by an empty class', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      prisma.mark.findMany.mockResolvedValue([]);
      const result = await service.getCompletionTracker(
        'section-1',
        'term-1',
        'subject-1',
        'assess-1',
      );
      expect(result.percentage).toBe(0);
    });

    it('counts only students still on the roll', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      prisma.mark.findMany.mockResolvedValue([]);
      await service.getCompletionTracker('section-1', 't', 's', 'a');
      expect(prisma.student.findMany.mock.calls[0][0].where).toMatchObject({
        status: 'ACTIVE',
      });
    });
  });

  /**
   * Working out a term. This is where a page of marks becomes the grade and
   * the position a family will read.
   */
  describe('working out a term', () => {
    const marksFor = (subject: string, scores: [string, number][]) =>
      scores.map(([type, score]) => ({
        subjectId: subject,
        score,
        maxScore: 20,
        subject: { scope: 'O_CORE' },
        assessmentType: { name: type },
      }));

    beforeEach(() => {
      prisma.termResult.upsert.mockImplementation((args: any) =>
        Promise.resolve({ id: `res-${args.create.studentId}`, ...args.create }),
      );
      prisma.termResult.update.mockResolvedValue({});
    });

    it('weighs each subject and averages across them', async () => {
      prisma.student.findMany.mockResolvedValue([{ id: 's-1' }]);
      prisma.mark.findMany.mockResolvedValue(
        marksFor('subject-1', [
          ['CAT 1', 16],
          ['End of Term Exam', 18],
        ]),
      );

      const result = await service.calculateTermResults({
        classSectionId: 'section-1',
        termId: 'term-1',
      } as never);
      expect(result.count).toBe(1);
      expect(prisma.termResult.upsert.mock.calls[0][0].create.average).toBeGreaterThan(
        0,
      );
      expect(
        prisma.termResult.upsert.mock.calls[0][0].create.letterGrade,
      ).toBeTruthy();
    });

    // A student with nothing marked has no result. Writing a zero would put
    // them bottom of a class they were never assessed in.
    it('skips a student with no marks at all', async () => {
      prisma.student.findMany.mockResolvedValue([{ id: 's-1' }]);
      prisma.mark.findMany.mockResolvedValue([]);

      const result = await service.calculateTermResults({
        classSectionId: 'section-1',
        termId: 'term-1',
      } as never);
      expect(result.count).toBe(0);
      expect(prisma.termResult.upsert).not.toHaveBeenCalled();
    });

    it('ranks the class, best first', async () => {
      prisma.student.findMany.mockResolvedValue([{ id: 's-1' }, { id: 's-2' }]);
      prisma.mark.findMany
        .mockResolvedValueOnce(marksFor('subject-1', [['CAT 1', 8]]))
        .mockResolvedValueOnce(marksFor('subject-1', [['CAT 1', 19]]));

      const result = await service.calculateTermResults({
        classSectionId: 'section-1',
        termId: 'term-1',
      } as never);
      expect(result.results[0].studentId).toBe('s-2');
      expect(result.results[0].rank).toBe(1);
      expect(result.results[1].rank).toBe(2);
    });

    /**
     * The whole class is worked out in one transaction. A half-calculated
     * class would have ranks that do not run 1 to n, which is exactly the
     * thing a family notices on a report card.
     */
    it('works the whole class out in one transaction', async () => {
      prisma.student.findMany.mockResolvedValue([{ id: 's-1' }]);
      prisma.mark.findMany.mockResolvedValue(
        marksFor('subject-1', [['CAT 1', 15]]),
      );
      await service.calculateTermResults({
        classSectionId: 'section-1',
        termId: 'term-1',
      } as never);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    // An elective does not count toward the national aggregate, so a student
    // taking only electives has no aggregate rather than a zero one.
    it('records no aggregate for a student with nothing that counts', async () => {
      prisma.student.findMany.mockResolvedValue([{ id: 's-1' }]);
      prisma.mark.findMany.mockResolvedValue([
        {
          subjectId: 'subject-1',
          score: 15,
          maxScore: 20,
          subject: { scope: 'O_ELECTIVE' },
          assessmentType: { name: 'CAT 1' },
        },
      ]);

      await service.calculateTermResults({
        classSectionId: 'section-1',
        termId: 'term-1',
      } as never);
      expect(prisma.termResult.upsert.mock.calls[0][0].create.aggregate).toBeNull();
    });

    it('records an aggregate for the papers that do count', async () => {
      prisma.student.findMany.mockResolvedValue([{ id: 's-1' }]);
      prisma.mark.findMany.mockResolvedValue(
        marksFor('subject-1', [['CAT 1', 18]]),
      );
      await service.calculateTermResults({
        classSectionId: 'section-1',
        termId: 'term-1',
      } as never);
      const created = prisma.termResult.upsert.mock.calls[0][0].create;
      expect(created.aggregate).not.toBeNull();
      expect(created.aggregateMax).toBeGreaterThan(0);
    });

    it('ignores a subject nothing could be weighed from', async () => {
      prisma.student.findMany.mockResolvedValue([{ id: 's-1' }]);
      prisma.mark.findMany.mockResolvedValue(
        marksFor('subject-1', [['Made-up assessment', 15]]),
      );
      await service.calculateTermResults({
        classSectionId: 'section-1',
        termId: 'term-1',
      } as never);
      expect(prisma.termResult.upsert.mock.calls[0][0].create.average).toBe(0);
    });
  });

  /**
   * Working out a year, and the promotion flag that comes out of it.
   */
  describe('working out a year', () => {
    beforeEach(() => {
      prisma.term.findMany.mockResolvedValue([
        { id: 'term-1' },
        { id: 'term-2' },
        { id: 'term-3' },
      ]);
      prisma.student.findMany.mockResolvedValue([
        { id: 's-1', disciplinePoints: 90 },
      ]);
      prisma.yearResult.upsert.mockImplementation((args: any) =>
        Promise.resolve({ id: 'yr-1', ...args.create }),
      );
      prisma.yearResult.update.mockResolvedValue({});
    });

    it('refuses a year with no terms in it', async () => {
      prisma.term.findMany.mockResolvedValue([]);
      await expect(
        service.calculateYearResults({
          classSectionId: 'section-1',
          academicYearId: 'year-1',
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('averages the terms that exist', async () => {
      prisma.termResult.findMany.mockResolvedValue([
        { average: 60 },
        { average: 70 },
        { average: 80 },
      ]);
      await service.calculateYearResults({
        classSectionId: 'section-1',
        academicYearId: 'year-1',
      } as never);
      expect(prisma.yearResult.upsert.mock.calls[0][0].create.yearlyAverage).toBe(
        70,
      );
    });

    // A year still in progress has one or two terms, and averaging over three
    // would understate every student in the school.
    it('averages only the terms that have happened', async () => {
      prisma.termResult.findMany.mockResolvedValue([{ average: 80 }]);
      await service.calculateYearResults({
        classSectionId: 'section-1',
        academicYearId: 'year-1',
      } as never);
      expect(prisma.yearResult.upsert.mock.calls[0][0].create.yearlyAverage).toBe(
        80,
      );
    });

    it('records no average at all for a student with no terms worked out', async () => {
      prisma.termResult.findMany.mockResolvedValue([]);
      await service.calculateYearResults({
        classSectionId: 'section-1',
        academicYearId: 'year-1',
      } as never);
      const created = prisma.yearResult.upsert.mock.calls[0][0].create;
      expect(created.yearlyAverage).toBeNull();
      expect(created.letterGrade).toBeNull();
      expect(created.isPromoted).toBe(false);
    });

    it('marks a student promoted at or above the pass threshold', async () => {
      prisma.schoolConfig.findUnique.mockResolvedValue({ value: '50' });
      prisma.termResult.findMany.mockResolvedValue([{ average: 50 }]);
      await service.calculateYearResults({
        classSectionId: 'section-1',
        academicYearId: 'year-1',
      } as never);
      expect(prisma.yearResult.upsert.mock.calls[0][0].create.isPromoted).toBe(
        true,
      );
    });

    it('uses the threshold the school set', async () => {
      prisma.schoolConfig.findUnique.mockResolvedValue({ value: '70' });
      prisma.termResult.findMany.mockResolvedValue([{ average: 60 }]);
      await service.calculateYearResults({
        classSectionId: 'section-1',
        academicYearId: 'year-1',
      } as never);
      expect(prisma.yearResult.upsert.mock.calls[0][0].create.isPromoted).toBe(
        false,
      );
    });

    it('carries the conduct standing onto the year record', async () => {
      prisma.termResult.findMany.mockResolvedValue([{ average: 80 }]);
      await service.calculateYearResults({
        classSectionId: 'section-1',
        academicYearId: 'year-1',
      } as never);
      expect(
        prisma.yearResult.upsert.mock.calls[0][0].create.disciplineAverage,
      ).toBe(90);
    });

    it('ranks the class for the year too', async () => {
      prisma.student.findMany.mockResolvedValue([
        { id: 's-1', disciplinePoints: 90 },
        { id: 's-2', disciplinePoints: 90 },
      ]);
      prisma.termResult.findMany
        .mockResolvedValueOnce([{ average: 40 }])
        .mockResolvedValueOnce([{ average: 90 }]);

      const result = await service.calculateYearResults({
        classSectionId: 'section-1',
        academicYearId: 'year-1',
      } as never);
      expect(result.results[0].studentId).toBe('s-2');
      expect(result.results[0].rank).toBe(1);
    });
  });

  describe('reading and publishing results', () => {
    it('reads a class in rank order', async () => {
      prisma.termResult.findMany.mockResolvedValue([]);
      await service.getTermResults('section-1', 'term-1');
      expect(prisma.termResult.findMany.mock.calls[0][0].orderBy).toEqual({
        rank: 'asc',
      });
    });

    it('brings a student’s marks along with their result', async () => {
      prisma.termResult.findFirst.mockResolvedValue({ id: 'res-1' });
      prisma.mark.findMany.mockResolvedValue([{ id: 'mark-1' }]);
      const result = await service.getStudentTermResult('student-1', 'term-1');
      expect(result.result).toMatchObject({ id: 'res-1' });
      expect(result.marks).toHaveLength(1);
    });

    it('refuses to comment on a result that does not exist', async () => {
      prisma.termResult.findUnique.mockResolvedValue(null);
      await expect(
        service.updateTermResultComment('nope', {} as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('accepts clearing a comment rather than ignoring the change', async () => {
      prisma.termResult.findUnique.mockResolvedValue({ id: 'res-1' });
      prisma.termResult.update.mockResolvedValue({});
      await service.updateTermResultComment('res-1', {
        teacherComment: '',
      } as never);
      expect(prisma.termResult.update.mock.calls[0][0].data).toEqual({
        teacherComment: '',
      });
    });

    /**
     * Publishing is what makes a term visible to families. It moves the whole
     * class at once, because half a class seeing their results is worse than
     * none of them.
     */
    it('publishes a whole class in one go', async () => {
      prisma.termResult.updateMany.mockResolvedValue({ count: 32 });
      await service.publishTermResults({
        classSectionId: 'section-1',
        termId: 'term-1',
        isPublished: true,
      } as never);
      expect(prisma.termResult.updateMany).toHaveBeenCalledWith({
        where: { classSectionId: 'section-1', termId: 'term-1' },
        data: { isPublished: true },
      });
    });

    it('can take a term back off view', async () => {
      prisma.termResult.updateMany.mockResolvedValue({ count: 32 });
      await service.publishTermResults({
        classSectionId: 'section-1',
        termId: 'term-1',
        isPublished: false,
      } as never);
      expect(
        prisma.termResult.updateMany.mock.calls[0][0].data.isPublished,
      ).toBe(false);
    });
  });

  /**
   * The report card's own data, which is what the printed sheet and the web
   * preview are both built from.
   */
  describe('the report card', () => {
    beforeEach(() => {
      prisma.student.findUnique.mockResolvedValue({
        id: 'student-1',
        classSectionId: 'section-1',
        studentIdNumber: 'STD-2026-001',
        user: { firstName: 'Divine', lastName: 'Niyonkuru', photoUrl: null },
        classSection: {
          name: 'A',
          classLevel: { name: 'Senior 1' },
          trade: null,
        },
      });
      prisma.term.findUnique.mockResolvedValue({
        id: 'term-1',
        name: 'Term 3',
        isClosed: false,
        academicYear: { name: '2026' },
      });
      prisma.mark.findMany.mockResolvedValue([]);
      prisma.termResult.findFirst.mockResolvedValue(null);
      prisma.termResult.findMany.mockResolvedValue([]);
      // The card carries the school's own name and motto in its header.
      prisma.schoolConfig.findMany.mockResolvedValue([
        { key: 'school_name', value: 'Markova TSS' },
      ]);
    });

    it('refuses a student who does not exist', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await expect(
        service.getReportCardData('nope', 'term-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses a term that does not exist', async () => {
      prisma.term.findUnique.mockResolvedValue(null);
      await expect(
        service.getReportCardData('student-1', 'nope'),
      ).rejects.toThrow(NotFoundException);
    });

    it('compares against the class the student is in', async () => {
      prisma.termResult.findMany.mockResolvedValue([
        { average: 60 },
        { average: 80 },
      ]);
      const data: any = await service.getReportCardData('student-1', 'term-1');
      expect(prisma.termResult.findMany).toHaveBeenCalledWith({
        where: { classSectionId: 'section-1', termId: 'term-1' },
      });
      expect(JSON.stringify(data)).toContain('70');
    });

    // Printing zero would tell a family their child is bottom of a class that
    // has no results at all.
    it('gives no class average rather than a zero', async () => {
      const data: any = await service.getReportCardData('student-1', 'term-1');
      expect(JSON.stringify(data)).not.toContain('"classAverage":0');
    });

    it('groups the marks by subject', async () => {
      prisma.mark.findMany.mockResolvedValue([
        {
          subjectId: 'subject-1',
          score: 16,
          maxScore: 20,
          subject: { name: 'Mathematics', scope: 'O_CORE' },
          assessmentType: { name: 'CAT 1' },
        },
        {
          subjectId: 'subject-1',
          score: 18,
          maxScore: 20,
          subject: { name: 'Mathematics', scope: 'O_CORE' },
          assessmentType: { name: 'CAT 2' },
        },
      ]);
      const data: any = await service.getReportCardData('student-1', 'term-1');
      const json = JSON.stringify(data);
      expect(json).toContain('Mathematics');
      expect(json).toContain('CAT 1');
      expect(json).toContain('CAT 2');
    });
  });

  describe('reading a year result back', () => {
    it('reads a class in rank order', async () => {
      prisma.yearResult.findMany.mockResolvedValue([]);
      await service.getYearResults('section-1', 'year-1');
      expect(prisma.yearResult.findMany.mock.calls[0][0].orderBy).toEqual({
        rank: 'asc',
      });
    });

    it('reads one student’s year', async () => {
      prisma.yearResult.findFirst.mockResolvedValue({ id: 'yr-1' });
      prisma.term.findMany.mockResolvedValue([{ id: 'term-1' }]);
      prisma.termResult.findMany.mockResolvedValue([]);
      const result = await service.getStudentYearResult('student-1', 'year-1');
      expect(result).toBeDefined();
      expect(prisma.yearResult.findFirst.mock.calls[0][0].where).toMatchObject({
        studentId: 'student-1',
        academicYearId: 'year-1',
      });
    });
  });

  describe('the marks list', () => {
    beforeEach(() => {
      prisma.mark.findMany.mockResolvedValue([]);
      prisma.mark.count.mockResolvedValue(0);
    });

    it('narrows every way the page offers', async () => {
      await service.findAll({
        studentId: 'student-1',
        subjectId: 'subject-1',
        classSectionId: 'section-1',
        termId: 'term-1',
        assessmentTypeId: 'assess-1',
        teacherId: 'teacher-1',
      } as never);
      expect(prisma.mark.findMany.mock.calls[0][0].where).toEqual({
        studentId: 'student-1',
        subjectId: 'subject-1',
        classSectionId: 'section-1',
        termId: 'term-1',
        assessmentTypeId: 'assess-1',
        teacherId: 'teacher-1',
      });
    });

    it('pages', async () => {
      prisma.mark.count.mockResolvedValue(120);
      const result: any = await service.findAll({ page: 3, limit: 20 } as never);
      expect(prisma.mark.findMany.mock.calls[0][0].skip).toBe(40);
      expect(result.meta).toMatchObject({ total: 120, page: 3 });
    });

    it('refuses one mark that does not exist', async () => {
      prisma.mark.findUnique.mockResolvedValue(null);
      await expect(service.findById('nope')).rejects.toThrow(NotFoundException);
    });
  });
});