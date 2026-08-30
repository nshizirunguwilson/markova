import {
  MAX_COMMENT_WORDS,
  countWords,
  differ,
  fit,
  suggestClassTeacherComment,
  suggestComments,
  suggestHeadTeacherComment,
  type CommentFacts,
} from './report-comments';

/**
 * The two drafted comments.
 *
 * What is being protected here is the one thing that makes a comment worth
 * printing: that it was written about this child. A drafted comment fails in
 * three ways, and all three are tested for.
 *
 *   It says the same thing on every card, so a family learns to skip the box.
 *   It says the same thing in both boxes, so they learn neither was written.
 *   It says something the marks do not support, which is worse than blank.
 */

const facts = (over: Partial<CommentFacts> = {}): CommentFacts => ({
  studentId: 'student-1',
  firstName: 'Aline',
  average: 68,
  letterGrade: 'B',
  rank: 4,
  classSize: 30,
  aggregate: 21,
  aggregateMax: 30,
  previousAverage: null,
  subjects: [
    { name: 'Mathematics', total: 78, grade: 'A', competence: 'COMPETENT' },
    { name: 'English', total: 66, grade: 'B', competence: 'NOT_YET_COMPETENT' },
    { name: 'Physics', total: 60, grade: 'C', competence: 'NOT_YET_COMPETENT' },
  ],
  conduct: { points: 38, outOf: 40 },
  ...over,
});

/**
 * The load-bearing promise. Two people writing about the same child produce
 * different comments not because they were given different adjectives, but
 * because they were asked different questions: the class teacher writes about
 * the work, the head teacher about standing and what happens next.
 */
describe('the two comments are two comments', () => {
  const bands = [
    ['a strong term', 88],
    ['a sound term', 65],
    ['a fair term', 54],
    ['a weak term', 44],
    ['a failing term', 22],
  ] as const;

  it.each(bands)('shares no sentence on %s', (_name, average) => {
    const both = suggestComments(facts({ average }));
    expect(differ(both.classTeacher, both.headTeacher)).toBe(true);
    expect(both.classTeacher).not.toBe(both.headTeacher);
  });

  it('shares no sentence when there is nothing marked at all', () => {
    const both = suggestComments(facts({ average: null, subjects: [] }));
    expect(differ(both.classTeacher, both.headTeacher)).toBe(true);
  });

  /**
   * The registers are what keep them apart. A head teacher who names a
   * subject is writing the class teacher's comment.
   */
  it("keeps the subjects in the class teacher's half", () => {
    const f = facts();
    expect(suggestClassTeacherComment(f)).toContain('Mathematics');
    const head = suggestHeadTeacherComment(f);
    for (const s of f.subjects) expect(head).not.toContain(s.name);
  });

  it("keeps the class position in the head teacher's half", () => {
    const f = facts();
    expect(suggestHeadTeacherComment(f)).toContain('4 of 30');
    expect(suggestClassTeacherComment(f)).not.toContain('4 of 30');
  });
});

/**
 * Thirty identical sentences read as thirty cards nobody looked at, which is
 * the failure the draft exists to fix rather than to reproduce.
 */
describe('a class of thirty does not read as one card', () => {
  it('varies the wording between students on the same marks', () => {
    const written = new Set(
      Array.from({ length: 12 }, (_, i) =>
        suggestClassTeacherComment(facts({ studentId: `student-${i}` })),
      ),
    );
    expect(written.size).toBeGreaterThan(1);
  });

  it("varies the head teacher's wording too", () => {
    const written = new Set(
      Array.from({ length: 12 }, (_, i) =>
        suggestHeadTeacherComment(facts({ studentId: `student-${i}` })),
      ),
    );
    expect(written.size).toBeGreaterThan(1);
  });

  /**
   * Pressing the button twice must give the same words back. A teacher who
   * cannot tell whether they changed anything will stop reading what they
   * are signing.
   */
  it('gives the same student the same draft every time', () => {
    const f = facts();
    expect(suggestClassTeacherComment(f)).toBe(suggestClassTeacherComment(f));
    expect(suggestHeadTeacherComment(f)).toBe(suggestHeadTeacherComment(f));
  });
});

