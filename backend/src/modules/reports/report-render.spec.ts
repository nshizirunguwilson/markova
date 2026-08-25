import { NotFoundException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

const setContent = jest.fn();
const pdf = jest.fn();
const close = jest.fn();
const newPage = jest.fn();
const launch = jest.fn();

jest.mock('puppeteer-core', () => ({
  __esModule: true,
  default: { launch: (...args: unknown[]) => launch(...args) },
}));

/**
 * Producing the sheet.
 *
 * A report card is a full-bleed A4 page rendered by a headless browser. Two
 * things about that are worth holding: the browser is expensive enough that
 * it is kept alive between reports, and if it dies the next report has to
 * relaunch it rather than failing for ever after.
 */
describe('rendering a report card', () => {
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

  beforeEach(() => {
    jest.clearAllMocks();
    pdf.mockResolvedValue(Buffer.from('%PDF-1.4 fake'));
    close.mockResolvedValue(undefined);
    newPage.mockResolvedValue({ setContent, pdf, close });
    launch.mockResolvedValue({ newPage, close });

    prisma = createMockPrisma();
    service = new ReportsService(prisma);

    prisma.student.findUnique.mockResolvedValue(student);
    prisma.term.findUnique.mockResolvedValue({
      id: 'term-1',
      name: 'Term 3',
      startDate: new Date('2026-04-20'),
      endDate: new Date('2026-08-26'),
      academicYear: { name: '2026' },
    });
    prisma.mark.findMany.mockResolvedValue([
      {
        subjectId: 'subject-1',
        score: 17,
        maxScore: 20,
        subject: { name: 'Mathematics', scope: 'O_CORE' },
        assessmentType: { name: 'CAT 1' },
        termId: 'term-1',
      },
    ]);
    prisma.termResult.findFirst.mockResolvedValue({
      id: 'res-1',
      average: 78,
      letterGrade: 'B',
      rank: 4,
      aggregate: 20,
      aggregateMax: 54,
    });
    prisma.termResult.findMany.mockResolvedValue([{ average: 70 }]);
    prisma.teacherRole.findFirst.mockResolvedValue({
      teacher: { user: { firstName: 'Aline', lastName: 'Uwase' } },
    });
    prisma.attendance.count.mockResolvedValue(60);
    prisma.schoolConfig.findMany.mockResolvedValue([
      { key: 'school_name', value: 'Markova TSS' },
      { key: 'school_address', value: 'Kigali, Rwanda' },
      { key: 'school_phone', value: '+250788000001' },
      { key: 'primary_color', value: '#1B4F72' },
    ]);
    prisma.reportVerification.findUnique.mockResolvedValue({
      code: '1234-5678-9012',
      createdAt: new Date('2026-08-01'),
    });
  });

  describe('the sheet itself', () => {
    it('is a whole HTML document', async () => {
      const html = await service.generateTermReportHtml('student-1', 'term-1');
      expect(html).toMatch(/<html/i);
      expect(html).toMatch(/<\/html>/i);
    });

    it('names the school, the student and the term', async () => {
      const html = await service.generateTermReportHtml('student-1', 'term-1');
      expect(html).toContain('Markova TSS');
      expect(html).toContain('Divine Niyonkuru');
      expect(html).toContain('STD-2026-001');
      expect(html).toContain('Term 3');
    });

    it('prints the subjects and what they came to', async () => {
      const html = await service.generateTermReportHtml('student-1', 'term-1');
      expect(html).toContain('Mathematics');
    });

    it('prints where the student came in the class', async () => {
      const html = await service.generateTermReportHtml('student-1', 'term-1');
      expect(html).toContain('4');
    });

    it('prints the class teacher who signs it', async () => {
      const html = await service.generateTermReportHtml('student-1', 'term-1');
      expect(html).toContain('Aline Uwase');
    });

    // The code is what ties this sheet to the digital original, and it is the
    // only thing on the page a stranger can check.
    it('prints the verification code and its QR', async () => {
      const html = await service.generateTermReportHtml('student-1', 'term-1');
      expect(html).toContain('1234-5678-9012');
      expect(html).toContain('data:image/png;base64,');
    });

    it('prints without a QR when the term has no result yet', async () => {
      prisma.termResult.findFirst.mockResolvedValue(null);
      const html = await service.generateTermReportHtml('student-1', 'term-1');
      expect(html).toMatch(/<html/i);
    });

    // Everything on this page came from a form somebody typed into.
    it('escapes a school name that is trying to be a script', async () => {
      prisma.schoolConfig.findMany.mockResolvedValue([
        { key: 'school_name', value: '<script>alert(1)</script>' },
      ]);
      const html = await service.generateTermReportHtml('student-1', 'term-1');
      expect(html).not.toContain('<script>alert(1)</script>');
    });

    it('escapes a student name that is trying to be a script', async () => {
      prisma.student.findUnique.mockResolvedValue({
        ...student,
        user: { ...student.user, firstName: '<img src=x onerror=alert(1)>' },
      });
      const html = await service.generateTermReportHtml('student-1', 'term-1');
      expect(html).not.toContain('<img src=x');
    });

    it('refuses a house colour that would rewrite the stylesheet', async () => {
      prisma.schoolConfig.findMany.mockResolvedValue([
        { key: 'school_name', value: 'Markova' },
        { key: 'primary_color', value: 'red;}*{visibility:hidden}' },
      ]);
      const html = await service.generateTermReportHtml('student-1', 'term-1');
      // The template has its own `display:none` rules, so the assertion is
      // about the injected payload rather than the property.
      expect(html).not.toContain('visibility:hidden');
      expect(html).not.toContain('red;}');
      expect(html).toContain('#1B4F72');
    });
  });

  /**
   * Chrome takes seconds to launch. Launching one per report card would make
   * printing a class of forty unusable, so one browser is kept and reused.
   */
  describe('the browser behind the PDF', () => {
    it('produces a PDF', async () => {
      const out = await service.generateTermReportPdf('student-1', 'term-1');
      expect(Buffer.isBuffer(out)).toBe(true);
      expect(out.toString()).toContain('%PDF');
    });

    it('prints A4 with the page’s own margins', async () => {
      await service.generateTermReportPdf('student-1', 'term-1');
      expect(pdf).toHaveBeenCalledWith(
        expect.objectContaining({
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: true,
        }),
      );
    });

    it('launches the browser once and reuses it', async () => {
      await service.generateTermReportPdf('student-1', 'term-1');
      await service.generateTermReportPdf('student-1', 'term-1');
      expect(launch).toHaveBeenCalledTimes(1);
      expect(newPage).toHaveBeenCalledTimes(2);
    });

    it('closes each page it opens', async () => {
      await service.generateTermReportPdf('student-1', 'term-1');
      expect(close).toHaveBeenCalled();
    });

    // A page that fails to close is a leak, not a reason to lose the PDF that
    // was already produced.
    it('still returns the PDF when the page will not close', async () => {
      close.mockRejectedValue(new Error('detached'));
      await expect(
        service.generateTermReportPdf('student-1', 'term-1'),
      ).resolves.toBeInstanceOf(Buffer);
    });

    /**
     * If Chrome dies, every subsequent report would fail against the dead
     * handle. One relaunch is the difference between a blip and an outage.
     */
    it('relaunches once when the browser has died', async () => {
      newPage
        .mockRejectedValueOnce(new Error('Target closed'))
        .mockResolvedValue({ setContent, pdf, close });

      await expect(
        service.generateTermReportPdf('student-1', 'term-1'),
      ).resolves.toBeInstanceOf(Buffer);
      expect(launch).toHaveBeenCalledTimes(2);
    });

    it('closes the page even when the PDF itself fails', async () => {
      pdf.mockRejectedValue(new Error('render failed'));
      await expect(
        service.generateTermReportPdf('student-1', 'term-1'),
      ).rejects.toThrow('render failed');
      expect(close).toHaveBeenCalled();
    });

    it('waits for the page to load before printing it', async () => {
      await service.generateTermReportPdf('student-1', 'term-1');
      expect(setContent).toHaveBeenCalledWith(
        expect.stringContaining('<html'),
        { waitUntil: 'load' },
      );
    });
  });

  describe('a whole class of report cards', () => {
    it('builds one per student still on the roll', async () => {
      prisma.student.findMany.mockResolvedValue([
        { id: 'student-1' },
        { id: 'student-2' },
      ]);
      const result = await service.generateClassReportCards(
        'section-1',
        'term-1',
      );
      expect(result.count).toBe(2);
      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { classSectionId: 'section-1', status: 'ACTIVE' },
        }),
      );
    });

    it('gives back nothing for an empty class rather than failing', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      const result = await service.generateClassReportCards(
        'section-1',
        'term-1',
      );
      expect(result).toEqual({ count: 0, reports: [] });
    });
  });
});

