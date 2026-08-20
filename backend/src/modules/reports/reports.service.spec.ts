import { Test, TestingModule } from '@nestjs/testing';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ReportsService } from './reports.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let uploadRoot: string;
  const originalCwd = process.cwd;

  const mockPrisma: any = {
    schoolConfig: { findMany: jest.fn() },
  };

  beforeAll(() => {
    // Lay out a fake uploads tree and point the service's cwd at it.
    uploadRoot = mkdtempSync(join(tmpdir(), 'markova-reports-'));
    mkdirSync(join(uploadRoot, 'uploads', 'branding'), { recursive: true });
    // 1×1 transparent PNG
    writeFileSync(
      join(uploadRoot, 'uploads', 'branding', 'crest.png'),
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64',
      ),
    );
    writeFileSync(join(uploadRoot, 'secret.txt'), 'do not leak me');
    process.cwd = () => uploadRoot;
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

  const inline = (url: string | null) => (service as any).inlineUpload(url);

  describe('inlineUpload()', () => {
    it('returns null when nothing is configured', async () => {
      await expect(inline(null)).resolves.toBeNull();
    });

    it('inlines a stored image as a data URI', async () => {
      const result = await inline('/uploads/branding/crest.png');
      expect(result).toMatch(/^data:image\/png;base64,/);
    });

    it('returns null rather than throwing when the file is gone', async () => {
      await expect(inline('/uploads/branding/missing.png')).resolves.toBeNull();
    });

    it('refuses a file type that is not an image', async () => {
      await expect(inline('/uploads/branding/notes.txt')).resolves.toBeNull();
    });

    it('cannot be walked out of the upload directory', async () => {
      // Even though secret.txt exists one level up, traversal must not reach it.
      await expect(
        inline('/uploads/../../../etc/passwd.png'),
      ).resolves.toBeNull();
      await expect(inline('/uploads/../secret.png')).resolves.toBeNull();
    });
  });

  describe('getSchoolInfo()', () => {
    const call = () => (service as any).getSchoolInfo();

    it('escapes the school name so a stray quote cannot break the document', async () => {
      mockPrisma.schoolConfig.findMany.mockResolvedValue([
        { key: 'school_name', value: '<script>alert(1)</script>' },
      ]);

      const info = await call();

      expect(info.name).not.toContain('<script>');
      expect(info.name).toContain('&lt;script&gt;');
    });

    it('falls back to the brand navy for a malformed colour', async () => {
      mockPrisma.schoolConfig.findMany.mockResolvedValue([
        { key: 'primary_color', value: 'red; } body { display:none' },
      ]);

      await expect(call()).resolves.toMatchObject({ primaryColor: '#1B4F72' });
    });

    it("keeps the school's own colour when it is well formed", async () => {
      mockPrisma.schoolConfig.findMany.mockResolvedValue([
        { key: 'primary_color', value: '#7D3C98' },
      ]);

      await expect(call()).resolves.toMatchObject({ primaryColor: '#7D3C98' });
    });

    it('inlines the crest, stamp and signature together', async () => {
      mockPrisma.schoolConfig.findMany.mockResolvedValue([
        { key: 'logo_url', value: '/uploads/branding/crest.png' },
        { key: 'stamp_url', value: '/uploads/branding/crest.png' },
        { key: 'signature_url', value: '/uploads/branding/crest.png' },
      ]);

      const info = await call();

      expect(info.logoDataUri).toMatch(/^data:image\/png;base64,/);
      expect(info.stampDataUri).toMatch(/^data:image\/png;base64,/);
      expect(info.signatureDataUri).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('renderSchoolHeader()', () => {
    const render = (school: any, title: string, subline?: string) =>
      (service as any).renderSchoolHeader(school, title, subline);

    it('draws the crest when the school has uploaded one', () => {
      const html = render(
        {
          name: 'Markova',
          motto: '',
          logoDataUri: 'data:image/png;base64,AAA',
        },
        'TERM REPORT CARD',
      );
      expect(html).toContain('class="crest"');
      expect(html).toContain('data:image/png;base64,AAA');
    });

    it('omits the crest element entirely when none is set', () => {
      const html = render({ name: 'Markova', motto: '' }, 'TRANSCRIPT');
      expect(html).not.toContain('class="crest"');
      expect(html).toContain('TRANSCRIPT');
    });

    it('escapes the document title', () => {
      const html = render({ name: 'X', motto: '' }, '<b>oops</b>');
      expect(html).not.toContain('<b>oops</b>');
    });

    it('renders the motto only when the school has one', () => {
      expect(render({ name: 'X', motto: '' }, 'T')).not.toContain('motto');
      expect(render({ name: 'X', motto: 'Learn well' }, 'T')).toContain(
        'Learn well',
      );
    });
  });
});
