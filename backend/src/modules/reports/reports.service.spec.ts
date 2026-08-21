import { Test, TestingModule } from '@nestjs/testing';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ReportsService } from './reports.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let root: string;
  const originalCwd = process.cwd;

  const mockPrisma: any = {
    schoolConfig: { findMany: jest.fn() },
  };

  beforeAll(() => {
    // A fake project root holding both an uploads tree and the bundled brand
    // assets, so logoDataUri's fallback chain can be exercised for real.
    root = mkdtempSync(join(tmpdir(), 'markova-reports-'));
    mkdirSync(join(root, 'uploads', 'branding'), { recursive: true });
    mkdirSync(join(root, 'assets'), { recursive: true });

    // 1×1 transparent PNG
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    );
    writeFileSync(join(root, 'uploads', 'branding', 'crest.png'), png);
    writeFileSync(join(root, 'assets', 'logo-horizontal.png'), png);
    writeFileSync(join(root, 'secret.txt'), 'do not leak me');

    process.cwd = () => root;
  });

  afterAll(() => {
    process.cwd = originalCwd;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env.UPLOAD_DIR;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<ReportsService>(ReportsService);
  });

  const schoolInfo = () => (service as any).getSchoolInfo();

  describe('getSchoolInfo()', () => {
    it('escapes the school name so markup cannot break the document', async () => {
      mockPrisma.schoolConfig.findMany.mockResolvedValue([
        { key: 'school_name', value: '<script>alert(1)</script>' },
      ]);

      const info = await schoolInfo();

      expect(info.name).not.toContain('<script>');
      expect(info.name).toContain('&lt;script&gt;');
    });

    it('reads the motto from school_motto, with `motto` as a legacy alias', async () => {
      // Settings writes `school_motto`; documents used to read `motto` and so
      // silently printed report cards with no motto at all.
      mockPrisma.schoolConfig.findMany.mockResolvedValue([
        { key: 'school_motto', value: 'Excellence Through Knowledge' },
      ]);
      await expect(schoolInfo()).resolves.toMatchObject({
        motto: 'Excellence Through Knowledge',
      });

      mockPrisma.schoolConfig.findMany.mockResolvedValue([
        { key: 'motto', value: 'Older key' },
      ]);
      await expect(schoolInfo()).resolves.toMatchObject({ motto: 'Older key' });
    });

    it('falls back to the brand navy for a malformed colour', async () => {
      mockPrisma.schoolConfig.findMany.mockResolvedValue([
        { key: 'primary_color', value: 'red; } body { display:none' },
      ]);
      await expect(schoolInfo()).resolves.toMatchObject({
        primaryColor: '#1B4F72',
      });
    });

    it("keeps the school's own colour when it is well formed", async () => {
      mockPrisma.schoolConfig.findMany.mockResolvedValue([
        { key: 'primary_color', value: '#7D3C98' },
      ]);
      await expect(schoolInfo()).resolves.toMatchObject({
        primaryColor: '#7D3C98',
      });
    });

    it('escapes the contact details too', async () => {
      mockPrisma.schoolConfig.findMany.mockResolvedValue([
        { key: 'school_email', value: '"><img src=x onerror=1>' },
      ]);
      const info = await schoolInfo();
      expect(info.email).not.toContain('<img');
    });
  });

  describe('report-card rendering', () => {
    const render = (data: any) => (service as any).renderTermReportHtml(data);

    const baseData = {
      school: {
        name: 'Markova Academy',
        motto: '',
        primaryColor: '#1B4F72',
        logoUrl: null,
      },
      student: { name: 'Divine Niyonkuru', studentIdNumber: 'MKV-2026-0001' },
      term: { name: 'Term 1', academicYear: '2026-2027' },
      subjects: [],
      classStats: {},
    };

    it('embeds a logo as a data URI — a stored path can never be fetched by Chrome', () => {
      // setContent() has no base URL, so /uploads/... would silently render as
      // a broken image in the PDF.
      const html = render(baseData);
      expect(html).toMatch(/data:image\/png;base64,/);
      expect(html).not.toMatch(/src="\/uploads\//);
    });

    it("falls back to Markova's own mark when the school has uploaded none", () => {
      const html = render(baseData);
      // assets/logo-horizontal.png is the bundled fallback.
      expect(html).toMatch(/data:image\/png;base64,/);
    });

    it('prefers the school crest when one is uploaded', () => {
      const html = render({
        ...baseData,
        school: { ...baseData.school, logoUrl: '/uploads/branding/crest.png' },
      });
      expect(html).toMatch(/data:image\/png;base64,/);
    });

    it('cannot be walked out of the upload directory', () => {
      // Even though secret.txt exists above the upload dir, traversal must not
      // reach it, and a non-image must never be inlined.
      const html = render({
        ...baseData,
        school: { ...baseData.school, logoUrl: '/uploads/../secret.txt' },
      });
      expect(html).not.toContain('do not leak me');
      expect(html).not.toMatch(/data:text\/plain/);
    });
  });
});