/**
 * What the class teacher actually writes about.
 */
describe('the class teacher on the work', () => {
  it('names the strongest subject rather than repeating the average', () => {
    const out = suggestClassTeacherComment(facts());
    expect(out).toContain('Mathematics');
    expect(out).not.toContain('68');
  });

  /**
   * Only when one subject is genuinely adrift. On an even sheet, naming the
   * lowest of eleven near-identical marks invents a problem the child does
   * not have.
   */
  it('names the subject holding the average down when one is', () => {
    const out = suggestClassTeacherComment(
      facts({
        subjects: [
          {
            name: 'Mathematics',
            total: 82,
            grade: 'A',
            competence: 'COMPETENT',
          },
          { name: 'English', total: 70, grade: 'A', competence: 'COMPETENT' },
          {
            name: 'Physics',
            total: 41,
            grade: 'E',
            competence: 'NOT_YET_COMPETENT',
          },
        ],
      }),
    );
    expect(out).toMatch(/Physics/);
  });

  it('invents no weak subject on an even sheet', () => {
    const out = suggestClassTeacherComment(
      facts({
        subjects: [
          {
            name: 'Mathematics',
            total: 68,
            grade: 'B',
            competence: 'COMPETENT',
          },
          { name: 'English', total: 66, grade: 'B', competence: 'COMPETENT' },
          { name: 'Physics', total: 64, grade: 'C', competence: 'COMPETENT' },
        ],
      }),
    );
    expect(out).not.toMatch(
      /holding the average down|well behind|The gap is in/,
    );
  });

  it('says what is not yet competent', () => {
    const out = suggestClassTeacherComment(
      facts({
        subjects: [
          { name: 'Mathematics', total: 78, grade: 'A', competence: 'COMPETENT' },
          { name: 'English', total: 66, grade: 'B', competence: 'NOT_YET_COMPETENT' },
        ],
      }),
    );
    expect(out).toMatch(/not yet competent/i);
  });

  it('counts them instead of listing when there are many', () => {
    const out = suggestClassTeacherComment(
      facts({
        subjects: Array.from({ length: 6 }, (_, i) => ({
          name: `Subject ${i}`,
          total: 40 + i,
          grade: 'E',
          competence: 'NOT_YET_COMPETENT' as const,
        })),
      }),
    );
    expect(out).toMatch(/6 subjects are not yet competent/i);
  });

  it('says so honestly when nothing has been marked', () => {
    const out = suggestClassTeacherComment(
      facts({ average: null, subjects: [] }),
    );
    expect(out).toMatch(/not yet marked/i);
    expect(out).not.toMatch(/keep it up|well done/i);
  });
});

/**
 * What the head teacher writes about: where this places the child, and what
 * the school does next.
 */
describe('the head teacher on standing', () => {
  it('gives the position and what follows from it', () => {
    const out = suggestHeadTeacherComment(facts({ average: 82, rank: 2 }));
    expect(out).toContain('2 of 30');
    expect(out).toMatch(/Promoted/);
  });

  it('asks a struggling student to come back ready', () => {
    const out = suggestHeadTeacherComment(facts({ average: 41 }));
    expect(out).toMatch(/return ready to work/);
    expect(out).not.toMatch(/Promoted/);
  });

  /**
   * The direction matters more than the number: a 58% that was 48% last term
   * is a different conversation from a 58% that was 68%.
   */
  it('notes a real improvement on last term', () => {
    const out = suggestHeadTeacherComment(
      facts({ average: 58, previousAverage: 48 }),
    );
    expect(out).toMatch(/improvement on last term/i);
  });

  it('notes a real fall', () => {
    const out = suggestHeadTeacherComment(
      facts({ average: 58, previousAverage: 68 }),
    );
    expect(out).toMatch(/fall on last term/i);
  });

  it('says nothing about movement that is inside the noise', () => {
    const out = suggestHeadTeacherComment(
      facts({ average: 58, previousAverage: 56 }),
    );
    expect(out).not.toMatch(/last term/i);
  });

  it('says nothing about last term when there was none', () => {
    expect(suggestHeadTeacherComment(facts())).not.toMatch(/last term/i);
  });

  it('copes with a result that has no position', () => {
    const out = suggestHeadTeacherComment(facts({ rank: null }));
    expect(out).not.toMatch(/null|undefined|NaN/);
    expect(out.length).toBeGreaterThan(20);
  });
});

