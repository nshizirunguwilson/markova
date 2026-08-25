import { inflateRawSync } from 'zlib';
import { BadRequestException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

/**
 * Taking the data out.
 *
 * This is the promise that a school owns its own records and is not locked
 * into this system. Two things make it worth having: it must not carry
 * password hashes out into a spreadsheet a bursar emails around, and it must
 * name things a person can read rather than the ids the database uses.
 */
describe('the full export', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ReportsService(prisma);
    // Every table in the export answers with nothing unless a test says
    // otherwise, so a new table added to the code shows up as an empty file
    // rather than as a crash.
    for (const model of Object.values(prisma as Record<string, any>)) {
      if (model && typeof model === 'object' && model.findMany) {
        model.findMany.mockResolvedValue([]);
      }
    }
  });

  /**
   * Reads the archive back out.
   *
   * The entries are deflated, so searching the raw bytes for a password hash
   * would pass whether or not the hash was in there. This walks the local
   * file headers and inflates each one, which is the only way the assertions
   * below mean anything.
   */
  const unzip = (zip: Buffer): Record<string, string> => {
    const files: Record<string, string> = {};
    let offset = 0;
    while (
      offset + 4 <= zip.length &&
      zip.readUInt32LE(offset) === 0x04034b50
    ) {
      const method = zip.readUInt16LE(offset + 8);
      const compressedSize = zip.readUInt32LE(offset + 18);
      const nameLength = zip.readUInt16LE(offset + 26);
      const extraLength = zip.readUInt16LE(offset + 28);
      const nameStart = offset + 30;
      const name = zip.toString('utf8', nameStart, nameStart + nameLength);
      const dataStart = nameStart + nameLength + extraLength;
      const data = zip.subarray(dataStart, dataStart + compressedSize);
      files[name] =
        method === 8
          ? inflateRawSync(data).toString('utf8')
          : data.toString('utf8');
      offset = dataStart + compressedSize;
    }
    return files;
  };

  /** Everything in the archive, as one searchable string. */
  const allText = (zip: Buffer) => Object.values(unzip(zip)).join('\n');

  it('bundles a file per table', async () => {
    const zip = await service.exportEverythingZip();
    const contents = Object.keys(unzip(zip));
    for (const table of [
      'users.csv',
      'students.csv',
      'teachers.csv',
      'terms.csv',
      'class_sections.csv',
      'subjects.csv',
      'school_config.csv',
    ]) {
      expect(contents).toContain(table);
    }
  });

  it('includes a manifest of what is inside', async () => {
    const zip = await service.exportEverythingZip();
    const manifest = unzip(zip)['manifest.csv'];
    expect(manifest).toBeDefined();
    expect(manifest).toContain('exportedAt');
    expect(manifest).toContain('users');
  });

  /**
   * The export lands in a spreadsheet somebody will email. A password hash in
   * it is an offline cracking exercise handed to whoever receives it.
   */
  it('strips the password hash out of the user table', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'u-1',
        firstName: 'Divine',
        email: 'd@markova.edu',
        passwordHash: '$2b$10$averyrealbcrypthash',
      },
    ]);
    const zip = await service.exportEverythingZip();
    const contents = allText(zip);
    expect(contents).toContain('Divine');
    expect(contents).not.toContain('averyrealbcrypthash');
    expect(contents).not.toContain('passwordHash');
  });

  it('keeps the rest of the user row', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u-1', firstName: 'Divine', passwordHash: 'x' },
    ]);
    const zip = await service.exportEverythingZip();
    expect(unzip(zip)['users.csv']).toContain('Divine');
  });

  it('produces a real zip', async () => {
    const zip = await service.exportEverythingZip();
    expect(Buffer.isBuffer(zip)).toBe(true);
    // Local file header. Anything else is not a file a person can open.
    expect(zip.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });
});

