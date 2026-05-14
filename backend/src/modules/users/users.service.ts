import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { Role, Prisma } from '@prisma/client';
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
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive;

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    if (classSectionId) {
      where.student = { classSectionId };
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
              include: { classLevel: true },
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
                  include: { classLevel: { select: { name: true } } },
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
                  include: { classLevel: { select: { name: true } } },
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

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
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

    // Create role-specific records
    if (dto.role === Role.STUDENT) {
      if (!dto.classSectionId) {
        throw new BadRequestException(
          'classSectionId is required for students',
        );
      }
      const studentIdNumber = await this.generateStudentId();
      await this.prisma.student.create({
        data: {
          userId: user.id,
          studentIdNumber,
          classSectionId: dto.classSectionId,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          gender: dto.gender || null,
          status: dto.status || 'ACTIVE',
          disciplinePoints: 100,
        },
      });
    }

    if (dto.role === Role.TEACHER) {
      await this.prisma.teacher.create({
        data: {
          userId: user.id,
          employmentStatus: dto.employmentStatus || 'FULL_TIME',
          isActive: true,
        },
      });
    }

    if (dto.role === Role.PARENT && dto.studentIds?.length) {
      for (const studentId of dto.studentIds) {
        await this.prisma.parentStudent.create({
          data: {
            parentUserId: user.id,
            studentId,
            relationship: dto.relationship || 'Parent',
          },
        });
      }
    }

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
          const studentIdNumber = await this.generateStudentId();
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

  private async generateStudentId(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `MKV-${year}-`;

    const lastStudent = await this.prisma.student.findFirst({
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
