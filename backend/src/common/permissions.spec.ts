import { Permissions } from './permissions';

/**
 * The rules that depend on who somebody is, not only on their role.
 *
 * A role guard answers "may a TEACHER reach this route". It cannot answer "is
 * this teacher the class teacher of that class", because that depends on the
 * record being asked about. Those questions were written out again in every
 * service that needed them, which is how the same rule came to be wrong on two
 * different screens in the same week.
 */
describe('who may do what to a particular record', () => {
  const prisma = {
    teacherRole: { findFirst: jest.fn(), findMany: jest.fn() },
    parentStudent: { findFirst: jest.fn() },
    student: { findFirst: jest.fn() },
  };
  const permissions = new Permissions(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.teacherRole.findFirst.mockResolvedValue(null);
    prisma.teacherRole.findMany.mockResolvedValue([]);
    prisma.parentStudent.findFirst.mockResolvedValue(null);
    prisma.student.findFirst.mockResolvedValue(null);
  });

  describe('leading a class', () => {
    it('says yes for the class they lead', async () => {
      prisma.teacherRole.findFirst.mockResolvedValue({ id: 'r-1' });
      expect(await permissions.isClassTeacherOf('t-1', 'section-1')).toBe(true);
    });

    it('says no for a class they only teach in', async () => {
      expect(await permissions.isClassTeacherOf('t-1', 'section-2')).toBe(
        false,
      );
    });

    /* A head teacher or an admin has no teacher record. Asking the database
       with an undefined id would match the first row rather than none. */
    it('says no for somebody who is not a teacher at all', async () => {
      expect(await permissions.isClassTeacherOf(undefined, 'section-1')).toBe(
        false,
      );
      expect(prisma.teacherRole.findFirst).not.toHaveBeenCalled();
    });

    it('lists the classes they lead, which is usually one', async () => {
      prisma.teacherRole.findMany.mockResolvedValue([
        { classSectionId: 'section-1' },
      ]);
      expect(await permissions.classesLedBy('t-1')).toEqual(['section-1']);
    });

    it('leaves out a role with no class attached', async () => {
      prisma.teacherRole.findMany.mockResolvedValue([
        { classSectionId: 'section-1' },
        { classSectionId: null },
      ]);
      expect(await permissions.classesLedBy('t-1')).toEqual(['section-1']);
    });
  });

  describe('writing on a report card', () => {
    /* Two conditions, and both matter: the role, because the head teacher
       writing in the class teacher's box is one person signing in another's
       name, and the class, because a teacher leads one and teaches several. */
    it('lets the class teacher write on their own class', async () => {
      prisma.teacherRole.findFirst.mockResolvedValue({ id: 'r-1' });
      expect(
        await permissions.mayWriteClassTeacherComment(
          { role: 'TEACHER', teacherId: 't-1' },
          'section-1',
        ),
      ).toBe(true);
    });

    it('refuses the head teacher that box', async () => {
      prisma.teacherRole.findFirst.mockResolvedValue({ id: 'r-1' });
      expect(
        await permissions.mayWriteClassTeacherComment(
          { role: 'HEAD_TEACHER' },
          'section-1',
        ),
      ).toBe(false);
    });

    it('refuses a teacher who does not lead that class', async () => {
      expect(
        await permissions.mayWriteClassTeacherComment(
          { role: 'TEACHER', teacherId: 't-2' },
          'section-1',
        ),
      ).toBe(false);
    });

    /* The mirror, and deliberately not "senior enough": the principal outranks
       the DOS and still may not write here, because the comment is signed by
       the Director of Studies and a signature has one author. */
    it('gives the head teacher their own box and nobody else', () => {
      expect(
        permissions.mayWriteHeadTeacherComment({ role: 'HEAD_TEACHER' }),
      ).toBe(true);
      expect(permissions.mayWriteHeadTeacherComment({ role: 'ADMIN' })).toBe(
        false,
      );
      expect(permissions.mayWriteHeadTeacherComment({ role: 'TEACHER' })).toBe(
        false,
      );
    });
  });

  describe('a family and their own child', () => {
    it('recognises a linked parent', async () => {
      prisma.parentStudent.findFirst.mockResolvedValue({ id: 'link-1' });
      expect(await permissions.isParentOf('u-1', 's-1')).toBe(true);
    });

    it('refuses another family', async () => {
      expect(await permissions.isParentOf('u-1', 's-9')).toBe(false);
    });

    it('recognises the student their own record belongs to', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 's-1' });
      expect(await permissions.isSelf('u-1', 's-1')).toBe(true);
    });
  });
});

/**
 * Whose move it is on a class's report cards.
 *
 * The pipeline runs four gates in order and each refuses until the one before
 * it is met, so the only useful answer is the first unmet one. The marks page
 * and the report cards page each had their own version of this, and the
 * versions disagreed.
 */
describe('what is holding a class up', () => {
  const at = (over: Record<string, number> = {}) =>
    Permissions.blockingStep({
      total: 30,
      published: 30,
      commented: 30,
      confirmed: 30,
      issued: 30,
      ...over,
    });

  it('names the marks while any are a draft', () => {
    expect(at({ published: 12, commented: 0, confirmed: 0, issued: 0 })).toBe(
      'MARKS',
    );
  });

  it('names the comments once the marks are out', () => {
    expect(at({ commented: 18, confirmed: 0, issued: 0 })).toBe('COMMENTS');
  });

  it('names the check once every comment is written', () => {
    expect(at({ confirmed: 0, issued: 0 })).toBe('CHECK');
  });

  it('names issuing once the class is confirmed', () => {
    expect(at({ issued: 0 })).toBe('ISSUE');
  });

  it('says a finished class is finished', () => {
    expect(at()).toBe('DONE');
  });

  it('has nothing to say about a class with no results', () => {
    expect(
      at({ total: 0, published: 0, commented: 0, confirmed: 0, issued: 0 }),
    ).toBe('NO_RESULTS');
  });

  /* The bug this exists to prevent. A class with no comments is held up by the
     comments, not by a check that cannot begin, and naming the check sent the
     DOS to a button the API would refuse. */
  it('blames the comments rather than the check when neither is done', () => {
    expect(at({ commented: 0, confirmed: 0, issued: 0 })).toBe('COMMENTS');
  });

  /* Named as a person rather than a state: "awaiting confirmation" is a
     status, "the Director of Studies" is somebody who can be asked. */
  it('names somebody who can act, for every step that is not finished', () => {
    for (const [step, owner] of Object.entries(Permissions.OWNER_OF)) {
      if (step === 'DONE') continue;
      expect(owner.length).toBeGreaterThan(2);
    }
  });

  /* The DOS cannot write a class teacher's comment, so a class stuck there is
     one they chase rather than finish. */
  it('names the class teacher, not the DOS, when comments are missing', () => {
    expect(Permissions.OWNER_OF.COMMENTS).toMatch(/class teacher/i);
  });
});
