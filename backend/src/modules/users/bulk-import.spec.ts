import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

/**
 * Importing a school.
 *
 * This is how a school's first thousand accounts get made, from a spreadsheet
 * somebody typed. Two things make it safe to run: the whole import is one
 * transaction, so a bad row on line 400 leaves no half-imported school behind
 * it, and every account gets its own generated password returned once so the
 * office can hand them out.
 */
describe('bulk import', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: UsersService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new UsersService(prisma);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockImplementation((args: any) =>
      Promise.resolve({
        id: `user-${args.data.firstName}`,
        firstName: args.data.firstName,
        lastName: args.data.lastName,
      }),
    );
    prisma.student.findUnique.mockResolvedValue(null);
    prisma.student.create.mockResolvedValue({});
    prisma.teacher.create.mockResolvedValue({});
    prisma.parentStudent.create.mockResolvedValue({});
  });

  const student = {
    firstName: 'Divine',
    lastName: 'Niyonkuru',
    email: 'd.niyonkuru@markova.edu',
    role: Role.STUDENT,
    classSectionId: 'section-1',
  };

  it('imports every good row', async () => {
    const result = await service.bulkImport([
      student,
      { ...student, firstName: 'Keza', email: 'k@markova.edu' },
    ]);
    expect(result.created).toBe(2);
  });

  /**
   * One transaction. A spreadsheet that fails on row 400 must leave nothing
   * behind, or the second attempt trips over the 399 accounts the first one
   * managed to make.
   */
  it('imports the whole spreadsheet in one transaction', async () => {
    await service.bulkImport([student]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('stops on a duplicate email and names the row', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(service.bulkImport([student])).rejects.toThrow(
      /^Row 1: Email d.niyonkuru@markova.edu already exists$/,
    );
  });

  it('stops on a duplicate phone and names the row', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(
      service.bulkImport([
        { ...student, email: undefined, phone: '+250788100000' },
      ]),
    ).rejects.toThrow(/^Row 1: Phone \+250788100000 already exists$/);
  });

  it('names the row that failed, not the first one', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing' });
    await expect(
      service.bulkImport([student, { ...student, email: 'taken@markova.edu' }]),
    ).rejects.toThrow(/^Row 2:/);
  });

  it('refuses a student row with no class', async () => {
    await expect(
      service.bulkImport([{ ...student, classSectionId: undefined }]),
    ).rejects.toThrow(/Row 1: classSectionId required/);
  });

  /**
   * Every account gets its own password, returned once. A shared default
   * would be on a WhatsApp group by lunchtime.
   */
  describe('the passwords it hands back', () => {
    it('returns one per person, with what they sign in with', async () => {
      const result = await service.bulkImport([student]);
      expect(result.credentials).toHaveLength(1);
      expect(result.credentials[0]).toMatchObject({
        name: 'Divine Niyonkuru',
        login: 'd.niyonkuru@markova.edu',
      });
      expect(result.credentials[0].password).toHaveLength(10);
    });

    it('gives a different password to each person', async () => {
      const result = await service.bulkImport(
        Array.from({ length: 30 }, (_, i) => ({
          ...student,
          firstName: `Student${i}`,
          email: `s${i}@markova.edu`,
        })),
      );
      const passwords = new Set(result.credentials.map((c) => c.password));
      expect(passwords.size).toBe(30);
    }, 30000);

    /**
     * The generated password has to pass the school's own complexity rule, or
     * the account it was made for cannot be signed into.
     */
    it('always carries an upper, a lower, a digit and a symbol', async () => {
      const result = await service.bulkImport(
        Array.from({ length: 40 }, (_, i) => ({
          ...student,
          firstName: `Student${i}`,
          email: `s${i}@markova.edu`,
        })),
      );
      for (const { password } of result.credentials) {
        expect(password).toMatch(/[a-z]/);
        expect(password).toMatch(/[A-Z]/);
        expect(password).toMatch(/\d/);
        expect(password).toMatch(/[!@#$%&*]/);
      }
    }, 30000);

    // A password read aloud from a printout should not turn on whether that
    // was an l or a 1.
    it('leaves out the characters people confuse when reading aloud', async () => {
      const result = await service.bulkImport(
        Array.from({ length: 40 }, (_, i) => ({
          ...student,
          firstName: `Student${i}`,
          email: `s${i}@markova.edu`,
        })),
      );
      for (const { password } of result.credentials) {
        expect(password).not.toMatch(/[ilIO01]/);
      }
    }, 30000);

    it('shows a parent’s phone as their login, since that is what they use', async () => {
      const result = await service.bulkImport([
        {
          firstName: 'Claudine',
          lastName: 'Mukamana',
          phone: '+250788100000',
          role: Role.PARENT,
        },
      ]);
      expect(result.credentials[0].login).toBe('+250788100000');
    });

    it('makes every imported account change its password on first use', async () => {
      await service.bulkImport([student]);
      expect(prisma.user.create.mock.calls[0][0].data.forcePasswordChange).toBe(
        true,
      );
    });
  });

  describe('the role record behind each account', () => {
    it('creates a student record with a student number', async () => {
      await service.bulkImport([student]);
      const data = prisma.student.create.mock.calls[0][0].data;
      expect(data.studentIdNumber).toMatch(/^STD-\d{4}-\d{6}-\d{3}$/);
      expect(data.classSectionId).toBe('section-1');
      // Forty a term, not a hundred for the year - see common/conduct.ts.
      expect(data.disciplinePoints).toBe(40);
    });

    it('creates a teacher record', async () => {
      await service.bulkImport([
        {
          firstName: 'Aline',
          lastName: 'Uwase',
          email: 'a@markova.edu',
          role: Role.TEACHER,
          qualification: 'A0',
        },
      ]);
      expect(prisma.teacher.create.mock.calls[0][0].data).toMatchObject({
        qualification: 'A0',
        employmentStatus: 'FULL_TIME',
        isActive: true,
      });
    });

    it('links a parent to each child named', async () => {
      await service.bulkImport([
        {
          firstName: 'Claudine',
          lastName: 'Mukamana',
          phone: '+250788100000',
          role: Role.PARENT,
          studentIds: ['student-1', 'student-2'],
          relationship: 'Mother',
        },
      ]);
      expect(prisma.parentStudent.create).toHaveBeenCalledTimes(2);
      expect(prisma.parentStudent.create.mock.calls[0][0].data).toMatchObject({
        relationship: 'Mother',
      });
    });

    it('calls the link "Parent" when the sheet did not say', async () => {
      await service.bulkImport([
        {
          firstName: 'Claudine',
          lastName: 'Mukamana',
          phone: '+250788100000',
          role: Role.PARENT,
          studentIds: ['student-1'],
        },
      ]);
      expect(
        prisma.parentStudent.create.mock.calls[0][0].data.relationship,
      ).toBe('Parent');
    });

    it('imports a parent with no children named yet', async () => {
      await service.bulkImport([
        {
          firstName: 'Claudine',
          lastName: 'Mukamana',
          phone: '+250788100000',
          role: Role.PARENT,
        },
      ]);
      expect(prisma.parentStudent.create).not.toHaveBeenCalled();
    });

    // A NIDA number is written with spaces on the card and typed that way
    // into a spreadsheet, but stored without them.
    it('strips the spaces out of a national ID', async () => {
      await service.bulkImport([
        { ...student, nationalId: '1 1990 7 8012345 67 8' },
      ]);
      expect(prisma.user.create.mock.calls[0][0].data.nationalId).toBe(
        '11990780123456 78'.replace(/\s+/g, ''),
      );
    });

    it('reads the boarding column as a real yes or no', async () => {
      await service.bulkImport([
        { ...student, isBoarder: 'TRUE' },
        {
          ...student,
          firstName: 'Keza',
          email: 'k@markova.edu',
          isBoarder: 'no',
        },
      ]);
      expect(prisma.student.create.mock.calls[0][0].data.isBoarder).toBe(true);
      expect(prisma.student.create.mock.calls[1][0].data.isBoarder).toBe(false);
    });

    it('carries the five-level Rwandan address through', async () => {
      await service.bulkImport([
        {
          ...student,
          province: 'Kigali City',
          district: 'Gasabo',
          sector: 'Kimironko',
          cell: 'Bibare',
          village: 'Amajyambere',
        },
      ]);
      expect(prisma.student.create.mock.calls[0][0].data).toMatchObject({
        province: 'Kigali City',
        district: 'Gasabo',
        sector: 'Kimironko',
        cell: 'Bibare',
        village: 'Amajyambere',
      });
    });
  });
});

