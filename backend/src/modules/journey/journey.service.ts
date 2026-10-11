import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JourneyStep, PauseKind, Role, StudentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingService } from '../messaging/messaging.service';
import {
  FamilyNews,
  PAUSE_LABEL,
  STANDING_LABEL,
  asDay,
  coversDay,
  dayBefore,
  familyMayHear,
  schoolDay,
  whatStops,
} from '../../common/student-standing';
import {
  BackDto,
  LeaveDto,
  PassedAwayDto,
  PauseDto,
  ReadmitDto,
  LEAVING,
} from './dto';

/**
 * A student's journey through the school (docs/STUDENT-LIFE-DESIGN.md, B8 and
 * A9).
 *
 * The only way a student's standing changes. Every change is kept, with the
 * day, the reason and who decided, and does what the change means: a student
 * who leaves loses their card and their place in the class chat; a student
 * who passed away is never written to again. What each standing stops is in
 * common/student-standing.ts.
 */
@Injectable()
export class JourneyService {
  constructor(
    private prisma: PrismaService,
    private messaging: MessagingService,
  ) {}

  // ─── reading ──────────────────────────────────────────────────────────────

  /** Where a student stands, what is paused, and how they got here. */
  async journey(studentId: string) {
    const student = await this.student(studentId);
    const today = schoolDay();
    const [entries, pauses] = await Promise.all([
      this.prisma.studentJourneyEntry.findMany({
        where: { studentId },
        orderBy: [{ happenedOn: 'desc' }, { createdAt: 'desc' }],
        include: {
          recordedBy: { select: { firstName: true, lastName: true } },
          classSection: {
            select: {
              name: true,
              classLevel: { select: { name: true } },
              trade: { select: { code: true } },
            },
          },
        },
      }),
      // The pause covering today, or the next one booked.
      this.prisma.studentPause.findMany({
        where: {
          studentId,
          OR: [{ endsOn: null }, { endsOn: { gte: today } }],
        },
        orderBy: { startsOn: 'asc' },
      }),
    ]);
    const pause =
      pauses.find((p) => p.startsOn.getTime() <= today.getTime()) ?? null;
    const upcoming =
      pauses.find((p) => p.startsOn.getTime() > today.getTime()) ?? null;
    return {
      status: student.status,
      label: STANDING_LABEL[student.status],
      pause,
      upcoming,
      stops: whatStops(student.status, pause?.kind ?? null),
      entries,
    };
  }

  /** Whether a message of this kind may reach the student's family. */
  familyMayHear(studentId: string, kind: FamilyNews, day?: Date) {
    return familyMayHear(this.prisma, studentId, kind, day);
  }

  // ─── time out of school ───────────────────────────────────────────────────

  /** A suspension, which always has an end, or time away, which may not. */
  async pause(
    studentId: string,
    kind: PauseKind,
    dto: PauseDto,
    byUserId: string,
  ) {
    const student = await this.student(studentId);
    if (student.status !== StudentStatus.ACTIVE) {
      throw new BadRequestException(
        `${this.name(student)} is not on the roll (${STANDING_LABEL[student.status].toLowerCase()}), so cannot be ${kind === PauseKind.SUSPENDED ? 'suspended' : 'marked away'}`,
      );
    }
    const startsOn = asDay(dto.startsOn);
    const endsOn = dto.endsOn ? asDay(dto.endsOn) : null;
    if (kind === PauseKind.SUSPENDED && !endsOn) {
      throw new BadRequestException('A suspension needs the day it ends');
    }
    if (endsOn && endsOn.getTime() < startsOn.getTime()) {
      throw new BadRequestException('The last day cannot be before the first');
    }

    // One pause at a time: two covering the same day would be two answers.
    const overlapping = await this.prisma.studentPause.findFirst({
      where: {
        studentId,
        ...(endsOn ? { startsOn: { lte: endsOn } } : {}),
        OR: [{ endsOn: null }, { endsOn: { gte: startsOn } }],
      },
      select: { kind: true },
    });
    if (overlapping) {
      throw new ConflictException(
        `${this.name(student)} is already ${PAUSE_LABEL[overlapping.kind].toLowerCase()} for some of those days. Bring them back first, or choose other days.`,
      );
    }

    if (dto.disciplineIncidentId) {
      const incident = await this.prisma.disciplineIncident.findFirst({
        where: { id: dto.disciplineIncidentId, studentId },
        select: { id: true },
      });
      if (!incident) {
        throw new BadRequestException(
          'That discipline record is not about this student',
        );
      }
    }

    const step =
      kind === PauseKind.SUSPENDED ? JourneyStep.SUSPENDED : JourneyStep.AWAY;
    const [pause] = await this.prisma.$transaction(async (tx) => [
      await tx.studentPause.create({
        data: {
          studentId,
          kind,
          startsOn,
          endsOn,
          reason: dto.reason.trim(),
          note: dto.note?.trim() || null,
          disciplineIncidentId: dto.disciplineIncidentId ?? null,
          recordedByUserId: byUserId,
        },
      }),
      await tx.studentJourneyEntry.create({
        data: {
          studentId,
          step,
          happenedOn: startsOn,
          until: endsOn,
          reason: dto.reason.trim(),
          note: dto.note?.trim() || null,
          recordedByUserId: byUserId,
        },
      }),
    ]);
    return pause;
  }

