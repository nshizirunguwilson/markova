import {
  HeadTeacherDashboardService,
  OWNER_OF,
  blockerFor,
  type ClassProgress,
} from './head-teacher-dashboard.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

/**
 * What the Director of Studies opens in the morning.
 *
 * Their day is spent unblocking a pipeline they do not run themselves -
 * subject teachers enter marks, class teachers write comments, the principal
 * issues - so the question that starts it is "what is stuck, and on whom".
 *
 * That is what this page has to answer, and what these tests hold: every row
 * names the one thing standing in a class's way, and names whose move it is.
 * A list of everything outstanding would include two things that are not yet
 * anybody's to do.
 */

const progress = (over: Partial<ClassProgress> = {}): ClassProgress => ({
  classSectionId: 'section-1',
  name: 'Senior 1 A',
  students: 30,
  marksReleased: 30,
  commentsWritten: 30,
  confirmed: 30,
  issued: 30,
  subjectsMarked: 11,
  subjectsTaught: 11,
  average: 68,
  ...over,
});

describe('what is holding a class up', () => {
  /**
   * In the order the pipeline runs. A class teacher cannot write a comment on
   * marks nobody entered, and the head teacher cannot confirm a card nobody
   * wrote on, so the first unmet step is the only one worth naming.
   */
  it('names the marks first, because nothing else can start', () => {
    expect(
      blockerFor(
        progress({
          subjectsMarked: 7,
          marksReleased: 0,
          commentsWritten: 0,
          confirmed: 0,
          issued: 0,
        }),
      ),
    ).toBe('MARKS_NOT_ENTERED');
  });

  it('names releasing them once they are all in', () => {
    expect(
      blockerFor(
        progress({
          marksReleased: 12,
          commentsWritten: 0,
          confirmed: 0,
          issued: 0,
        }),
      ),
    ).toBe('MARKS_NOT_RELEASED');
  });

  it('names the comments once the marks are out', () => {
    expect(
      blockerFor(progress({ commentsWritten: 18, confirmed: 0, issued: 0 })),
    ).toBe('COMMENTS_NOT_WRITTEN');
  });

  it('names their own check once the comments are written', () => {
    expect(blockerFor(progress({ confirmed: 0, issued: 0 }))).toBe(
      'AWAITING_CONFIRMATION',
    );
  });

  it('names the principal once it is confirmed', () => {
    expect(blockerFor(progress({ issued: 0 }))).toBe('AWAITING_ISSUE');
  });

  it('says a finished class is finished', () => {
    expect(blockerFor(progress())).toBe('DONE');
  });

  /*
    A class with nobody in it is not a class with work outstanding. Without
    this it would sit at the top of the list every morning, because zero of
    zero comments are written.
  */
  it('leaves an empty class alone', () => {
    expect(
      blockerFor(progress({ students: 0, marksReleased: 0, confirmed: 0 })),
    ).toBe('DONE');
  });

  /* A class nobody is assigned to teach cannot be judged on its marks, and
     saying "marks not entered" for ever would be a row that never clears. */
  it('does not fault a class with no subjects assigned to it', () => {
    expect(
      blockerFor(
        progress({ subjectsTaught: 0, subjectsMarked: 0, marksReleased: 0 }),
      ),
    ).toBe('MARKS_NOT_RELEASED');
  });
});

/**
 * Whose move it is, named as a person. "Awaiting confirmation" is a state;
 * "You" is somebody who can do something about it before lunchtime.
 */
describe('whose move it is', () => {
  it('names an owner for every state that is not finished', () => {
    for (const [state, owner] of Object.entries(OWNER_OF)) {
      if (state === 'DONE') continue;
      expect(owner.length).toBeGreaterThan(2);
    }
  });

  it('says the head teacher themselves where it is their own check', () => {
    expect(OWNER_OF.AWAITING_CONFIRMATION).toBe('You');
  });

  /*
    Issuing moved to the DOS along with the rest of the academic side, so the
    last step is theirs too. Naming the principal here was worse than untidy:
    the principal has no route that issues a card, so a class sat in that
    state pointing at somebody who could not clear it, and the DOS had no
    reason to look at it again.
  */
  it('says the head teacher again on the step that is now also theirs', () => {
    expect(OWNER_OF.AWAITING_ISSUE).toBe('You');
  });

  it('names nobody who cannot act on the step it names', () => {
    expect(Object.values(OWNER_OF)).not.toContain('The principal');
  });

  it('gives a finished class nobody to chase', () => {
    expect(OWNER_OF.DONE).toBe('');
  });
});

