import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { SchoolsService } from './schools.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

/**
 * Taking a school on. Until this service, schools could only come from the
 * seed, so a real school could not be onboarded without a developer.
 */
describe('SchoolsService', () => {
  let service: SchoolsService;
  let prisma: ReturnType<typeof createMockPrisma>;
  const accounts = {
    loginFor: jest.fn(),
    attach: jest.fn(),
  };

  const dto = {
    name: 'College Saint Andre',
    slug: 'saint-andre',
    admin: {
      firstName: 'Beatha',
      lastName: 'Uwimana',
      email: 'b.uwimana@saintandre.rw',
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    const module = await Test.createTestingModule({
      providers: [
        SchoolsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountsService, useValue: accounts },
      ],
    }).compile();
    service = module.get(SchoolsService);

    accounts.loginFor.mockResolvedValue({ accountId: 'acc-1', isNew: true });
    prisma.school.findFirst.mockResolvedValue(null);
    prisma.school.create.mockResolvedValue({
      id: 'school-9',
      name: dto.name,
      slug: dto.slug,
    });
    prisma.user.create.mockResolvedValue({
      id: 'user-9',
      firstName: 'Beatha',
      lastName: 'Uwimana',
      email: dto.admin.email,
      phone: null,
    });
  });

  describe('taking a school on', () => {
    it('creates the school and its first principal together', async () => {
      const result = await service.create(dto);
      expect(prisma.school.create).toHaveBeenCalledWith({
        data: { name: dto.name, slug: dto.slug },
      });
      expect(prisma.user.create.mock.calls[0][0].data).toMatchObject({
        accountId: 'acc-1',
        role: 'ADMIN',
        firstName: 'Beatha',
      });
      expect(result.principal.name).toBe('Beatha Uwimana');
    });

    it('hands over a temporary password for a brand new login', async () => {
      const result = await service.create(dto);
      expect(result.tempPassword).toMatch(/^.{10}$/);
      // The hash of that very password is what the account is created with.
      expect(accounts.attach.mock.calls[0][2].passwordHash).toBeTruthy();
    });

    /* One login, many schools: a principal who already runs another school
       keeps their password, so there is nothing to hand over. */
    it('leaves an existing login and its password alone', async () => {
      accounts.loginFor.mockResolvedValue({ accountId: 'acc-1', isNew: false });
      const result = await service.create(dto);
      expect(result.tempPassword).toBeNull();
      expect(accounts.attach.mock.calls[0][2].passwordHash).toBeNull();
    });

    it('refuses a principal with no way to sign in', async () => {
      await expect(
        service.create({
          ...dto,
          admin: { firstName: 'A', lastName: 'B' },
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.school.create).not.toHaveBeenCalled();
    });

    it('refuses a short name that is taken', async () => {
      prisma.school.findFirst.mockResolvedValue({ slug: 'saint-andre' });
      await expect(service.create(dto as never)).rejects.toThrow(
        'That short name is taken',
      );
    });

    it('refuses a school name that is already here', async () => {
      prisma.school.findFirst.mockResolvedValue({ slug: 'other' });
      await expect(service.create(dto as never)).rejects.toThrow(
        ConflictException,
      );
    });

    /* Most Rwandan parents and many heads sign in by phone alone, and a
       missing contact must land in the column as null, not as "". */
    it('keeps a phone-only principal with no empty-string email', async () => {
      await service.create({
        ...dto,
        admin: {
          firstName: 'Beatha',
          lastName: 'Uwimana',
          phone: '+250788123456',
        },
      });
      expect(prisma.user.create.mock.calls[0][0].data).toMatchObject({
        email: null,
        phone: '+250788123456',
      });
    });

    it('numbers the principal ADM-<year>-001', async () => {
      await service.create(dto);
      expect(prisma.user.create.mock.calls[0][0].data.code).toBe(
        `ADM-${new Date().getFullYear()}-001`,
      );
    });
  });

  describe('the list of schools', () => {
    it('answers every school with how many people it holds', async () => {
      prisma.school.findMany.mockResolvedValue([
        {
          id: 's-1',
          name: 'Markova Academy',
          slug: 'markova',
          status: 'ACTIVE',
          _count: { users: 120, students: 90 },
        },
      ]);
      const result = await service.findAll();
      expect(result).toEqual([
        {
          id: 's-1',
          name: 'Markova Academy',
          slug: 'markova',
          status: 'ACTIVE',
          people: 120,
          students: 90,
        },
      ]);
    });
  });
});