  /**
   * Back at school from the day given: the pause covering it, or the next
   * one booked, ends the day before. A pause that had not started yet is
   * cancelled.
   */
  async back(studentId: string, dto: BackDto, byUserId: string) {
    const student = await this.student(studentId);
    const on = dto.on ? asDay(dto.on) : schoolDay();
    const pause = await this.prisma.studentPause.findFirst({
      where: {
        studentId,
        OR: [{ endsOn: null }, { endsOn: { gte: on } }],
      },
      orderBy: { startsOn: 'asc' },
    });
    if (!pause) {
      throw new BadRequestException(
        `${this.name(student)} is not suspended or away`,
      );
    }
    /* Ending the day before it began leaves a pause that covers no day:
       cancelled, and still in the record. */
    const endsOn =
      on.getTime() <= pause.startsOn.getTime()
        ? dayBefore(pause.startsOn)
        : dayBefore(on);
    await this.prisma.$transaction(async (tx) => {
      await tx.studentPause.update({
        where: { id: pause.id },
        data: { endsOn },
      });
      await tx.studentJourneyEntry.create({
        data: {
          studentId,
          step: JourneyStep.BACK,
          happenedOn: on,
          note: dto.note?.trim() || null,
          recordedByUserId: byUserId,
        },
      });
    });
    return this.journey(studentId);
  }

  // ─── leaving, and coming back ─────────────────────────────────────────────

  /** Withdrawn, expelled, transferred or graduated. */
  async leave(studentId: string, dto: LeaveDto, byUserId: string) {
    const student = await this.student(studentId);
    if (!LEAVING.includes(dto.status)) {
      throw new BadRequestException('Not a way of leaving the school');
    }
    if (student.status !== StudentStatus.ACTIVE) {
      throw new BadRequestException(
        `${this.name(student)} has already left (${STANDING_LABEL[student.status].toLowerCase()})`,
      );
    }
    await this.close(student, dto.status, asDay(dto.on), byUserId, {
      reason: dto.reason.trim(),
      note: dto.note?.trim() || null,
    });
    return this.journey(studentId);
  }

  /**
   * A student who passed away.
   *
   * Their record stays, and their family can still open what was already
   * theirs (past report cards). Nothing more is ever sent about them, they
   * leave every register and the class chat, and nobody can sign in as them.
   */
  async passedAway(studentId: string, dto: PassedAwayDto, byUserId: string) {
    const student = await this.student(studentId);
    if (student.status === StudentStatus.PASSED_AWAY) {
      throw new BadRequestException('This has already been recorded');
    }
    await this.close(
      student,
      StudentStatus.PASSED_AWAY,
      asDay(dto.on),
      byUserId,
      { reason: null, note: dto.note?.trim() || null },
    );
    return this.journey(studentId);
  }

