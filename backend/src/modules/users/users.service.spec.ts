import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
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
        service.create({ ...teacher, phone: '+250788000001' } as never),
      ).rejects.toThrow(/phone already in use/i);
    });

    it('refuses a national ID somebody already registered', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(
        service.create({ ...teacher, nationalId: '1200780012345678' } as never),
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
      await service.create(teacher as never);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('hashes the password rather than storing it', async () => {
      await service.create(teacher as never);
      const data = prisma.user.create.mock.calls[0][0].data;
      expect(data.passwordHash).not.toBe('Password123!');
      expect(data.passwordHash).toMatch(/^\$2[aby]\$/);
    });

    // The first sign-in has to be the account holder's own choice of
    // password, not one the office knows.
    it('makes the first sign-in change the password', async () => {
      await service.create(teacher as never);
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
      await service.create(teacher as never);
      expect(prisma.user.create.mock.calls[0][0].data.code).toMatch(
        /^TCH-\d{4}-042$/,
      );
    });

    it('starts at one for the first of a role in a year', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await service.create(teacher as never);
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
      prisma.user.update.mockResolvedValue({ photoUrl: '/uploads/photos/a.png' });
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
      await service.findAll({ search: 'Divine Senior' } as never);
      const and = prisma.user.findMany.mock.calls[0][0].where.AND;
      expect(and).toHaveLength(2);
    });

    // A lone letter is an initial. Matching it inside every name would return
    // most of the school.
    it('treats a single letter as an initial rather than a substring', async () => {
      await service.findAll({ search: 'D' } as never);
      const or = prisma.user.findMany.mock.calls[0][0].where.AND[0].OR;
      const names = JSON.stringify(or);
      expect(names).toContain('startsWith');
      expect(names).not.toContain('"contains":"D"');
    });

    // "NIT" scoped to class must not drag in Anitha by her name.
    it('pins the search to one field group when a scope is given', async () => {
      await service.findAll({ search: 'NIT', searchIn: 'class' } as never);
      const or = JSON.stringify(
        prisma.user.findMany.mock.calls[0][0].where.AND[0].OR,
      );
      expect(or).toContain('classSection');
      expect(or).not.toContain('firstName');
    });

    it('reads a lone digit as a year level', async () => {
      await service.findAll({ search: '5' } as never);
      const or = JSON.stringify(
        prisma.user.findMany.mock.calls[0][0].where.AND[0].OR,
      );
      expect(or).toContain('classLevel');
    });

    it('pages', async () => {
      prisma.user.count.mockResolvedValue(45);
      const result = await service.findAll({ page: 3, limit: 20 } as never);
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
      await service.update('user-1', { firstName: 'Aline' } as never);
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
      await service.update('user-1', { classSectionId: 'section-2' } as never);
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
      await service.update('user-1', { allergies: '' } as never);
      expect(prisma.student.update.mock.calls[0][0].data.allergies).toBe('');
    });

    it('deactivates an account through the same route', async () => {
      asTeacher();
      await service.update('user-1', { isActive: false } as never);
      expect(prisma.user.update.mock.calls[0][0].data.isActive).toBe(false);
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
  });
});