/**
 * Discipline, and when it belongs in a comment at all.
 *
 * A line about behaviour on every card is a line nobody reads, and it turns
 * the one card that omits it into an accusation nobody wrote. So it appears
 * only where there is something to say, and the two writers speak at
 * different points: the class teacher where it starts to cost classroom time,
 * the head teacher only where it has stopped being the classroom's to handle.
 */
describe('discipline, only where it is needed', () => {
  it('says nothing at all about a clean term', () => {
    const clean = facts({ conduct: { points: 40, outOf: 40 } });
    expect(suggestClassTeacherComment(clean)).not.toMatch(/[Cc]onduct/);
    expect(suggestHeadTeacherComment(clean)).not.toMatch(/[Cc]onduct/);
  });

  it('says nothing about conduct that is merely very good', () => {
    const good = facts({ conduct: { points: 35, outOf: 40 } });
    expect(suggestClassTeacherComment(good)).not.toMatch(/[Cc]onduct/);
  });

  it('has the class teacher raise it once it costs classroom time', () => {
    const out = suggestClassTeacherComment(
      facts({ conduct: { points: 30, outOf: 40 } }),
    );
    expect(out).toMatch(/[Cc]onduct needs to settle/);
  });

  // Still the classroom's to handle at 75%, so the head teacher stays out.
  it("keeps the head teacher out of it while it is the classroom's", () => {
    const out = suggestHeadTeacherComment(
      facts({ conduct: { points: 30, outOf: 40 } }),
    );
    expect(out).not.toMatch(/[Cc]onduct/);
  });

  it("brings the head teacher in once it is the school's", () => {
    const out = suggestHeadTeacherComment(
      facts({ conduct: { points: 18, outOf: 40 } }),
    );
    expect(out).toMatch(/asked to meet me/i);
  });

  it('speaks plainly to the family when behaviour has cost real time', () => {
    const out = suggestClassTeacherComment(
      facts({ conduct: { points: 12, outOf: 40 } }),
    );
    expect(out).toMatch(/costing Aline real time/);
  });

  it('copes with a school that marks no conduct', () => {
    const none = facts({ conduct: null });
    expect(suggestClassTeacherComment(none)).not.toMatch(/[Cc]onduct/);
    expect(suggestHeadTeacherComment(none)).not.toMatch(/[Cc]onduct/);
  });

  it('does not divide by a conduct mark out of nothing', () => {
    const out = suggestClassTeacherComment(
      facts({ conduct: { points: 0, outOf: 0 } }),
    );
    expect(out).not.toMatch(/NaN|Infinity/);
  });
});

/**
 * A drafted comment is a draft. Nothing here is sent, saved or signed
 * without somebody reading it, and these are the properties that make it
 * safe to put in front of them.
 */