  /** Back on the roll after leaving: to the same class, or another. */
  async readmit(studentId: string, dto: ReadmitDto, byUserId: string) {
    const student = await this.student(studentId);
    if (student.status === StudentStatus.ACTIVE) {
      throw new BadRequestException(`${this.name(student)} is on the roll`);
    }
    if (student.status === StudentStatus.PASSED_AWAY) {
      throw new BadRequestException(
        'A student recorded as passed away cannot be readmitted. If it was recorded by mistake, ask Markova support.',
      );
    }
    const section = await this.prisma.classSection.findUnique({
      where: { id: dto.classSectionId },
      select: { id: true },
    });
    if (!section) throw new NotFoundException('Class not found');

    const on = asDay(dto.on);
    await this.prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id: studentId },
        data: { status: StudentStatus.ACTIVE, classSectionId: section.id },
      });
      await tx.studentJourneyEntry.create({
        data: {
          studentId,
          step: JourneyStep.READMITTED,
          happenedOn: on,
          reason: dto.reason.trim(),
          note: dto.note?.trim() || null,
          classSectionId: section.id,
          recordedByUserId: byUserId,
        },
      });
    });
    await this.messaging.ensureClassGroup(section.id);
    return this.journey(studentId);
  }

  // ─── a parent ─────────────────────────────────────────────────────────────

  /**
   * A parent who passed away.
   *
   * Their account stops, so nothing more is sent to them. Each child's class
   * teacher is told privately, so they can look out for the child. A child
   * left with no parent or guardian at all is put to the principal at once:
   * otherwise fee notices and report cards go to nobody.
   */
  async parentPassedAway(userId: string, dto: PassedAwayDto) {
    const parent = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        firstName: true,
        lastName: true,
        passedAwayOn: true,
        parentStudents: {
          select: {
            relationship: true,
            student: {
              select: {
                id: true,
                status: true,
                classSectionId: true,
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    });
    if (!parent) throw new NotFoundException('User not found');
    if (parent.role !== Role.PARENT) {
      throw new BadRequestException('This is for a parent or guardian');
    }
    if (parent.passedAwayOn) {
      throw new BadRequestException('This has already been recorded');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false, passedAwayOn: asDay(dto.on) },
    });

    const children = parent.parentStudents
      .map((l) => ({ ...l.student, relationship: l.relationship }))
      .filter((c) => c.status === StudentStatus.ACTIVE);
    const principals = await this.prisma.user.findMany({
      where: { role: Role.ADMIN, isActive: true },
      select: { id: true },
    });

    const withoutGuardian: string[] = [];
    for (const child of children) {
      const childName = `${child.user.firstName} ${child.user.lastName}`;
      const others = await this.prisma.parentStudent.count({
        where: {
          studentId: child.id,
          parentUserId: { not: userId },
          parent: { isActive: true },
        },
      });

      // Private, to the one adult who sees the child every day.
      const classTeacher = await this.prisma.teacherRole.findFirst({
        where: { role: 'CLASS_TEACHER', classSectionId: child.classSectionId },
        select: { teacher: { select: { userId: true } } },
      });
      if (classTeacher?.teacher?.userId) {
        await this.prisma.notification.create({
          data: {
            userId: classTeacher.teacher.userId,
            title: `${childName}'s ${child.relationship.toLowerCase() || 'parent'} has passed away`,
            message: `Please look out for ${child.user.firstName}. This is shared with you only, as their class teacher.`,
            type: 'IN_APP',
            relatedEntityType: 'STUDENT',
            relatedEntityId: child.id,
          },
        });
      }

      if (others === 0) {
        withoutGuardian.push(child.id);
        for (const principal of principals) {
          await this.prisma.notification.create({
            data: {
              userId: principal.id,
              title: `${childName} has no parent or guardian left in Markova`,
              message: `${parent.firstName} ${parent.lastName} has passed away. Add the guardian who now looks after ${child.user.firstName}, or fee notices and report cards will reach nobody.`,
              type: 'IN_APP',
              relatedEntityType: 'STUDENT',
              relatedEntityId: child.id,
            },
          });
        }
      }
    }
    return { recorded: true, childrenWithoutGuardian: withoutGuardian };
  }

  // ─── inside ───────────────────────────────────────────────────────────────

  /**
   * Off the roll: the standing, the history line, and what leaving does.
   * The card is revoked, a pause still running ends the day before, and the
   * class chat lets them go. One who passed away also cannot sign in.
   */
  private async close(
    student: {
      id: string;
      userId: string;
      classSectionId: string;
      status: StudentStatus;
    },
    status: StudentStatus,
    on: Date,
    byUserId: string,
    words: { reason: string | null; note: string | null },
  ) {
    const step = status as unknown as JourneyStep;
    await this.prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id: student.id },
        data: {
          status,
          nfcCardId: null,
          cardIssuedAt: null,
          cardCode: null,
          cardSuspendedAt: null,
        },
      });
      await tx.studentPause.updateMany({
        where: { studentId: student.id, ...coversDay(on) },
        data: { endsOn: dayBefore(on) },
      });
      await tx.studentPause.updateMany({
        where: { studentId: student.id, startsOn: { gt: on } },
        data: { endsOn: dayBefore(on) },
      });
      if (status === StudentStatus.PASSED_AWAY) {
        await tx.user.update({
          where: { id: student.userId },
          data: { isActive: false, passedAwayOn: on },
        });
      }
      await tx.studentJourneyEntry.create({
        data: {
          studentId: student.id,
          step,
          happenedOn: on,
          reason: words.reason,
          note: words.note,
          recordedByUserId: byUserId,
        },
      });
    });
    await this.messaging.ensureClassGroup(student.classSectionId);
  }

  private async student(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        userId: true,
        status: true,
        classSectionId: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }

  private name(student: { user: { firstName: string; lastName: string } }) {
    return `${student.user.firstName} ${student.user.lastName}`;
  }
}
