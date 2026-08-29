import { ReportsService } from './reports.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

jest.mock('puppeteer-core', () => ({
  __esModule: true,
  default: { launch: jest.fn() },
}));

/**
 * Drafting a card's comments from the card.
 *
 * The draft is assembled from `getTermReportData` - the same call that
 * renders the sheet - and that is the whole point of it living here rather
 * than in the marks module. A comment that is supposed to reflect what is on
 * the report card has to be built from what is on the report card; a second
 * reading of the marks is a second reading that can disagree with the first,
 * and then a family holds a sheet whose numbers and whose words are about
 * different terms.
 */
describe('drafting the comments on a card', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  const student = {
    id: 'student-1',
    studentIdNumber: 'STD-2026-001',
    classSectionId: 'section-1',
    gender: 'FEMALE',
    dateOfBirth: new Date('2010-04-02'),
    disciplinePoints: 92,
    user: { firstName: 'Aline', lastName: 'Uwase', photoUrl: null },
    classSection: {
      name: 'A',
      classLevel: { name: 'Senior 1', stage: 'O_LEVEL' },
      trade: null,
    },
  };

  const markFor = (subject: string, scope: string, pct: number) => [
    {
      subjectId: subject,
      subject: { name: subject, scope },
      assessmentType: { name: 'CAT 1' },
      score: pct,
      maxScore: 100,
    },
    {
      subjectId: subject,
      subject: { name: subject, scope },
      assessmentType: { name: 'CAT 2' },
      score: pct,
      maxScore: 100,
    },
    {
      subjectId: subject,
      subject: { name: subject, scope },
      assessmentType: { name: 'End of Term Exam' },
      score: pct,
      maxScore: 100,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    service = new ReportsService(prisma);

    prisma.student.findUnique.mockResolvedValue(student);
    prisma.student.count.mockResolvedValue(30);
    prisma.term.findUnique.mockResolvedValue({
      id: 'term-2',
      name: 'Term 2',
      startDate: new Date('2026-04-01'),
      endDate: new Date('2026-07-01'),
      academicYearId: 'year-1',
      academicYear: { name: '2026-2027' },
    });
    prisma.subject.findMany.mockResolvedValue([]);
    prisma.mark.findMany.mockResolvedValue([
      ...markFor('Mathematics', 'O_CORE', 82),
      ...markFor('English', 'O_CORE', 74),
      ...markFor('Physics', 'O_CORE', 48),
    ]);
    prisma.termResult.findFirst.mockResolvedValue({
      id: 'res-1',
      average: 68,
      letterGrade: 'B',
      rank: 4,
      aggregate: 15,
      aggregateMax: 18,
    });
    prisma.termResult.findMany.mockResolvedValue(
      Array.from({ length: 30 }, () => ({ average: 65 })),
    );
    prisma.teacherRole.findFirst.mockResolvedValue(null);
    prisma.attendance.count.mockResolvedValue(60);
    prisma.schoolConfig.findMany.mockResolvedValue([
      { key: 'school_name', value: 'Markova TSS' },
    ]);
    prisma.reportVerification.findUnique.mockResolvedValue(null);
    // A clean record: nothing deducted, nothing restored.
    prisma.disciplineIncident.aggregate.mockResolvedValue({
      _sum: { pointsDeducted: 0 },
    });
    prisma.meritAward.aggregate.mockResolvedValue({ _sum: { points: 0 } });
  });

  const draft = () => service.suggestReportComments('student-1', 'term-2');

  it('returns one draft for each person who signs the card', async () => {
    const out = await draft();
    expect(typeof out.classTeacher).toBe('string');
    expect(typeof out.headTeacher).toBe('string');
    expect(out.classTeacher.length).toBeGreaterThan(20);
    expect(out.headTeacher.length).toBeGreaterThan(20);
  });

  it('gives the two of them nothing in common', async () => {
    const out = await draft();
    expect(out.classTeacher).not.toBe(out.headTeacher);
  });

  /*
    Built from the sheet, so the subjects it names are the subjects printed
    above the box rather than a second reading of the mark book.
  */
  it('names a subject that is actually on the card', async () => {
    const out = await draft();
    expect(out.classTeacher).toMatch(/Mathematics|English|Physics/);
  });

  it('speaks to the child by the name they are called', async () => {
    const out = await draft();
    expect(out.classTeacher).toContain('Aline');
    expect(out.classTeacher).not.toContain('Aline Uwase');
  });

  it('gives the head teacher the position the card prints', async () => {
    const out = await draft();
    expect(out.headTeacher).toContain('4 of 30');
  });

  /**
   * The one fact the card itself does not carry. A 68% that was 55% last
   * term is a different conversation from a 68% that was 78%, and the head
   * teacher is the person who reads a card that way.
   */
  it('reads last term to say which way the child is moving', async () => {
    prisma.termResult.findFirst
      .mockResolvedValueOnce({
        id: 'res-1',
        average: 68,
        letterGrade: 'B',
        rank: 4,
        aggregate: 15,
        aggregateMax: 18,
      })
      .mockResolvedValueOnce({ average: 55 });
    const out = await draft();
    expect(out.headTeacher).toMatch(/improvement on last term/i);
  });

  it('looks for last term inside this academic year only', async () => {
    await draft();
    expect(prisma.termResult.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studentId: 'student-1',
          term: expect.objectContaining({ academicYearId: 'year-1' }),
        }),
      }),
    );
  });

  it('says nothing about last term in Term 1', async () => {
    prisma.termResult.findFirst
      .mockResolvedValueOnce({
        id: 'res-1',
        average: 68,
        letterGrade: 'B',
        rank: 4,
        aggregate: 15,
        aggregateMax: 18,
      })
      .mockResolvedValueOnce(null);
    const out = await draft();
    expect(out.headTeacher).not.toMatch(/last term/i);
  });

  it('drafts something honest for a term with no marks in it', async () => {
    prisma.mark.findMany.mockResolvedValue([]);
    prisma.termResult.findFirst.mockResolvedValue(null);
    const out = await draft();
    expect(out.classTeacher).toMatch(/not yet complete/i);
    expect(out.headTeacher).toMatch(/incomplete/i);
  });

  it('writes nothing about behaviour on a clean record', async () => {
    const out = await draft();
    expect(out.classTeacher).not.toMatch(/[Cc]onduct/);
    expect(out.headTeacher).not.toMatch(/[Cc]onduct/);
  });
});