describe('what a draft never does', () => {
  const all = () =>
    [88, 65, 54, 44, 22].flatMap((average) => {
      const f = facts({ average });
      return [suggestClassTeacherComment(f), suggestHeadTeacherComment(f)];
    });

  it('never leaks a placeholder', () => {
    for (const c of all()) expect(c).not.toMatch(/null|undefined|NaN|\[object/);
  });

  it("always uses the child's own name where it uses a name", () => {
    for (const c of all()) expect(c).not.toMatch(/\bthe student\b/i);
  });

  it('stays short enough for the box it prints in', () => {
    for (const c of all()) expect(c.length).toBeLessThan(400);
  });

  it('is a finished sentence, not a fragment', () => {
    for (const c of all()) {
      expect(c.trim()).toMatch(/\.$/);
      expect(c.trim()[0]).toBe(c.trim()[0].toUpperCase());
    }
  });
});

/**
 * The length of a comment.
 *
 * Twenty words is one sentence, or two short ones, and the box on a report
 * card is two inches tall. A comment that overflows it is a comment a family
 * reads the first half of - and a teacher writing thirty by hand keeps to
 * about this length anyway. The long ones are the ones nobody wrote.
 */
describe('how long a comment may run', () => {
  const everything = () =>
    [88, 74, 65, 54, 44, 22].flatMap((average) =>
      [
        { points: 40, outOf: 40 },
        { points: 30, outOf: 40 },
        { points: 12, outOf: 40 },
      ].flatMap((conduct) =>
        [null, 48, 78].flatMap((previousAverage) => {
          const f = facts({ average, conduct, previousAverage });
          return [
            suggestClassTeacherComment(f),
            suggestHeadTeacherComment(f),
          ];
        }),
      ),
    );

  it('never runs past twenty words, whatever the term was like', () => {
    for (const c of everything()) {
      expect(countWords(c)).toBeLessThanOrEqual(MAX_COMMENT_WORDS);
    }
  });

  it('never runs past it on a sheet with everything wrong at once', () => {
    const f = facts({
      average: 31,
      previousAverage: 62,
      conduct: { points: 8, outOf: 40 },
      subjects: Array.from({ length: 9 }, (_, i) => ({
        name: `Subject Number ${i}`,
        total: 20 + i * 6,
        grade: 'F',
        competence: 'NOT_YET_COMPETENT' as const,
      })),
    });
    expect(countWords(suggestClassTeacherComment(f))).toBeLessThanOrEqual(20);
    expect(countWords(suggestHeadTeacherComment(f))).toBeLessThanOrEqual(20);
  });

  // Short is the point, but empty is not a comment.
  it('still says something on every one of them', () => {
    for (const c of everything()) expect(countWords(c)).toBeGreaterThan(2);
  });

  it('is never cut off mid sentence', () => {
    for (const c of everything()) expect(c.trim()).toMatch(/\.$/);
  });
});

/**
 * What survives when there is more to say than there is room for.
 *
 * This is the whole design of the limit: clauses are written most important
 * first and taken until the next will not fit, so a comment is never
 * truncated and what remains is always the thing that mattered most.
 */
describe('what gets dropped', () => {
  it('keeps whole clauses rather than cutting one in half', () => {
    expect(fit(['One two three.', 'Four five six seven.'], 5)).toBe(
      'One two three.',
    );
  });

  /* Order is priority, not sequence: a later clause that fits is taken even
     when an earlier one did not, because dropping both would lose something
     for no gain. */
  it('takes a later clause that fits when an earlier one did not', () => {
    expect(fit(['One two three four five six.', 'Seven.'], 5)).toBe('Seven.');
  });

  it('ignores clauses that are not there', () => {
    expect(fit(['One.', '', 'Two.'])).toBe('One. Two.');
  });

  it('says nothing when nothing fits', () => {
    expect(fit(['One two three.'], 1)).toBe('');
  });

  /**
   * Behaviour that has begun costing a child real time outranks a competence
   * tally: one of those is something a family can act on tonight, the other
   * is a curriculum artefact they will ask the school to explain.
   */
  it('keeps serious behaviour over a competence count', () => {
    const out = suggestClassTeacherComment(
      facts({
        average: 44,
        conduct: { points: 8, outOf: 40 },
        subjects: Array.from({ length: 5 }, (_, i) => ({
          name: `Subject ${i}`,
          total: 40 + i,
          grade: 'E',
          competence: 'NOT_YET_COMPETENT' as const,
        })),
      }),
    );
    expect(out).toMatch(/costing Aline real time/);
  });

  it('counts words the way a person counts them', () => {
    expect(countWords('One two  three')).toBe(3);
    expect(countWords('  ')).toBe(0);
    expect(countWords(null)).toBe(0);
  });
});

describe('telling two comments apart', () => {
  it('sees a shared sentence', () => {
    expect(differ('One. Two.', 'Three. Two.')).toBe(false);
  });

  it('sees two comments that share nothing', () => {
    expect(differ('One. Two.', 'Three. Four.')).toBe(true);
  });
});
