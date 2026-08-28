import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

/**
 * Accounts, and the things that make one usable.
 *
 * A user row that cannot sign in is worse than no row at all: the office
 * believes the teacher has an account, the teacher cannot get in, and nobody
 * finds out until term starts. So the identifier rules are checked before any
 * write, and the write itself is one transaction so a half-made account can
 * never exist.
 */
describe('UsersService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: UsersService;

  /** The row `create` reads back once the transaction has committed. */
  let created: Record<string, unknown>;

  beforeEach(() => {
    created = {
      id: 'user-1',
      firstName: 'Aline',
      lastName: 'Uwase',
      role: 'TEACHER',
      photoUrl: null,
    };
    prisma = createMockPrisma();
    service = new UsersService(prisma);
    /**
     * `create` ends by reading the account back, so a blanket null would make
     * every successful path throw "User not found". Identifier lookups answer
     * null (nothing is taken); a lookup by id answers the created row.
     */
    prisma.user.findUnique.mockImplementation((args: any) =>
      Promise.resolve(args?.where?.id ? created : null),
    );
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'user-1',
      firstName: 'Divine',
      lastName: 'Niyonkuru',
      role: 'TEACHER',
    });
    prisma.teacher.create.mockResolvedValue({});
    prisma.student.create.mockResolvedValue({});
    prisma.student.findUnique.mockResolvedValue(null);
    prisma.parentStudent.create.mockResolvedValue({});
  });

  const teacher = {
    role: 'TEACHER' as const,
    firstName: 'Aline',
    lastName: 'Uwase',
    email: 'a.uwase@markova.edu',
    password: 'Password123!',
  };

  /**
   * Each role signs in with a different thing, and the school's own demo data
   * proves it: the first fifteen parents have no email at all.
   */
  describe('who can sign in with what', () => {
    it.each(['TEACHER', 'ADMIN', 'LIBRARIAN'])(
      'refuses a %s with no email',
      async (role) => {
        await expect(
          service.create({ ...teacher, role, email: undefined } as never),
        ).rejects.toThrow(/log in with email/i);
      },
    );

    it('refuses a parent with no phone', async () => {
      await expect(
        service.create({
          ...teacher,
          role: 'PARENT',
          email: 'p@markova.edu',
          phone: undefined,
        } as never),
      ).rejects.toThrow(/log in by phone/i);
    });

    it('accepts a parent with a phone and no email at all', async () => {
      prisma.user.create.mockResolvedValue({ id: 'u-1', role: 'PARENT' });
      await expect(
        service.create({
          ...teacher,
          role: 'PARENT',
          email: undefined,
          phone: '+250788100000',
        } as never),
      ).resolves.toBeDefined();
    });

    it('refuses anybody with neither', async () => {
      await expect(
        service.create({
          ...teacher,
          role: 'STUDENT',
          email: undefined,
          phone: undefined,
        } as never),
      ).rejects.toThrow(/so the user can log in/i);
    });

    it('refuses a student with no class to put them in', async () => {
      await expect(
        service.create({
          ...teacher,
          role: 'STUDENT',
          email: 's@markova.edu',
        } as never),
      ).rejects.toThrow(/classSectionId is required/i);
    });
  });

  describe('identifiers already in use', () => {
    it('refuses an email somebody already has', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.create(teacher as never)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a phone somebody already has', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing' });
      await expect(
        service.create({ ...teacher, phone: '+250788000001' }),
      ).rejects.toThrow(/phone already in use/i);
    });

    it('refuses a national ID somebody already registered', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(
        service.create({ ...teacher, nationalId: '1200780012345678' }),
      ).rejects.toThrow(/national id already registered/i);
    });
  });

  /**
   * A NIDA number encodes the birth year and the gender, so a number that
   * disagrees with the profile is one of the two being wrong. Catching it at
   * entry is far cheaper than finding it on an exam registration.
   */
  describe('the national ID', () => {
    const withNid = (nationalId: string, extra = {}) => ({
      ...teacher,
      nationalId,
      ...extra,
    });

    it('accepts one that agrees with the profile', async () => {
      await expect(
        service.create(
          withNid('1199078012345678', {
            gender: 'FEMALE',
            dateOfBirth: '1990-05-02',
          }) as never,
        ),
      ).resolves.toBeDefined();
    });

    it('refuses an impossible birth year', async () => {
      await expect(
        service.create(withNid('1180078012345678') as never),
      ).rejects.toThrow(/impossible birth year/i);
    });

    it('refuses a birth year in the future', async () => {
      const future = String(new Date().getFullYear() + 5);
      await expect(
        service.create(withNid(`1${future}78012345678`) as never),
      ).rejects.toThrow(/impossible birth year/i);
    });

    it('refuses a male profile carrying a female digit', async () => {
      await expect(
        service.create(
          withNid('1199078012345678', { gender: 'MALE' }) as never,
        ),
      ).rejects.toThrow(/male IDs carry 8/i);
    });

    it('refuses a female profile carrying a male digit', async () => {
      await expect(
        service.create(
          withNid('1199088012345678', { gender: 'FEMALE' }) as never,
        ),
      ).rejects.toThrow(/female IDs carry 7/i);
    });

    it('refuses a birth year that contradicts the date of birth', async () => {
      await expect(
        service.create(
          withNid('1199078012345678', { dateOfBirth: '1991-05-02' }) as never,
        ),
      ).rejects.toThrow(/does not match the date of birth/i);
    });

    it('says nothing about an account that carries no national ID', async () => {
      await expect(service.create(teacher as never)).resolves.toBeDefined();
    });
  });

  /**
   * A user row with no teacher record behind it is an account that exists and
   * does nothing. One transaction is what stops that.
   */
  describe('creating the account', () => {
    it('writes the user and its role record together', async () => {
      await service.create(teacher);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('hashes the password rather than storing it', async () => {
      await service.create(teacher);
      const data = prisma.user.create.mock.calls[0][0].data;
      expect(data.passwordHash).not.toBe('Password123!');
      expect(data.passwordHash).toMatch(/^\$2[aby]\$/);
    });

    // The first sign-in has to be the account holder's own choice of
    // password, not one the office knows.
    it('makes the first sign-in change the password', async () => {
      await service.create(teacher);
      expect(prisma.user.create.mock.calls[0][0].data.forcePasswordChange).toBe(
        true,
      );
    });

    it('stores a blank email as nothing rather than an empty string', async () => {
      prisma.user.create.mockResolvedValue({ id: 'u-1', role: 'PARENT' });
      await service.create({
        ...teacher,
        role: 'PARENT',
        email: '',
        phone: '+250788100000',
      } as never);
      expect(prisma.user.create.mock.calls[0][0].data.email).toBeNull();
    });

    /**
     * A student's demographics live on the Student record, which is the
     * single source of truth for them. Writing them to both would let the two
     * drift.
     */
    it('keeps a student’s gender off the user row', async () => {
      prisma.user.create.mockResolvedValue({
        id: 'u-1',
        firstName: 'Divine',
        lastName: 'Niyonkuru',
        role: 'STUDENT',
      });
      await service.create({
        ...teacher,
        role: 'STUDENT',
        email: 's@markova.edu',
        classSectionId: 'section-1',
        gender: 'FEMALE',
      } as never);
      expect(prisma.user.create.mock.calls[0][0].data).not.toHaveProperty(
        'gender',
      );
    });

    it('puts a teacher’s gender on the user row', async () => {
      await service.create({ ...teacher, gender: 'FEMALE' } as never);
      expect(prisma.user.create.mock.calls[0][0].data.gender).toBe('FEMALE');
    });
  });

  /**
   * The role-based code is what a person is called on a register: TCH-2026-012.
   * Students carry theirs on the Student record instead.
   */
  describe('the registration code', () => {
    it.each([
      ['TEACHER', 'TCH'],
      ['LIBRARIAN', 'LIB'],
      ['ADMIN', 'ADM'],
    ])('gives a %s a %s code', async (role, prefix) => {
      await service.create({ ...teacher, role } as never);
      const code = prisma.user.create.mock.calls[0][0].data.code;
      expect(code).toMatch(new RegExp(`^${prefix}-\\d{4}-\\d{3}$`));
    });

    // Parents outnumber staff several times over, so their sequence has room.
    it('gives a parent four digits rather than three', async () => {
      prisma.user.create.mockResolvedValue({ id: 'u-1', role: 'PARENT' });
      await service.create({
        ...teacher,
        role: 'PARENT',
        email: undefined,
        phone: '+250788100000',
      } as never);
      expect(prisma.user.create.mock.calls[0][0].data.code).toMatch(
        /^PAR-\d{4}-\d{4}$/,
      );
    });

    it('gives a student no code at all, since theirs lives elsewhere', async () => {
      prisma.user.create.mockResolvedValue({
        id: 'u-1',
        firstName: 'A',
        lastName: 'B',
        role: 'STUDENT',
      });
      await service.create({
        ...teacher,
        role: 'STUDENT',
        email: 's@markova.edu',
        classSectionId: 'section-1',
      } as never);
      expect(prisma.user.create.mock.calls[0][0].data.code).toBeNull();
    });

    it('continues the sequence from the last one issued', async () => {
      prisma.user.findFirst.mockResolvedValue({ code: 'TCH-2026-041' });
      await service.create(teacher);
      expect(prisma.user.create.mock.calls[0][0].data.code).toMatch(
        /^TCH-\d{4}-042$/,
      );
    });

    it('starts at one for the first of a role in a year', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await service.create(teacher);
      expect(prisma.user.create.mock.calls[0][0].data.code).toMatch(
        /^TCH-\d{4}-001$/,
      );
    });
  });

  describe('changing and retiring an account', () => {
    it('refuses to read somebody who does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.findOne('nope')).rejects.toThrow(NotFoundException);
    });

    // Deleting a user would take their marks, their attendance and their
    // discipline record with them. A school needs that history.
    it('retires an account rather than deleting the row', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u-1' });
      prisma.user.update.mockResolvedValue({});
      await service.softDelete('u-1');
      expect(prisma.user.update.mock.calls[0][0].data).toMatchObject({
        isActive: false,
      });
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('refuses to retire somebody who does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.softDelete('nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('stores a new photo path', async () => {
      prisma.user.update.mockResolvedValue({
        photoUrl: '/uploads/photos/a.png',
      });
      await service.updatePhoto('u-1', '/uploads/photos/a.png');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u-1' },
          data: { photoUrl: '/uploads/photos/a.png' },
        }),
      );
    });
  });

  /**
   * The search box on the roll. Every word has to match something, which is
   * what makes "Divine Senior 1" narrow rather than widen.
   */
  describe('finding people', () => {
    beforeEach(() => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);
    });

    it('narrows by role and by whether the account is live', async () => {
      await service.findAll({ role: 'STUDENT', isActive: true } as never);
      expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({
        role: 'STUDENT',
        isActive: true,
      });
    });

    it('requires every word to match something', async () => {
      await service.findAll({ search: 'Divine Senior' });
      const and = prisma.user.findMany.mock.calls[0][0].where.AND;
      expect(and).toHaveLength(2);
    });

    // A lone letter is an initial. Matching it inside every name would return
    // most of the school.
    it('treats a single letter as an initial rather than a substring', async () => {
      await service.findAll({ search: 'D' });
      const or = prisma.user.findMany.mock.calls[0][0].where.AND[0].OR;
      const names = JSON.stringify(or);
      expect(names).toContain('startsWith');
      expect(names).not.toContain('"contains":"D"');
    });

    // "NIT" scoped to class must not drag in Anitha by her name.
    it('pins the search to one field group when a scope is given', async () => {
      await service.findAll({ search: 'NIT', searchIn: 'class' });
      const or = JSON.stringify(
        prisma.user.findMany.mock.calls[0][0].where.AND[0].OR,
      );
      expect(or).toContain('classSection');
      expect(or).not.toContain('firstName');
    });

    it('reads a lone digit as a year level', async () => {
      await service.findAll({ search: '5' });
      const or = JSON.stringify(
        prisma.user.findMany.mock.calls[0][0].where.AND[0].OR,
      );
      expect(or).toContain('classLevel');
    });

    it('pages', async () => {
      prisma.user.count.mockResolvedValue(45);
      const result = await service.findAll({ page: 3, limit: 20 });
      expect(prisma.user.findMany.mock.calls[0][0].skip).toBe(40);
      expect(result.meta).toMatchObject({ total: 45, page: 3, limit: 20 });
    });
  });

  /**
   * Changing an account. A student's demographics live on the Student record,
   * so a change to a student's gender must land there and not on the user row,
   * or the two would disagree and nothing would say which was right.
   */
  describe('updating an account', () => {
    beforeEach(() => {
      prisma.user.update.mockResolvedValue({});
      prisma.student.update.mockResolvedValue({});
      prisma.teacher.update.mockResolvedValue({});
    });

    const asStudent = () =>
      prisma.user.findUnique.mockImplementation((args: any) =>
        Promise.resolve(
          args?.where?.id
            ? { id: 'user-1', student: { id: 'student-1' }, teacher: null }
            : null,
        ),
      );

    const asTeacher = () =>
      prisma.user.findUnique.mockImplementation((args: any) =>
        Promise.resolve(
          args?.where?.id
            ? { id: 'user-1', student: null, teacher: { id: 'teacher-1' } }
            : null,
        ),
      );

    it('refuses somebody who does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.update('nope', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('changes only what was sent', async () => {
      asTeacher();
      await service.update('user-1', { firstName: 'Aline' });
      expect(prisma.user.update.mock.calls[0][0].data).toEqual({
        firstName: 'Aline',
      });
    });

    it('puts a student’s gender on the student record, not the user row', async () => {
      asStudent();
      await service.update('user-1', { gender: 'FEMALE' } as never);
      expect(prisma.user.update.mock.calls[0][0].data).not.toHaveProperty(
        'gender',
      );
      expect(prisma.student.update.mock.calls[0][0].data.gender).toBe('FEMALE');
    });

    it('puts a teacher’s gender on the user row', async () => {
      asTeacher();
      await service.update('user-1', { gender: 'FEMALE' } as never);
      expect(prisma.user.update.mock.calls[0][0].data.gender).toBe('FEMALE');
      expect(prisma.student.update).not.toHaveBeenCalled();
    });

    it('moves a student to another class', async () => {
      asStudent();
      await service.update('user-1', { classSectionId: 'section-2' });
      expect(prisma.student.update.mock.calls[0][0].data.classSectionId).toBe(
        'section-2',
      );
    });

    // Graduating or transferring a student is a status change, and it is the
    // one that decides whether they still count on the roll.
    it('changes a student’s standing', async () => {
      asStudent();
      await service.update('user-1', { status: 'GRADUATED' } as never);
      expect(prisma.student.update.mock.calls[0][0].data.status).toBe(
        'GRADUATED',
      );
    });

    it('accepts clearing a medical note rather than ignoring the change', async () => {
      asStudent();
      await service.update('user-1', { allergies: '' });
      expect(prisma.student.update.mock.calls[0][0].data.allergies).toBe('');
    });

    it('deactivates an account through the same route', async () => {
      asTeacher();
      await service.update('user-1', { isActive: false });
      expect(prisma.user.update.mock.calls[0][0].data.isActive).toBe(false);
    });

    /**
     * The NIDA number carries a birth year and a gender digit. `create` has
     * always checked those; `update` did not, so a profile could be edited
     * into a state where the ID contradicted the person it was on.
     */
    describe('the national ID it is being given', () => {
      const asTeacherBorn = (gender: string, year: number) =>
        prisma.user.findUnique.mockImplementation((args: any) =>
          Promise.resolve(
            args?.where?.id
              ? {
                  id: 'user-1',
                  gender,
                  dateOfBirth: new Date(`${year}-04-12`),
                  student: null,
                  teacher: { id: 'teacher-1' },
                }
              : null,
          ),
        );

      it('refuses one whose birth year contradicts the date of birth', async () => {
        asTeacherBorn('MALE', 1990);
        prisma.user.findFirst.mockResolvedValue(null);
        await expect(
          service.update('user-1', { nationalId: '1198580123456012' }),
        ).rejects.toThrow(/does not match the date of birth/);
        expect(prisma.user.update).not.toHaveBeenCalled();
      });

      it('refuses one whose gender digit contradicts the profile', async () => {
        asTeacherBorn('FEMALE', 1990);
        prisma.user.findFirst.mockResolvedValue(null);
        await expect(
          service.update('user-1', { nationalId: '1199080123456012' }),
        ).rejects.toThrow(/female IDs carry 7/);
      });

      // A student's demographics are on the Student record, so that is what
      // the ID has to agree with for them.
      it('checks a student against their own record, not the user row', async () => {
        prisma.user.findUnique.mockImplementation((args: any) =>
          Promise.resolve(
            args?.where?.id
              ? {
                  id: 'user-1',
                  gender: 'MALE',
                  dateOfBirth: new Date('1990-04-12'),
                  student: {
                    id: 'student-1',
                    gender: 'FEMALE',
                    dateOfBirth: new Date('2008-04-12'),
                  },
                  teacher: null,
                }
              : null,
          ),
        );
        prisma.user.findFirst.mockResolvedValue(null);
        await service.update('user-1', { nationalId: '1200870123456012' });
        expect(prisma.user.update.mock.calls[0][0].data.nationalId).toBe(
          '1200870123456012',
        );
      });

      // Without this the duplicate surfaced as a unique-constraint 500 with
      // nothing in it for the admin to act on.
      it('names who already holds it rather than failing on the constraint', async () => {
        asTeacherBorn('MALE', 1990);
        prisma.user.findFirst.mockResolvedValue({
          firstName: 'Aline',
          lastName: 'Uwase',
        });
        await expect(
          service.update('user-1', { nationalId: '1199080123456012' }),
        ).rejects.toThrow(/already registered to Aline Uwase/);
      });

      it('lets someone keep the ID they already hold', async () => {
        asTeacherBorn('MALE', 1990);
        prisma.user.findFirst.mockResolvedValue(null);
        await service.update('user-1', { nationalId: '1199080123456012' });
        expect(prisma.user.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ id: { not: 'user-1' } }),
          }),
        );
        expect(prisma.user.update).toHaveBeenCalled();
      });
    });

    /**
     * Email and phone are unique and they are how people sign in.
     *
     * `create` has always refused a clash; `update` did not, so editing
     * somebody onto an address another account held raised a raw Prisma
     * unique-constraint error that reached the browser as "An unexpected
     * error occurred" — with a 500 in the server log and nothing an admin
     * could act on.
     */
    describe('an email or phone another account already holds', () => {
      const asSomeoneElse = () =>
        prisma.user.findFirst.mockResolvedValue({
          firstName: 'Aline',
          lastName: 'Uwase',
        });

      it('refuses a duplicate email and names who holds it', async () => {
        asTeacher();
        asSomeoneElse();
        await expect(
          service.update('user-1', { email: 'a.uwase@markova.edu' }),
        ).rejects.toThrow(/already belongs to Aline Uwase/);
        expect(prisma.user.update).not.toHaveBeenCalled();
      });

      it('refuses a duplicate phone and names who holds it', async () => {
        asTeacher();
        asSomeoneElse();
        await expect(
          service.update('user-1', { phone: '+250788100000' }),
        ).rejects.toThrow(/already belongs to Aline Uwase/);
      });

      it('answers 409 rather than a server error', async () => {
        asTeacher();
        asSomeoneElse();
        await expect(
          service.update('user-1', { email: 'taken@markova.edu' }),
        ).rejects.toBeInstanceOf(ConflictException);
      });

      // Saving a profile without touching the address must not trip over the
      // account's own email.
      it('lets someone keep the address they already have', async () => {
        asTeacher();
        prisma.user.findFirst.mockResolvedValue(null);
        await service.update('user-1', { email: 'their.own@markova.edu' });
        expect(prisma.user.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ id: { not: 'user-1' } }),
          }),
        );
        expect(prisma.user.update).toHaveBeenCalled();
      });

      it('checks nothing when neither was sent', async () => {
        asTeacher();
        prisma.user.findFirst.mockResolvedValue(null);
        await service.update('user-1', { firstName: 'Aline' });
        expect(prisma.user.findFirst).not.toHaveBeenCalled();
      });
    });
  });

  /**
   * One student's whole record, which is the page an admin opens before a
   * meeting with a family.
   */
  describe('reading one account', () => {
    it('never selects the password hash', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      await service.findOne('user-1');
      const select = prisma.user.findUnique.mock.calls[0][0].select;
      expect(select).not.toHaveProperty('passwordHash');
      expect(select.email).toBe(true);
    });

    it('brings the parents along with a student', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      await service.findOne('user-1');
      const select = prisma.user.findUnique.mock.calls[0][0].select;
      expect(select.student.include).toHaveProperty('parentStudents');
    });

    /**
     * The profile page shows and edits all of these. They were missing from
     * the select, so National ID and Nationality opened empty for everybody
     * however many times they had been saved, and a staff member's own
     * registration code never appeared at all.
     */
    it.each([
      'code',
      'nationalId',
      'nationality',
      'gender',
      'dateOfBirth',
    ])('selects %s, which the profile page shows', async (field) => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      await service.findOne('user-1');
      expect(prisma.user.findUnique.mock.calls[0][0].select[field]).toBe(true);
    });

    it('never selects the password hash even now', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      await service.findOne('user-1');
      expect(
        prisma.user.findUnique.mock.calls[0][0].select,
      ).not.toHaveProperty('passwordHash');
    });

    // What a teacher's own page is made of: who they teach, when, and what
    // they are class teacher of.
    it('brings a teacher’s assignments, timetable and roles', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      await service.findOne('user-1');
      const teacher = prisma.user.findUnique.mock.calls[0][0].select.teacher;
      expect(teacher.include).toHaveProperty('teacherSubjectClasses');
      expect(teacher.include).toHaveProperty('timetables');
      expect(teacher.include).toHaveProperty('roles');
    });

    /**
     * `TeacherRole.classSectionId` is a plain column, not a relation, so the
     * class a special role belongs to could only ever be rendered as a uuid.
     */
    it('names the class a special role is attached to', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        teacher: {
          id: 'teacher-1',
          roles: [{ id: 'r-1', role: 'CLASS_TEACHER', classSectionId: 'sec-1' }],
        },
      });
      prisma.classSection.findMany.mockResolvedValue([
        { id: 'sec-1', name: 'B', classLevel: { name: 'Senior 2' }, trade: null },
      ]);

      const user: any = await service.findOne('user-1');
      expect(user.teacher.roles[0].classSection.name).toBe('B');
      expect(user.teacher.roles[0].classSection.classLevel.name).toBe(
        'Senior 2',
      );
    });

    it('leaves a school-wide role without a class rather than inventing one', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        teacher: {
          id: 'teacher-1',
          roles: [{ id: 'r-1', role: 'DOS', classSectionId: null }],
        },
      });

      const user: any = await service.findOne('user-1');
      expect(user.teacher.roles[0].classSection).toBeUndefined();
      expect(prisma.classSection.findMany).not.toHaveBeenCalled();
    });

    it('costs no extra query for somebody who is not a teacher', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', teacher: null });
      await service.findOne('user-1');
      expect(prisma.classSection.findMany).not.toHaveBeenCalled();
    });
  });
});

