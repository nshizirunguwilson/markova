import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;

  // tx client mirrors the prisma mock so $transaction(cb) runs against the same fns
  const mockPrisma: any = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    student: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    teacher: { create: jest.fn() },
    parentStudent: { create: jest.fn(), deleteMany: jest.fn() },
    userSession: { updateMany: jest.fn() },
  };
  mockPrisma.$transaction = jest.fn((cb: any) =>
    typeof cb === 'function' ? cb(mockPrisma) : Promise.all(cb),
  );

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<UsersService>(UsersService);
  });

  const baseDto = {
    email: 'new@markova.test',
    password: 'Password123!',
    role: 'TEACHER' as any,
    firstName: 'New',
    lastName: 'Teacher',
  };

  describe('create()', () => {
    it('creates a teacher with a teacher record', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null); // uniqueness ok
      mockPrisma.user.create.mockResolvedValue({ id: 'u1' });
      mockPrisma.teacher.create.mockResolvedValue({ id: 't1' });
      // findOne() at the end
      mockPrisma.user.findUnique.mockResolvedValueOnce(null); // email check
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        role: 'TEACHER',
      });

      const result = await service.create(baseDto);

      expect(mockPrisma.user.create).toHaveBeenCalled();
      expect(mockPrisma.teacher.create).toHaveBeenCalled();
      expect(result).toMatchObject({ id: 'u1' });
    });

    it('rejects duplicate email with ConflictException', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.create(baseDto)).rejects.toThrow(ConflictException);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('requires classSectionId for a STUDENT', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'u2' });
      await expect(
        service.create({ ...baseDto, role: 'STUDENT' as any }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a phone-only teacher: staff log in with email', async () => {
      await expect(
        service.create({
          ...baseDto,
          email: undefined,
          phone: '+250781234567',
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects an email-only parent: parents log in by phone', async () => {
      await expect(
        service.create({
          ...baseDto,
          role: 'PARENT' as any,
          email: 'parent@markova.edu',
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects a user with neither email nor phone', async () => {
      await expect(
        service.create({ ...baseDto, email: undefined } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects a national ID whose gender digit contradicts the gender', async () => {
      await expect(
        service.create({
          ...baseDto,
          role: 'STUDENT' as any,
          classSectionId: 'sec-1',
          gender: 'FEMALE' as any,
          nationalId: '1200880123456012', // gender digit 8 = male
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('links a parent to children with per-child relationships', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // email uniqueness
        .mockResolvedValueOnce(null) // phone uniqueness
        .mockResolvedValue({ id: 'p1', role: 'PARENT' }); // findOne()
      mockPrisma.user.create.mockResolvedValue({ id: 'p1' });
      mockPrisma.parentStudent.create.mockResolvedValue({});

      await service.create({
        ...baseDto,
        role: 'PARENT',
        phone: '+250731112223',
        children: [
          { studentId: 's1', relationship: 'Father' },
          { studentId: 's2', relationship: 'Guardian' },
        ],
      });

      expect(mockPrisma.parentStudent.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.parentStudent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            studentId: 's2',
            relationship: 'Guardian',
          }),
        }),
      );
    });

    it('M-3: wraps the user + role record creation in a single transaction', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // email uniqueness check
        .mockResolvedValue({ id: 'u3', role: 'TEACHER' }); // findOne()
      mockPrisma.user.create.mockResolvedValue({ id: 'u3' });
      mockPrisma.teacher.create.mockResolvedValue({ id: 't3' });

      await service.create(baseDto);

      // Atomicity: the base user and its role record must be created together,
      // so a failure half-way cannot leave an orphan user row.
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('update()', () => {
    it('throws NotFoundException for a missing user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.update('missing', { firstName: 'X' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates base + student fields when the user is a student', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1',
        role: 'STUDENT',
        student: { id: 's1' },
        teacher: null,
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.student.update.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' }); // findOne

      await service.update('u1', {
        firstName: 'Edited',
        gender: 'MALE',
      } as any);

      expect(mockPrisma.user.update).toHaveBeenCalled();
      expect(mockPrisma.student.update).toHaveBeenCalled();
    });
  });

  describe('softDelete()', () => {
    it('deactivates the user and kills their sessions', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.userSession.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.softDelete('u1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { isActive: false },
      });
      expect(mockPrisma.userSession.updateMany).toHaveBeenCalled();
      expect(result.message).toMatch(/deactivated/i);
    });

    it('throws NotFoundException for a missing user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.softDelete('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
