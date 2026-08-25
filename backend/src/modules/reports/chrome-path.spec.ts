const existsSync = jest.fn();
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return { ...actual, existsSync: (...args: unknown[]) => existsSync(...args) };
});

const launch = jest.fn();
jest.mock('puppeteer-core', () => ({
  __esModule: true,
  default: { launch: (...args: unknown[]) => launch(...args) },
}));

import { ReportsService } from './reports.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

/**
 * Finding the browser that renders a PDF.
 *
 * A report card is a headless Chrome render, and where Chrome lives depends
 * on the machine: a Docker image built from the Nest example has it at one
 * path, an Ubuntu server at another, a developer's Mac at a third. Getting
 * this wrong means every PDF in the school fails at once with a message about
 * an executable, so all three routes are pinned.
 */
describe('finding Chrome', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReportsService;
  let platform: PropertyDescriptor | undefined;

  const setPlatform = (value: string) => {
    Object.defineProperty(process, 'platform', { value, configurable: true });
  };

  /** Renders anything at all, purely to make the service reach for Chrome. */
  const renderSomething = async () => {
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
    prisma.schoolConfig.findMany.mockResolvedValue([]);
    prisma.reportVerification.findUnique.mockResolvedValue(null);

    await service.generateTermReportPdf('student-1', 'term-1');
    return launch.mock.calls[0][0].executablePath as string;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    platform = Object.getOwnPropertyDescriptor(process, 'platform');
    delete process.env.CHROME_PATH;

    launch.mockResolvedValue({
      newPage: jest.fn().mockResolvedValue({
        setContent: jest.fn().mockResolvedValue(undefined),
        pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF')),
        close: jest.fn().mockResolvedValue(undefined),
      }),
      close: jest.fn().mockResolvedValue(undefined),
    });

    prisma = createMockPrisma();
    service = new ReportsService(prisma);
  });

  afterEach(() => {
    if (platform) Object.defineProperty(process, 'platform', platform);
    delete process.env.CHROME_PATH;
  });

  // A school that installed Chrome somewhere of its own says so, and nothing
  // else gets a look in.
  it('uses the path the environment names, whatever the machine', async () => {
    process.env.CHROME_PATH = '/opt/chrome/chrome';
    existsSync.mockReturnValue(false);

    expect(await renderSomething()).toBe('/opt/chrome/chrome');
    // Nothing on disk was consulted about where Chrome is; the only lookups
    // are the school's own branding assets.
    const chromeLookups = existsSync.mock.calls.filter(([p]: [string]) =>
      /chrom|Chrome/i.test(p),
    );
    expect(chromeLookups).toEqual([]);
  });

  it('looks in the Applications folder on a Mac', async () => {
    setPlatform('darwin');
    existsSync.mockImplementation((p: string) => p.includes('Applications'));

    expect(await renderSomething()).toMatch(/^\/Applications\//);
  });

  it('looks in usr bin on a server', async () => {
    setPlatform('linux');
    existsSync.mockImplementation((p: string) => p === '/usr/bin/chromium');

    expect(await renderSomething()).toBe('/usr/bin/chromium');
  });

  // Nothing found is still a path: puppeteer's own error names the file it
  // could not launch, which is more use than a message about an empty string.
  it('names the first place it looked when it finds nothing', async () => {
    setPlatform('linux');
    existsSync.mockReturnValue(false);

    expect(await renderSomething()).toBe('/usr/bin/chromium-browser');
  });
});