/**
 * The whole Rwandan school record, written in one go.
 *
 * A student's row carries the SDMS fields a school is inspected on: province
 * down to village, both parents' names, insurance, boarding, religion,
 * disability. The update method spreads each one only when it was sent, and a
 * test that sends one field at a time proves nothing about the other twenty.
 * This sends the lot, and then sends none.
 */
describe('updating every field a student record carries', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: UsersService;

  const everything = {
    email: 'k.uwimana@markova.edu',
    phone: '+250788100000',
    firstName: 'Keza',
    lastName: 'Uwimana',
    isActive: true,
    // 1 | 2012 | 7 | 2901978 | 0 | 78 — the birth year and the female digit
    // both agree with the profile below, which update() now insists on.
    nationalId: '1201272901978078',
    nationality: 'Rwandan',
    classSectionId: 'section-1',
    dateOfBirth: '2012-04-11',
    gender: 'FEMALE' as const,
    status: 'ACTIVE' as const,
    bloodType: 'A-',
    allergies: 'Penicillin',
    medicalConditions: 'Asthma',
    previousSchool: 'GS Kacyiru',
    enrollmentDate: '2026-01-15',
    province: 'Kigali City',
    district: 'Kicukiro',
    sector: 'Kanombe',
    cell: 'Amajyambere',
    village: 'Karisimbi',
    disability: 'None',
    fatherName: 'Jonas Ndagijimana',
    motherName: 'Seraphine Mukamazimpaka',
    insuranceNumber: '1234994661',
    isBoarder: true,
    religion: 'Protestant',
  };

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new UsersService(prisma);
    prisma.user.findUnique.mockImplementation((args: any) =>
      Promise.resolve(
        args?.where?.id
          ? { id: 'user-1', student: { id: 'student-1' }, teacher: null }
          : null,
      ),
    );
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue({});
    prisma.student.update.mockResolvedValue({});
  });

  it('writes every field it was given', async () => {
    await service.update('user-1', everything);

    const written = prisma.student.update.mock.calls[0][0].data;
    expect(written).toMatchObject({
      classSectionId: 'section-1',
      gender: 'FEMALE',
      status: 'ACTIVE',
      bloodType: 'A-',
      allergies: 'Penicillin',
      medicalConditions: 'Asthma',
      previousSchool: 'GS Kacyiru',
      province: 'Kigali City',
      district: 'Kicukiro',
      sector: 'Kanombe',
      cell: 'Amajyambere',
      village: 'Karisimbi',
      disability: 'None',
      fatherName: 'Jonas Ndagijimana',
      motherName: 'Seraphine Mukamazimpaka',
      insuranceNumber: '1234994661',
      isBoarder: true,
      religion: 'Protestant',
    });
  });

  it('turns the two dates into dates', async () => {
    await service.update('user-1', everything);

    const written = prisma.student.update.mock.calls[0][0].data;
    expect(written.dateOfBirth).toBeInstanceOf(Date);
    expect(written.enrollmentDate).toBeInstanceOf(Date);
  });

  it('writes the account fields onto the account, not the student', async () => {
    await service.update('user-1', everything);

    expect(prisma.user.update.mock.calls[0][0].data).toMatchObject({
      email: 'k.uwimana@markova.edu',
      phone: '+250788100000',
      firstName: 'Keza',
      lastName: 'Uwimana',
      isActive: true,
      nationalId: '1201272901978078',
      nationality: 'Rwandan',
    });
  });

  // A student's gender and birthday live on the student row, not on the
  // account, or the two copies drift apart.
  it('keeps gender and birthday off a student account row', async () => {
    await service.update('user-1', everything);

    const account = prisma.user.update.mock.calls[0][0].data;
    expect(account.gender).toBeUndefined();
    expect(account.dateOfBirth).toBeUndefined();
  });

  it('writes them onto the account of somebody who is not a student', async () => {
    prisma.user.findUnique.mockImplementation((args: any) =>
      Promise.resolve(
        args?.where?.id
          ? { id: 'user-2', student: null, teacher: { id: 'teacher-1' } }
          : null,
      ),
    );
    prisma.teacher.update.mockResolvedValue({});

    await service.update('user-2', {
      gender: 'FEMALE',
      dateOfBirth: '1990-02-02',
    } as never);

    const account = prisma.user.update.mock.calls[0][0].data;
    expect(account.gender).toBe('FEMALE');
    expect(account.dateOfBirth).toBeInstanceOf(Date);
  });

  it('writes nothing at all when nothing was sent', async () => {
    await service.update('user-1', {});

    expect(prisma.user.update.mock.calls[0][0].data).toEqual({});
    expect(prisma.student.update.mock.calls[0][0].data).toEqual({});
  });

  // Clearing a field is not the same as leaving it alone: an empty string has
  // to reach the database, or a wrong allergy can never be removed.
  it('clears a field that was sent empty', async () => {
    await service.update('user-1', {
      allergies: '',
      bloodType: '',
      motherName: '',
    });

    expect(prisma.student.update.mock.calls[0][0].data).toEqual({
      allergies: '',
      bloodType: '',
      motherName: '',
    });
  });
});