describe('one dataset as a CSV', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  const user = {
    id: 'u-1',
    firstName: 'Divine',
    lastName: 'Niyonkuru',
    email: 'd.niyonkuru@markova.edu',
    phone: null,
    role: 'STUDENT',
    isActive: true,
    student: {
      studentIdNumber: 'STD-2026-001',
      status: 'ACTIVE',
      classSection: {
        name: 'A',
        classLevel: { name: 'Senior 1' },
        trade: { code: 'SWD' },
      },
    },
  };

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ReportsService(prisma);
    prisma.user.findMany.mockResolvedValue([user]);
    prisma.mark.findMany.mockResolvedValue([]);
    prisma.attendance.findMany.mockResolvedValue([]);
    prisma.student.findMany.mockResolvedValue([]);
    prisma.subject.findMany.mockResolvedValue([]);
    prisma.assessmentType.findMany.mockResolvedValue([]);
    prisma.term.findMany.mockResolvedValue([]);
  });

  it('refuses a dataset it does not know, and says which it does', async () => {
    await expect(service.exportDatasetCsv('nonsense')).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.exportDatasetCsv('nonsense')).rejects.toThrow(
      /users, students, teachers, marks, attendance/,
    );
  });

  it('names the file for the dataset and the day', async () => {
    const { filename } = await service.exportDatasetCsv('users');
    expect(filename).toMatch(/^users_export_\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('writes a header row a person can read', async () => {
    const { csv } = await service.exportDatasetCsv('users');
    const [header] = csv.split('\n');
    expect(header).toContain('firstName');
    expect(header).toContain('studentId');
    expect(header).toContain('class');
  });

  /**
   * A raw foreign key is useless in a spreadsheet. The class has to arrive as
   * "Senior 1 SWD A", not as a uuid.
   */
  it('spells the class out rather than exporting its id', async () => {
    const { csv } = await service.exportDatasetCsv('users');
    expect(csv).toContain('Senior 1 SWD A');
  });

  it('writes an empty cell rather than the word undefined', async () => {
    prisma.user.findMany.mockResolvedValue([
      { ...user, email: null, phone: null, student: null },
    ]);
    const { csv } = await service.exportDatasetCsv('users');
    expect(csv).not.toContain('undefined');
    expect(csv).not.toContain('null');
  });

  it.each([
    ['students', 'STUDENT'],
    ['teachers', 'TEACHER'],
  ])('narrows %s to that role', async (dataset, role) => {
    await service.exportDatasetCsv(dataset);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role } }),
    );
  });

  it('exports every role when asked for users', async () => {
    await service.exportDatasetCsv('users');
    expect(prisma.user.findMany.mock.calls[0][0]).not.toHaveProperty('where');
  });

  /**
   * Marks and attendance are the two tables with hundreds of thousands of
   * rows. They are read flat and joined in memory, because a nested include
   * at that scale exhausts the process.
   */
  describe('the two big tables', () => {
    it('reads marks flat and resolves the names itself', async () => {
      prisma.mark.findMany.mockResolvedValue([
        {
          studentId: 'student-1',
          subjectId: 'subject-1',
          assessmentTypeId: 'assess-1',
          termId: 'term-1',
          score: 17,
          maxScore: 20,
        },
      ]);
      prisma.student.findMany.mockResolvedValue([
        {
          id: 'student-1',
          studentIdNumber: 'STD-2026-001',
          user: { firstName: 'Divine', lastName: 'Niyonkuru' },
        },
      ]);
      prisma.subject.findMany.mockResolvedValue([
        { id: 'subject-1', name: 'Mathematics' },
      ]);
      prisma.assessmentType.findMany.mockResolvedValue([
        { id: 'assess-1', name: 'CAT 1' },
      ]);
      prisma.term.findMany.mockResolvedValue([
        { id: 'term-1', name: 'Term 3' },
      ]);

      const { csv } = await service.exportDatasetCsv('marks');
      expect(csv).toContain('Divine');
      expect(csv).toContain('Mathematics');
      expect(csv).toContain('CAT 1');
      expect(csv).toContain('Term 3');
      // The ids themselves have no business in a spreadsheet.
      expect(csv).not.toContain('subject-1');
    });

    it('never asks the database to nest the joins for marks', async () => {
      await service.exportDatasetCsv('marks');
      expect(prisma.mark.findMany.mock.calls[0][0]).not.toHaveProperty(
        'include',
      );
    });

    it('reads attendance flat too', async () => {
      prisma.attendance.findMany.mockResolvedValue([
        {
          studentId: 'student-1',
          date: new Date('2026-08-20'),
          status: 'PRESENT',
        },
      ]);
      prisma.student.findMany.mockResolvedValue([
        {
          id: 'student-1',
          studentIdNumber: 'STD-2026-001',
          user: { firstName: 'Divine', lastName: 'Niyonkuru' },
        },
      ]);

      const { csv } = await service.exportDatasetCsv('attendance');
      expect(csv).toContain('Divine');
      expect(csv).toContain('PRESENT');
      expect(prisma.attendance.findMany.mock.calls[0][0]).not.toHaveProperty(
        'include',
      );
    });

    // A mark whose subject has since been deleted still belongs on the sheet;
    // dropping the row would make the export disagree with the database.
    it('keeps a row whose lookup came back empty', async () => {
      prisma.mark.findMany.mockResolvedValue([
        {
          studentId: 'gone',
          subjectId: 'gone',
          assessmentTypeId: 'gone',
          termId: 'gone',
          score: 17,
          maxScore: 20,
        },
      ]);
      const { csv } = await service.exportDatasetCsv('marks');
      expect(csv.split('\n').length).toBeGreaterThan(1);
    });
  });

  it('reads in the order things were created, so the file is stable', async () => {
    await service.exportDatasetCsv('users');
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'asc' } }),
    );
  });
});

/**
 * An attendance export whose students are no longer on the roll.
 *
 * The register is exported flat and the names are joined back afterwards, so
 * a student who has since left has a row with nothing to join to. The row
 * still belongs on the sheet — dropping it would make the export disagree with
 * the register it came from — but it must not carry the word undefined.
 */
describe('exporting a register for students who have left', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ReportsService(prisma);
    prisma.attendance.findMany.mockResolvedValue([
      {
        studentId: 'student-gone',
        date: new Date('2026-08-20'),
        status: 'ABSENT',
        reasonCategory: null,
      },
    ]);
  });

  it('keeps the row with the name column blank', async () => {
    prisma.student.findMany.mockResolvedValue([]);

    const { csv } = await service.exportDatasetCsv('attendance');
    expect(csv).toContain('ABSENT');
    expect(csv).not.toMatch(/undefined/);
  });

  it('leaves the student number blank too', async () => {
    prisma.student.findMany.mockResolvedValue([]);

    const { csv } = await service.exportDatasetCsv('attendance');
    const row = csv.trim().split('\n').pop() ?? '';
    // Two empty leading columns where the number and the name would be.
    expect(row.startsWith(',,') || row.startsWith('"",""')).toBe(true);
  });

  it('names a student whose record has no user behind it as blank', async () => {
    prisma.student.findMany.mockResolvedValue([
      { id: 'student-gone', studentIdNumber: 'STD-2026-001' },
    ]);

    const { csv } = await service.exportDatasetCsv('attendance');
    expect(csv).toContain('STD-2026-001');
    expect(csv).not.toMatch(/undefined/);
  });
});