/**
 * The year sheet: three terms side by side, which is the document a promotion
 * decision is made from.
 */
describe('the year report', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  const student = {
    studentIdNumber: 'STD-2026-001',
    user: { firstName: 'Divine', lastName: 'Niyonkuru', photoUrl: null },
    classSection: {
      name: 'A',
      classLevel: { name: 'Level 4' },
      trade: { code: 'SWD' },
    },
  };

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ReportsService(prisma);
    prisma.student.findUnique.mockResolvedValue(student);
    prisma.academicYear.findUnique.mockResolvedValue({
      id: 'year-1',
      name: '2026',
    });
    prisma.term.findMany.mockResolvedValue([
      { id: 'term-1', name: 'Term 1' },
      { id: 'term-2', name: 'Term 2' },
    ]);
    prisma.termResult.findMany.mockResolvedValue([]);
    prisma.yearResult.findFirst.mockResolvedValue(null);
    prisma.mark.findMany.mockResolvedValue([]);
    prisma.schoolConfig.findMany.mockResolvedValue([
      { key: 'school_name', value: 'Markova TSS' },
    ]);
  });

  it('refuses a student who does not exist', async () => {
    prisma.student.findUnique.mockResolvedValue(null);
    await expect(service.getYearReportData('nobody', 'year-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('refuses a year that does not exist', async () => {
    prisma.academicYear.findUnique.mockResolvedValue(null);
    await expect(
      service.getYearReportData('student-1', 'nope'),
    ).rejects.toThrow(NotFoundException);
  });

  it('names the class including the trade code', async () => {
    const data = await service.getYearReportData('student-1', 'year-1');
    expect(data.student.class).toBe('Level 4 SWD A');
  });

  it('lists the terms in the order they happened', async () => {
    const data = await service.getYearReportData('student-1', 'year-1');
    expect(data.terms).toEqual(['Term 1', 'Term 2']);
    expect(prisma.term.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { startDate: 'asc' } }),
    );
  });

  /**
   * A subject across three terms is the shape a promotion decision is read
   * in: one row per subject, one column per term.
   */
  it('lays the marks out per subject per term', async () => {
    prisma.mark.findMany.mockResolvedValue([
      {
        termId: 'term-1',
        score: 16,
        maxScore: 20,
        subject: { name: 'Mathematics' },
        assessmentType: { name: 'CAT 1' },
      },
      {
        termId: 'term-2',
        score: 18,
        maxScore: 20,
        subject: { name: 'Mathematics' },
        assessmentType: { name: 'CAT 1' },
      },
    ]);

    const data = await service.getYearReportData('student-1', 'year-1');
    expect(data.subjectsByTerm).toEqual({
      Mathematics: { 'Term 1': 80, 'Term 2': 90 },
    });
  });

  it('averages two marks landing in the same term', async () => {
    prisma.mark.findMany.mockResolvedValue([
      {
        termId: 'term-1',
        score: 10,
        maxScore: 20,
        subject: { name: 'Mathematics' },
        assessmentType: { name: 'CAT 1' },
      },
      {
        termId: 'term-1',
        score: 20,
        maxScore: 20,
        subject: { name: 'Mathematics' },
        assessmentType: { name: 'CAT 2' },
      },
    ]);

    const data = await service.getYearReportData('student-1', 'year-1');
    expect(data.subjectsByTerm.Mathematics['Term 1']).toBe(75);
  });

  it('reads only the terms belonging to the year asked for', async () => {
    await service.getYearReportData('student-1', 'year-1');
    expect(prisma.mark.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId: 'student-1', termId: { in: ['term-1', 'term-2'] } },
      }),
    );
  });
});