describe('updating every field a teacher record carries', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: UsersService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new UsersService(prisma);
    prisma.user.findUnique.mockImplementation((args: any) =>
      Promise.resolve(
        args?.where?.id
          ? { id: 'user-1', student: null, teacher: { id: 'teacher-1' } }
          : null,
      ),
    );
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue({});
    prisma.teacher.update.mockResolvedValue({});
  });

  it('writes the employment details', async () => {
    await service.update('user-1', {
      employmentStatus: 'FULL_TIME',
      qualification: 'A0',
      rssbNumber: 'RSSB-0099',
      hireDate: '2019-01-14',
    } as never);

    const written = prisma.teacher.update.mock.calls[0][0].data;
    expect(written).toMatchObject({
      employmentStatus: 'FULL_TIME',
      qualification: 'A0',
      rssbNumber: 'RSSB-0099',
    });
    expect(written.hireDate).toBeInstanceOf(Date);
  });

  it('clears an RSSB number that was sent empty', async () => {
    await service.update('user-1', { rssbNumber: '' });

    expect(prisma.teacher.update.mock.calls[0][0].data).toEqual({
      rssbNumber: '',
    });
  });

  it('leaves the teacher row alone when nothing about it changed', async () => {
    await service.update('user-1', { firstName: 'Aline' });

    expect(prisma.teacher.update).not.toHaveBeenCalled();
  });
});

