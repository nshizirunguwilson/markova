import {
  ASSESSMENT_WEIGHTS,
  CORE_SCALE,
  ELECTIVE_SCALE,
} from './grading';
import { gradingExplained } from './grading-explained';

/**
 * How a mark becomes a grade, explained.
 *
 * This is reference material a parent, a student or a teacher opens with a
 * question, and the one thing it must never do is disagree with the marks it
 * explains. It used to be a legend printed on every report card from literal
 * arrays typed out beside the arithmetic - two copies of the same numbers,
 * one of which was going to drift.
 *
 * So what these tests mostly hold is that there is still only one copy: every
 * figure below is read out of the constants the marks are computed with, and
 * changing a scale changes the explanation with it.
 */
describe('explaining the grading', () => {
  const explained = gradingExplained();

  describe('the scales', () => {
    it('gives both, and says who each one is for', () => {
      expect(explained.scales).toHaveLength(2);
      expect(explained.scales[0].appliesTo).toMatch(/core subjects/i);
      expect(explained.scales[1].appliesTo).toMatch(/elective/i);
    });

    it('is the same scale the marks are graded on, not a copy of it', () => {
      const core = explained.scales[0].rows;
      expect(core).toHaveLength(CORE_SCALE.length);
      expect(core.map((r) => r.letter)).toEqual(
        CORE_SCALE.map((b) => b.letter),
      );
      expect(core.map((r) => r.points)).toEqual(
        CORE_SCALE.map((b) => b.points),
      );
    });

    /**
     * A reader recognises a band as "70-100", not as "min 70". The top of
     * each band is one below where the band above it starts, and the best
     * band runs to a hundred.
     */
    it('writes each band as the range it is', () => {
      const core = explained.scales[0].rows;
      expect(core[0].range).toBe('70-100');
      expect(core[1].range).toBe('65-69');
      expect(core[core.length - 1].range).toBe('0-19');
    });

    it('writes the stricter scale from its own numbers', () => {
      const elective = explained.scales[1].rows;
      expect(elective[0].range).toBe('80-100');
      // The range, not the floor it was built from.
      expect(Object.keys(elective[0])).not.toContain('min');
      expect(elective.map((r) => r.letter)).toEqual(
        ELECTIVE_SCALE.map((b) => b.letter),
      );
    });

    // Which is the whole reason there are two of them.
    it('shows the elective scale asking more for the same letter', () => {
      const core = explained.scales[0].rows[0].range;
      const elective = explained.scales[1].rows[0].range;
      expect(core).not.toBe(elective);
    });
  });

  /**
   * What each assessment is worth. A parent who can see the exam is 60% of
   * the total reads a poor CAT differently from one who cannot.
   */
  describe('what makes up a term mark', () => {
    it('covers every kind of subject the school teaches', () => {
      expect(explained.weights.map((w) => w.scope).sort()).toEqual(
        Object.keys(ASSESSMENT_WEIGHTS).sort(),
      );
    });

    it('names each one in words rather than by its enum', () => {
      for (const w of explained.weights) {
        expect(w.name).not.toMatch(/_/);
        expect(w.name.length).toBeGreaterThan(5);
      }
    });

    it('gives whole percentages that add up to the whole mark', () => {
      for (const w of explained.weights) {
        const total = w.parts.reduce((n, p) => n + p.percent, 0);
        expect(total).toBe(100);
      }
    });

    // The trade modules are the only ones with a practical in them, and that
    // is the fact a TVET student most needs off this page.
    it('shows the practical only where there is one', () => {
      const trade = explained.weights.find((w) => w.scope === 'A_SPECIFIC');
      const general = explained.weights.find((w) => w.scope === 'A_GENERAL');
      expect(trade?.parts.map((p) => p.assessment)).toContain('Practical');
      expect(general?.parts.map((p) => p.assessment)).not.toContain(
        'Practical',
      );
    });
  });

  /**
   * Competence is a different question from a grade: not how well, but
   * whether the learner can do the thing.
   */
  describe('competence', () => {
    it('names the mark it turns on', () => {
      expect(explained.competence.threshold).toBe(70);
      expect(explained.competence.competent).toContain('70%');
    });

    it('says not yet rather than failed', () => {
      expect(explained.competence.notYet).toMatch(/unfinished rather than failed/i);
    });

    it('says what a trade certificate needs', () => {
      expect(explained.competence.certificate).toMatch(/grade E/);
    });
  });

  describe('the aggregate', () => {
    it('explains both levels, because they count differently', () => {
      expect(explained.aggregate.oLevel).toMatch(/9 core subjects/);
      expect(explained.aggregate.oLevel).toMatch(/54/);
      expect(explained.aggregate.aLevel).toMatch(/every module/i);
    });

    it('gives the points a single subject can be worth', () => {
      expect(explained.aggregate.maxPerSubject).toBe(6);
    });
  });

  /**
   * Conduct is marked like everything else on the card, and a family reading
   * "32 / 40" is owed the sentence that says where the missing eight went.
   */
  describe('conduct', () => {
    it('says what it is marked out of and how marks come off', () => {
      expect(explained.conduct.outOf).toBe(40);
      expect(explained.conduct.explanation).toMatch(/starts the term on full marks/i);
    });

    it('lists the bands the word comes from', () => {
      expect(explained.conduct.bands[0]).toEqual({
        from: 95,
        remark: 'Excellent',
      });
      expect(explained.conduct.bands[explained.conduct.bands.length - 1]).toEqual(
        { from: 0, remark: 'Poor' },
      );
    });
  });
});