/**
 * The template a school downloads before filling anything in. It is the only
 * documentation most people will read, so the columns have to be the ones the
 * importer actually accepts.
 */
describe('the import template', () => {
  const service = new UsersService(createMockPrisma());

  it.each([
    [Role.STUDENT, ['firstName', 'classSectionId', 'province', 'isBoarder']],
    [Role.TEACHER, ['firstName', 'qualification', 'rssbNumber', 'hireDate']],
    [Role.PARENT, ['phone', 'studentIds', 'relationship']],
    [Role.ADMIN, ['email', 'phone', 'nationalId']],
    [Role.LIBRARIAN, ['email', 'phone', 'nationalId']],
  ])('gives a %s the columns it needs', (role, columns) => {
    const header = service.getImportTemplate(role);
    for (const column of columns) {
      expect(header.split(',')).toContain(column);
    }
  });

  // A parent signs in by phone, so an email column would invite a school to
  // fill in the one field that will not let them in.
  it('offers a parent no email column', () => {
    expect(service.getImportTemplate(Role.PARENT).split(',')).not.toContain(
      'email',
    );
  });

  it('falls back to the student columns for anything unrecognised', () => {
    expect(service.getImportTemplate('NURSE')).toBe(
      service.getImportTemplate(Role.STUDENT),
    );
  });
});

