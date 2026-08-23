import { AcademicService } from './academic.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

/**
 * Promotion: the decision that ends a child's year.
 *
 * This is the most consequential thing in the system. A student wrongly
 * retained repeats a year of their life; a student wrongly promoted sits in a
 * class they cannot follow. So the deliberation is deliberately in three
 * parts: a preview that recommends and changes nothing, a staff decision, and
 * a commit that does exactly what was decided and nothing else.
 */
describe('promotion', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: AcademicService;

  const student = (over: Record<string, unknown> = {}) => ({
    id: 'student-1',
    studentIdNumber: 'STD-2026-001',
    disciplinePoints: 92,
    yearResults: [],
    user: { firstName: 'Divine', lastName: 'Niyonkuru' },
    ...over,
  });

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AcademicService(prisma);
    prisma.term.findMany.mockResolvedValue([]);
    prisma.mark.findMany.mockResolvedValue([]);
    prisma.student.update.mockResolvedValue({});
    prisma.yearResult.update.mockResolvedValue({});
  });

  const preview = {
    fromClassSectionId: 'section-1',
    academicYearId: 'year-1',
  };

  /**
   * The preview must never move a student. A mistake here is discovered a
   * term later by a child sitting in the wrong classroom.
   */
  describe('the deliberation preview', () => {
    it('changes nothing at all', async () => {
      prisma.student.findMany.mockResolvedValue([student()]);
      await service.getPromotionPreview(preview);
      expect(prisma.student.update).not.toHaveBeenCalled();
      expect(prisma.yearResult.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    /**
     * Both criteria have to be met. A student who passed every paper but was
     * suspended twice is a conversation, not an automatic promotion.
     */
    it('recommends promotion only when both marks and conduct pass', async () => {
      prisma.student.findMany.mockResolvedValue([
        student({
          id: 's-1',
          disciplinePoints: 92,
          yearResults: [{ yearlyAverage: 72 }],
        }),
      ]);
      const result = await service.getPromotionPreview(preview);
      expect(result.students[0].recommendation).toBe('PROMOTE');
      expect(result.students[0].reason).toMatch(/academic and discipline/i);
    });

    it('retains a student who passed the papers but not on conduct', async () => {
      prisma.student.findMany.mockResolvedValue([
        student({ disciplinePoints: 20, yearResults: [{ yearlyAverage: 72 }] }),
      ]);
      const result = await service.getPromotionPreview(preview);
      expect(result.students[0].recommendation).toBe('RETAIN');
      expect(result.students[0].reason).toMatch(/discipline below threshold/i);
    });

    it('retains a student who behaved but did not pass', async () => {
      prisma.student.findMany.mockResolvedValue([
        student({ disciplinePoints: 100, yearResults: [{ yearlyAverage: 31 }] }),
      ]);
      const result = await service.getPromotionPreview(preview);
      expect(result.students[0].reason).toMatch(/below pass mark/i);
      expect(result.students[0].reason).not.toMatch(/discipline/i);
    });

    // The reason is read out at a deliberation meeting, so when both failed
    // it has to say both rather than only the first one checked.
    it('names both failings when both applied', async () => {
      prisma.student.findMany.mockResolvedValue([
        student({ disciplinePoints: 20, yearResults: [{ yearlyAverage: 31 }] }),
      ]);
      const result = await service.getPromotionPreview(preview);
      expect(result.students[0].reason).toMatch(/below pass mark/i);
      expect(result.students[0].reason).toMatch(/and discipline/i);
    });

    it('uses the thresholds the school set', async () => {
      prisma.student.findMany.mockResolvedValue([
        student({ disciplinePoints: 60, yearResults: [{ yearlyAverage: 55 }] }),
      ]);
      const strict = await service.getPromotionPreview({
        ...preview,
        passThreshold: 70,
        disciplineThreshold: 80,
      });
      expect(strict.students[0].recommendation).toBe('RETAIN');
      expect(strict.passThreshold).toBe(70);
      expect(strict.disciplineThreshold).toBe(80);
    });

    it('falls back to fifty for both when the school set neither', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      const result = await service.getPromotionPreview(preview);
      expect(result.passThreshold).toBe(50);
      expect(result.disciplineThreshold).toBe(50);
    });

    /**
     * A school that never ran the end-of-year calculation still has to be
     * able to deliberate, so the average falls back to the raw marks.
     */
    it('works the average out from the marks when no year result exists', async () => {
      prisma.student.findMany.mockResolvedValue([student({ id: 'student-1' })]);
      prisma.term.findMany.mockResolvedValue([{ id: 'term-1' }]);
      prisma.mark.findMany.mockResolvedValue([
        { studentId: 'student-1', score: 16, maxScore: 20 },
        { studentId: 'student-1', score: 12, maxScore: 20 },
      ]);

      const result = await service.getPromotionPreview(preview);
      expect(result.students[0].average).toBe(70);
      expect(result.students[0].hasResult).toBe(false);
    });

    it('prefers the computed year result over the raw marks', async () => {
      prisma.student.findMany.mockResolvedValue([
        student({ id: 'student-1', yearResults: [{ yearlyAverage: 81 }] }),
      ]);
      prisma.term.findMany.mockResolvedValue([{ id: 'term-1' }]);
      prisma.mark.findMany.mockResolvedValue([
        { studentId: 'student-1', score: 1, maxScore: 20 },
      ]);

      const result = await service.getPromotionPreview(preview);
      expect(result.students[0].average).toBe(81);
      expect(result.students[0].hasResult).toBe(true);
    });

    it('reads a student with no marks at all as zero, not as passing', async () => {
      prisma.student.findMany.mockResolvedValue([student()]);
      const result = await service.getPromotionPreview(preview);
      expect(result.students[0].average).toBe(0);
      expect(result.students[0].recommendation).toBe('RETAIN');
    });

    // A mark out of zero is a data error, and dividing by it would poison the
    // whole average with Infinity.
    it('ignores marks recorded out of nothing', async () => {
      prisma.student.findMany.mockResolvedValue([student()]);
      prisma.term.findMany.mockResolvedValue([{ id: 'term-1' }]);
      await service.getPromotionPreview(preview);
      expect(prisma.mark.findMany.mock.calls[0][0].where.maxScore).toEqual({
        gt: 0,
      });
    });

    it('asks for no marks when the year has no terms', async () => {
      prisma.student.findMany.mockResolvedValue([student()]);
      prisma.term.findMany.mockResolvedValue([]);
      await service.getPromotionPreview(preview);
      expect(prisma.mark.findMany).not.toHaveBeenCalled();
    });

    it('counts the two recommendations for the meeting', async () => {
      prisma.student.findMany.mockResolvedValue([
        student({ id: 's-1', yearResults: [{ yearlyAverage: 80 }] }),
        student({ id: 's-2', yearResults: [{ yearlyAverage: 20 }] }),
        student({ id: 's-3', yearResults: [{ yearlyAverage: 90 }] }),
      ]);
      const result = await service.getPromotionPreview(preview);
      expect(result).toMatchObject({
        total: 3,
        recommendedPromote: 2,
        recommendedRetain: 1,
      });
    });

    it('lists the students by name so a register can be followed', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      await service.getPromotionPreview(preview);
      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { user: { firstName: 'asc' } } }),
      );
    });

    it('considers only students still on the roll', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      await service.getPromotionPreview(preview);
      expect(prisma.student.findMany.mock.calls[0][0].where).toEqual({
        classSectionId: 'section-1',
        status: 'ACTIVE',
      });
    });
  });

  /**
   * The commit does what staff decided, not what the system recommended.
   * An override is the whole reason the deliberation exists.
   */
  describe('committing the decisions', () => {
    const commit = {
      academicYearId: 'year-1',
      toClassSectionId: 'section-2',
      decisions: [
        { studentId: 's-1', decision: 'PROMOTE' as const },
        { studentId: 's-2', decision: 'RETAIN' as const },
      ],
    };

    beforeEach(() => {
      prisma.student.findMany.mockResolvedValue([
        student({ id: 's-1', yearResults: [{ id: 'yr-1' }] }),
        student({
          id: 's-2',
          yearResults: [{ id: 'yr-2' }],
          user: { firstName: 'Keza', lastName: 'Mutesi' },
        }),
      ]);
    });

    it('moves the promoted student into the next class', async () => {
      await service.commitPromotion(commit);
      expect(prisma.student.update).toHaveBeenCalledWith({
        where: { id: 's-1' },
        data: { classSectionId: 'section-2' },
      });
    });

    // A retained student stays where they are. Moving them and moving them
    // back would be two audit entries for a decision that was never made.
    it('leaves the retained student where they are', async () => {
      await service.commitPromotion(commit);
      const moved = prisma.student.update.mock.calls.map((c) => c[0].where.id);
      expect(moved).toEqual(['s-1']);
    });

    it('records the outcome on the year result either way', async () => {
      await service.commitPromotion(commit);
      expect(prisma.yearResult.update).toHaveBeenCalledWith({
        where: { id: 'yr-1' },
        data: { isPromoted: true },
      });
      expect(prisma.yearResult.update).toHaveBeenCalledWith({
        where: { id: 'yr-2' },
        data: { isPromoted: false },
      });
    });

    it('promotes a student who has no year result to record it on', async () => {
      prisma.student.findMany.mockResolvedValue([
        student({ id: 's-1', yearResults: [] }),
      ]);
      await service.commitPromotion({
        ...commit,
        decisions: [{ studentId: 's-1', decision: 'PROMOTE' }],
      });
      expect(prisma.student.update).toHaveBeenCalled();
      expect(prisma.yearResult.update).not.toHaveBeenCalled();
    });

    /**
     * Every move happens inside one transaction. A promotion that half
     * completed would leave a class register that does not match the results.
     */
    it('moves the whole class in one transaction', async () => {
      await service.commitPromotion(commit);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('skips a decision naming a student who is not there', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      const result = await service.commitPromotion(commit);
      expect(prisma.student.update).not.toHaveBeenCalled();
      expect(result.promoted).toBe(0);
      expect(result.retained).toBe(0);
    });

    it('names who went up and who stayed', async () => {
      const result = await service.commitPromotion(commit);
      expect(result).toMatchObject({
        total: 2,
        promoted: 1,
        retained: 1,
        promotedStudents: ['Divine Niyonkuru'],
        retainedStudents: ['Keza Mutesi'],
      });
    });
  });

  /**
   * The older one-shot promotion, kept for a school that wants the system to
   * decide. It applies the academic threshold only.
   */
  describe('promoting a whole class at once', () => {
    const bulk = {
      fromClassSectionId: 'section-1',
      toClassSectionId: 'section-2',
      academicYearId: 'year-1',
    };

    it('promotes those at or above the pass mark', async () => {
      prisma.student.findMany.mockResolvedValue([
        student({ id: 's-1', yearResults: [{ id: 'yr-1', yearlyAverage: 50 }] }),
        student({ id: 's-2', yearResults: [{ id: 'yr-2', yearlyAverage: 49 }] }),
      ]);

      const result = await service.promoteStudents(bulk);
      expect(result.promoted).toBe(1);
      expect(result.retained).toBe(1);
    });

    it('uses the threshold given rather than the default', async () => {
      prisma.student.findMany.mockResolvedValue([
        student({ yearResults: [{ id: 'yr-1', yearlyAverage: 60 }] }),
      ]);
      const result = await service.promoteStudents({
        ...bulk,
        passThreshold: 70,
      });
      expect(result.retained).toBe(1);
    });

    it('retains a student with no result rather than promoting them', async () => {
      prisma.student.findMany.mockResolvedValue([student({ yearResults: [] })]);
      const result = await service.promoteStudents(bulk);
      expect(result.retained).toBe(1);
      expect(prisma.student.update).not.toHaveBeenCalled();
    });

    it('says the average alongside each name, for the record', async () => {
      prisma.student.findMany.mockResolvedValue([
        student({ yearResults: [{ id: 'yr-1', yearlyAverage: 72.36 }] }),
      ]);
      const result = await service.promoteStudents(bulk);
      expect(result.promotedStudents[0]).toBe('Divine Niyonkuru (72.4%)');
    });

    it('moves the whole class in one transaction', async () => {
      prisma.student.findMany.mockResolvedValue([student()]);
      await service.promoteStudents(bulk);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