/**
 * What the search box understands.
 *
 * An office clerk types one thing into one box and expects it to find the
 * person, whether they typed a name, a class, a role or a status. Each of
 * those is a separate arm, and a search that matches none of them has to
 * return nobody rather than everybody.
 */
describe('the words the search box understands', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: UsersService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new UsersService(prisma);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);
  });

  const whereFor = async (filters: Record<string, unknown>) => {
    await service.findAll(filters);
    return prisma.user.findMany.mock.calls[0][0].where;
  };

  const clauseFor = async (filters: Record<string, unknown>) =>
    JSON.stringify((await whereFor(filters)).AND[0].OR);

  it('reads a role name as a role', async () => {
    expect(await clauseFor({ search: 'teach' })).toContain('TEACHER');
  });

  it('reads "active" as a live account', async () => {
    const clause = await clauseFor({ search: 'active' });
    expect(clause).toContain('"isActive":true');
  });

  it('reads "inactive" as a switched-off one', async () => {
    const clause = await clauseFor({ search: 'inactive' });
    expect(clause).toContain('"isActive":false');
  });

  it('reads a student status as a status', async () => {
    expect(await clauseFor({ search: 'gradu' })).toContain('GRADUATED');
  });

  it('finds nobody for a word no field can match', async () => {
    const clause = await clauseFor({ search: 'zzzz', searchIn: 'role' });
    expect(clause).toBeUndefined();
    const where = await whereFor({ search: 'zzzz', searchIn: 'role' });
    expect(JSON.stringify(where)).toContain('__no_match__');
  });

  // A class of one letter: "A", not every class containing an A.
  it('matches a one-letter class exactly', async () => {
    const clause = await clauseFor({ search: 'A', searchIn: 'class' });
    expect(clause).toContain('"equals":"A"');
  });

  it('matches a trade code or its name', async () => {
    const clause = await clauseFor({ search: 'software', searchIn: 'class' });
    expect(clause).toContain('trade');
  });

  // Roles and statuses are whole words; a single letter would match several.
  it('does not read a single letter as a role', async () => {
    expect(await clauseFor({ search: 'T', searchIn: 'role' })).toBeUndefined();
  });

  it('narrows to one class without a search at all', async () => {
    const where = await whereFor({ classSectionId: 'section-1' });
    expect(where.student).toEqual({ classSectionId: 'section-1' });
  });

  it('narrows to one student status without a search at all', async () => {
    const where = await whereFor({ studentStatus: 'GRADUATED' });
    expect(where.student).toEqual({ status: 'GRADUATED' });
  });

  it('narrows by both at once', async () => {
    const where = await whereFor({
      classSectionId: 'section-1',
      studentStatus: 'ACTIVE',
    });
    expect(where.student).toEqual({
      classSectionId: 'section-1',
      status: 'ACTIVE',
    });
  });

  it('adds no student clause when neither was given', async () => {
    const where = await whereFor({ role: 'TEACHER' });
    expect(where.student).toBeUndefined();
  });
});

