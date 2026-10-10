import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TERM_CONDUCT_MARK } from '../../common/conduct';
import { buildStudentId, studentIdSecret } from '../../common/student-id';
import { Role, Prisma, StudentStatus, Gender } from '@prisma/client';
import { PaginatedResponse } from '../../common/dto';
import { CreateUserDto, UpdateUserDto, QueryUserDto } from './dto';
import { hashPassword } from '../../common/password';

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
              // The students list has a Gender column and the export has a
              // gender field. Without this both read "-" for every row.
              gender: true,
              classSection: {
                select: {
                  name: true,
                  classLevel: { select: { name: true } },
                  trade: { select: { code: true, name: true } },
                },
              },
              // Who to call about this student. The list showed a Contact
              // column that was always blank because students carry no phone
              // of their own; the number that matters is a parent's.
              parentStudents: {
                take: 1,
                select: {
                  relationship: true,
                  parent: {
                    select: {
                      firstName: true,
                      lastName: true,
                      phone: true,
                    },
                  },
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
        // The profile page shows it, and the report card prints it where a
        // class teacher or head teacher has to sign.
        signatureUrl: true,
        isActive: true,
        forcePasswordChange: true,
        lastLoginAt: true,
        lastSeenAt: true,
        createdAt: true,
        updatedAt: true,
        // The profile page shows and edits all of these. They were absent
        // from this select, so the National ID and Nationality fields opened
        // empty for everybody and a staff member's own registration code -
        // TCH-…, PAR-…, LIB-…, ADM-… - never appeared anywhere.
        code: true,
        nationalId: true,
        nationality: true,
        gender: true,
        dateOfBirth: true,
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
                subject: { select: { id: true, name: true, category: true } },
                academicYear: {
                  select: { id: true, name: true, isCurrent: true },
                },
                classSection: {
                  include: {
                    classLevel: { select: { name: true } },
                    trade: { select: { code: true, name: true } },
                    _count: {
                      select: { students: { where: { status: 'ACTIVE' } } },
                    },
                  },
                },
              },
              orderBy: { subject: { name: 'asc' } },
            },
            // The week they actually teach, which is what tells you where
            // they are right now.
            timetables: {
              include: {
                subject: { select: { name: true } },
                classSection: {
                  include: {
                    classLevel: { select: { name: true } },
                    trade: { select: { code: true } },
                  },
                },
              },
              orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
            },
            _count: { select: { homeworks: true, marks: true } },
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

    return this.withNamedRoleSections(user);
  }

  /**
   * Names the class a special role is attached to.
   *
   * `TeacherRole.classSectionId` is a plain column rather than a relation in
   * the schema, so "class teacher of Senior 2 B" could only ever be rendered
   * as a uuid. Resolved here in one extra query rather than by adding a
   * foreign key to a table that already has rows.
   */
  private async withNamedRoleSections<
    T extends {
      teacher?: { roles?: { classSectionId: string | null }[] } | null;
    },
  >(user: T): Promise<T> {
    const ids = (user.teacher?.roles ?? [])
      .map((r) => r.classSectionId)
      .filter((id): id is string => !!id);
    if (ids.length === 0) return user;

    const sections = await this.prisma.classSection.findMany({
      where: { id: { in: ids } },
      include: {
        classLevel: { select: { name: true } },
        trade: { select: { code: true, name: true } },
      },
    });
    const byId = new Map(sections.map((s) => [s.id, s]));

    return {
      ...user,
      teacher: {
        ...user.teacher,
        roles: (user.teacher?.roles ?? []).map((r) => ({
          ...r,
          classSection: r.classSectionId
            ? (byId.get(r.classSectionId) ?? null)
            : null,
        })),
      },
    };
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

    // Students need a section up front - fail before any write.
    if (dto.role === Role.STUDENT && !dto.classSectionId) {
      throw new BadRequestException('classSectionId is required for students');
    }

    const passwordHash = await hashPassword(dto.password);

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
          // Student demographics live on the Student record; everyone else
          // carries them here.
          ...(dto.role !== Role.STUDENT && {
            gender: dto.gender || null,
            dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          }),
          passwordHash,
          role: dto.role,
          firstName: dto.firstName,
          lastName: dto.lastName,
          isActive: true,
          forcePasswordChange: true,
        },
      });

      if (dto.role === Role.STUDENT) {
        const studentIdNumber = await this.generateStudentId(
          tx,
          `${created.firstName} ${created.lastName}`,
          created.id,
          dto.enrollmentDate ? new Date(dto.enrollmentDate) : undefined,
        );
        await tx.student.create({
          data: {
            userId: created.id,
            studentIdNumber,
            classSectionId: dto.classSectionId!,
            dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
            gender: dto.gender || null,
            status: dto.status || 'ACTIVE',
            disciplinePoints: TERM_CONDUCT_MARK,
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
        const links = dto.children?.length
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

    // The same NIDA checks `create` runs. They were missing here, so an edit
    // could save an ID whose birth year or gender digit contradicted the
    // profile it was attached to, and a second user could be given an ID that
    // already belonged to someone (which then failed as a unique-constraint
    // 500 rather than a message anyone could act on).
    //
    // Demographics live in two places: a student's gender and date of birth
    // are on Student, everyone else's are on User. Whichever this user has is
    // what the ID is checked against, with anything the edit itself changes
    // taking priority.
    if (dto.nationalId) {
      const currentGender = user.student ? user.student.gender : user.gender;
      const currentDob = user.student
        ? user.student.dateOfBirth
        : user.dateOfBirth;
      this.validateNationalId(
        dto.nationalId,
        dto.gender ?? currentGender,
        dto.dateOfBirth ?? currentDob?.toISOString(),
      );

      const owner = await this.prisma.user.findFirst({
        where: { nationalId: dto.nationalId, id: { not: id } },
        select: { firstName: true, lastName: true },
      });
      if (owner) {
        throw new ConflictException(
          `National ID already registered to ${owner.firstName} ${owner.lastName}`,
        );
      }
    }

    /**
     * Email and phone are unique columns and they are how people sign in, so
     * a clash has to be refused before the write rather than by the database.
     * `create` has always checked them; `update` did not, so editing somebody
     * onto an address another account already held raised a raw Prisma
     * unique-constraint error and surfaced as "An unexpected error occurred".
     *
     * Naming the holder is the difference between a dead end and a fix: the
     * admin can go and look at that account.
     */
    for (const [field, value, label] of [
      ['email', dto.email, 'Email address'],
      ['phone', dto.phone, 'Phone number'],
    ] as const) {
      if (!value) continue;
      const holder = await this.prisma.user.findFirst({
        where: { [field]: value, id: { not: id } },
        select: { firstName: true, lastName: true },
      });
      if (holder) {
        throw new ConflictException(
          `${label} ${value} already belongs to ${holder.firstName} ${holder.lastName}`,
        );
      }
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
        ...(!user.student &&
          dto.gender && {
            gender: dto.gender,
          }),
        ...(!user.student &&
          dto.dateOfBirth && {
            dateOfBirth: new Date(dto.dateOfBirth),
          }),
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

  /** A new photograph, or `null` to take the one on file down. */
  async updatePhoto(id: string, photoUrl: string | null) {
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

  /**
   * The person's own signature, as distinct from the school's.
   *
   * The branding settings hold one signature for the whole school, which is
   * right for a letter the school sends. A report card is not that: it
   * carries a class teacher's mark and a head teacher's mark, and one file
   * shared between them would put the same hand under both names.
   */
  async updateSignature(id: string, signatureUrl: string | null) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.update({
      where: { id },
      data: { signatureUrl },
    });

    return { signatureUrl };
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
      nationalId?: string;
      nationality?: string;
      province?: string;
      district?: string;
      sector?: string;
      cell?: string;
      village?: string;
      fatherName?: string;
      motherName?: string;
      isBoarder?: string;
      previousSchool?: string;
      qualification?: string;
      rssbNumber?: string;
      hireDate?: string;
    }>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const results = {
        created: 0,
        errors: [] as string[],
        // Each user gets their own generated password, returned once so the
        // admin can distribute them; first login forces a change.
        credentials: [] as Array<{
          name: string;
          login: string;
          password: string;
        }>,
      };

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

        const password = this.generateTempPassword();
        const user = await tx.user.create({
          data: {
            email: row.email || null,
            phone: row.phone || null,
            code: await this.generateUserCode(row.role, tx),
            nationalId: row.nationalId?.replace(/\s+/g, '') || null,
            nationality: row.nationality || null,
            ...(row.role !== Role.STUDENT && {
              gender: (row.gender as any) || null,
              dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth) : null,
            }),
            passwordHash: await hashPassword(password),
            role: row.role,
            firstName: row.firstName,
            lastName: row.lastName,
            isActive: true,
            forcePasswordChange: true,
          },
        });
        results.credentials.push({
          name: `${row.firstName} ${row.lastName}`,
          login: row.email || row.phone || '',
          password,
        });

        if (row.role === Role.STUDENT) {
          if (!row.classSectionId) {
            throw new BadRequestException(
              `Row ${i + 1}: classSectionId required for students`,
            );
          }
          const studentIdNumber = await this.generateStudentId(
            tx,
            `${user.firstName} ${user.lastName}`,
            user.id,
          );
          await tx.student.create({
            data: {
              userId: user.id,
              studentIdNumber,
              classSectionId: row.classSectionId,
              dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth) : null,
              gender: (row.gender as any) || null,
              status: 'ACTIVE',
              disciplinePoints: TERM_CONDUCT_MARK,
              province: row.province || null,
              district: row.district || null,
              sector: row.sector || null,
              cell: row.cell || null,
              village: row.village || null,
              fatherName: row.fatherName || null,
              motherName: row.motherName || null,
              isBoarder: String(row.isBoarder).toLowerCase() === 'true',
              previousSchool: row.previousSchool || null,
            },
          });
        }

        if (row.role === Role.TEACHER) {
          await tx.teacher.create({
            data: {
              userId: user.id,
              qualification: (row.qualification as any) || null,
              rssbNumber: row.rssbNumber || null,
              hireDate: row.hireDate ? new Date(row.hireDate) : null,
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
      STUDENT:
        'email,firstName,lastName,classSectionId,gender,dateOfBirth,nationalId,nationality,province,district,sector,cell,village,fatherName,motherName,isBoarder,previousSchool',
      TEACHER:
        'email,phone,firstName,lastName,gender,dateOfBirth,nationalId,qualification,rssbNumber,hireDate',
      PARENT: 'phone,firstName,lastName,nationalId,studentIds,relationship',
      ADMIN: 'email,phone,firstName,lastName,nationalId',
      LIBRARIAN: 'email,phone,firstName,lastName,nationalId',
    };

    return headers[role] || headers.STUDENT;
  }

  // Same policy shape as the wizard's generator: 10 chars with an upper, a
  // lower, a digit and a symbol guaranteed.
  private generateTempPassword(): string {
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
    const digits = '23456789';
    const symbols = '!@#$%&*';
    const all = lower + upper + digits + symbols;
    const pick = (pool: string) => pool[randomInt(pool.length)];
    const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)];
    while (chars.length < 10) chars.push(pick(all));
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
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

  /**
   * Issues a student number, retrying until it lands on a free one.
   *
   * The check digits are three, so a year and name code hold 1000 numbers. The
   * largest group of students sharing a name code in a real roll is 7, but the
   * retry is what makes that a fact about this school rather than a promise.
   */
  private async generateStudentId(
    client: Prisma.TransactionClient,
    fullName: string,
    userId: string,
    enrolledAt?: Date,
  ): Promise<string> {
    const secret = studentIdSecret();
    const year = (enrolledAt ?? new Date()).getFullYear();
    const studentKey = userId;

    for (let nonce = 0; nonce < 50; nonce += 1) {
      const candidate = buildStudentId(secret, {
        fullName,
        year,
        studentKey,
        nonce,
      });
      const taken = await client.student.findFirst({
        where: { studentIdNumber: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    throw new ConflictException(
      'Could not issue a student number; too many share this name and year',
    );
  }

  // Role-based registration code for everyone who is not a student:
  // TCH-2026-012, PAR-2026-0198, LIB-2026-001, ADM-2026-001.
  private async generateUserCode(
    role: Role,
    client: Prisma.TransactionClient,
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
    // A code left behind in an older shape has no number to continue from,
    // and parsing it produced "TCH-2026-NaN", which the office then wrote on
    // somebody's badge. Anything unreadable restarts the sequence.
    const lastSequence = Number.parseInt(
      last?.code?.split('-').pop() ?? '',
      10,
    );
    const sequence = Number.isFinite(lastSequence) ? lastSequence + 1 : 1;
    return `${prefix}${String(sequence).padStart(digits, '0')}`;
  }
}