describe('the morning view', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: HeadTeacherDashboardService;

  const section = (id: string, name: string) => ({
    id,
    name,
    classLevel: { name: 'Senior 1' },
    trade: null,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    service = new HeadTeacherDashboardService(prisma);

    prisma.term.findFirst.mockResolvedValue({
      id: 'term-1',
      name: 'Term 2',
      academicYearId: 'year-1',
      academicYear: { name: '2026-2027' },
    });
    prisma.classSection.findMany.mockResolvedValue([
      section('section-1', 'A'),
      section('section-2', 'B'),
    ]);
    prisma.termResult.findMany.mockResolvedValue([]);
    prisma.mark.findMany.mockResolvedValue([]);
    prisma.teacherSubjectClass.findMany.mockResolvedValue([]);
    prisma.student.groupBy.mockResolvedValue([]);
    prisma.teacher.count.mockResolvedValue(46);
    prisma.teacherAttendance.findMany.mockResolvedValue([]);
  });

  it('opens on the term the school is in', async () => {
    const out = await service.overview();
    expect(out.term?.name).toBe('Term 2');
    expect(prisma.term.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isCurrent: true } }),
    );
  });

  it('reads the term it was asked for instead', async () => {
    prisma.term.findUnique.mockResolvedValue({
      id: 'term-9',
      name: 'Term 1',
      academicYearId: 'year-1',
      academicYear: { name: '2026-2027' },
    });
    const out = await service.overview('term-9');
    expect(out.term?.name).toBe('Term 1');
  });

  /* A school in the holidays has no current term, and a dashboard that threw
     would be a dashboard nobody could open in August. */
  it('answers empty rather than failing when there is no term', async () => {
    prisma.term.findFirst.mockResolvedValue(null);
    const out = await service.overview();
    expect(out.term).toBeNull();
    expect(out.classes).toEqual([]);
  });

  it('gives a row for every class in the school', async () => {
    const out = await service.overview();
    expect(out.classes).toHaveLength(2);
    expect(out.classes[0].name).toBe('Senior 1 A');
  });

  it('counts each step of the pipeline from the results', async () => {
    prisma.student.groupBy.mockResolvedValue([
      { classSectionId: 'section-1', _count: { _all: 2 } },
    ]);
    prisma.termResult.findMany.mockResolvedValue([
      {
        classSectionId: 'section-1',
        isPublished: true,
        dosConfirmed: true,
        reportCardPublished: false,
        teacherComment: 'Written.',
        average: 70,
      },
      {
        classSectionId: 'section-1',
        isPublished: true,
        dosConfirmed: false,
        reportCardPublished: false,
        teacherComment: null,
        average: 60,
      },
    ]);

    const [first] = await service.overview().then((o) => o.classes);
    expect(first.students).toBe(2);
    expect(first.marksReleased).toBe(2);
    expect(first.commentsWritten).toBe(1);
    expect(first.confirmed).toBe(1);
    expect(first.issued).toBe(0);
    expect(first.average).toBe(65);
  });

  // Whitespace is not a comment. A card carrying a space would otherwise
  // count as written and let the class be confirmed.
  it('does not count a blank comment as written', async () => {
    prisma.termResult.findMany.mockResolvedValue([
      {
        classSectionId: 'section-1',
        isPublished: true,
        dosConfirmed: false,
        reportCardPublished: false,
        teacherComment: '   ',
        average: 70,
      },
    ]);
    const [first] = await service.overview().then((o) => o.classes);
    expect(first.commentsWritten).toBe(0);
  });

  it('says how much of the mark book each class has in', async () => {
    prisma.mark.findMany.mockResolvedValue([
      { classSectionId: 'section-1', subjectId: 'sub-1' },
      { classSectionId: 'section-1', subjectId: 'sub-2' },
    ]);
    prisma.teacherSubjectClass.findMany.mockResolvedValue([
      { classSectionId: 'section-1', subjectId: 'sub-1' },
      { classSectionId: 'section-1', subjectId: 'sub-2' },
      { classSectionId: 'section-1', subjectId: 'sub-3' },
    ]);
    const [first] = await service.overview().then((o) => o.classes);
    expect(first.subjectsMarked).toBe(2);
    expect(first.subjectsTaught).toBe(3);
  });

  /*
    Counted as distinct pairs rather than as rows: a class of thirty times
    eleven subjects times four assessments is thirteen hundred marks nobody
    needs counted to answer "which subjects have been started".
  */
  it('asks the database for subjects, not for every mark', async () => {
    await service.overview();
    expect(prisma.mark.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ distinct: ['classSectionId', 'subjectId'] }),
    );
  });

  it('carries the blocker and its owner on every row', async () => {
    const out = await service.overview();
    for (const c of out.classes) {
      expect(c).toHaveProperty('blocker');
      expect(c).toHaveProperty('owner');
    }
  });

  it('leaves the average empty where nothing has been worked out', async () => {
    const out = await service.overview();
    expect(out.classes[0].average).toBeNull();
  });
});

