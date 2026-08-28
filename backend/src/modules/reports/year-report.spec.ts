import { ReportsService } from './reports.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

jest.mock('puppeteer-core', () => ({
  __esModule: true,
  default: { launch: jest.fn() },
  launch: jest.fn(),
}));

/**
 * The annual report and the school's year summary.
 *
 * A term report answers "how was this term". These answer "how was the year,
 * and what happens next" — the question a parent has in July and the one a
 * promotion decision is argued from.
 */
describe('the annual report for one student', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  const terms = [
    { id: 't1', name: 'Term 1', startDate: new Date('2025-09-01'), endDate: new Date('2025-12-15') },
    { id: 't2', name: 'Term 2', startDate: new Date('2026-01-10'), endDate: new Date('2026-04-05') },
    { id: 't3', name: 'Term 3', startDate: new Date('2026-04-20'), endDate: new Date('2026-07-10') },
  ];

  /** A subject's marks for one term, at the weights the term card uses. */
  const marksFor = (termId: string, subject: string, cat1: number, cat2: number, exam: number) => [
    { termId, score: cat1, maxScore: 20, subject: { name: subject, scope: 'O_CORE' }, assessmentType: { name: 'CAT 1' } },
    { termId, score: cat2, maxScore: 20, subject: { name: subject, scope: 'O_CORE' }, assessmentType: { name: 'CAT 2' } },
    { termId, score: exam, maxScore: 100, subject: { name: subject, scope: 'O_CORE' }, assessmentType: { name: 'End of Term Exam' } },
  ];

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ReportsService(prisma);
    prisma.student.findUnique.mockResolvedValue({
      id: 'student-1',
      studentIdNumber: 'STD-2026-001',
      classSectionId: 'section-1',
      user: { firstName: 'Divine', lastName: 'Niyonkuru', photoUrl: null },
      classSection: {
        name: 'A',
        classLevel: { name: 'Senior 1', stage: 'O_LEVEL' },
        trade: null,
      },
    });
    prisma.academicYear.findUnique.mockResolvedValue({ id: 'year-1', name: '2025-2026' });
    prisma.term.findMany.mockResolvedValue(terms);
    prisma.termResult.findMany.mockResolvedValue([]);
    prisma.yearResult.findFirst.mockResolvedValue({
      yearlyAverage: 74.2,
      letterGrade: 'A',
      rank: 7,
      isPromoted: true,
    });
    prisma.mark.findMany.mockResolvedValue([
      ...marksFor('t1', 'Mathematics', 14, 15, 70),
      ...marksFor('t2', 'Mathematics', 16, 16, 78),
      ...marksFor('t3', 'Mathematics', 18, 18, 84),
    ]);
    prisma.schoolConfig.findMany.mockResolvedValue([]);
    prisma.schoolConfig.findUnique.mockResolvedValue(null);
  });

  it('lays a subject out across the three terms', async () => {
    const html = await service.generateYearReportHtml('student-1', 'year-1');
    expect(html).toMatch(/Term 1/);
    expect(html).toMatch(/Term 2/);
    expect(html).toMatch(/Term 3/);
    expect(html).toMatch(/Mathematics/);
  });

  /*
    Every term column is the weighted total that term's report card printed.
    A parent holding all four documents must read the same number in all four.
  */
  it("carries each term's own weighted total, not a raw average", async () => {
    const data = await service.getYearReportData('student-1', 'year-1');
    const maths = data.subjectsByTerm.Mathematics;
    // 70% and 75% on the CATs (20% each) with 70 on the exam (60%) is 71.
    expect(maths.terms['Term 1']).toBe(71);
    expect(maths.terms['Term 2']).toBe(79);
    expect(maths.terms['Term 3']).toBe(86);
  });

  it('averages the year over the terms the subject was taught in', async () => {
    const data = await service.getYearReportData('student-1', 'year-1');
    expect(data.subjectsByTerm.Mathematics.average).toBe(79);
  });

  it('says the promotion decision plainly', async () => {
    const html = await service.generateYearReportHtml('student-1', 'year-1');
    expect(html).toMatch(/PROMOTED/);
    expect(html).toMatch(/moves up next year/);
  });

  it('says so just as plainly when a student repeats', async () => {
    prisma.yearResult.findFirst.mockResolvedValue({
      yearlyAverage: 38,
      letterGrade: 'F',
      rank: 30,
      isPromoted: false,
    });
    const html = await service.generateYearReportHtml('student-1', 'year-1');
    expect(html).toMatch(/REPEATING/);
    expect(html).toMatch(/repeats the year/);
  });

  // A year the school has not finalised is not a year the student failed.
  it('does not invent a decision the school has not made', async () => {
    prisma.yearResult.findFirst.mockResolvedValue(null);
    const html = await service.generateYearReportHtml('student-1', 'year-1');
    expect(html).toMatch(/NOT YET DECIDED/);
    expect(html).not.toMatch(/REPEATING/);
  });

  /**
   * Conduct across the year is each term's mark out of forty added up, read
   * from that term's own incidents and merits.
   */
  it('adds the three terms of conduct up to a hundred and twenty', async () => {
    prisma.disciplineIncident.aggregate.mockResolvedValue({ _sum: { pointsDeducted: 4 } });
    prisma.meritAward.aggregate.mockResolvedValue({ _sum: { points: 0 } });

    const data = await service.getYearReportData('student-1', 'year-1');

    expect(data.conduct.outOf).toBe(120);
    expect(data.conduct.points).toBe(108);
    expect(data.conduct.percentage).toBe(90);
    expect(data.conduct.byTerm).toHaveLength(3);
  });

  it('gives a clean year the full conduct mark', async () => {
    const data = await service.getYearReportData('student-1', 'year-1');
    expect(data.conduct.points).toBe(120);
  });

  it('never prints the word undefined', async () => {
    const html = await service.generateYearReportHtml('student-1', 'year-1');
    expect(html).not.toMatch(/undefined|NaN/);
  });
});