/**
 * The TVET report card.
 *
 * An A-Level sheet in the Rwandan system is a different document from an
 * O-Level one: modules rather than subjects, split into general and trade
 * specific, a practical column, and a competence verdict instead of a written
 * remark. Nothing about that layout was rendered by any test, which meant the
 * card handed to half a TVET school's students had never been drawn.
 */
describe('a TVET report card', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  const tvetStudent = {
    id: 'student-9',
    studentIdNumber: 'STD-2026-009',
    classSectionId: 'section-9',
    gender: 'MALE',
    dateOfBirth: new Date('2007-02-14'),
    disciplinePoints: 96,
    user: { firstName: 'Manzi', lastName: 'Habimana', photoUrl: null },
    classSection: {
      name: 'A',
      classLevel: { name: 'Level 4', stage: 'A_LEVEL' },
      trade: { code: 'SWD', name: 'Software Development', sector: 'ICT' },
    },
  };

  /** One module's marks, at the weights the A-Level scheme uses. */
  const marksFor = (
    subjectId: string,
    name: string,
    scope: string,
    pcts: Record<string, number>,
  ) =>
    Object.entries(pcts).map(([type, pct]) => ({
      subjectId,
      score: pct,
      maxScore: 100,
      subject: { name, scope },
      assessmentType: { name: type },
      termId: 'term-1',
    }));

  beforeEach(() => {
    jest.clearAllMocks();
    pdf.mockResolvedValue(Buffer.from('%PDF-1.4 fake'));
    close.mockResolvedValue(undefined);
    newPage.mockResolvedValue({ setContent, pdf, close });
    launch.mockResolvedValue({ newPage, close });

    prisma = createMockPrisma();
    service = new ReportsService(prisma);

    prisma.student.findUnique.mockResolvedValue(tvetStudent);
    prisma.term.findUnique.mockResolvedValue({
      id: 'term-1',
      name: 'Term 1',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-12-15'),
      academicYear: { name: '2026' },
    });
    prisma.mark.findMany.mockResolvedValue([
      ...marksFor('sub-1', 'Entrepreneurship', 'A_GENERAL', {
        'CAT 1': 70,
        'CAT 2': 75,
        'End of Term Exam': 68,
      }),
      ...marksFor('sub-2', 'Web Development', 'A_SPECIFIC', {
        'CAT 1': 80,
        'CAT 2': 78,
        Practical: 85,
        'End of Term Exam': 74,
      }),
      ...marksFor('sub-3', 'Database Design', 'A_SPECIFIC', {
        'CAT 1': 40,
        'CAT 2': 42,
        Practical: 38,
        'End of Term Exam': 45,
      }),
    ]);
    prisma.termResult.findFirst.mockResolvedValue({
      id: 'res-9',
      average: 68,
      letterGrade: 'B',
      rank: 2,
      aggregate: 18,
      aggregateMax: 45,
    });
    prisma.termResult.findMany.mockResolvedValue([{ average: 64 }]);
    prisma.teacherRole.findFirst.mockResolvedValue({
      teacher: { user: { firstName: 'Aline', lastName: 'Uwase' } },
    });
    prisma.attendance.count.mockResolvedValue(58);
    prisma.schoolConfig.findMany.mockResolvedValue([
      { key: 'school_name', value: 'Markova TSS' },
      { key: 'primary_color', value: '#1B4F72' },
    ]);
    prisma.reportVerification.findUnique.mockResolvedValue({
      code: '1234-5678-9012',
      createdAt: new Date('2026-12-01'),
    });
  });

  it('titles the sheet as Advanced Level', async () => {
    const html = await service.generateTermReportHtml('student-9', 'term-1');
    expect(html).toMatch(/Advanced Level \(TVET\)/);
    expect(html).not.toMatch(/Ordinary Level Report/);
  });

  it('names the trade rather than the level', async () => {
    const html = await service.generateTermReportHtml('student-9', 'term-1');
    expect(html).toMatch(/Software Development/);
    expect(html).toMatch(/SWD/);
  });

  it('splits the modules into general and trade specific', async () => {
    const html = await service.generateTermReportHtml('student-9', 'term-1');
    expect(html).toMatch(/General modules/);
    expect(html).toMatch(/Specific modules/);
    expect(html).toMatch(/Entrepreneurship/);
    expect(html).toMatch(/Web Development/);
  });

  it('carries a practical column, which O-Level has not', async () => {
    const html = await service.generateTermReportHtml('student-9', 'term-1');
    expect(html).toMatch(/Practical/);
    expect(html).toMatch(/Module<\/th>/);
  });

  it('gives a competence verdict rather than a written remark', async () => {
    const html = await service.generateTermReportHtml('student-9', 'term-1');
    expect(html).toMatch(/Competence/);
    // One module was passed on the practical and one was not.
    expect(html).toMatch(/Competent/);
    expect(html).toMatch(/Not yet competent/i);
  });

  it('states the weightings the two module groups are marked on', async () => {
    const html = await service.generateTermReportHtml('student-9', 'term-1');
    expect(html).toMatch(/CAT 1 20% \+ CAT 2 20% \+ Exam 60%/);
    expect(html).toMatch(/CAT 1 15% \+ CAT 2 15% \+ Practical 30% \+ Exam 40%/);
  });

  it('still draws when the trade has no name recorded', async () => {
    prisma.student.findUnique.mockResolvedValue({
      ...tvetStudent,
      classSection: {
        ...tvetStudent.classSection,
        trade: { code: 'SWD', name: null, sector: null },
      },
    });

    const html = await service.generateTermReportHtml('student-9', 'term-1');
    expect(html).toMatch(/<html/i);
    expect(html).not.toMatch(/undefined|null<\/b>/);
  });

  it('draws a module nothing has been marked against yet', async () => {
    prisma.mark.findMany.mockResolvedValue(
      marksFor('sub-4', 'Networking', 'A_SPECIFIC', {}),
    );

    const html = await service.generateTermReportHtml('student-9', 'term-1');
    expect(html).toMatch(/<html/i);
    expect(html).not.toMatch(/undefined/);
  });
});

