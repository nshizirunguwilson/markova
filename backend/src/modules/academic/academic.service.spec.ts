import { Test, TestingModule } from '@nestjs/testing';
import { AcademicService } from './academic.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('AcademicService', () => {
  let service: AcademicService;

  const mockPrisma = {
    term: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    academicYear: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    classSection: {
      findUnique: jest.fn(),
    },
    student: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    yearResult: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    schoolConfig: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AcademicService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AcademicService>(AcademicService);
    jest.clearAllMocks();
  });

  describe('closeTerm', () => {
    it('should close a term successfully', async () => {
      mockPrisma.term.findUnique.mockResolvedValue({
        id: 'term-1',
        isClosed: false,
      });
      mockPrisma.term.update.mockResolvedValue({
        id: 'term-1',
        isClosed: true,
        isCurrent: false,
      });

      const result = await service.closeTerm('term-1');

      expect(mockPrisma.term.update).toHaveBeenCalledWith({
        where: { id: 'term-1' },
        data: { isClosed: true, isCurrent: false },
      });
      expect(result.isClosed).toBe(true);
    });

    it('should throw NotFoundException for non-existent term', async () => {
      mockPrisma.term.findUnique.mockResolvedValue(null);

      await expect(service.closeTerm('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('reopenTerm', () => {
    it('should reopen a closed term', async () => {
      mockPrisma.term.findUnique.mockResolvedValue({
        id: 'term-1',
        isClosed: true,
      });
      mockPrisma.term.update.mockResolvedValue({
        id: 'term-1',
        isClosed: false,
      });

      const result = await service.reopenTerm('term-1');

      expect(mockPrisma.term.update).toHaveBeenCalledWith({
        where: { id: 'term-1' },
        data: { isClosed: false },
      });
    });
  });

  describe('findAllTerms', () => {
    it('should return all terms for an academic year', async () => {
      const mockTerms = [
        { id: 'term-1', name: 'Term 1', isCurrent: true, isClosed: false },
        { id: 'term-2', name: 'Term 2', isCurrent: false, isClosed: false },
      ];
      mockPrisma.term.findMany.mockResolvedValue(mockTerms);

      const result = await service.findAllTerms('year-1');

      expect(result).toEqual(mockTerms);
      expect(mockPrisma.term.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { academicYearId: 'year-1' },
        }),
      );
    });
  });
});