/**
 * Who is not in today: the one number here with a deadline attached. A class
 * whose teacher is absent needs cover before the first lesson.
 */
describe('the staffroom this morning', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: HeadTeacherDashboardService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    service = new HeadTeacherDashboardService(prisma);
    prisma.term.findFirst.mockResolvedValue({
      id: 'term-1',
      name: 'Term 2',
      academicYearId: 'year-1',
      academicYear: { name: '2026-2027' },
    });
    prisma.classSection.findMany.mockResolvedValue([]);
    prisma.termResult.findMany.mockResolvedValue([]);
    prisma.mark.findMany.mockResolvedValue([]);
    prisma.teacherSubjectClass.findMany.mockResolvedValue([]);
    prisma.student.groupBy.mockResolvedValue([]);
    prisma.teacher.count.mockResolvedValue(46);
  });

  const register = (rows: unknown[]) =>
    prisma.teacherAttendance.findMany.mockResolvedValue(rows);

  const who = (first: string, status: string) => ({
    teacherId: `t-${first}`,
    status,
    teacher: { user: { firstName: first, lastName: 'Uwase' } },
  });

  it('names who is away rather than only counting them', async () => {
    register([who('Aline', 'ABSENT'), who('Jean', 'PRESENT')]);
    const { staff } = await service.overview();
    expect(staff.absent).toBe(1);
    expect(staff.present).toBe(1);
    expect(staff.absentToday[0].name).toBe('Aline Uwase');
  });

  // Late is not present, and a head teacher covering a first lesson needs to
  // know which of the two it was.
  it('counts anything that is not present as away, and says which', async () => {
    register([who('Aline', 'LATE')]);
    const { staff } = await service.overview();
    expect(staff.absent).toBe(1);
    expect(staff.absentToday[0].status).toBe('LATE');
  });

  /**
   * A register nobody has taken is not a school with nobody absent, and the
   * difference matters at half past eight.
   */
  it('says when the register has not been taken at all', async () => {
    register([]);
    const { staff } = await service.overview();
    expect(staff.taken).toBe(false);
    expect(staff.absent).toBe(0);
  });

  it('says when it has', async () => {
    register([who('Aline', 'PRESENT')]);
    expect((await service.overview()).staff.taken).toBe(true);
  });

  it('reads today, not the whole year', async () => {
    register([]);
    await service.overview();
    const where = prisma.teacherAttendance.findMany.mock.calls[0][0].where;
    const asked = where.date as Date;
    expect(asked.getHours()).toBe(0);
    expect(asked.toDateString()).toBe(new Date().toDateString());
  });

  it('carries the whole staffroom to count against', async () => {
    register([]);
    expect((await service.overview()).staff.total).toBe(46);
  });
});
