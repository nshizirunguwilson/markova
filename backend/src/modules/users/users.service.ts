import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TERM_CONDUCT_MARK } from '../../common/conduct';
import { buildStudentId, studentIdSecret } from '../../common/student-id';
import { Role, Prisma, StudentStatus, Gender } from '@prisma/client';
import { PaginatedResponse } from '../../common/dto';
import { CreateUserDto, UpdateUserDto, QueryUserDto } from './dto';
import { hashPassword } from '../../common/password';
import { AccountsService, LoginFor } from '../accounts/accounts.service';
import { labelForRole } from '../../common/role-labels';
import { withPlatform } from '../../prisma/request-context';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private accounts: AccountsService,
  ) {}

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
          account: { select: { forcePasswordChange: true } },
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

    return new PaginatedResponse(
      data.map(({ account, ...user }) => ({
        ...user,
        forcePasswordChange: account.forcePasswordChange,
      })),
      total,
      page,
      limit,
    );
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
        /* How this person signs in. The school shows it so it can tell them,
           and cannot change it: see resetLogin. */
        account: {
          select: { email: true, phone: true, forcePasswordChange: true },
        },
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

    const { account, ...rest } = user;
    return this.withNamedRoleSections({
      ...rest,
      forcePasswordChange: account.forcePasswordChange,
      login: { email: account.email, phone: account.phone },
    });
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

    /*
      The person's login. If the email or phone already signs in to Markova,
      through this school or another, the new record joins that login and
      the person keeps their password. The answer to the admin is the same
      either way (see AccountsService).
    */
    const login = await this.accounts.loginFor(dto.email, dto.phone);
    await this.refuseSameRoleTwice(login, dto.role);

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
          accountId: login.accountId,
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
          role: dto.role,
          firstName: dto.firstName,
          lastName: dto.lastName,
          isActive: true,
        },
      });
      await this.accounts.attach(tx, login, {
        email: dto.email,
        phone: dto.phone,
        passwordHash,
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

    if (!login.isNew) await this.accounts.tellAdded(login.accountId, dto.role);
    return this.findOne(user.id);
  }

  /**
   * A person holds each role in a school once.
   *
   * Asked of this school's own records only, behind its wall, so it reveals
   * nothing about other schools. A teacher being added as a parent at the
   * same school is fine: that is a second record with a second role.
   */
  private async refuseSameRoleTwice(login: LoginFor, role: Role, row?: number) {
    if (login.isNew) return;
    const already = await this.prisma.user.findFirst({
      where: { accountId: login.accountId, role },
      select: { firstName: true, lastName: true },
    });
    if (already) {
      throw new ConflictException(
        `${row ? `Row ${row}: ` : ''}${already.firstName} ${already.lastName} is already a ${labelForRole(role).toLowerCase()} here`,
      );
    }
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

    /*
      Email and phone here are this school's contact details for the person,
      not how they sign in. The login is shared with the person's other
      schools, so only they can change it (after a code), or this school
      through resetLogin when it is their only school. A contact may match
      somebody else's: a family can share one phone.
    */
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

  // ─── RESET HOW SOMEBODY SIGNS IN ────────────────────────────────────────────

  /**
   * Give somebody who lost their phone a way back in.
   *
   * Normally only the person changes how they sign in, because their login
   * is shared with every school they belong to. The one exception, agreed in
   * docs/MULTI-SCHOOL-DESIGN.md: when this school is the only one they
   * belong to, its admin may reset it, having checked in person who they
   * are. A new phone or email if given, and a new password shown once, which
   * they must change when they first sign in. Every device they were signed
   * in on is signed out.
   */
  async resetLogin(id: string, dto: { email?: string; phone?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, accountId: true, account: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const schoolId = await this.prisma.currentSchoolId();
    const elsewhere = await withPlatform(() =>
      this.prisma.user.count({
        where: { accountId: user.accountId, schoolId: { not: schoolId } },
      }),
    );
    if (elsewhere > 0) {
      throw new ForbiddenException(
        'Only this person can change how they sign in, from their own profile.',
      );
    }

    for (const [field, label] of [
      ['email', 'email'],
      ['phone', 'phone number'],
    ] as const) {
      const value = dto[field];
      if (!value || value === user.account[field]) continue;
      const taken = await withPlatform(() =>
        this.prisma.account.count({ where: { [field]: value } }),
      );
      if (taken) {
        throw new ConflictException(
          `That ${label} is already used to sign in to Markova`,
        );
      }
    }

    const password = this.generateTempPassword();
    await this.prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: user.accountId },
        data: {
          ...(dto.email && { email: dto.email }),
          ...(dto.phone && { phone: dto.phone }),
          passwordHash: await hashPassword(password),
          forcePasswordChange: true,
        },
      });
      /* The school's contact details that were the old login move with it. */
      for (const field of ['email', 'phone'] as const) {
        const old = user.account[field];
        if (dto[field] && old) {
          await tx.user.updateMany({
            where: { accountId: user.accountId, [field]: old },
            data: { [field]: dto[field] },
          });
        }
      }
      await tx.userSession.updateMany({
        where: { accountId: user.accountId },
        data: { isActive: false },
      });
    });

    return {
      login: {
        email: dto.email ?? user.account.email,
        phone: dto.phone ?? user.account.phone,
      },
      password,
    };
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
    /*
      Every row's login, found before the transaction: the lookup crosses the
      wall between schools and has to run on its own. Two rows with the same
      email or phone in one file are one person, so the second joins the
      login the first creates.
    */
    const logins: LoginFor[] = [];
    const seen = new Map<string, LoginFor>();
    for (let i = 0; i < rows.length; i++) {
      const { email, phone, role } = rows[i];
      const again = [email, phone]
        .filter((k): k is string => !!k)
        .map((k) => seen.get(k))
        .find(Boolean);
      const login = again
        ? { accountId: again.accountId, isNew: false }
        : await this.accounts.loginFor(email, phone);
      if (!again) await this.refuseSameRoleTwice(login, role, i + 1);
      if (
        again &&
        logins.some(
          (l, j) => l.accountId === again.accountId && rows[j].role === role,
        )
      ) {
        throw new ConflictException(
          `Row ${i + 1}: this person is already in the file as a ${labelForRole(role).toLowerCase()}`,
        );
      }
      for (const k of [email, phone]) if (k) seen.set(k, login);
      logins.push(login);
    }

    const result = await this.prisma.$transaction(async (tx) => {
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
        const login = logins[i];
        const password = this.generateTempPassword();
        const user = await tx.user.create({
          data: {
            accountId: login.accountId,
            email: row.email || null,
            phone: row.phone || null,
            code: await this.generateUserCode(row.role, tx),
            nationalId: row.nationalId?.replace(/\s+/g, '') || null,
            nationality: row.nationality || null,
            ...(row.role !== Role.STUDENT && {
              gender: (row.gender as any) || null,
              dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth) : null,
            }),
            role: row.role,
            firstName: row.firstName,
            lastName: row.lastName,
            isActive: true,
          },
        });
        await this.accounts.attach(tx, login, {
          email: row.email,
          phone: row.phone,
          passwordHash: await hashPassword(password),
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

    for (let i = 0; i < rows.length; i++) {
      const login = logins[i];
      if (!login.isNew && !seenEarlier(logins, i)) {
        await this.accounts.tellAdded(login.accountId, rows[i].role);
      }
    }
    return result;
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

/** Whether an earlier row already joined this login, so it is told once. */
const seenEarlier = (logins: LoginFor[], i: number) =>
  logins.slice(0, i).some((l) => l.accountId === logins[i].accountId);
