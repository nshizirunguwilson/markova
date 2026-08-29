import { ReportsService } from './reports.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

jest.mock('puppeteer-core', () => ({
  __esModule: true,
  default: { launch: jest.fn() },
}));

/*
  Each signature is read off disk and inlined, so the filesystem is stood in
  for rather than reached. The two files give back different bytes on purpose:
  the whole point of the arrangement is that the two marks are not the same
  mark, and a stub that returned one buffer for both would make that
  untestable.
*/
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  const stub: Record<string, string> = {
    'aline.png': 'ALINEINK',
    'speciose.png': 'SPECIOSEINK',
  };
  const nameOf = (p: string) => String(p).split('/').pop() ?? '';
  return {
    ...actual,
    existsSync: (p: string) =>
      nameOf(p) in stub ||
      (actual.existsSync as (x: unknown) => boolean)(p),
    readFileSync: (p: string, ...rest: unknown[]) =>
      nameOf(p) in stub
        ? Buffer.from(stub[nameOf(p)])
        : (actual.readFileSync as (...a: unknown[]) => Buffer)(p, ...rest),
  };
});

/**
 * Who signed the card.
 *
 * A report card carries two marks that mean different things: the class
 * teacher's, saying they taught this child and stand by what is written, and
 * the head teacher's, saying the school has read the sheet and issues it.
 *
 * So each comes off its own owner's profile. The school's own signature, held
 * in the branding settings, is right for a letter the school sends and wrong
 * here: one file shared between two names is the same hand under both, which
 * is precisely the thing a countersignature exists to prevent.
 */
describe('the signatures on a report card', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  const student = {
    id: 'student-1',
    studentIdNumber: 'STD-2026-001',
    classSectionId: 'section-1',
    gender: 'FEMALE',
    dateOfBirth: new Date('2010-04-02'),
    disciplinePoints: 92,
    user: { firstName: 'Divine', lastName: 'Niyonkuru', photoUrl: null },
    classSection: {
      name: 'A',
      classLevel: { name: 'Senior 1', stage: 'O_LEVEL' },
      trade: null,
    },
  };

  const classTeacher = (signatureUrl: string | null) => ({
    teacher: {
      user: { firstName: 'Aline', lastName: 'Uwase', signatureUrl },
    },
  });

  const head = (signatureUrl: string | null) => ({
    firstName: 'Speciose',
    lastName: 'Mukarugwiza',
    signatureUrl,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    service = new ReportsService(prisma as never);

    prisma.student.findUnique.mockResolvedValue(student);
    prisma.student.count.mockResolvedValue(30);
    prisma.term.findUnique.mockResolvedValue({
      id: 'term-1',
      name: 'Term 3',
      startDate: new Date('2026-04-01'),
      endDate: new Date('2026-07-01'),
      academicYearId: 'year-1',
      academicYear: { name: '2026-2027' },
    });
    prisma.subject.findMany.mockResolvedValue([]);
    prisma.mark.findMany.mockResolvedValue([]);
    prisma.termResult.findFirst.mockResolvedValue(null);
    prisma.termResult.findMany.mockResolvedValue([]);
    prisma.teacherRole.findFirst.mockResolvedValue(classTeacher(null));
    prisma.user.findFirst.mockResolvedValue(head(null));
    prisma.attendance.count.mockResolvedValue(60);
    prisma.schoolConfig.findMany.mockResolvedValue([
      { key: 'school_name', value: 'Markova TSS' },
    ]);
    prisma.reportVerification.findUnique.mockResolvedValue(null);
    prisma.disciplineIncident.aggregate.mockResolvedValue({
      _sum: { pointsDeducted: 0 },
    });
    prisma.meritAward.aggregate.mockResolvedValue({ _sum: { points: 0 } });
  });

  const card = () => service.generateTermReportHtml('student-1', 'term-1');

  it('names all three of the people a card is signed by', async () => {
    const html = await card();
    expect(html).toContain('Class Teacher');
    expect(html).toContain('Head Teacher');
    expect(html).toContain('Parent / Guardian');
  });

  it('names the head teacher under their own line', async () => {
    const html = await card();
    expect(html).toContain('Speciose Mukarugwiza');
    expect(html).toContain('Aline Uwase');
  });

  /** One post, so one holder, and a retired one does not sign anything. */
  it('looks for a head teacher who is still in post', async () => {
    await card();
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: 'HEAD_TEACHER', isActive: true },
      }),
    );
  });

  describe('when both have uploaded a signature', () => {
    beforeEach(() => {
      prisma.teacherRole.findFirst.mockResolvedValue(
        classTeacher('/uploads/signatures/aline.png'),
      );
      prisma.user.findFirst.mockResolvedValue(
        head('/uploads/signatures/speciose.png'),
      );
    });

    it('prints both marks', async () => {
      const html = await card();
      const inks = html.match(/class="ink"><img/g) ?? [];
      expect(inks).toHaveLength(2);
    });

    /*
      Inlined rather than linked, like every other image on the sheet: a
      remote fetch inside the PDF renderer is the worst moment to discover a
      file has moved.
    */
    it('carries no request out to fetch them', async () => {
      const html = await card();
      expect(html).not.toContain('src="/uploads/signatures/');
      expect(html).toContain('data:image/png;base64,');
    });

    /**
     * The point of the whole arrangement. Two people signing with one file
     * would be the same hand under both names, which is exactly what a
     * countersignature exists to prevent.
     */
    it('gives the two of them different marks', async () => {
      const html = await card();
      const found = [...html.matchAll(/<img src="(data:image\/[^"]+)"/g)].map(
        (m) => m[1],
      );
      const signatures = found.slice(-2);
      expect(signatures[0]).not.toBe(signatures[1]);
    });

    // A parent signs in ink, on paper, after reading it.
    it("leaves the parent's line empty", async () => {
      const html = await card();
      const parentBlock = html.slice(html.lastIndexOf('Parent / Guardian') - 200);
      expect(parentBlock).not.toContain('<img');
    });
  });

  /**
   * A card nobody has uploaded a signature for is still a valid document.
   * It prints the line and the name, which is a card waiting to be signed by
   * hand - the form every one of these took before the system existed.
   */
  describe('when nobody has uploaded one', () => {
    it('prints the lines and the names anyway', async () => {
      const html = await card();
      expect(html).toContain('Aline Uwase');
      expect(html).toContain('Speciose Mukarugwiza');
      expect(html).toContain('class="ink"></div>');
    });

    /* Fixed height whether or not it holds anything, so three blocks stay
       level and a half-signed card has no step in the middle. */
    it('keeps the space for a signature that is not there', async () => {
      const html = await card();
      expect(html).toContain('.sigs .ink{ height:13mm');
    });
  });

  describe('a school between head teachers', () => {
    it('prints the line with no name rather than a blank', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      const html = await card();
      expect(html).toContain('Head Teacher');
      expect(html).not.toMatch(/null|undefined/);
    });

    it('still signs for the class teacher', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      expect(await card()).toContain('Aline Uwase');
    });
  });

  it('escapes a name that is trying to be a script', async () => {
    prisma.user.findFirst.mockResolvedValue({
      firstName: '<img src=x onerror=alert(1)>',
      lastName: 'Nkurunziza',
      signatureUrl: null,
    });
    expect(await card()).not.toContain('<img src=x');
  });
});
