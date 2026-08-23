import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityAudience,
  ActivityKind,
  ConsentState,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * What the school does outside a timetabled lesson.
 *
 * Clubs, matches, assemblies, visiting day and trips. Three questions this has
 * to answer that a paper diary cannot:
 *
 *  - **What is on, and who is it for?** An event is aimed at the whole school,
 *    at year levels, or at named classes, because that is how a school thinks.
 *  - **Who is going?** For a trip this is a safety question. If a bus leaves
 *    with thirty students, somebody has to hold the list of exactly which
 *    thirty.
 *  - **Did the parent agree?** Paper slips get lost, and "I never signed that"
 *    is a conversation no school wants after an accident.
 */
@Injectable()
export class ActivitiesService {
  constructor(private prisma: PrismaService) {}

  private readonly detail = {
    createdBy: { select: { firstName: true, lastName: true } },
    classLevels: { include: { classLevel: { select: { id: true, name: true } } } },
    sections: {
      include: {
        classSection: {
          select: {
            id: true,
            name: true,
            classLevel: { select: { name: true } },
          },
        },
      },
    },
    _count: { select: { participants: true } },
  };

  async create(
    data: {
      kind: ActivityKind;
      title: string;
      description?: string;
      location?: string;
      startsAt: string;
      endsAt?: string;
      audience?: ActivityAudience;
      requiresConsent?: boolean;
      tracksAttendance?: boolean;
      capacity?: number;
      termId?: string;
      classLevelIds?: string[];
      classSectionIds?: string[];
    },
    createdByUserId: string,
  ) {
    const startsAt = new Date(data.startsAt);
    const endsAt = data.endsAt ? new Date(data.endsAt) : null;

    // An event that ends before it starts breaks every calendar that reads it.
    if (endsAt && endsAt < startsAt) {
      throw new BadRequestException(
        'The end of an activity cannot be before its start',
      );
    }

    const audience = data.audience ?? ActivityAudience.WHOLE_SCHOOL;
    if (audience === ActivityAudience.LEVELS && !data.classLevelIds?.length) {
      throw new BadRequestException(
        'Choose at least one year level, or aim this at the whole school',
      );
    }
    if (audience === ActivityAudience.CLASSES && !data.classSectionIds?.length) {
      throw new BadRequestException(
        'Choose at least one class, or aim this at the whole school',
      );
    }

    return this.prisma.activity.create({
      data: {
        kind: data.kind,
        title: data.title,
        description: data.description,
        location: data.location,
        startsAt,
        endsAt,
        audience,
        requiresConsent: data.requiresConsent ?? false,
        tracksAttendance: data.tracksAttendance ?? false,
        capacity: data.capacity,
        termId: data.termId,
        createdByUserId,
        ...(audience === ActivityAudience.LEVELS && {
          classLevels: {
            create: (data.classLevelIds ?? []).map((classLevelId) => ({
              classLevelId,
            })),
          },
        }),
        ...(audience === ActivityAudience.CLASSES && {
          sections: {
            create: (data.classSectionIds ?? []).map((classSectionId) => ({
              classSectionId,
            })),
          },
        }),
      },
      include: this.detail,
    });
  }

