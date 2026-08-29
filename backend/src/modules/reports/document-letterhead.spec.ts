import { ReportsService } from './reports.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

/**
 * The letterhead every official document is printed on.
 *
 * A transfer letter is what a Rwandan school hands a family on the day their
 * child leaves, and the next school reads it. So it carries the school's own
 * identity: crest, motto, address, phone, email, website, the head teacher's
 * signature and the school stamp. Every one of those is optional in the
 * config, which means every one of them is a branch, and a school that has
 * filled none of them in must still get a printable page.
 */

const logoDataUri = jest.fn();

jest.mock('../../common/html', () => {
  const actual = jest.requireActual('../../common/html');
  return {
    ...actual,
    logoDataUri: (...args: unknown[]) => logoDataUri(...args),
  };
});

describe('the letterhead on an official document', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  const student = {
    id: 'student-1',
    studentIdNumber: 'STD-2026-001',
    status: 'ACTIVE',
    enrollmentDate: new Date('2026-01-15'),
    dateOfBirth: new Date('2010-03-04'),
    gender: 'MALE',
    disciplinePoints: 96,
    user: {
      firstName: 'Divine',
      lastName: 'Niyonkuru',
      email: 'd.niyonkuru@markova.edu',
      phone: '+250788100000',
    },
    classSection: {
      name: 'A',
      classLevel: { name: 'Senior 1' },
      trade: null,
    },
  };

  /** The whole school identity, as a fully set-up school has it. */
  const fullBranding = [
    { key: 'school_name', value: 'Markova TSS' },
    { key: 'school_motto', value: 'Learn, and lift others' },
    { key: 'school_address', value: 'KG 11 Ave, Kigali' },
    { key: 'school_phone', value: '+250788000001' },
    { key: 'school_email', value: 'info@markova.edu' },
    { key: 'school_website', value: 'markova.edu' },
    { key: 'primary_color', value: '#1B4F72' },
    { key: 'logo_url', value: '/uploads/branding/logo.png' },
    { key: 'stamp_url', value: '/uploads/branding/stamp.png' },
    { key: 'signature_url', value: '/uploads/branding/signature.png' },
    { key: 'head_teacher_name', value: 'Aline Uwase' },
    { key: 'registration_number', value: 'REB/2015/0142' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    service = new ReportsService(prisma);
    prisma.student.findUnique.mockResolvedValue(student);
    prisma.disciplineIncident.findMany.mockResolvedValue([]);
    prisma.termResult.findMany.mockResolvedValue([]);
  });

  describe('a school that has filled everything in', () => {
    beforeEach(() => {
      prisma.schoolConfig.findMany.mockResolvedValue(fullBranding);
      logoDataUri.mockReturnValue('data:image/png;base64,AAAA');
    });

    it('prints the crest rather than the initials', async () => {
      const doc = await service.generateDocument(
        'student-1',
        'transfer_letter',
      );
      expect(doc.html).toMatch(/class="crest-img"/);
      expect(doc.html).not.toMatch(/class="crest"/);
    });

    it('prints the motto', async () => {
      const doc = await service.generateDocument(
        'student-1',
        'transfer_letter',
      );
      expect(doc.html).toMatch(/Learn, and lift others/);
    });

    it('prints the address, phone, email and website on one line', async () => {
      const doc = await service.generateDocument(
        'student-1',
        'transfer_letter',
      );
      expect(doc.html).toMatch(/KG 11 Ave, Kigali/);
      expect(doc.html).toMatch(/\+250788000001/);
      expect(doc.html).toMatch(/info@markova\.edu/);
      expect(doc.html).toMatch(/markova\.edu/);
    });

    it('prints the head teacher signature and the school stamp', async () => {
      const doc = await service.generateDocument(
        'student-1',
        'transfer_letter',
      );
      expect(doc.html).toMatch(/class="sig-img"/);
      expect(doc.html).toMatch(/class="stamp-img"/);
    });

    // The letter is signed by a named head teacher, not by "Head Teacher"
    // alone, and the school's registration number belongs on the letterhead
    // because that is what a receiving school checks it against.
    it("signs it in the head teacher's own name", async () => {
      const doc = await service.generateDocument(
        'student-1',
        'transfer_letter',
      );
      expect(doc.html).toMatch(/Aline Uwase/);
      expect(doc.html).toMatch(/Head Teacher, Markova TSS/);
    });

    it('prints the registration number on the letterhead', async () => {
      const doc = await service.generateDocument(
        'student-1',
        'transfer_letter',
      );
      expect(doc.html).toMatch(/Registration No\. REB\/2015\/0142/);
    });

    // Addressed, headed and signed off. Without these it reads as a form.
    it('addresses, heads and signs off like a letter', async () => {
      const doc = await service.generateDocument(
        'student-1',
        'transfer_letter',
      );
      expect(doc.html).toMatch(/THE HEAD TEACHER/);
      expect(doc.html).toMatch(/RE: Transfer Letter/);
      expect(doc.html).toMatch(/Dear Sir \/ Madam,/);
      expect(doc.html).toMatch(/Yours faithfully,/);
    });

    it('quotes the reference in the footer', async () => {
      const doc = await service.generateDocument(
        'student-1',
        'transfer_letter',
      );
      expect(doc.html).toMatch(/Ref: STD-2026-001/);
      expect(doc.html).toMatch(/Issued /);
    });

    it('carries the student number as the reference', async () => {
      const doc = await service.generateDocument(
        'student-1',
        'transfer_letter',
      );
      expect(doc.html).toMatch(/STD-2026-001/);
    });
  });

  describe('a school on its first day', () => {
    beforeEach(() => {
      prisma.schoolConfig.findMany.mockResolvedValue([
        { key: 'school_name', value: 'Markova TSS' },
      ]);
      // Nothing uploaded, and no bundled fallback available either.
      logoDataUri.mockReturnValue(null);
    });

    it('draws the school initials where the crest would be', async () => {
      const doc = await service.generateDocument(
        'student-1',
        'transfer_letter',
      );
      expect(doc.html).toMatch(/class="crest">MA</);
    });

    it('leaves out the motto rather than printing an empty line', async () => {
      const doc = await service.generateDocument(
        'student-1',
        'transfer_letter',
      );
      expect(doc.html).not.toMatch(/class="motto"/);
    });

    it('leaves out the contact line', async () => {
      const doc = await service.generateDocument(
        'student-1',
        'transfer_letter',
      );
      expect(doc.html).not.toMatch(/class="addr"/);
    });

    it('leaves the signature and stamp out but keeps the sign-off', async () => {
      const doc = await service.generateDocument(
        'student-1',
        'transfer_letter',
      );
      expect(doc.html).not.toMatch(/class="sig-img"/);
      expect(doc.html).not.toMatch(/class="stamp-img"/);
      expect(doc.html).toMatch(/Head Teacher/);
    });

    it('leaves the website off the footer when there is none', async () => {
      const doc = await service.generateDocument(
        'student-1',
        'transfer_letter',
      );
      expect(doc.html).toMatch(/Issued /);
      expect(doc.html).not.toMatch(/·&nbsp; https/);
    });

    // A school with no stamp uploaded still needs somewhere to put the wet
    // one. Before this, an empty stamp slot fell back to the house logo, so
    // the letter went out with Markova's mark where the school's seal belongs.
    it('rules a place for the wet stamp rather than borrowing a logo', async () => {
      const doc = await service.generateDocument(
        'student-1',
        'transfer_letter',
      );
      expect(doc.html).toMatch(/class="stamp-placeholder"/);
    });

    it('leaves the head teacher line blank rather than printing undefined', async () => {
      const doc = await service.generateDocument(
        'student-1',
        'transfer_letter',
      );
      expect(doc.html).toMatch(/class="sign-name">&nbsp;</);
      expect(doc.html).not.toMatch(/undefined/);
    });

    it('falls back to an S when the school has no name either', async () => {
      prisma.schoolConfig.findMany.mockResolvedValue([]);
      const doc = await service.generateDocument(
        'student-1',
        'transfer_letter',
      );
      expect(doc.html).toMatch(/class="crest">S</);
    });
  });

  describe('the other documents a school issues', () => {
    beforeEach(() => {
      prisma.schoolConfig.findMany.mockResolvedValue(fullBranding);
      logoDataUri.mockReturnValue('data:image/png;base64,AAAA');
    });

    it('dates an enrolment confirmation from the enrolment', async () => {
      const doc = await service.generateDocument(
        'student-1',
        'enrollment_confirmation',
      );
      expect(doc.html).toMatch(/currently enrolled/);
      expect(doc.html).toMatch(/15 January 2026/);
    });

    // Reads as a sentence either way. The old version printed a literal "N/A"
    // mid-paragraph, which is a form's answer, not a letter's.
    it('simply omits the admission date when there is none on file', async () => {
      prisma.student.findUnique.mockResolvedValue({
        ...student,
        enrollmentDate: null,
      });

      const doc = await service.generateDocument(
        'student-1',
        'enrollment_confirmation',
      );
      expect(doc.html).toMatch(/currently enrolled/);
      expect(doc.html).not.toMatch(/N\/A/);
      expect(doc.html).not.toMatch(/admitted on ,/);
    });

    /**
     * A transfer letter is read by the school taking the child in, so it has
     * to answer what they will ask: who this is, how long they were here, what
     * class they leave from, how they behaved, and whether anything is
     * outstanding. It used to be one sentence and a four-cell table.
     */
    it('says everything a receiving school needs to admit the child', async () => {
      const doc = await service.generateDocument(
        'student-1',
        'transfer_letter',
      );
      expect(doc.html).toMatch(/Divine Niyonkuru/);
      expect(doc.html).toMatch(/STD-2026-001/);
      expect(doc.html).toMatch(/Senior 1 A/);
      expect(doc.html).toMatch(/conduct/i);
      expect(doc.html).toMatch(/financial obligation to this school/i);
    });

    it('states the particulars in prose rather than a grid', async () => {
      const doc = await service.generateDocument(
        'student-1',
        'transfer_letter',
      );
      expect(doc.html).not.toMatch(/<th>Student number<\/th>/);
    });

    it('prints a letter for a student whose record is half empty', async () => {
      prisma.student.findUnique.mockResolvedValue({
        ...student,
        status: null,
        dateOfBirth: null,
        gender: null,
        disciplinePoints: null,
      });

      const doc = await service.generateDocument(
        'student-1',
        'transfer_letter',
      );
      expect(doc.html).toMatch(/<html/i);
      expect(doc.html).not.toMatch(/undefined|null</);
    });
  });
});

