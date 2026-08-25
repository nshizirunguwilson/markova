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
    nationalId: '1201382901978078',
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
      nationalId: '1201382901978078',
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
      disciplinePoints: 100,
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
