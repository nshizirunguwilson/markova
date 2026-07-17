import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { Role, Prisma, StudentStatus } from '@prisma/client';
import { PaginatedResponse } from '../../common/dto';
import { CreateUserDto, UpdateUserDto, QueryUserDto } from './dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // ─── LIST USERS ─────────────────────────────────────────────────────────────

  async findAll(query: QueryUserDto) {
    const {
      page = 1,
      limit = 20,
      role,
      search,
      isActive,
      classSectionId,
      studentStatus,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive;

    if (search) {
      // Every word of the query must match something about the user, so
      // "Ashley Cyuzuzo", "Level 5 AUT B", "graduated teacher" or a code
      // fragment like 2026-1280 all resolve.
      const tokens = search.trim().split(/\s+/).filter(Boolean);
      where.AND = tokens.map((token) => {
        const upper = token.toUpperCase();

        // Single characters get narrow meanings: a digit points at a year
        // level or a code ("5" in "Level 5 AUT B"), a letter at a stream or
        // an initial. Matching them inside every name would flood the list.
        if (token.length === 1) {
          if (/\d/.test(token)) {
            // Every student code and phone contains most digits, so a lone
            // digit can only sensibly mean the year level ("5" in Level 5).
            return {
              student: {
                classSection: { classLevel: { name: { contains: token } } },
              },
            } satisfies Prisma.UserWhereInput;
          }
          return {
            OR: [
              { firstName: { startsWith: token, mode: 'insensitive' } },
              { lastName: { startsWith: token, mode: 'insensitive' } },
              {
                student: {
                  classSection: { name: { equals: token, mode: 'insensitive' } },
                },
              },
            ],
          } satisfies Prisma.UserWhereInput;
        }

        const or: Prisma.UserWhereInput[] = [
          { firstName: { contains: token, mode: 'insensitive' } },
          { lastName: { contains: token, mode: 'insensitive' } },
          { email: { contains: token, mode: 'insensitive' } },
          { phone: { contains: token } },
          {
            student: {
              studentIdNumber: { contains: token, mode: 'insensitive' },
            },
          },
          {
            student: {
              classSection: {
                OR: [
                  {
                    classLevel: {
                      name: { contains: token, mode: 'insensitive' },
                    },
                  },
                  { trade: { code: { contains: token, mode: 'insensitive' } } },
                  { trade: { name: { contains: token, mode: 'insensitive' } } },
                ],
              },
            },
          },
        ];
        const roleMatches = Object.values(Role).filter((r) =>
          r.startsWith(upper),
        );
        if (roleMatches.length) or.push({ role: { in: roleMatches } });
        if ('ACTIVE'.startsWith(upper)) or.push({ isActive: true });
        if ('INACTIVE'.startsWith(upper)) or.push({ isActive: false });
        const statusMatches = Object.values(StudentStatus).filter((st) =>
          st.startsWith(upper),
        );
        if (statusMatches.length) {
          or.push({ student: { status: { in: statusMatches } } });
        }
        return { OR: or };
      });
    }

    if (classSectionId || studentStatus) {
      where.student = {
        ...(classSectionId && { classSectionId }),
        ...(studentStatus && { status: studentStatus as any }),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          phone: true,
          role: true,
          firstName: true,
          lastName: true,
          photoUrl: true,
          isActive: true,
          forcePasswordChange: true,
          lastLoginAt: true,
          createdAt: true,
          student: {
            select: {
              id: true,
              studentIdNumber: true,
              classSectionId: true,
              status: true,
              classSection: {
                select: {
                  name: true,
                  classLevel: { select: { name: true } },
                  trade: { select: { code: true, name: true } },
                },
              },
            },
          },
          teacher: {
            select: {
              id: true,
              employmentStatus: true,
              roles: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return new PaginatedResponse(data, total, page, limit);
  }

  // ─── GET SINGLE USER ───────────────────────────────────────────────────────

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        firstName: true,
        lastName: true,
        photoUrl: true,
        isActive: true,
        forcePasswordChange: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        student: {
          include: {
            classSection: {
              include: { classLevel: true, trade: true },
            },
            parentStudents: {
              include: {
                parent: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phone: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        teacher: {
          include: {
            roles: true,
            teacherSubjectClasses: {
              include: {
                subject: { select: { name: true } },
                classSection: {
                  include: {
                    classLevel: { select: { name: true } },
                    trade: { select: { code: true, name: true } },
                  },
                },
              },
            },
          },
        },
        parentStudents: {
          include: {
            student: {
              include: {
                user: { select: { firstName: true, lastName: true } },
                classSection: {
                  include: {
                    classLevel: { select: { name: true } },
                    trade: { select: { code: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  // ─── CREATE USER ────────────────────────────────────────────────────────────

  async create(dto: CreateUserDto) {
    // Check uniqueness
    if (dto.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing) throw new ConflictException('Email already in use');
    }
    if (dto.phone) {
      const existing = await this.prisma.user.findUnique({
        where: { phone: dto.phone },
      });
      if (existing) throw new ConflictException('Phone already in use');
    }

    // Students need a section up front — fail before any write.
    if (dto.role === Role.STUDENT && !dto.classSectionId) {
      throw new BadRequestException('classSectionId is required for students');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Create the base user and its role-specific record atomically: a failure
    // on the second write (e.g. a bad classSectionId) must not leave an orphan
    // user row with no student/teacher/parent record behind it.
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email || null,
          phone: dto.phone || null,
          passwordHash,
          role: dto.role,
          firstName: dto.firstName,
          lastName: dto.lastName,
          isActive: true,
          forcePasswordChange: true,
        },
      });

      if (dto.role === Role.STUDENT) {
        const studentIdNumber = await this.generateStudentId(tx);
        await tx.student.create({
          data: {
            userId: created.id,
            studentIdNumber,
            classSectionId: dto.classSectionId!,
            dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
            gender: dto.gender || null,
            status: dto.status || 'ACTIVE',
            disciplinePoints: 100,
          },
        });
      }

      if (dto.role === Role.TEACHER) {
        await tx.teacher.create({
          data: {
            userId: created.id,
            employmentStatus: dto.employmentStatus || 'FULL_TIME',
            isActive: true,
          },
        });
      }

      if (dto.role === Role.PARENT && dto.studentIds?.length) {
        for (const studentId of dto.studentIds) {
          await tx.parentStudent.create({
            data: {
              parentUserId: created.id,
              studentId,
              relationship: dto.relationship || 'Parent',
            },
          });
        }
      }

      return created;
    });

    return this.findOne(user.id);
  }

  // ─── UPDATE USER ────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { student: true, teacher: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Update base user fields
    await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    // Update student-specific fields
    if (user.student) {
      await this.prisma.student.update({
        where: { id: user.student.id },
        data: {
          ...(dto.classSectionId && { classSectionId: dto.classSectionId }),
          ...(dto.dateOfBirth && { dateOfBirth: new Date(dto.dateOfBirth) }),
          ...(dto.gender && { gender: dto.gender }),
          ...(dto.status && { status: dto.status }),
          ...(dto.bloodType !== undefined && { bloodType: dto.bloodType }),
          ...(dto.allergies !== undefined && { allergies: dto.allergies }),
          ...(dto.medicalConditions !== undefined && {
            medicalConditions: dto.medicalConditions,
          }),
        },
      });
    }

    // Update teacher-specific fields
    if (user.teacher && dto.employmentStatus) {
      await this.prisma.teacher.update({
        where: { id: user.teacher.id },
        data: { employmentStatus: dto.employmentStatus },
      });
    }

    // Update parent-student links
    if (user.role === Role.PARENT && dto.studentIds) {
      // Remove existing links and recreate
      await this.prisma.parentStudent.deleteMany({
        where: { parentUserId: id },
      });
      for (const studentId of dto.studentIds) {
        await this.prisma.parentStudent.create({
          data: {
            parentUserId: id,
            studentId,
            relationship: dto.relationship || 'Parent',
          },
        });
      }
    }

    return this.findOne(id);
  }

  // ─── SOFT DELETE ────────────────────────────────────────────────────────────

  async softDelete(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    // Invalidate all sessions
    await this.prisma.userSession.updateMany({
      where: { userId: id },
      data: { isActive: false },
    });

    return { message: 'User deactivated successfully' };
  }

  // ─── UPLOAD PHOTO ───────────────────────────────────────────────────────────

  async updatePhoto(id: string, photoUrl: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.update({
      where: { id },
      data: { photoUrl },
    });

    return { photoUrl };
  }

  // ─── BULK IMPORT ────────────────────────────────────────────────────────────

  async bulkImport(
    rows: Array<{
      email?: string;
      phone?: string;
      firstName: string;
      lastName: string;
      role: Role;
      classSectionId?: string;
      gender?: string;
      dateOfBirth?: string;
      relationship?: string;
      studentIds?: string[];
    }>,
  ) {
    const passwordHash = await bcrypt.hash('Markova2025!', 10);

    return this.prisma.$transaction(async (tx) => {
      const results = { created: 0, errors: [] as string[] };

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        // Check for duplicates
        if (row.email) {
          const existing = await tx.user.findUnique({
            where: { email: row.email },
          });
          if (existing) {
            throw new BadRequestException(
              `Row ${i + 1}: Email ${row.email} already exists`,
            );
          }
        }
        if (row.phone) {
          const existing = await tx.user.findUnique({
            where: { phone: row.phone },
          });
          if (existing) {
            throw new BadRequestException(
              `Row ${i + 1}: Phone ${row.phone} already exists`,
            );
          }
        }

        const user = await tx.user.create({
          data: {
            email: row.email || null,
            phone: row.phone || null,
            passwordHash,
            role: row.role,
            firstName: row.firstName,
            lastName: row.lastName,
            isActive: true,
            forcePasswordChange: true,
          },
        });

        if (row.role === Role.STUDENT) {
          if (!row.classSectionId) {
            throw new BadRequestException(
              `Row ${i + 1}: classSectionId required for students`,
            );
          }
          const studentIdNumber = await this.generateStudentId(tx);
          await tx.student.create({
            data: {
              userId: user.id,
              studentIdNumber,
              classSectionId: row.classSectionId,
              dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth) : null,
              gender: (row.gender as any) || null,
              status: 'ACTIVE',
              disciplinePoints: 100,
            },
          });
        }

        if (row.role === Role.TEACHER) {
          await tx.teacher.create({
            data: {
              userId: user.id,
              employmentStatus: 'FULL_TIME',
              isActive: true,
            },
          });
        }

        if (row.role === Role.PARENT && row.studentIds?.length) {
          for (const studentId of row.studentIds) {
            await tx.parentStudent.create({
              data: {
                parentUserId: user.id,
                studentId,
                relationship: row.relationship || 'Parent',
              },
            });
          }
        }

        results.created++;
      }

      return results;
    });
  }

  // ─── CSV TEMPLATE ───────────────────────────────────────────────────────────

  getImportTemplate(role: Role): string {
    const headers: Record<string, string> = {
      STUDENT: 'email,firstName,lastName,classSectionId,gender,dateOfBirth',
      TEACHER: 'email,phone,firstName,lastName',
      PARENT: 'phone,firstName,lastName,studentIds,relationship',
      ADMIN: 'email,phone,firstName,lastName',
      LIBRARIAN: 'email,phone,firstName,lastName',
    };

    return headers[role] || headers.STUDENT;
  }

  // ─── HELPERS ────────────────────────────────────────────────────────────────

  private async generateStudentId(
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `MKV-${year}-`;

    const lastStudent = await client.student.findFirst({
      where: { studentIdNumber: { startsWith: prefix } },
      orderBy: { studentIdNumber: 'desc' },
    });

    let sequence = 1;
    if (lastStudent) {
      const lastNum = parseInt(
        lastStudent.studentIdNumber.split('-').pop() || '0',
      );
      sequence = lastNum + 1;
    }

    return `${prefix}${String(sequence).padStart(4, '0')}`;
  }
}