/**
 * The transcript, which is the document a university asks for.
 *
 * It is a table of every published term result, and a student who has just
 * arrived has none. Printing an empty table would read as a school that lost
 * their records rather than one they have only just joined.
 */
describe('a transcript', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  const student = {
    id: 'student-1',
    studentIdNumber: 'STD-2026-001',
    status: 'ACTIVE',
    enrollmentDate: new Date('2026-01-15'),
    user: {
      firstName: 'Divine',
      lastName: 'Niyonkuru',
      email: 'd.niyonkuru@markova.edu',
      phone: '+250788100000',
    },
    classSection: { name: 'A', classLevel: { name: 'Senior 1' }, trade: null },
  };

  const result = (over: Record<string, unknown> = {}) => ({
    average: 78.4,
    letterGrade: 'B',
    rank: 4,
    term: { name: 'Term 1', academicYear: { name: '2026' } },
    ...over,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    service = new ReportsService(prisma);
    prisma.student.findUnique.mockResolvedValue(student);
    prisma.disciplineIncident.findMany.mockResolvedValue([]);
    prisma.schoolConfig.findMany.mockResolvedValue([
      { key: 'school_name', value: 'Markova TSS' },
    ]);
    logoDataUri.mockReturnValue(null);
  });

  it('lists a row per published term', async () => {
    prisma.termResult.findMany.mockResolvedValue([
      result(),
      result({
        average: 81,
        letterGrade: 'A',
        rank: 2,
        term: { name: 'Term 2', academicYear: { name: '2026' } },
      }),
    ]);

    const doc = await service.generateDocument('student-1', 'transcript');
    expect(doc.html).toMatch(/Term 1/);
    expect(doc.html).toMatch(/Term 2/);
    expect(doc.html).toMatch(/78\.4%/);
    expect(doc.html).toMatch(/2 assessed terms/);
  });

  it('says so when nothing has been published yet', async () => {
    prisma.termResult.findMany.mockResolvedValue([]);

    const doc = await service.generateDocument('student-1', 'transcript');
    expect(doc.html).toMatch(/No results have been published/);
  });

  // A term closed before the marks were finished carries no numbers at all.
  it('draws a dash for a term with no figures on it', async () => {
    prisma.termResult.findMany.mockResolvedValue([
      result({ average: null, letterGrade: null, rank: null }),
    ]);

    const doc = await service.generateDocument('student-1', 'transcript');
    expect(doc.html).toMatch(/>-</);
    expect(doc.html).not.toMatch(/undefined|null<\/td>/);
  });

  it('draws a dash for a grade recorded as an empty string', async () => {
    prisma.termResult.findMany.mockResolvedValue([result({ letterGrade: '' })]);

    const doc = await service.generateDocument('student-1', 'transcript');
    expect(doc.html).toMatch(/>-</);
  });
});