/**
 * Creating a whole record in one transaction.
 *
 * A student's row is written with the same twenty SDMS fields the update path
 * carries, a teacher's with their employment details, and a parent's with the
 * children they are responsible for. Each of the three is a different arm of
 * the same transaction.
 */
describe('creating a record with everything on it', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: UsersService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new UsersService(prisma);
    prisma.user.findUnique.mockImplementation((args: any) =>
      Promise.resolve(args?.where?.id ? { id: 'u-1' } : null),
    );
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'u-1',
      firstName: 'Keza',
      lastName: 'Uwimana',
      role: 'STUDENT',
    });
    prisma.student.create.mockResolvedValue({});
    prisma.teacher.create.mockResolvedValue({});
    prisma.parentStudent.create.mockResolvedValue({});
    prisma.student.findUnique.mockResolvedValue(null);
    prisma.student.findFirst.mockResolvedValue(null);
  });

  it('writes a student with the whole SDMS record on them', async () => {
    await service.create({
      role: 'STUDENT',
      firstName: 'Keza',
      lastName: 'Uwimana',
      email: 'k.uwimana@markova.edu',
      password: 'Password123!',
      classSectionId: 'section-1',
      dateOfBirth: '2012-04-11',
      gender: 'FEMALE',
      status: 'ACTIVE',
      enrollmentDate: '2026-01-15',
      bloodType: 'A-',
      allergies: 'Penicillin',
      medicalConditions: 'Asthma',
      previousSchool: 'GS Kacyiru',
      province: 'Kigali City',
      district: 'Kicukiro',
      sector: 'Kanombe',
      cell: 'Amajyambere',
      village: 'Karisimbi',
      disability: 'None',
      fatherName: 'Jonas Ndagijimana',
      motherName: 'Seraphine Mukamazimpaka',
      insuranceNumber: '1234994661',
      isBoarder: true,
      religion: 'Protestant',
    } as never);

    const written = prisma.student.create.mock.calls[0][0].data;
    expect(written).toMatchObject({
      classSectionId: 'section-1',
      gender: 'FEMALE',
      status: 'ACTIVE',
      bloodType: 'A-',
      province: 'Kigali City',
      village: 'Karisimbi',
      isBoarder: true,
      religion: 'Protestant',
      disciplinePoints: 40,
    });
    expect(written.dateOfBirth).toBeInstanceOf(Date);
    expect(written.enrollmentDate).toBeInstanceOf(Date);
  });

  it('stores a student with nothing optional filled in as nulls', async () => {
    await service.create({
      role: 'STUDENT',
      firstName: 'Keza',
      lastName: 'Uwimana',
      email: 'k.uwimana@markova.edu',
      password: 'Password123!',
      classSectionId: 'section-1',
    } as never);

    const written = prisma.student.create.mock.calls[0][0].data;
    // Nulls, not empty strings: the reports read these back and an empty
    // string prints as a blank line where "–" belongs.
    expect(written).toMatchObject({
      dateOfBirth: null,
      gender: null,
      status: 'ACTIVE',
      bloodType: null,
      motherName: null,
      isBoarder: false,
    });
    expect(written.enrollmentDate).toBeUndefined();
  });

  it('writes a teacher with their employment details', async () => {
    prisma.user.create.mockResolvedValue({
      id: 'u-2',
      firstName: 'Aline',
      lastName: 'Uwase',
      role: 'TEACHER',
    });

    await service.create({
      role: 'TEACHER',
      firstName: 'Aline',
      lastName: 'Uwase',
      email: 'a.uwase@markova.edu',
      password: 'Password123!',
      employmentStatus: 'PART_TIME',
      qualification: 'A0',
      rssbNumber: 'RSSB-0099',
      hireDate: '2019-01-14',
    } as never);

    const written = prisma.teacher.create.mock.calls[0][0].data;
    expect(written).toMatchObject({
      employmentStatus: 'PART_TIME',
      qualification: 'A0',
      rssbNumber: 'RSSB-0099',
      isActive: true,
    });
    expect(written.hireDate).toBeInstanceOf(Date);
  });

  it('defaults a teacher with no employment details to full time', async () => {
    prisma.user.create.mockResolvedValue({
      id: 'u-2',
      firstName: 'Aline',
      lastName: 'Uwase',
      role: 'TEACHER',
    });

    await service.create({
      role: 'TEACHER',
      firstName: 'Aline',
      lastName: 'Uwase',
      email: 'a.uwase@markova.edu',
      password: 'Password123!',
    } as never);

    expect(prisma.teacher.create.mock.calls[0][0].data).toMatchObject({
      employmentStatus: 'FULL_TIME',
      qualification: null,
      rssbNumber: null,
      hireDate: null,
    });
  });
});