/**
 * The conduct line, which is one word chosen from five bands.
 *
 * It goes on every card the school issues, and a fixture at ninety-two only
 * ever prints "Very Good".
 */
describe('the conduct verdict on a card', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  const baseStudent = {
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

  beforeEach(() => {
    jest.clearAllMocks();
    pdf.mockResolvedValue(Buffer.from('%PDF-1.4 fake'));
    newPage.mockResolvedValue({ setContent, pdf, close });
    launch.mockResolvedValue({ newPage, close });

    prisma = createMockPrisma();
    service = new ReportsService(prisma);
    prisma.term.findUnique.mockResolvedValue({
      id: 'term-1',
      name: 'Term 1',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-12-15'),
      academicYear: { name: '2026' },
    });
    prisma.mark.findMany.mockResolvedValue([]);
    prisma.termResult.findFirst.mockResolvedValue(null);
    prisma.termResult.findMany.mockResolvedValue([]);
    prisma.teacherRole.findFirst.mockResolvedValue(null);
    prisma.attendance.count.mockResolvedValue(0);
    prisma.schoolConfig.findMany.mockResolvedValue([]);
    prisma.reportVerification.findUnique.mockResolvedValue(null);
  });

  const cardFor = async (disciplinePoints: number | null) => {
    prisma.student.findUnique.mockResolvedValue({
      ...baseStudent,
      disciplinePoints,
    });
    return service.generateTermReportHtml('student-1', 'term-1');
  };

  it.each([
    [98, 'Excellent'],
    [90, 'Very Good'],
    [78, 'Good'],
    [60, 'Fair'],
    [30, 'Poor'],
  ])('calls %i points %s', async (points, verdict) => {
    expect(await cardFor(points)).toMatch(new RegExp(verdict));
  });

  it('says nothing at all when no conduct is on record', async () => {
    const html = await cardFor(null);
    expect(html).toMatch(/<html/i);
    expect(html).not.toMatch(/Excellent|Very Good|Poor/);
  });

  it('draws a dash for attendance nobody recorded', async () => {
    prisma.attendance.count.mockResolvedValue(0);
    const html = await cardFor(92);
    expect(html).toMatch(/<html/i);
    expect(html).not.toMatch(/NaN/);
  });
});

