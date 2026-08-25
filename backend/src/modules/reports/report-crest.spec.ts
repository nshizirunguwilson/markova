import { ReportsService } from './reports.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

const logoDataUri = jest.fn();

jest.mock('../../common/html', () => {
  const actual = jest.requireActual('../../common/html');
  return {
    ...actual,
    logoDataUri: (...args: unknown[]) => logoDataUri(...args),
  };
});

/**
 * The crest on a report card when there is no image to be had.
 *
 * A school that has uploaded nothing still gets the bundled Markova mark, so
 * this arm only shows up on a deployment where the bundled asset is missing
 * too: a trimmed container image, or a volume mounted over `assets`. The card
 * has to print the school's initials rather than a broken image.
 */
describe('a report card with no crest image at all', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  beforeEach(() => {
    jest.clearAllMocks();
    logoDataUri.mockReturnValue(null);

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
    prisma.mark.findMany.mockResolvedValue([]);
    prisma.termResult.findFirst.mockResolvedValue(null);
    prisma.termResult.findMany.mockResolvedValue([]);
    prisma.teacherRole.findFirst.mockResolvedValue(null);
    prisma.attendance.count.mockResolvedValue(0);
    prisma.reportVerification.findUnique.mockResolvedValue(null);
  });

  it('draws the school initials instead', async () => {
    prisma.schoolConfig.findMany.mockResolvedValue([
      { key: 'school_name', value: 'Markova Technical School' },
    ]);

    const html = await service.generateTermReportHtml('student-1', 'term-1');
    expect(html).toMatch(/class="crest">MT</);
    expect(html).not.toMatch(/class="crest-img"/);
  });

  it('takes two letters however many words the name has', async () => {
    prisma.schoolConfig.findMany.mockResolvedValue([
      { key: 'school_name', value: 'Groupe Scolaire Officiel de Butare' },
    ]);

    const html = await service.generateTermReportHtml('student-1', 'term-1');
    expect(html).toMatch(/class="crest">GS</);
  });

  it('still prints a card for a school with no name on file', async () => {
    prisma.schoolConfig.findMany.mockResolvedValue([]);

    const html = await service.generateTermReportHtml('student-1', 'term-1');
    expect(html).toMatch(/<html/i);
    expect(html).not.toMatch(/undefined/);
  });
});
