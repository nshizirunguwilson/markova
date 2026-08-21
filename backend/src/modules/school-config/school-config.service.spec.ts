import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SchoolConfigService } from './school-config.service';
import { PrismaService } from '../../prisma/prisma.service';

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

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchoolConfigService,
        { provide: PrismaService, useValue: mockPrisma },
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
});