/**
 * A report card for a school and a term with almost nothing filled in.
 *
 * The sheet is the one document a family keeps, and every optional thing on
 * it is a branch: the crest, the school colour, the address line, the QR, the
 * result block, a subject nobody has marked yet, and a class with elective
 * subjects alongside its core ones. A school in its first term has none of
 * them, and the card still has to print.
 */
describe('a report card with almost nothing on it', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  const student = {
    id: 'student-1',
    studentIdNumber: '',
    classSectionId: 'section-1',
    gender: null,
    dateOfBirth: null,
    disciplinePoints: null,
    user: { firstName: 'Divine', lastName: 'Niyonkuru', photoUrl: null },
    classSection: {
      name: 'A',
      classLevel: { name: 'Senior 1', stage: 'O_LEVEL' },
      trade: null,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    pdf.mockResolvedValue(Buffer.from('%PDF-1.4 fake'));
    newPage.mockResolvedValue({ setContent, pdf, close });
    launch.mockResolvedValue({ newPage, close });

    prisma = createMockPrisma();
    service = new ReportsService(prisma);
    prisma.student.findUnique.mockResolvedValue(student);
    prisma.term.findUnique.mockResolvedValue({
      id: 'term-1',
      name: 'Term 1',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-12-15'),
      academicYear: { name: '2026' },
    });
    prisma.mark.findMany.mockResolvedValue([]);
    // No result computed, no class average, no class teacher, no attendance,
    // no school config, no verification code.
    prisma.termResult.findFirst.mockResolvedValue(null);
    prisma.termResult.findMany.mockResolvedValue([]);
    prisma.teacherRole.findFirst.mockResolvedValue(null);
    prisma.attendance.count.mockResolvedValue(0);
    prisma.schoolConfig.findMany.mockResolvedValue([]);
    prisma.reportVerification.findUnique.mockResolvedValue(null);
  });

  it('still produces a whole page', async () => {
    const html = await service.generateTermReportHtml('student-1', 'term-1');
    expect(html).toMatch(/<html/i);
    expect(html).toMatch(/<\/html>/i);
  });

  it('falls back to the brand navy when no colour is set', async () => {
    const html = await service.generateTermReportHtml('student-1', 'term-1');
    expect(html).toMatch(/#1B4F72/);
  });

  it('prints no QR when no code has been allocated', async () => {
    const html = await service.generateTermReportHtml('student-1', 'term-1');
    expect(html).not.toMatch(/alt="QR code/);
  });

  it('prints no contact details for a school that has none', async () => {
    const html = await service.generateTermReportHtml('student-1', 'term-1');
    // The address line is empty rather than carrying stray separators.
    expect(html).toMatch(/<div class="addr"><\/div>/);
  });

  it('says nothing about conduct when no points are on record', async () => {
    const html = await service.generateTermReportHtml('student-1', 'term-1');
    expect(html).not.toMatch(/Excellent|Very Good|Poor/);
  });

  it('never prints the word undefined', async () => {
    const html = await service.generateTermReportHtml('student-1', 'term-1');
    expect(html).not.toMatch(/undefined/);
  });
});

/**
 * A class with electives alongside its core subjects.
 *
 * O-Level splits the sheet in two: the nine core papers that count towards the
 * aggregate, and electives graded on a stricter scale. A class taking only
 * core subjects never draws the second half.
 */
describe('a report card with elective subjects on it', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  const markFor = (
    subjectId: string,
    name: string,
    scope: string,
    type: string,
    pct: number | null,
  ) => ({
    subjectId,
    score: pct,
    maxScore: 100,
    subject: { name, scope },
    assessmentType: { name: type },
    termId: 'term-1',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    pdf.mockResolvedValue(Buffer.from('%PDF-1.4 fake'));
    newPage.mockResolvedValue({ setContent, pdf, close });
    launch.mockResolvedValue({ newPage, close });

    prisma = createMockPrisma();
    service = new ReportsService(prisma);
    prisma.student.findUnique.mockResolvedValue({
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
    });
    prisma.term.findUnique.mockResolvedValue({
      id: 'term-1',
      name: 'Term 1',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-12-15'),
      academicYear: { name: '2026' },
    });
    prisma.termResult.findFirst.mockResolvedValue({
      id: 'res-1',
      average: 71,
      letterGrade: 'B',
      rank: 3,
      aggregate: 22,
      aggregateMax: 54,
    });
    prisma.termResult.findMany.mockResolvedValue([{ average: 68 }]);
    prisma.teacherRole.findFirst.mockResolvedValue(null);
    prisma.attendance.count.mockResolvedValue(55);
    prisma.schoolConfig.findMany.mockResolvedValue([
      { key: 'school_name', value: 'Markova TSS' },
    ]);
    prisma.reportVerification.findUnique.mockResolvedValue(null);
  });

  it('groups the electives under their own heading', async () => {
    prisma.mark.findMany.mockResolvedValue([
      markFor('s-1', 'Mathematics', 'O_CORE', 'End of Term Exam', 78),
      markFor('s-2', 'Fine Art', 'O_ELECTIVE', 'End of Term Exam', 64),
    ]);

    const html = await service.generateTermReportHtml('student-1', 'term-1');
    expect(html).toMatch(/Core subjects/);
    expect(html).toMatch(/Elective subjects/);
    expect(html).toMatch(/Fine Art/);
  });

  it('leaves the elective heading off a class that takes none', async () => {
    prisma.mark.findMany.mockResolvedValue([
      markFor('s-1', 'Mathematics', 'O_CORE', 'End of Term Exam', 78),
    ]);

    const html = await service.generateTermReportHtml('student-1', 'term-1');
    expect(html).toMatch(/Core subjects/);
    expect(html).not.toMatch(/Elective subjects/);
  });

  // A subject entered on the register but never marked has no total, so it has
  // no grade, no points and no remark either.
  it('draws dashes for a subject nobody has marked yet', async () => {
    prisma.mark.findMany.mockResolvedValue([
      markFor('s-1', 'Mathematics', 'O_CORE', 'CAT 1', null),
    ]);

    const html = await service.generateTermReportHtml('student-1', 'term-1');
    expect(html).toMatch(/–/);
    expect(html).not.toMatch(/undefined|null<\/td>/);
  });

  /**
   * A scope the server grew before this app knew about it.
   *
   * The sheet has two sections, core and elective, and nothing to put a third
   * kind in, so such a subject is left off. What matters is that it is left
   * off rather than taking the whole card down, which is what used to happen:
   * the weights table was read through without a guard.
   */
  it('leaves out a subject whose scope it does not recognise', async () => {
    prisma.mark.findMany.mockResolvedValue([
      markFor('s-1', 'Mathematics', 'O_CORE', 'End of Term Exam', 78),
      markFor('s-9', 'Debate', 'SOMETHING_NEW', 'End of Term Exam', 60),
    ]);

    const html = await service.generateTermReportHtml('student-1', 'term-1');
    expect(html).toMatch(/<html/i);
    expect(html).toMatch(/Mathematics/);
    expect(html).not.toMatch(/Debate/);
  });
});