/**
 * Nobody reads eight hundred report cards to find out whether Senior 2 had a
 * bad year.
 */
describe("the school's year at a glance", () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ReportsService(prisma);
    prisma.academicYear.findUnique.mockResolvedValue({ id: 'year-1', name: '2025-2026' });
    prisma.term.findMany.mockResolvedValue([
      { id: 't1', startDate: new Date('2025-09-01'), endDate: new Date('2025-12-15') },
      { id: 't3', startDate: new Date('2026-04-20'), endDate: new Date('2026-07-10') },
    ]);
    prisma.classSection.findMany.mockResolvedValue([
      { id: 'sec-1', name: 'A', classLevel: { name: 'Senior 1' }, trade: null },
      { id: 'sec-2', name: 'B', classLevel: { name: 'Senior 1' }, trade: null },
    ]);
    prisma.yearResult.findMany.mockResolvedValue([
      { classSectionId: 'sec-1', yearlyAverage: 80, isPromoted: true },
      { classSectionId: 'sec-1', yearlyAverage: 60, isPromoted: true },
      { classSectionId: 'sec-1', yearlyAverage: 40, isPromoted: false },
      { classSectionId: 'sec-2', yearlyAverage: 70, isPromoted: true },
    ]);
    prisma.schoolConfig.findUnique.mockResolvedValue({ value: '50' });
    prisma.schoolConfig.findMany.mockResolvedValue([]);
    prisma.attendance.count.mockResolvedValue(0);
  });

  it('reports each class on its own row', async () => {
    const data = await service.getSchoolYearSummary('year-1');
    expect(data.classes).toHaveLength(2);
    expect(data.classes[0].classSection).toBe('Senior 1 A');
    expect(data.classes[0].students).toBe(3);
  });

  it('averages and counts the pass rate per class', async () => {
    const data = await service.getSchoolYearSummary('year-1');
    const first = data.classes[0];
    expect(first.average).toBe(60);
    // Two of three at or above fifty.
    expect(first.passRate).toBe(67);
    expect(first.promoted).toBe(2);
  });

  it('totals the school beneath them', async () => {
    const data = await service.getSchoolYearSummary('year-1');
    expect(data.totals.students).toBe(4);
    expect(data.totals.average).toBe(62.5);
    expect(data.totals.promoted).toBe(3);
  });

  /*
    A class nobody has run year results for is left out. Shown as a row of
    zeroes it would be indistinguishable from a class where every child
    failed, and those mean opposite things.
  */
  it('leaves out a class with no year results rather than failing it', async () => {
    prisma.yearResult.findMany.mockResolvedValue([
      { classSectionId: 'sec-1', yearlyAverage: 80, isPromoted: true },
    ]);
    const data = await service.getSchoolYearSummary('year-1');
    expect(data.classes.map((c: any) => c.classSection)).toEqual(['Senior 1 A']);
  });

  it('says nothing rather than zero when no year has been calculated', async () => {
    prisma.yearResult.findMany.mockResolvedValue([]);
    const data = await service.getSchoolYearSummary('year-1');
    expect(data.totals.average).toBeNull();
    expect(data.totals.passRate).toBeNull();

    const html = await service.generateSchoolYearSummaryHtml('year-1');
    expect(html).toMatch(/No year results have been calculated/);
  });

  // Attendance is dated rather than filed under a term, so it is counted over
  // the span from the first term's start to the last term's end.
  it('counts attendance across the span of the year', async () => {
    prisma.attendance.count.mockResolvedValue(10);
    await service.getSchoolYearSummary('year-1');

    const where = prisma.attendance.count.mock.calls[0][0].where;
    expect(where.date.gte).toEqual(new Date('2025-09-01'));
    expect(where.date.lte).toEqual(new Date('2026-07-10'));
  });

  // Counting every attendance record ever written would report the school's
  // whole history as this year's.
  it('counts no attendance at all for a year with no terms', async () => {
    prisma.term.findMany.mockResolvedValue([]);
    const data = await service.getSchoolYearSummary('year-1');
    expect(data.totals.attendance).toBeNull();
    expect(prisma.attendance.count).not.toHaveBeenCalled();
  });

  it('renders to a sheet without saying undefined', async () => {
    const html = await service.generateSchoolYearSummaryHtml('year-1');
    expect(html).toMatch(/SCHOOL YEAR SUMMARY/);
    expect(html).not.toMatch(/undefined|NaN/);
  });
});