/**
 * A parent and the children they answer for.
 *
 * A parent account with no child linked sees nothing at all, so the link is
 * the point of the record. Two shapes reach this: the wizard sends a
 * relationship per child, and bulk import sends a list of ids with one
 * relationship for all of them.
 */
describe('linking a parent to their children', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: UsersService;

  const parent = {
    role: 'PARENT' as const,
    firstName: 'Jean',
    lastName: 'Habimana',
    phone: '+250788100000',
    password: 'Password123!',
  };

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new UsersService(prisma);
    prisma.user.findUnique.mockImplementation((args: any) =>
      Promise.resolve(args?.where?.id ? { id: 'u-3' } : null),
    );
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'u-3',
      firstName: 'Jean',
      lastName: 'Habimana',
      role: 'PARENT',
    });
    prisma.parentStudent.create.mockResolvedValue({});
  });

  it('links each child with the relationship it was given', async () => {
    await service.create({
      ...parent,
      children: [
        { studentId: 'student-1', relationship: 'Father' },
        { studentId: 'student-2', relationship: 'Guardian' },
      ],
    });

    expect(prisma.parentStudent.create).toHaveBeenCalledTimes(2);
    expect(prisma.parentStudent.create.mock.calls[0][0].data).toMatchObject({
      studentId: 'student-1',
      relationship: 'Father',
    });
    expect(prisma.parentStudent.create.mock.calls[1][0].data).toMatchObject({
      studentId: 'student-2',
      relationship: 'Guardian',
    });
  });

  it('takes the bulk import shape as well', async () => {
    await service.create({
      ...parent,
      studentIds: ['student-1', 'student-2'],
      relationship: 'Mother',
    });

    expect(prisma.parentStudent.create).toHaveBeenCalledTimes(2);
    expect(prisma.parentStudent.create.mock.calls[0][0].data.relationship).toBe(
      'Mother',
    );
  });

  it('calls them a parent when the import named no relationship', async () => {
    await service.create({
      ...parent,
      studentIds: ['student-1'],
    });

    expect(prisma.parentStudent.create.mock.calls[0][0].data.relationship).toBe(
      'Parent',
    );
  });

  it('links nobody when no children were named', async () => {
    await service.create(parent);

    expect(prisma.parentStudent.create).not.toHaveBeenCalled();
  });
});

