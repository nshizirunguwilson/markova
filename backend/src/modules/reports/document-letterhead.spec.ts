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
      const doc = await service.generateDocument('student-1', 'transfer_letter');
      expect(doc.html).toMatch(/class="crest-img"/);
      expect(doc.html).not.toMatch(/class="crest"/);
    });

    it('prints the motto', async () => {
      const doc = await service.generateDocument('student-1', 'transfer_letter');
      expect(doc.html).toMatch(/Learn, and lift others/);
    });

    it('prints the address, phone, email and website on one line', async () => {
      const doc = await service.generateDocument('student-1', 'transfer_letter');
      expect(doc.html).toMatch(/KG 11 Ave, Kigali/);
      expect(doc.html).toMatch(/\+250788000001/);
      expect(doc.html).toMatch(/info@markova\.edu/);
      expect(doc.html).toMatch(/markova\.edu/);
    });

    it('prints the head teacher signature and the school stamp', async () => {
      const doc = await service.generateDocument('student-1', 'transfer_letter');
      expect(doc.html).toMatch(/class="sig-img"/);
      expect(doc.html).toMatch(/class="stamp-img"/);
    });

    it('names the school and its website in the footer', async () => {
      const doc = await service.generateDocument('student-1', 'transfer_letter');
      expect(doc.html).toMatch(/Issued by Markova TSS/);
    });

    it('carries the student number as the reference', async () => {
      const doc = await service.generateDocument('student-1', 'transfer_letter');
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
      const doc = await service.generateDocument('student-1', 'transfer_letter');
      expect(doc.html).toMatch(/class="crest">MA</);
    });

    it('leaves out the motto rather than printing an empty line', async () => {
      const doc = await service.generateDocument('student-1', 'transfer_letter');
      expect(doc.html).not.toMatch(/class="motto"/);
    });

    it('leaves out the contact line', async () => {
      const doc = await service.generateDocument('student-1', 'transfer_letter');
      expect(doc.html).not.toMatch(/class="addr"/);
    });

    it('leaves the signature and stamp out but keeps the sign-off', async () => {
      const doc = await service.generateDocument('student-1', 'transfer_letter');
      expect(doc.html).not.toMatch(/class="sig-img"/);
      expect(doc.html).not.toMatch(/class="stamp-img"/);
      expect(doc.html).toMatch(/Head Teacher/);
    });

    it('names the school in the footer with no website beside it', async () => {
      const doc = await service.generateDocument('student-1', 'transfer_letter');
      expect(doc.html).toMatch(/Issued by Markova TSS/);
      expect(doc.html).not.toMatch(/Issued by Markova TSS &nbsp;/);
    });

    it('falls back to an S when the school has no name either', async () => {
      prisma.schoolConfig.findMany.mockResolvedValue([]);
      const doc = await service.generateDocument('student-1', 'transfer_letter');
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
      expect(doc.html).toMatch(/is currently enrolled/);
      expect(doc.html).not.toMatch(/N\/A/);
    });

    it('says so when there is no enrolment date on file', async () => {
      prisma.student.findUnique.mockResolvedValue({
        ...student,
        enrollmentDate: null,
      });

      const doc = await service.generateDocument(
        'student-1',
        'enrollment_confirmation',
      );
      expect(doc.html).toMatch(/N\/A/);
    });

    it('lowercases the status on the details table', async () => {
      const doc = await service.generateDocument('student-1', 'transfer_letter');
      expect(doc.html).toMatch(/<td>active<\/td>/);
    });

    it('leaves the status blank when there is none', async () => {
      prisma.student.findUnique.mockResolvedValue({
        ...student,
        status: null,
      });

      const doc = await service.generateDocument('student-1', 'transfer_letter');
      expect(doc.html).toMatch(/<html/i);
      expect(doc.html).not.toMatch(/undefined|null<\/td>/);
    });
  });
});
