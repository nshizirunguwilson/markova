import { ReportsService } from './reports.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

jest.mock('puppeteer-core', () => ({
  __esModule: true,
  default: { launch: jest.fn() },
}));

/**
 * Whose card this is.
 *
 * A report card is handed over in a stack of thirty, and the first thing a
 * parent does with one is confirm it belongs to their child. That used to be
 * the hardest thing on the sheet to do: the name was one of eight fields set
 * in 11.5px, carrying exactly the weight of "Class size", so the commonest
 * real failure of the document - the wrong card reaching the wrong family -
 * was the one thing the layout did nothing to prevent.
 *
 * So identity is now a block of its own, with the photograph in it. These
 * tests hold that, and hold the two fields that came off the sheet to make
 * room: a class size that was already printed beside the position it gives
 * meaning to, and an attendance figure that is a record of the term rather
 * than a fact about who this child is.
 */
describe('who the report card belongs to', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  const student = {
    id: 'student-1',
    studentIdNumber: 'STD-2026-231419-167',
    classSectionId: 'section-1',
    gender: 'MALE',
    dateOfBirth: new Date('2009-04-02'),
    disciplinePoints: 92,
    user: {
      firstName: 'Kevin Hirwa',
      lastName: 'Kwizera',
      photoUrl: '/uploads/photos/kevin.png',
    },
    classSection: {
      name: 'B',
      classLevel: { name: 'Level 3', stage: 'A_LEVEL' },
      trade: {
        code: 'AUT',
        name: 'Automobile Technology',
        sector: 'Transport',
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    service = new ReportsService(prisma);

    prisma.student.findUnique.mockResolvedValue(student);
    prisma.student.count.mockResolvedValue(30);
    prisma.term.findUnique.mockResolvedValue({
      id: 'term-1',
      name: 'Term 2',
      startDate: new Date('2026-04-01'),
      endDate: new Date('2026-07-01'),
      academicYear: { name: '2026-2027' },
    });
    prisma.subject.findMany.mockResolvedValue([
      { id: 'sub-1', name: 'Engine Systems', scope: 'A_SPECIFIC' },
    ]);
    prisma.mark.findMany.mockResolvedValue([]);
    prisma.termResult.findFirst.mockResolvedValue({
      id: 'res-1',
      average: 61.5,
      letterGrade: 'C',
      rank: 4,
      aggregate: 21,
      aggregateMax: 30,
    });
    // Thirty in the class, so the summary's "4 of 30" is a real figure.
    prisma.termResult.findMany.mockResolvedValue(
      Array.from({ length: 30 }, () => ({ average: 60 })),
    );
    prisma.teacherRole.findFirst.mockResolvedValue({
      teacher: { user: { firstName: 'Speciose', lastName: 'Mukarugwiza' } },
    });
    prisma.attendance.count.mockResolvedValue(94);
    prisma.schoolConfig.findMany.mockResolvedValue([
      { key: 'school_name', value: 'Markova TSS' },
      { key: 'primary_color', value: '#1B4F72' },
    ]);
    prisma.reportVerification.findUnique.mockResolvedValue(null);
  });

  const card = () => service.generateTermReportHtml('student-1', 'term-1');

  it('gives the name a block of its own rather than a field among fields', async () => {
    const html = await card();
    expect(html).toContain('class="ident"');
    expect(html).toContain('<div class="nm">Kevin Hirwa Kwizera</div>');
  });

  /**
   * Set large enough to be read across a desk. The rest of the identity
   * fields are 11.5px, and a name at that size is what made the wrong card
   * so easy to hand over.
   */
  it('sets the name far above everything around it', async () => {
    const html = await card();
    expect(html).toContain('.who .nm{ font-size:22px');
    expect(html).toContain('.info{ display:grid');
  });

  it('prints the photograph beside it', async () => {
    const html = await card();
    expect(html).toContain('class="portrait"');
    expect(html).toContain('data:image/png;base64,');
  });

  /*
    Inlined, not linked. A remote fetch inside the PDF renderer is the worst
    possible moment to find out a file has moved, which is why the crest has
    always refused to take one.
  */
  it('carries no request out to fetch it', async () => {
    expect(await card()).not.toContain('src="/uploads/photos/kevin.png"');
  });

  /**
   * Initials rather than a silhouette. "We hold no photograph of this child"
   * is a true statement about the record; a generic head is not.
   */
  it('falls back to initials where there is no photograph', async () => {
    prisma.student.findUnique.mockResolvedValue({
      ...student,
      user: { ...student.user, photoUrl: null },
    });
    const html = await card();
    expect(html).toContain('<span>KK</span>');
    expect(html).toContain('class="portrait"');
  });

  it('escapes a name that is trying to be a script', async () => {
    prisma.student.findUnique.mockResolvedValue({
      ...student,
      user: {
        ...student.user,
        firstName: '<img src=x onerror=alert(1)>',
        photoUrl: null,
      },
    });
    const html = await card();
    expect(html).not.toContain('<img src=x');
  });

  /**
   * The class size is the denominator of the position, and the summary
   * already prints it there as "4 of 30". A second copy in the identity
   * fields was the same number with nothing to give it meaning.
   */
  it('no longer prints the class size as an identity field', async () => {
    const html = await card();
    expect(html).not.toContain('<span>Class size</span>');
    expect(html).toContain('of 30');
  });

  /**
   * Attendance is a record of the term, not a fact about who this child is.
   * The register still holds it and the annual report still carries it.
   */
  it('no longer prints attendance on the card', async () => {
    const html = await card();
    expect(html).not.toContain('<span>Attendance</span>');
    expect(html).not.toMatch(/94 \/ 95 days/);
  });

  /**
   * The scale is identical on every card the school will ever issue, so
   * printing it on all of them spent a fifth of each sheet on something that
   * never changes. It lives at /grading now, built from the same constants
   * the marks are computed with rather than from a second copy of them.
   */
  it('no longer prints the grading scale on every card', async () => {
    const html = await card();
    expect(html).not.toContain('class="legend"');
    expect(html).not.toContain('Module scale');
    expect(html).not.toContain('Core subject scale');
  });

  /**
   * The sheet is clipped to a single page on purpose. Removing the legend is
   * what bought the room, and nothing may spend it again: a report card that
   * runs to two pages is a report card whose second page gets lost.
   */
  it('stays one page', async () => {
    const html = await card();
    expect(html).toContain('height:296.5mm');
    expect(html).toContain('overflow:hidden');
    expect(html).toContain('@page{ size:A4; margin:0; }');
  });

  it('keeps the facts that say which record this is', async () => {
    const html = await card();
    expect(html).toContain('STD-2026-231419-167');
    expect(html).toContain('Level 3 AUT B');
    expect(html).toContain('Term 2');
    expect(html).toContain('Speciose Mukarugwiza');
  });
});
