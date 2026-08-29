import { ReportsService } from './reports.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

/**
 * Every document the school issues carries its stamp across the middle.
 *
 * There are three sheets, each with its own `<!DOCTYPE html>` and its own
 * stylesheet: the term report card, the annual report, and the letter shell
 * that transfer letters, transcripts and discipline reports are printed on.
 * Three sheets is three places to forget the mark, which is the whole reason
 * these cases exist.
 *
 * The stamp is read from disk and inlined, so the filesystem is stood in for
 * here rather than reached.
 */
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: (p: string) => /stamp\.png$/.test(String(p)),
    readFileSync: (p: string, ...rest: unknown[]) =>
      /stamp\.png$/.test(String(p))
        ? Buffer.from('STAMPBYTES')
        : (actual.readFileSync as (...a: unknown[]) => Buffer)(p, ...rest),
  };
});

describe('the stamp printed across every document', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;

  /** A school that has uploaded a stamp, unless a case says otherwise. */
  const branding = (stamp: string | null = '/uploads/branding/stamp.png') => [
    { key: 'school_name', value: 'Markova TSS' },
    { key: 'school_address', value: 'Kigali, Rwanda' },
    { key: 'primary_color', value: '#1B4F72' },
    ...(stamp ? [{ key: 'stamp_url', value: stamp }] : []),
  ];

  const student = {
    id: 'student-1',
    studentIdNumber: 'STD-2026-0001',
    dateOfBirth: new Date('2012-04-02'),
    gender: 'FEMALE',
    isBoarder: true,
    user: { firstName: 'Divine', lastName: 'Niyonkuru', photoUrl: null },
    classSection: {
      id: 'section-1',
      name: 'A',
      classLevel: { id: 'level-1', name: 'Senior 1', stage: 'O_LEVEL' },
      trade: null,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    service = new ReportsService(prisma);

    prisma.student.findUnique.mockResolvedValue(student);
    prisma.term.findUnique.mockResolvedValue({
      id: 'term-1',
      name: 'Term 1',
      academicYear: { id: 'year-1', name: '2026-2027' },
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-12-15'),
    });
    prisma.academicYear.findUnique.mockResolvedValue({
      id: 'year-1',
      name: '2026-2027',
    });
    prisma.term.findMany.mockResolvedValue([]);
    prisma.mark.findMany.mockResolvedValue([]);
    prisma.termResult.findMany.mockResolvedValue([]);
    prisma.termResult.findFirst.mockResolvedValue(null);
    prisma.yearResult.findFirst.mockResolvedValue(null);
    prisma.disciplineIncident.findMany.mockResolvedValue([]);
    prisma.meritAward.findMany.mockResolvedValue([]);
    prisma.attendance.count.mockResolvedValue(0);
    prisma.teacherRole.findFirst.mockResolvedValue(null);
    prisma.reportVerification.findUnique.mockResolvedValue(null);
    prisma.reportVerification.upsert.mockResolvedValue({
      code: '1234-5678-9012',
      createdAt: new Date('2026-08-01'),
    });
    prisma.schoolConfig.findMany.mockResolvedValue(branding());
  });

  /** The three sheets, each reached the way the app reaches it. */
  const sheets: [string, () => Promise<string>][] = [
    [
      'the term report card',
      () => service.generateTermReportHtml('student-1', 'term-1'),
    ],
    [
      'the annual report',
      () => service.generateYearReportHtml('student-1', 'year-1'),
    ],
    [
      'a letter on the school shell',
      async () =>
        (await service.generateDocument('student-1', 'transfer_letter')).html,
    ],
  ];

  describe.each(sheets)('%s', (_name, render) => {
    it('carries the stamp', async () => {
      const html = await render();
      expect(html).toContain('class="watermark"');
      expect(html).toContain(Buffer.from('STAMPBYTES').toString('base64'));
    });

    it('prints it at six per cent, in grey, across 90% of the width', async () => {
      const html = await render();
      expect(html).toContain('opacity:0.06');
      expect(html).toContain('grayscale(1)');
      expect(html).toContain('width:90%');
    });

    /*
      Chrome repeats a fixed element on every printed page. Absolute puts the
      mark on page one and nowhere else, and a transcript runs to several.
    */
    it('fixes it, so a long document carries it on every page', async () => {
      expect(await render()).toContain('position:fixed');
    });

    // Chrome drops low-opacity art from a print unless told to keep it, and
    // the PDF renderer is a print.
    it('tells the renderer to keep it', async () => {
      expect(await render()).toContain('print-color-adjust:exact');
    });

    it('keeps the content above it', async () => {
      expect(await render()).toContain('z-index:1');
    });

    it('hides it from anything reading the document aloud', async () => {
      expect(await render()).toContain('aria-hidden="true"');
    });

    /**
     * No house fallback. A school with no stamp of its own would otherwise
     * have Markova's mark printed across its report cards, which is the same
     * mistake the letterhead already refuses to make with the signature.
     */
    it('draws nothing when the school has uploaded no stamp', async () => {
      prisma.schoolConfig.findMany.mockResolvedValue(branding(null));
      expect(await render()).not.toContain('class="watermark"');
    });

    it('still renders the document itself without a stamp', async () => {
      prisma.schoolConfig.findMany.mockResolvedValue(branding(null));
      const html = await render();
      expect(html).toContain('Markova TSS');
      expect(html).toContain('Divine');
    });
  });
});