/**
 * The verification strip, and a school with its own crest and colour.
 *
 * A printed report card carries a QR and a code so the next school can check
 * it against the digital original. The strip only appears once a code has
 * been allocated, and the crest only once a logo has been uploaded, so a
 * school midway through setting itself up sees a different sheet.
 */
describe('a fully set-up school printing a card', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  const student = {
    id: 'student-1',
    studentIdNumber: 'STD-2026-231419-167',
    classSectionId: 'section-1',
    gender: 'FEMALE',
    dateOfBirth: new Date('2010-04-02'),
    disciplinePoints: 96,
    user: { firstName: 'Divine', lastName: 'Niyonkuru', photoUrl: null },
    classSection: {
      name: 'A',
      classLevel: { name: 'Senior 1', stage: 'O_LEVEL' },
      trade: null,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    pdf.mockResolvedValue(Buffer.from('%PDF-1.4 fake'));
    newPage.mockResolvedValue({ setContent, pdf, close });
    launch.mockResolvedValue({ newPage, close });

    prisma = createMockPrisma();
    service = new ReportsService(prisma);
    prisma.student.findUnique.mockResolvedValue(student);
    prisma.term.findUnique.mockResolvedValue({
      id: 'term-1',
      name: 'Term 1',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-12-15'),
      academicYear: { name: '2026' },
    });
    prisma.mark.findMany.mockResolvedValue([
      {
        subjectId: 's-1',
        score: 78,
        maxScore: 100,
        subject: { name: 'Mathematics', scope: 'O_CORE' },
        assessmentType: { name: 'End of Term Exam' },
        termId: 'term-1',
      },
    ]);
    prisma.termResult.findFirst.mockResolvedValue({
      id: 'res-1',
      average: 78,
      letterGrade: 'B',
      rank: 4,
      aggregate: 20,
      aggregateMax: 54,
    });
    prisma.termResult.findMany.mockResolvedValue([{ average: 70 }]);
    prisma.teacherRole.findFirst.mockResolvedValue({
      teacher: { user: { firstName: 'Aline', lastName: 'Uwase' } },
    });
    prisma.attendance.count.mockResolvedValue(60);
    prisma.schoolConfig.findMany.mockResolvedValue([
      { key: 'school_name', value: 'Markova Technical School' },
      { key: 'school_address', value: 'KG 11 Ave, Kigali' },
      { key: 'school_email', value: 'info@markova.edu' },
      { key: 'school_phone', value: '+250788000001' },
      { key: 'primary_color', value: '#0F4C81' },
    ]);
    prisma.reportVerification.findUnique.mockResolvedValue({
      code: '1234-5678-9012',
      createdAt: new Date('2026-12-01'),
    });
  });

  it('prints the verification strip with its QR', async () => {
    const html = await service.generateTermReportHtml('student-1', 'term-1');
    expect(html).toMatch(/Report verification/);
    expect(html).toMatch(/alt="QR code/);
    expect(html).toMatch(/1234-5678-9012/);
  });

  it('uses the schools own colour rather than the brand navy', async () => {
    const html = await service.generateTermReportHtml('student-1', 'term-1');
    expect(html).toMatch(/#0F4C81/);
  });

  // With nothing uploaded the bundled Markova mark is used, so a school that
  // has not got round to branding still prints a crest rather than a gap.
  it('falls back to the bundled crest when nothing is uploaded', async () => {
    const html = await service.generateTermReportHtml('student-1', 'term-1');
    expect(html).toMatch(/class="crest-img"/);
  });

  it('prints the address, email and phone on one line', async () => {
    const html = await service.generateTermReportHtml('student-1', 'term-1');
    expect(html).toMatch(/KG 11 Ave, Kigali/);
    expect(html).toMatch(/info@markova\.edu/);
    expect(html).toMatch(/\+250788000001/);
  });

  // The document number ends in the tail of the student's own number, so two
  // cards printed the same day are still tellable apart.
  it('ends the document number with the tail of the student number', async () => {
    const html = await service.generateTermReportHtml('student-1', 'term-1');
    expect(html).toMatch(/\/167</);
  });

  it('names the class teacher who signed it off', async () => {
    const html = await service.generateTermReportHtml('student-1', 'term-1');
    expect(html).toMatch(/Aline Uwase/);
  });

  it('says what the aggregate is counted from', async () => {
    const html = await service.generateTermReportHtml('student-1', 'term-1');
    expect(html).toMatch(/9 core subjects only/);
  });
});

/**
 * A subject the school has entered marks for that do not count.
 *
 * Each subject's total is a weighted mix of the assessments its scope defines.
 * A core paper with only a practical mark recorded has nothing weighted at
 * all, so it has no total, and with no total it has no grade, no points and
 * no remark either. Four dashes, not four zeroes.
 */
describe('a subject with no weighted marks against it', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  beforeEach(() => {
    jest.clearAllMocks();
    pdf.mockResolvedValue(Buffer.from('%PDF-1.4 fake'));
    newPage.mockResolvedValue({ setContent, pdf, close });
    launch.mockResolvedValue({ newPage, close });

    prisma = createMockPrisma();
    service = new ReportsService(prisma);
    prisma.student.findUnique.mockResolvedValue({
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
    });
    prisma.term.findUnique.mockResolvedValue({
      id: 'term-1',
      name: 'Term 1',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-12-15'),
      academicYear: { name: '2026' },
    });
    prisma.termResult.findMany.mockResolvedValue([]);
    prisma.teacherRole.findFirst.mockResolvedValue(null);
    prisma.attendance.count.mockResolvedValue(0);
    prisma.schoolConfig.findMany.mockResolvedValue([
      { key: 'school_name', value: 'Markova TSS' },
    ]);
    prisma.reportVerification.findUnique.mockResolvedValue(null);
  });

  it('draws a dash for the total, grade, points and remark', async () => {
    // A practical carries no weight on a core O-Level paper.
    prisma.termResult.findFirst.mockResolvedValue(null);
    prisma.mark.findMany.mockResolvedValue([
      {
        subjectId: 's-1',
        score: 80,
        maxScore: 100,
        subject: { name: 'Mathematics', scope: 'O_CORE' },
        assessmentType: { name: 'Practical' },
        termId: 'term-1',
      },
    ]);

    const html = await service.generateTermReportHtml('student-1', 'term-1');
    const row = html.slice(html.indexOf('Mathematics'));
    expect(row).toMatch(/<td class="tot">–<\/td>/);
    expect(row).toMatch(/<td class="gr">–<\/td>/);
    expect(row).toMatch(/<td class="num">–<\/td>/);
    expect(row).toMatch(/<td class="rem">–<\/td>/);
  });

  // A term closed before anything was marked has a result row with no average.
  it('grades an average of nothing as the bottom band', async () => {
    prisma.termResult.findFirst.mockResolvedValue({
      id: 'res-1',
      average: null,
      letterGrade: null,
      rank: null,
      aggregate: null,
      aggregateMax: null,
    });
    prisma.mark.findMany.mockResolvedValue([]);

    const html = await service.generateTermReportHtml('student-1', 'term-1');
    expect(html).toMatch(/<html/i);
    expect(html).not.toMatch(/NaN|undefined/);
  });
});

