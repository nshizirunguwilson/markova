import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { Role, Prisma, StudentStatus, Gender } from '@prisma/client';
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
      searchIn,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive;

    if (search) {
      // Every word of the query must match something about the user. The
      // optional searchIn scope pins matching to one field group, so "NIT"
      // scoped to class never drags in Anitha by her name.
      const scope = searchIn && searchIn !== 'all' ? searchIn : 'all';
      const inScope = (f: string) => scope === 'all' || scope === f;
      const tokens = search.trim().split(/\s+/).filter(Boolean);

      where.AND = tokens.map((token) => {
        const upper = token.toUpperCase();
        const single = token.length === 1;
        const digit = /^\d$/.test(token);
        const or: Prisma.UserWhereInput[] = [];

        if (inScope('name') && !digit) {
          // A lone letter is an initial; matching it inside every name
          // would flood the list.
          if (single) {
            or.push(
              { firstName: { startsWith: token, mode: 'insensitive' } },
              { lastName: { startsWith: token, mode: 'insensitive' } },
            );
          } else {
            or.push(
              { firstName: { contains: token, mode: 'insensitive' } },
              { lastName: { contains: token, mode: 'insensitive' } },
            );
          }
        }

        if (inScope('email') && !single) {
          or.push({ email: { contains: token, mode: 'insensitive' } });
        }
        if (inScope('phone') && !single) {
          or.push({ phone: { contains: token } });
        }

        if (inScope('code') && (!single || scope === 'code')) {
          or.push(
            {
              student: {
                studentIdNumber: { contains: token, mode: 'insensitive' },
              },
            },
            { code: { contains: token, mode: 'insensitive' } },
          );
        }

        if (inScope('class')) {
          if (digit) {
            // A lone digit points at the year level ("5" in Level 5).
            or.push({
              student: {
                classSection: { classLevel: { name: { contains: token } } },
              },
            });
          } else if (single) {
            or.push({
              student: {
                classSection: { name: { equals: token, mode: 'insensitive' } },
              },
            });
          } else {
            or.push({
              student: {
                classSection: {
                  OR: [
                    {
                      classLevel: {
                        name: { contains: token, mode: 'insensitive' },
                      },
                    },
                    {
                      trade: { code: { contains: token, mode: 'insensitive' } },
                    },
                    {
                      trade: { name: { contains: token, mode: 'insensitive' } },
                    },
                  ],
                },
              },
            });
          }
        }

        if (inScope('role') && !single) {
          const roleMatches = Object.values(Role).filter((r) =>
            r.startsWith(upper),
          );
          if (roleMatches.length) or.push({ role: { in: roleMatches } });
        }

        if (inScope('status') && !single) {
          if ('ACTIVE'.startsWith(upper)) or.push({ isActive: true });
          if ('INACTIVE'.startsWith(upper)) or.push({ isActive: false });
          const statusMatches = Object.values(StudentStatus).filter((st) =>
            st.startsWith(upper),
          );
          if (statusMatches.length) {
            or.push({ student: { status: { in: statusMatches } } });
          }
        }

        // A token no field can match must yield zero rows, not be ignored.
        return or.length ? { OR: or } : { id: { equals: '__no_match__' } };
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
          code: true,
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
              qualification: true,
              roles: true,
              // The teachers page lists what each teacher teaches; without
              // this include every row read "No assignments".
              teacherSubjectClasses: {
                include: {
                  subject: { select: { name: true } },
                  classSection: {
                    include: {
                      classLevel: { select: { name: true } },
                      trade: { select: { code: true } },
                    },
                  },
                },
              },
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
    // Login identifiers are role-shaped: staff sign in with email, parents
    // with their phone, students with either.
    const emailRoles: Role[] = [Role.TEACHER, Role.ADMIN, Role.LIBRARIAN];
    if (emailRoles.includes(dto.role) && !dto.email) {
      throw new BadRequestException(
        'Staff accounts log in with email, so an email address is required',
      );
    }
    if (dto.role === Role.PARENT && !dto.phone) {
      throw new BadRequestException(
        'Parents log in by phone, so a phone number is required',
      );
    }
    if (!dto.email && !dto.phone) {
      throw new BadRequestException(
        'Provide an email or a phone number so the user can log in',
      );
    }
    this.validateNationalId(dto.nationalId, dto.gender, dto.dateOfBirth);

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

    if (dto.nationalId) {
      const existing = await this.prisma.user.findFirst({
        where: { nationalId: dto.nationalId },
      });
      if (existing) {
        throw new ConflictException('National ID already registered');
      }
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
          code: await this.generateUserCode(dto.role, tx),
          nationalId: dto.nationalId || null,
          nationality: dto.nationality || null,
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
            ...(dto.enrollmentDate && {
              enrollmentDate: new Date(dto.enrollmentDate),
            }),
            bloodType: dto.bloodType || null,
            allergies: dto.allergies || null,
            medicalConditions: dto.medicalConditions || null,
            previousSchool: dto.previousSchool || null,
            province: dto.province || null,
            district: dto.district || null,
            sector: dto.sector || null,
            cell: dto.cell || null,
            village: dto.village || null,
            disability: dto.disability || null,
            fatherName: dto.fatherName || null,
            motherName: dto.motherName || null,
            insuranceNumber: dto.insuranceNumber || null,
            isBoarder: dto.isBoarder ?? false,
            religion: dto.religion || null,
          },
        });
      }

      if (dto.role === Role.TEACHER) {
        await tx.teacher.create({
          data: {
            userId: created.id,
            employmentStatus: dto.employmentStatus || 'FULL_TIME',
            qualification: dto.qualification || null,
            rssbNumber: dto.rssbNumber || null,
            hireDate: dto.hireDate ? new Date(dto.hireDate) : null,
            isActive: true,
          },
        });
      }

      if (dto.role === Role.PARENT) {
        // Preferred shape: children with their own relationship each. The
        // legacy studentIds + single relationship stays for bulk import.
        const links =
          dto.children?.length
            ? dto.children
            : (dto.studentIds || []).map((studentId) => ({
                studentId,
                relationship: dto.relationship || 'Parent',
              }));
        for (const link of links) {
          await tx.parentStudent.create({
            data: {
              parentUserId: created.id,
              studentId: link.studentId,
              relationship: link.relationship,
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
        ...(dto.nationalId !== undefined && { nationalId: dto.nationalId }),
        ...(dto.nationality !== undefined && { nationality: dto.nationality }),
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
          ...(dto.previousSchool !== undefined && {
            previousSchool: dto.previousSchool,
          }),
          ...(dto.enrollmentDate && {
            enrollmentDate: new Date(dto.enrollmentDate),
          }),
          ...(dto.province !== undefined && { province: dto.province }),
          ...(dto.district !== undefined && { district: dto.district }),
          ...(dto.sector !== undefined && { sector: dto.sector }),
          ...(dto.cell !== undefined && { cell: dto.cell }),
          ...(dto.village !== undefined && { village: dto.village }),
          ...(dto.disability !== undefined && { disability: dto.disability }),
          ...(dto.fatherName !== undefined && { fatherName: dto.fatherName }),
          ...(dto.motherName !== undefined && { motherName: dto.motherName }),
          ...(dto.insuranceNumber !== undefined && {
            insuranceNumber: dto.insuranceNumber,
          }),
          ...(dto.isBoarder !== undefined && { isBoarder: dto.isBoarder }),
          ...(dto.religion !== undefined && { religion: dto.religion }),
        },
      });
    }

    // Update teacher-specific fields
    if (
      user.teacher &&
      (dto.employmentStatus ||
        dto.qualification ||
        dto.rssbNumber !== undefined ||
        dto.hireDate)
    ) {
      await this.prisma.teacher.update({
        where: { id: user.teacher.id },
        data: {
          ...(dto.employmentStatus && {
            employmentStatus: dto.employmentStatus,
          }),
          ...(dto.qualification && { qualification: dto.qualification }),
          ...(dto.rssbNumber !== undefined && { rssbNumber: dto.rssbNumber }),
          ...(dto.hireDate && { hireDate: new Date(dto.hireDate) }),
        },
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

  // NIDA semantic checks beyond the regex: plausible birth year, and the
  // gender digit / birth year must agree with the profile when provided.
  private validateNationalId(
    nationalId?: string,
    gender?: Gender | null,
    dateOfBirth?: string | null,
  ) {
    if (!nationalId) return;
    const year = parseInt(nationalId.slice(1, 5));
    const currentYear = new Date().getFullYear();
    if (year < 1900 || year > currentYear) {
      throw new BadRequestException(
        `National ID carries an impossible birth year (${year})`,
      );
    }
    const genderDigit = nationalId[5];
    if (gender === 'MALE' && genderDigit !== '8') {
      throw new BadRequestException(
        'National ID gender digit does not match: male IDs carry 8',
      );
    }
    if (gender === 'FEMALE' && genderDigit !== '7') {
      throw new BadRequestException(
        'National ID gender digit does not match: female IDs carry 7',
      );
    }
    if (dateOfBirth) {
      const dobYear = new Date(dateOfBirth).getFullYear();
      if (!Number.isNaN(dobYear) && dobYear !== year) {
        throw new BadRequestException(
          `National ID birth year (${year}) does not match the date of birth (${dobYear})`,
        );
      }
    }
  }

  private async generateStudentId(
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `STD-${year}-`;

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

  // Role-based registration code for everyone who is not a student:
  // TCH-2026-012, PAR-2026-0198, LIB-2026-001, ADM-2026-001.
  private async generateUserCode(
    role: Role,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<string | null> {
    const prefixes: Partial<Record<Role, string>> = {
      [Role.TEACHER]: 'TCH',
      [Role.PARENT]: 'PAR',
      [Role.LIBRARIAN]: 'LIB',
      [Role.ADMIN]: 'ADM',
    };
    const rolePrefix = prefixes[role];
    if (!rolePrefix) return null;

    const year = new Date().getFullYear();
    const prefix = `${rolePrefix}-${year}-`;
    const digits = role === Role.PARENT ? 4 : 3;

    const last = await client.user.findFirst({
      where: { code: { startsWith: prefix } },
      orderBy: { code: 'desc' },
    });
    const sequence = last
      ? parseInt(last.code!.split('-').pop() || '0') + 1
      : 1;
    return `${prefix}${String(sequence).padStart(digits, '0')}`;
  }
}