/**
 * The numbers a school hands out, at their edges.
 *
 * A student number carries a signed name code, and two students sharing a
 * name and a year collide by design: the nonce is what separates them. A
 * registration code carries a sequence that has to survive a malformed one
 * left behind by an older version.
 */
describe('issuing numbers when they collide', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: UsersService;

  const student = {
    role: 'STUDENT' as const,
    firstName: 'Divine',
    lastName: 'Niyonkuru',
    email: 'd.niyonkuru@markova.edu',
    password: 'Password123!',
    classSectionId: 'section-1',
  };

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new UsersService(prisma);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'u-1',
      firstName: 'Divine',
      lastName: 'Niyonkuru',
      role: 'STUDENT',
    });
    prisma.user.findUnique.mockImplementation((args: any) =>
      Promise.resolve(args?.where?.id ? { id: 'u-1' } : null),
    );
    prisma.student.create.mockResolvedValue({});
  });

  it('tries again when the first number it builds is taken', async () => {
    // The first candidate belongs to somebody; the second does not.
    prisma.student.findUnique
      .mockResolvedValueOnce({ id: 'student-9' })
      .mockResolvedValue(null);

    await service.create(student);

    expect(prisma.student.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.student.create.mock.calls[0][0].data.studentIdNumber).toMatch(
      /^STD-/,
    );
  });

  // Fifty is far past the largest group of students sharing a name in a real
  // roll, so reaching it means something else is wrong.
  it('gives up rather than looping for ever', async () => {
    prisma.student.findUnique.mockResolvedValue({ id: 'student-9' });

    await expect(service.create(student as never)).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.student.findUnique).toHaveBeenCalledTimes(50);
  }, 20000);

  it('dates the number from the enrolment rather than from today', async () => {
    prisma.student.findUnique.mockResolvedValue(null);

    await service.create({
      ...student,
      enrollmentDate: '2024-01-15',
    });

    expect(prisma.student.create.mock.calls[0][0].data.studentIdNumber).toMatch(
      /^STD-2024-/,
    );
  });
});