/**
 * A spreadsheet with the optional columns filled in, and one with none.
 *
 * A school importing its whole roll on day one fills every column; a school
 * importing a handful of late admissions fills three. Both have to produce
 * accounts somebody can sign into, which is what the credentials list is for.
 */
describe('the optional columns on an imported row', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: UsersService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new UsersService(prisma);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockImplementation((args: any) =>
      Promise.resolve({
        id: `user-${args.data.firstName}`,
        firstName: args.data.firstName,
        lastName: args.data.lastName,
      }),
    );
    prisma.student.findUnique.mockResolvedValue(null);
    prisma.student.findFirst.mockResolvedValue(null);
    prisma.student.create.mockResolvedValue({});
    prisma.teacher.create.mockResolvedValue({});
    prisma.parentStudent.create.mockResolvedValue({});
  });

  it('reads a teacher birthday and hire date into dates', async () => {
    await service.bulkImport([
      {
        firstName: 'Aline',
        lastName: 'Uwase',
        email: 'a.uwase@markova.edu',
        role: Role.TEACHER,
        gender: 'FEMALE',
        dateOfBirth: '1971-03-07',
        qualification: 'A0',
        hireDate: '2019-01-14',
      },
    ]);

    expect(prisma.user.create.mock.calls[0][0].data.dateOfBirth).toBeInstanceOf(
      Date,
    );
    const teacher = prisma.teacher.create.mock.calls[0][0].data;
    expect(teacher.qualification).toBe('A0');
    expect(teacher.hireDate).toBeInstanceOf(Date);
  });

  it('stores nulls for a teacher row with only the required columns', async () => {
    await service.bulkImport([
      {
        firstName: 'Aline',
        lastName: 'Uwase',
        email: 'a.uwase@markova.edu',
        role: Role.TEACHER,
      },
    ]);

    expect(prisma.user.create.mock.calls[0][0].data.dateOfBirth).toBeNull();
    const teacher = prisma.teacher.create.mock.calls[0][0].data;
    expect(teacher.qualification).toBeNull();
    expect(teacher.hireDate).toBeNull();
  });

  it('reads a student birthday into a date on the student row', async () => {
    await service.bulkImport([
      {
        firstName: 'Divine',
        lastName: 'Niyonkuru',
        email: 'd.niyonkuru@markova.edu',
        role: Role.STUDENT,
        classSectionId: 'section-1',
        dateOfBirth: '2012-04-11',
      },
    ]);

    // A student's demographics live on the student row, not the account.
    expect(
      prisma.user.create.mock.calls[0][0].data.dateOfBirth,
    ).toBeUndefined();
    expect(
      prisma.student.create.mock.calls[0][0].data.dateOfBirth,
    ).toBeInstanceOf(Date);
  });

  it('stores null for a student row with no birthday', async () => {
    await service.bulkImport([
      {
        firstName: 'Divine',
        lastName: 'Niyonkuru',
        email: 'd.niyonkuru@markova.edu',
        role: Role.STUDENT,
        classSectionId: 'section-1',
      },
    ]);

    expect(prisma.student.create.mock.calls[0][0].data.dateOfBirth).toBeNull();
  });
});

/**
 * What a person signs in with, handed back after an import.
 *
 * The office prints this list and gives each person their line. A blank login
 * on it is an account nobody can reach, so it has to carry whichever
 * identifier the row actually had.
 */
describe('the login on the credentials list', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: UsersService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new UsersService(prisma);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockImplementation((args: any) =>
      Promise.resolve({
        id: `user-${args.data.firstName}`,
        firstName: args.data.firstName,
        lastName: args.data.lastName,
      }),
    );
    prisma.parentStudent.create.mockResolvedValue({});
  });

  it('is the email when the row carried one', async () => {
    const result = await service.bulkImport([
      {
        firstName: 'Aline',
        lastName: 'Uwase',
        email: 'a.uwase@markova.edu',
        role: Role.TEACHER,
      },
    ]);

    expect(result.credentials[0].login).toBe('a.uwase@markova.edu');
  });

  // The first fifteen parents in a Rwandan school's roll have no email at all.
  it('is the phone number when the row carried no email', async () => {
    const result = await service.bulkImport([
      {
        firstName: 'Jean',
        lastName: 'Habimana',
        phone: '+250788100000',
        role: Role.PARENT,
      },
    ]);

    expect(result.credentials[0].login).toBe('+250788100000');
  });
});