/**
 * A discipline report for a student who has never been in trouble.
 *
 * It is the commonest case, and the one a family asks for when they are
 * applying somewhere. An empty table would look like a missing record.
 */
describe('a discipline report', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  const student = {
    id: 'student-1',
    studentIdNumber: 'STD-2026-001',
    status: 'ACTIVE',
    enrollmentDate: new Date('2026-01-15'),
    disciplinePoints: 100,
    user: {
      firstName: 'Divine',
      lastName: 'Niyonkuru',
      email: null,
      phone: null,
    },
    classSection: { name: 'A', classLevel: { name: 'Senior 1' }, trade: null },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    service = new ReportsService(prisma);
    prisma.student.findUnique.mockResolvedValue(student);
    prisma.termResult.findMany.mockResolvedValue([]);
    prisma.schoolConfig.findMany.mockResolvedValue([
      { key: 'school_name', value: 'Markova TSS' },
    ]);
    logoDataUri.mockReturnValue(null);
  });

  it('says so when there is nothing on the record', async () => {
    prisma.disciplineIncident.findMany.mockResolvedValue([]);

    const doc = await service.generateDocument(
      'student-1',
      'discipline_report',
    );
    expect(doc.html).toMatch(/<html/i);
    expect(doc.html).not.toMatch(/undefined/);
  });

  it('lists an incident with what it cost', async () => {
    prisma.disciplineIncident.findMany.mockResolvedValue([
      {
        date: new Date('2026-05-02'),
        description: 'Late to assembly',
        pointsDeducted: 5,
        actionTaken: 'VERBAL_WARNING',
        recordedBy: { firstName: 'Aline', lastName: 'Uwase' },
      },
    ]);

    const doc = await service.generateDocument(
      'student-1',
      'discipline_report',
    );
    expect(doc.html).toMatch(/Late to assembly/);
    expect(doc.html).toMatch(/5/);
  });
});
