import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SchoolConfigService } from './school-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../common/cache.service';

describe('SchoolConfigService', () => {
  let service: SchoolConfigService;

  const mockPrisma: any = {
    schoolConfig: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockCache = {
    remember: jest.fn((_key, _ttl, produce: () => unknown) => produce()),
    forget: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCache.remember.mockImplementation((_k, _t, produce: () => unknown) =>
      produce(),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchoolConfigService,
        { provide: PrismaService, useValue: mockPrisma },
        /* The cache asks the source every time here, which keeps these tests
           about what the service returns rather than about Redis. Whether it
           caches at all is held by the tests below. */
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();
    service = module.get<SchoolConfigService>(SchoolConfigService);
  });

  describe('findAll()', () => {
    it('returns the rows and a key/value map of them', async () => {
      mockPrisma.schoolConfig.findMany.mockResolvedValue([
        { key: 'school_name', value: 'Markova' },
        { key: 'primary_color', value: '#1B4F72' },
      ]);

      const result = await service.findAll();

      expect(result.map).toEqual({
        school_name: 'Markova',
        primary_color: '#1B4F72',
      });
      expect(result.configs).toHaveLength(2);
    });
  });

  describe('getPublicBranding()', () => {
    it('exposes only the four branding keys, never anything else', async () => {
      mockPrisma.schoolConfig.findMany.mockResolvedValue([]);

      await service.getPublicBranding();

      expect(mockPrisma.schoolConfig.findMany).toHaveBeenCalledWith({
        where: {
          key: {
            in: ['school_name', 'school_motto', 'primary_color', 'logo_url'],
          },
        },
      });
    });

    it('falls back to Markova defaults when nothing is configured', async () => {
      mockPrisma.schoolConfig.findMany.mockResolvedValue([]);

      await expect(service.getPublicBranding()).resolves.toEqual({
        schoolName: 'Markova',
        schoolMotto: '',
        primaryColor: '#1B4F72',
        logoUrl: '',
        // Where the browser dashboard lives. Empty unless WEB_URL is set, which
        // it is not under test. The mobile app reads it to tell a student where
        // to go, since it does not serve them.
        webUrl: '',
      });
    });

    it("returns the school's own branding once it has been set", async () => {
      mockPrisma.schoolConfig.findMany.mockResolvedValue([
        { key: 'school_name', value: 'Groupe Scolaire Kigali' },
        { key: 'primary_color', value: '#7D3C98' },
        { key: 'logo_url', value: '/uploads/branding/crest.png' },
      ]);

      await expect(service.getPublicBranding()).resolves.toEqual({
        schoolName: 'Groupe Scolaire Kigali',
        schoolMotto: '',
        primaryColor: '#7D3C98',
        logoUrl: '/uploads/branding/crest.png',
        webUrl: '',
      });
    });
  });

  describe('findByKey()', () => {
    it('throws when the key does not exist', async () => {
      mockPrisma.schoolConfig.findUnique.mockResolvedValue(null);
      await expect(service.findByKey('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('bulkUpsert()', () => {
    it('upserts every supplied config', async () => {
      mockPrisma.schoolConfig.upsert.mockImplementation(({ create }: any) =>
        Promise.resolve(create),
      );

      const result = await service.bulkUpsert({
        configs: [
          { key: 'school_name', value: 'Markova' },
          { key: 'school_phone', value: '+250788000000' },
        ],
      });

      expect(mockPrisma.schoolConfig.upsert).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });
  });

  describe('delete()', () => {
    it('refuses to delete a key that is not there', async () => {
      mockPrisma.schoolConfig.findUnique.mockResolvedValue(null);
      await expect(service.delete('nope')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.schoolConfig.delete).not.toHaveBeenCalled();
    });

    it('deletes an existing key', async () => {
      mockPrisma.schoolConfig.findUnique.mockResolvedValue({ key: 'motto' });
      await service.delete('motto');
      expect(mockPrisma.schoolConfig.delete).toHaveBeenCalledWith({
        where: { key: 'motto' },
      });
    });
  });

  describe('getOnboardingStatus()', () => {
    it('reports step 0 and incomplete before onboarding starts', async () => {
      mockPrisma.schoolConfig.findUnique.mockResolvedValue(null);
      await expect(service.getOnboardingStatus()).resolves.toEqual({
        currentStep: 0,
        completed: false,
      });
    });

    it('parses the stored step and completion flag', async () => {
      mockPrisma.schoolConfig.findUnique
        .mockResolvedValueOnce({ value: '3' })
        .mockResolvedValueOnce({ value: 'true' });

      await expect(service.getOnboardingStatus()).resolves.toEqual({
        currentStep: 3,
        completed: true,
      });
    });
  });

  describe('updateBrandingFile()', () => {
    it('stores the uploaded path against the branding key', async () => {
      mockPrisma.schoolConfig.upsert.mockResolvedValue({});
      await service.updateBrandingFile(
        'logo_url',
        '/uploads/branding/crest.png',
      );
      expect(mockPrisma.schoolConfig.upsert).toHaveBeenCalledWith({
        where: { key: 'logo_url' },
        update: { value: '/uploads/branding/crest.png' },
        create: { key: 'logo_url', value: '/uploads/branding/crest.png' },
      });
    });
  });

  /**
   * The settings a school configures once and depends on for ever after:
   * the pass mark, the grading scale, the borrowing limit.
   */
  describe('reading and writing one setting', () => {
    it('refuses a key nobody set, and names it', async () => {
      mockPrisma.schoolConfig.findUnique.mockResolvedValue(null);
      await expect(service.findByKey('pass_threshold')).rejects.toThrow(
        /Config key "pass_threshold" not found/,
      );
    });

    it('writes a key that did not exist yet', async () => {
      mockPrisma.schoolConfig.upsert.mockResolvedValue({});
      await service.upsert({ key: 'pass_mark', value: '50' });
      expect(mockPrisma.schoolConfig.upsert).toHaveBeenCalledWith({
        where: { key: 'pass_mark' },
        update: { value: '50' },
        create: { key: 'pass_mark', value: '50' },
      });
    });

    it('writes a page of settings in one go', async () => {
      mockPrisma.schoolConfig.upsert.mockResolvedValue({});
      const result = await service.bulkUpsert({
        configs: [
          { key: 'a', value: '1' },
          { key: 'b', value: '2' },
        ],
      });
      expect(result).toHaveLength(2);
      expect(mockPrisma.schoolConfig.upsert).toHaveBeenCalledTimes(2);
    });

    it('refuses to remove a key nobody set', async () => {
      mockPrisma.schoolConfig.findUnique.mockResolvedValue(null);
      await expect(service.delete('nope')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.schoolConfig.delete).not.toHaveBeenCalled();
    });

    it('removes one that exists', async () => {
      mockPrisma.schoolConfig.findUnique.mockResolvedValue({
        key: 'pass_mark',
      });
      mockPrisma.schoolConfig.delete.mockResolvedValue({});
      await expect(service.delete('pass_mark')).resolves.toMatchObject({
        message: 'Config "pass_mark" deleted',
      });
    });
  });

  /**
   * The setup wizard's own progress, so a school that stops halfway can pick
   * it up where they left it rather than starting again.
   */
  describe('how far through setup a school is', () => {
    it('starts at the beginning for a school that has done nothing', async () => {
      mockPrisma.schoolConfig.findUnique.mockResolvedValue(null);
      await expect(service.getOnboardingStatus()).resolves.toEqual({
        currentStep: 0,
        completed: false,
      });
    });

    it('reads back the step a school reached', async () => {
      mockPrisma.schoolConfig.findUnique
        .mockResolvedValueOnce({ value: '4' })
        .mockResolvedValueOnce({ value: 'false' });
      await expect(service.getOnboardingStatus()).resolves.toEqual({
        currentStep: 4,
        completed: false,
      });
    });

    it('says a school is finished only when it actually is', async () => {
      mockPrisma.schoolConfig.findUnique
        .mockResolvedValueOnce({ value: '10' })
        .mockResolvedValueOnce({ value: 'true' });
      await expect(service.getOnboardingStatus()).resolves.toEqual({
        currentStep: 10,
        completed: true,
      });
    });

    it('moves the step along', async () => {
      mockPrisma.schoolConfig.upsert.mockResolvedValue({});
      mockPrisma.schoolConfig.findUnique.mockResolvedValue(null);
      await service.updateOnboarding({ currentStep: '5' });
      expect(mockPrisma.schoolConfig.upsert.mock.calls[0][0].where).toEqual({
        key: 'onboarding_step',
      });
    });

    // Finishing is a separate flag, so a school moving between steps never
    // accidentally marks itself done.
    it('does not mark a school finished just for moving a step', async () => {
      mockPrisma.schoolConfig.upsert.mockResolvedValue({});
      mockPrisma.schoolConfig.findUnique.mockResolvedValue(null);
      await service.updateOnboarding({ currentStep: '5' });
      expect(mockPrisma.schoolConfig.upsert).toHaveBeenCalledTimes(1);
    });

    it('marks it finished when told', async () => {
      mockPrisma.schoolConfig.upsert.mockResolvedValue({});
      mockPrisma.schoolConfig.findUnique.mockResolvedValue(null);
      await service.updateOnboarding({
        currentStep: '10',
        completed: 'true',
      });
      expect(mockPrisma.schoolConfig.upsert).toHaveBeenCalledTimes(2);
      expect(mockPrisma.schoolConfig.upsert.mock.calls[1][0].where).toEqual({
        key: 'onboarding_completed',
      });
    });
  });

  /**
   * The one query the whole school makes on every page load.
   *
   * The dashboard asks for the school's name, colour and crest before anybody
   * has signed in, on every page, for everybody. It changes when a school is
   * set up and then perhaps once more, ever, so it is the clearest case in the
   * system for not going to Postgres each time.
   */
  describe('caching the branding', () => {
    it('goes through the cache rather than straight to the database', async () => {
      mockPrisma.schoolConfig.findMany.mockResolvedValue([]);
      await service.getPublicBranding();
      expect(mockCache.remember).toHaveBeenCalledWith(
        'cache:branding:public',
        expect.any(Number),
        expect.any(Function),
      );
    });

    it('does not query at all when the cache answers', async () => {
      mockCache.remember.mockResolvedValue({ schoolName: 'Cached School' });
      const out = await service.getPublicBranding();
      expect(out).toEqual({ schoolName: 'Cached School' });
      expect(mockPrisma.schoolConfig.findMany).not.toHaveBeenCalled();
    });

    /*
      Cleared on write rather than left to expire. A school that changes its
      colour and sees the old one for another ten minutes will change it
      again, and then twice more.
    */
    it('clears it when a single setting is saved', async () => {
      mockPrisma.schoolConfig.upsert.mockResolvedValue({ key: 'k', value: 'v' });
      await service.upsert({ key: 'primary_color', value: '#1B7456' } as never);
      expect(mockCache.forget).toHaveBeenCalledWith('cache:branding:public');
    });

    it('clears it when settings are saved in bulk', async () => {
      mockPrisma.schoolConfig.upsert.mockResolvedValue({ key: 'k', value: 'v' });
      await service.bulkUpsert({
        configs: [{ key: 'school_name', value: 'New' }],
      } as never);
      expect(mockCache.forget).toHaveBeenCalledWith('cache:branding:public');
    });

    it('clears it when a crest is uploaded', async () => {
      mockPrisma.schoolConfig.upsert.mockResolvedValue({ key: 'k', value: 'v' });
      await service.updateBrandingFile('logo_url', '/uploads/logo.png');
      expect(mockCache.forget).toHaveBeenCalledWith('cache:branding:public');
    });

    it('clears it when a setting is deleted', async () => {
      mockPrisma.schoolConfig.findUnique.mockResolvedValue({ key: 'k' });
      mockPrisma.schoolConfig.delete.mockResolvedValue({});
      await service.delete('logo_url');
      expect(mockCache.forget).toHaveBeenCalledWith('cache:branding:public');
    });
  });
});
