import { Test, TestingModule } from '@nestjs/testing';
import { AcademicService } from './academic.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('AcademicService', () => {
  let service: AcademicService;

  const mockPrisma = {
    term: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    academicYear: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    classLevel: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    classSection: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    subject: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    mark: {
      count: jest.fn(),
    },
    student: {
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    yearResult: {
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
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

  // M-5: deletes that would cascade away graded data must be blocked, and
  // deletes blocked by a restrict FK must return 400 (not a raw 500).
  describe('delete guards (M-5)', () => {
    it('deleteSubject refuses when the subject has marks', async () => {
      mockPrisma.subject.findUnique.mockResolvedValue({ id: 'sub-1' });
      mockPrisma.mark.count.mockResolvedValue(12);
      await expect(service.deleteSubject('sub-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.subject.delete).not.toHaveBeenCalled();
    });

    it('deleteSubject succeeds when there are no marks', async () => {
      mockPrisma.subject.findUnique.mockResolvedValue({ id: 'sub-1' });
      mockPrisma.mark.count.mockResolvedValue(0);
      mockPrisma.subject.delete.mockResolvedValue({});
      await expect(service.deleteSubject('sub-1')).resolves.toBeDefined();
      expect(mockPrisma.subject.delete).toHaveBeenCalled();
    });

    it('deleteSubject throws NotFound for a missing subject', async () => {
      mockPrisma.subject.findUnique.mockResolvedValue(null);
      await expect(service.deleteSubject('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deleteTerm refuses when the term has marks', async () => {
      mockPrisma.term.findUnique.mockResolvedValue({ id: 't-1' });
      mockPrisma.mark.count.mockResolvedValue(3);
      await expect(service.deleteTerm('t-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deleteYear refuses when marks/results exist under it', async () => {
      mockPrisma.academicYear.findUnique.mockResolvedValue({ id: 'y-1' });
      mockPrisma.term.findMany.mockResolvedValue([{ id: 't-1' }]);
      mockPrisma.mark.count.mockResolvedValue(5);
      mockPrisma.yearResult.count.mockResolvedValue(0);
      await expect(service.deleteYear('y-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deleteSection returns 400 (not 500) when students are enrolled', async () => {
      mockPrisma.classSection.findUnique.mockResolvedValue({
        id: 'sec-1',
        _count: { students: 4 },
      });
      await expect(service.deleteSection('sec-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.classSection.delete).not.toHaveBeenCalled();
    });

    it('deleteClassLevel returns 400 when it still has students', async () => {
      mockPrisma.classLevel.findUnique.mockResolvedValue({
        id: 'lvl-1',
        _count: { sections: 2 },
      });
      mockPrisma.student.count.mockResolvedValue(10);
      await expect(service.deleteClassLevel('lvl-1')).rejects.toThrow(
        BadRequestException,
      );
    });
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