  async update(id: string, data: Record<string, any>) {
    const existing = await this.prisma.activity.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Activity not found');

    const startsAt = data.startsAt ? new Date(data.startsAt) : existing.startsAt;
    const endsAt = data.endsAt ? new Date(data.endsAt) : existing.endsAt;
    if (endsAt && endsAt < startsAt) {
      throw new BadRequestException(
        'The end of an activity cannot be before its start',
      );
    }

    return this.prisma.activity.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.location !== undefined && { location: data.location }),
        ...(data.startsAt !== undefined && { startsAt }),
        ...(data.endsAt !== undefined && { endsAt }),
        ...(data.kind !== undefined && { kind: data.kind }),
        ...(data.capacity !== undefined && { capacity: data.capacity }),
        ...(data.requiresConsent !== undefined && {
          requiresConsent: data.requiresConsent,
        }),
        ...(data.tracksAttendance !== undefined && {
          tracksAttendance: data.tracksAttendance,
        }),
      },
      include: this.detail,
    });
  }

  /**
   * Cancelling rather than deleting.
   *
   * A trip that was called off is a thing that happened, and parents who
   * already gave consent need to see why it is not going ahead. Deleting the
   * row would leave them with a slip they signed for nothing.
   */
  async cancel(id: string, reason: string) {
    const activity = await this.prisma.activity.findUnique({ where: { id } });
    if (!activity) throw new NotFoundException('Activity not found');
    return this.prisma.activity.update({
      where: { id },
      data: { isCancelled: true, cancelledReason: reason },
      include: this.detail,
    });
  }

  async remove(id: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id },
      include: { _count: { select: { participants: true } } },
    });
    if (!activity) throw new NotFoundException('Activity not found');
    if (activity._count.participants > 0) {
      throw new BadRequestException(
        'Students are already signed up. Cancel it instead, so their families are told why.',
      );
    }
    await this.prisma.activity.delete({ where: { id } });
    return { success: true };
  }

  async findAll(query: {
    kind?: ActivityKind;
    from?: string;
    to?: string;
    includeCancelled?: boolean;
    page?: number;
    limit?: number;
  }) {
    const where: Prisma.ActivityWhereInput = {};
    if (query.kind) where.kind = query.kind;
    if (!query.includeCancelled) where.isCancelled = false;
    if (query.from || query.to) {
      where.startsAt = {
        ...(query.from && { gte: new Date(query.from) }),
        ...(query.to && { lte: new Date(query.to) }),
      };
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));

    const [total, data] = await Promise.all([
      this.prisma.activity.count({ where }),
      this.prisma.activity.findMany({
        where,
        include: this.detail,
        orderBy: { startsAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findById(id: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id },
      include: {
        ...this.detail,
        participants: {
          include: {
            student: {
              select: {
                id: true,
                studentIdNumber: true,
                user: { select: { firstName: true, lastName: true } },
                classSection: {
                  select: { name: true, classLevel: { select: { name: true } } },
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!activity) throw new NotFoundException('Activity not found');
    return activity;
  }

  /**
   * Everything a student is concerned by, whether they signed up or not.
   *
   * An activity aimed at the whole school concerns them without any row
   * existing, so this is a union of "aimed at me" and "I am on the list".
   *
   * The reply carries the student's own consent state, so a student may only
   * ask about themselves and a parent only about their children. Staff ask
   * about anyone.
   */
  async forStudent(
    studentId: string,
    from?: string,
    viewer?: { userId: string; role: Role },
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        userId: true,
        classSectionId: true,
        classSection: { select: { classLevelId: true } },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    if (viewer?.role === Role.STUDENT && student.userId !== viewer.userId) {
      throw new ForbiddenException('You can only see your own activities');
    }
    if (viewer?.role === Role.PARENT) {
      const link = await this.prisma.parentStudent.findFirst({
        where: { parentUserId: viewer.userId, studentId },
        select: { id: true },
      });
      if (!link) {
        throw new ForbiddenException(
          'You can only see the activities of your own children',
        );
      }
    }

    const activities = await this.prisma.activity.findMany({
      where: {
        isCancelled: false,
        ...(from && { startsAt: { gte: new Date(from) } }),
        OR: [
          { audience: ActivityAudience.WHOLE_SCHOOL },
          {
            audience: ActivityAudience.LEVELS,
            classLevels: {
              some: { classLevelId: student.classSection?.classLevelId },
            },
          },
          {
            audience: ActivityAudience.CLASSES,
            sections: { some: { classSectionId: student.classSectionId } },
          },
          { participants: { some: { studentId } } },
        ],
      },
      include: {
        ...this.detail,
        participants: {
          where: { studentId },
          select: { id: true, consent: true, attended: true },
        },
      },
      orderBy: { startsAt: 'asc' },
    });

    return activities.map((a) => ({
      ...a,
      // Flattened, because "am I signed up and did my parent agree" is one
      // question from the student's side.
      myPlace: a.participants[0] ?? null,
      participants: undefined,
    }));
  }

  /** Put a student on the list. */
  async addParticipant(activityId: string, studentId: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
      include: { _count: { select: { participants: true } } },
    });
    if (!activity) throw new NotFoundException('Activity not found');
    if (activity.isCancelled) {
      throw new BadRequestException('That activity has been cancelled');
    }
    if (
      activity.capacity !== null &&
      activity._count.participants >= activity.capacity
    ) {
      throw new BadRequestException(
        `This activity is full at ${activity.capacity} places`,
      );
    }

    const existing = await this.prisma.activityParticipant.findUnique({
      where: { activityId_studentId: { activityId, studentId } },
    });
    if (existing) return existing;

    return this.prisma.activityParticipant.create({
      data: { activityId, studentId },
    });
  }

  /** Sign up a whole class at once, which is how a club roster is built. */
  async addClass(activityId: string, classSectionId: string) {
    const students = await this.prisma.student.findMany({
      where: { classSectionId, status: 'ACTIVE' },
      select: { id: true },
    });
    let added = 0;
    for (const s of students) {
      const existing = await this.prisma.activityParticipant.findUnique({
        where: { activityId_studentId: { activityId, studentId: s.id } },
      });
      if (existing) continue;
      await this.prisma.activityParticipant.create({
        data: { activityId, studentId: s.id },
      });
      added += 1;
    }
    return { added, alreadyOn: students.length - added };
  }

  async removeParticipant(activityId: string, studentId: string) {
    await this.prisma.activityParticipant.deleteMany({
      where: { activityId, studentId },
    });
    return { success: true };
  }

  /**
   * A parent answering for their own child.
   *
   * The answer is recorded against the person who gave it, because consent
   * that cannot be attributed is not consent.
   */
  async recordConsent(
    activityId: string,
    studentId: string,
    consent: ConsentState,
    note: string | undefined,
    byUserId: string,
    role: Role,
  ) {
    if (role === Role.PARENT) {
      const link = await this.prisma.parentStudent.findFirst({
        where: { parentUserId: byUserId, studentId },
        select: { id: true },
      });
      if (!link) {
        throw new ForbiddenException(
          'A parent can only answer for their own child',
        );
      }
    }

    const participant = await this.prisma.activityParticipant.upsert({
      where: { activityId_studentId: { activityId, studentId } },
      create: {
        activityId,
        studentId,
        consent,
        consentByUserId: byUserId,
        consentAt: new Date(),
        consentNote: note,
      },
      update: {
        consent,
        consentByUserId: byUserId,
        consentAt: new Date(),
        consentNote: note,
      },
    });
    return participant;
  }

  /**
   * Take the register for an activity.
   *
   * A club that never checks who came is a club that quietly stops existing,
   * and for a trip this is the list of who actually got on the bus.
   */
  async markAttendance(
    activityId: string,
    records: { studentId: string; attended: boolean }[],
  ) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
    });
    if (!activity) throw new NotFoundException('Activity not found');

    let marked = 0;
    for (const r of records) {
      await this.prisma.activityParticipant.upsert({
        where: {
          activityId_studentId: { activityId, studentId: r.studentId },
        },
        create: {
          activityId,
          studentId: r.studentId,
          attended: r.attended,
          attendedAt: new Date(),
        },
        update: { attended: r.attended, attendedAt: new Date() },
      });
      marked += 1;
    }
    return { marked };
  }

  /**
   * What is coming up, for a dashboard.
   *
   * Only the next few, because a term's worth of events on a dashboard is a
   * list nobody reads.
   */
  async upcoming(limit = 5) {
    return this.prisma.activity.findMany({
      where: { isCancelled: false, startsAt: { gte: new Date() } },
      include: this.detail,
      orderBy: { startsAt: 'asc' },
      take: Math.min(20, Math.max(1, limit)),
    });
  }

  /**
   * Who still has not answered a consent request.
   *
   * The list a head teacher works from the day before a trip, since an
   * unanswered slip is the one that stops a child getting on the bus.
   */
  async consentSummary(activityId: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
      include: {
        participants: {
          include: {
            student: {
              select: {
                id: true,
                studentIdNumber: true,
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    });
    if (!activity) throw new NotFoundException('Activity not found');

    const by = (state: ConsentState) =>
      activity.participants
        .filter((p) => p.consent === state)
        .map((p) => ({
          studentId: p.student.id,
          name: `${p.student.user.firstName} ${p.student.user.lastName}`,
          studentIdNumber: p.student.studentIdNumber,
        }));

    return {
      activityId,
      requiresConsent: activity.requiresConsent,
      total: activity.participants.length,
      given: by(ConsentState.GIVEN),
      refused: by(ConsentState.REFUSED),
      pending: by(ConsentState.PENDING),
    };
  }
}
