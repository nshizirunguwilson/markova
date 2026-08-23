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
    prisma.academicYear.findUnique.mockResolvedValue({ id: 'year-1', name: '2026' });
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
    await expect(
      service.getYearReportData('nobody', 'year-1'),
    ).rejects.toThrow(NotFoundException);
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