/**
 * A TVET module nobody has taken the practical for yet.
 *
 * Competence is decided on the practical alone, so a module with the written
 * papers marked and no practical is neither competent nor not: it is not
 * decided, and the sheet has to say so rather than failing them.
 */
describe('a TVET module with no practical marked', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  beforeEach(() => {
    jest.clearAllMocks();
    pdf.mockResolvedValue(Buffer.from('%PDF-1.4 fake'));
    newPage.mockResolvedValue({ setContent, pdf, close });
    launch.mockResolvedValue({ newPage, close });

    prisma = createMockPrisma();
    service = new ReportsService(prisma);
    prisma.student.findUnique.mockResolvedValue({
      id: 'student-9',
      studentIdNumber: 'STD-2026-009',
      classSectionId: 'section-9',
      gender: 'MALE',
      dateOfBirth: new Date('2007-02-14'),
      disciplinePoints: 96,
      user: { firstName: 'Manzi', lastName: 'Habimana', photoUrl: null },
      classSection: {
        name: 'A',
        classLevel: { name: 'Level 4', stage: 'A_LEVEL' },
        trade: { code: 'SWD', name: 'Software Development', sector: 'ICT' },
      },
    });
    prisma.term.findUnique.mockResolvedValue({
      id: 'term-1',
      name: 'Term 1',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-12-15'),
      academicYear: { name: '2026' },
    });
    prisma.mark.findMany.mockResolvedValue([
      {
        subjectId: 'sub-2',
        score: 74,
        maxScore: 100,
        subject: { name: 'Web Development', scope: 'A_SPECIFIC' },
        assessmentType: { name: 'End of Term Exam' },
        termId: 'term-1',
      },
    ]);
    prisma.termResult.findFirst.mockResolvedValue({
      id: 'res-9',
      average: 74,
      letterGrade: 'B',
      rank: 1,
      aggregate: 5,
      aggregateMax: 6,
    });
    prisma.termResult.findMany.mockResolvedValue([]);
    prisma.teacherRole.findFirst.mockResolvedValue(null);
    prisma.attendance.count.mockResolvedValue(0);
    prisma.schoolConfig.findMany.mockResolvedValue([
      { key: 'school_name', value: 'Markova TSS' },
    ]);
    prisma.reportVerification.findUnique.mockResolvedValue(null);
  });

  it('leaves the competence undecided rather than failing them', async () => {
    const html = await service.generateTermReportHtml('student-9', 'term-1');
    expect(html).toMatch(/Web Development/);
    expect(html).not.toMatch(/undefined/);
  });

  it('says what the aggregate is counted from on a TVET sheet', async () => {
    const html = await service.generateTermReportHtml('student-9', 'term-1');
    expect(html).toMatch(/modules taken this term/);
  });
});