describe('a registration code left behind in an odd shape', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: UsersService;

  const teacher = {
    role: 'TEACHER' as const,
    firstName: 'Aline',
    lastName: 'Uwase',
    email: 'a.uwase@markova.edu',
    password: 'Password123!',
  };

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new UsersService(prisma);
    prisma.user.create.mockResolvedValue({
      id: 'u-1',
      firstName: 'Aline',
      lastName: 'Uwase',
      role: 'TEACHER',
    });
    prisma.user.findUnique.mockImplementation((args: any) =>
      Promise.resolve(args?.where?.id ? { id: 'u-1' } : null),
    );
    prisma.teacher.create.mockResolvedValue({});
  });

  it('starts again from one when the last code has no number on it', async () => {
    prisma.user.findFirst.mockResolvedValue({ code: 'TCH' });

    await service.create(teacher);

    // "TCH" split on "-" gives back "TCH", which is not a number, so the
    // sequence restarts rather than becoming NaN.
    expect(prisma.user.create.mock.calls[0][0].data.code).toMatch(
      /^TCH-\d{4}-\d{3}$/,
    );
    expect(prisma.user.create.mock.calls[0][0].data.code).not.toMatch(/NaN/);
  });
});

/**
 * Re-linking a parent to their children after the fact.
 *
 * A family who move a child between classes, or who turn out to have a second
 * one at the school, are edited rather than created again. The links are
 * replaced wholesale so a child removed from the form really is removed.
 */
describe('changing which children a parent answers for', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: UsersService;

  const asParent = () =>
    prisma.user.findUnique.mockImplementation((args: any) =>
      Promise.resolve(
        args?.where?.id
          ? { id: 'user-1', role: 'PARENT', student: null, teacher: null }
          : null,
      ),
    );

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new UsersService(prisma);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue({});
    prisma.parentStudent.deleteMany.mockResolvedValue({ count: 1 });
    prisma.parentStudent.create.mockResolvedValue({});
    asParent();
  });

  it('replaces the links rather than adding to them', async () => {
    await service.update('user-1', {
      studentIds: ['student-1', 'student-2'],
      relationship: 'Mother',
    });

    expect(prisma.parentStudent.deleteMany).toHaveBeenCalledWith({
      where: { parentUserId: 'user-1' },
    });
    expect(prisma.parentStudent.create).toHaveBeenCalledTimes(2);
    expect(prisma.parentStudent.create.mock.calls[0][0].data.relationship).toBe(
      'Mother',
    );
  });

  it('calls them a parent when no relationship was chosen', async () => {
    await service.update('user-1', {
      studentIds: ['student-1'],
    });

    expect(prisma.parentStudent.create.mock.calls[0][0].data.relationship).toBe(
      'Parent',
    );
  });

  // Sending an empty list is how a family with no children left at the school
  // is recorded, and it has to actually clear them.
  it('clears every link when an empty list is sent', async () => {
    await service.update('user-1', { studentIds: [] });

    expect(prisma.parentStudent.deleteMany).toHaveBeenCalled();
    expect(prisma.parentStudent.create).not.toHaveBeenCalled();
  });

  it('leaves the links alone when the form did not mention them', async () => {
    await service.update('user-1', { firstName: 'Jean' });

    expect(prisma.parentStudent.deleteMany).not.toHaveBeenCalled();
  });

  // Only a parent has children to link, so the same field on a teacher is
  // ignored rather than wiping something else.
  it('ignores the field entirely on somebody who is not a parent', async () => {
    prisma.user.findUnique.mockImplementation((args: any) =>
      Promise.resolve(
        args?.where?.id
          ? { id: 'user-2', role: 'TEACHER', student: null, teacher: null }
          : null,
      ),
    );

    await service.update('user-2', {
      studentIds: ['student-1'],
    });

    expect(prisma.parentStudent.deleteMany).not.toHaveBeenCalled();
  });
});

describe('changing somebodys photograph', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: UsersService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new UsersService(prisma);
    prisma.user.update.mockResolvedValue({});
  });

  it('refuses somebody who does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.updatePhoto('nobody', '/uploads/avatars/a.png'),
    ).rejects.toThrow(NotFoundException);
  });

  it('saves it against somebody who does', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });

    await service.updatePhoto('user-1', '/uploads/avatars/a.png');

    expect(prisma.user.update.mock.calls[0][0].data).toEqual({
      photoUrl: '/uploads/avatars/a.png',
    });
  });
});
