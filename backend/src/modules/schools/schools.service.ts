import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { withPlatform, withSchool } from '../../prisma/request-context';
import { hashPassword } from '../../common/password';
import { generateTempPassword } from '../../common/temp-password';
import { CreateSchoolDto } from './dto';

/**
 * Schools, for whoever runs Markova itself.
 *
 * Until now a school could only come from the seed: there was no way to
 * take a real school on without a developer. Creating one makes the School
 * row and its first principal, who signs in with a temporary password and
 * is walked through onboarding (year, terms, classes) by the app itself.
 *
 * Everything here runs on the platform pass: there is no school to be
 * inside while the school is being made.
 */
@Injectable()
export class SchoolsService {
  constructor(
    private prisma: PrismaService,
    private accounts: AccountsService,
  ) {}

  async findAll() {
    return withPlatform(async () => {
      const schools = await this.prisma.school.findMany({
        include: { _count: { select: { users: true, students: true } } },
        orderBy: { createdAt: 'asc' },
      });
      return schools.map(({ _count, ...school }) => ({
        ...school,
        people: _count.users,
        students: _count.students,
      }));
    });
  }

  async create(dto: CreateSchoolDto) {
    const { admin } = dto;
    if (!admin.email && !admin.phone) {
      throw new BadRequestException(
        'The principal needs an email or a phone to sign in with',
      );
    }

    /* One login, many schools: if this person already signs in somewhere,
       the new school is attached to that login and their password stands.
       Refused out loud when the email and phone belong to two people. */
    const login = await this.accounts.loginFor(admin.email, admin.phone);
    const tempPassword = login.isNew ? generateTempPassword() : null;
    const passwordHash = tempPassword ? await hashPassword(tempPassword) : null;

    const school = await withPlatform(async () => {
      const taken = await this.prisma.school.findFirst({
        where: { OR: [{ slug: dto.slug }, { name: dto.name }] },
        select: { slug: true },
      });
      if (taken) {
        throw new ConflictException(
          taken.slug === dto.slug
            ? 'That short name is taken'
            : 'A school with that name is already on Markova',
        );
      }
      return this.prisma.school.create({
        data: { name: dto.name, slug: dto.slug },
      });
    });

    /* The first principal, made inside the new school's own wall. */
    const principal = await withSchool(school.id, () =>
      this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            accountId: login.accountId,
            email: admin.email || null,
            phone: admin.phone || null,
            code: `ADM-${new Date().getFullYear()}-001`,
            role: 'ADMIN',
            firstName: admin.firstName,
            lastName: admin.lastName,
            isActive: true,
          },
        });
        await this.accounts.attach(tx, login, {
          email: admin.email,
          phone: admin.phone,
          passwordHash,
        });
        return created;
      }),
    );

    return {
      school,
      principal: {
        id: principal.id,
        name: `${principal.firstName} ${principal.lastName}`,
        email: principal.email,
        phone: principal.phone,
      },
      /* Shown once, to be handed over; null when the person already signs
         in to another school with their own password. */
      tempPassword,
    };
  }
}
