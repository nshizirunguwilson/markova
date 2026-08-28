import { SubjectScope } from '@prisma/client';
import {
  COMPETENCE_THRESHOLD,
  competenceFor,
  competenceForSubject,
  computeSubjectTotal,
  countsTowardAggregate,
  gradeFor,
  overallGrade,
} from './grading';

describe('grading', () => {
  describe('gradeFor', () => {
    it('grades core subjects on the national core scale', () => {
      expect(gradeFor(SubjectScope.O_CORE, 72)).toMatchObject({
        letter: 'A',
        points: 6,
      });
      expect(gradeFor(SubjectScope.O_CORE, 58)).toMatchObject({
        letter: 'D',
        points: 3,
      });
      expect(gradeFor(SubjectScope.O_CORE, 10)).toMatchObject({
        letter: 'F',
        points: 0,
      });
    });

    it('grades electives on the stricter non-core scale', () => {
      // 58% is D on the core scale but only S on the elective scale
      expect(gradeFor(SubjectScope.O_ELECTIVE, 58)).toMatchObject({
        letter: 'S',
        points: 1,
      });
      expect(gradeFor(SubjectScope.O_ELECTIVE, 84)).toMatchObject({
        letter: 'A',
        points: 6,
      });
    });

    it('grades A-Level modules on the core scale', () => {
      expect(gradeFor(SubjectScope.A_SPECIFIC, 69)).toMatchObject({
        letter: 'B',
        points: 5,
      });
    });
  });

  describe('computeSubjectTotal', () => {
    it('weights CATs and exam 20/20/60 for general subjects', () => {
      const total = computeSubjectTotal(SubjectScope.O_CORE, [
        { assessmentName: 'CAT 1', score: 70, maxScore: 100 },
        { assessmentName: 'CAT 2', score: 80, maxScore: 100 },
        { assessmentName: 'End of Term Exam', score: 60, maxScore: 100 },
      ]);
      expect(total).toBe(66); // 14 + 16 + 36
    });

    it('weights 15/15/30/40 with a practical for specific modules', () => {
      const total = computeSubjectTotal(SubjectScope.A_SPECIFIC, [
        { assessmentName: 'CAT 1', score: 70, maxScore: 100 },
        { assessmentName: 'CAT 2', score: 75, maxScore: 100 },
        { assessmentName: 'Practical', score: 82, maxScore: 100 },
        { assessmentName: 'End of Term Exam', score: 68, maxScore: 100 },
      ]);
      expect(total).toBe(74); // 10.5 + 11.25 + 24.6 + 27.2 = 73.55 → 74
    });

    it('renormalizes when a component is missing', () => {
      const total = computeSubjectTotal(SubjectScope.O_CORE, [
        { assessmentName: 'CAT 1', score: 50, maxScore: 100 },
        { assessmentName: 'End of Term Exam', score: 50, maxScore: 100 },
      ]);
      expect(total).toBe(50);
    });

    it('returns null when nothing usable is recorded', () => {
      expect(computeSubjectTotal(SubjectScope.O_CORE, [])).toBeNull();
    });
  });

  describe('aggregates and competence', () => {
    it('counts core and A-Level scopes, not electives', () => {
      expect(countsTowardAggregate(SubjectScope.O_CORE)).toBe(true);
      expect(countsTowardAggregate(SubjectScope.A_GENERAL)).toBe(true);
      expect(countsTowardAggregate(SubjectScope.A_SPECIFIC)).toBe(true);
      expect(countsTowardAggregate(SubjectScope.O_ELECTIVE)).toBe(false);
    });

    it('marks practicals competent at 70 and above', () => {
      expect(competenceFor(70)).toBe('COMPETENT');
      expect(competenceFor(66)).toBe('NOT_YET_COMPETENT');
      expect(competenceFor(null)).toBeNull();
    });

    it('reads the overall average on the core scale', () => {
      expect(overallGrade(70.2).letter).toBe('A');
      expect(overallGrade(68.8).letter).toBe('B');
    });
  });
});

/**
 * Competence on every subject, not only the practical modules.
 *
 * The Rwandan competence-based curriculum asks whether a learner can do the
 * thing, and that question is as real in English as it is in a workshop.
 */
describe('whether a subject was reached', () => {
  it('reads a mark at or above the threshold as competent', () => {
    expect(competenceFor(COMPETENCE_THRESHOLD)).toBe('COMPETENT');
    expect(competenceFor(85)).toBe('COMPETENT');
  });

  it('reads one below it as not yet', () => {
    expect(competenceFor(COMPETENCE_THRESHOLD - 1)).toBe('NOT_YET_COMPETENT');
    expect(competenceFor(0)).toBe('NOT_YET_COMPETENT');
  });

  // "Not yet competent" is a judgement, and a subject nobody has marked has
  // not been judged.
  it('says nothing about a subject with no mark', () => {
    expect(competenceFor(null)).toBeNull();
  });

  describe('for one subject on a report card', () => {
    it('judges an ordinary subject on its term total', () => {
      expect(competenceForSubject(SubjectScope.O_CORE, 75, null)).toBe(
        'COMPETENT',
      );
      expect(competenceForSubject(SubjectScope.O_ELECTIVE, 40, null)).toBe(
        'NOT_YET_COMPETENT',
      );
      expect(competenceForSubject(SubjectScope.A_GENERAL, 90, null)).toBe(
        'COMPETENT',
      );
    });

    /*
      The practical is the assessment that asks whether the learner can do the
      work. Judging a module on a total three fifths made of written papers
      would say something else.
    */
    it('judges a practical module on its practical mark', () => {
      expect(competenceForSubject(SubjectScope.A_SPECIFIC, 90, 40)).toBe(
        'NOT_YET_COMPETENT',
      );
      expect(competenceForSubject(SubjectScope.A_SPECIFIC, 40, 90)).toBe(
        'COMPETENT',
      );
    });

    // A module the school has not run a practical for yet still has a total.
    it('falls back to the total for a module with no practical', () => {
      expect(competenceForSubject(SubjectScope.A_SPECIFIC, 80, null)).toBe(
        'COMPETENT',
      );
    });

    it('says nothing for a subject with nothing to judge', () => {
      expect(competenceForSubject(SubjectScope.O_CORE, null, null)).toBeNull();
    });
  });
});
