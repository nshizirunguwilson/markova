import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, StudentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnershipService } from '../../common/ownership.service';
import { classDisplayName } from '../../common/class-name';
import {
  NEED_LABEL,
  arrangementWords,
  extraMinutes,
} from '../../common/support-words';
import { SupportPlanDto } from './support.dto';

type Viewer = { id: string; role: string };

/** Who keeps support plans: they see and change the whole of one. */
const KEEPERS: string[] = [Role.HEAD_TEACHER, Role.NURSE];
/** Who reads the whole of one: the keepers, and the principal. */
const READERS: string[] = [...KEEPERS, Role.ADMIN];

/**
 * Support plans for students with special educational needs (B7 in
 * docs/STUDENT-LIFE-DESIGN.md).
 *
 * The need itself is private: the Director of Studies and the nurse keep it,
 * the principal reads it, and the family sees their own child's. A teacher is
 * told only what to do in their tests and exams ("25% extra time, large
 * print"), and only for the students they teach. Every time somebody at the
 * school opens a whole plan, it is written down.
 */
@Injectable()
export class SupportService {
  constructor(
    private prisma: PrismaService,
    private ownership: OwnershipService,
  ) {}

  /** One student's plan, as much of it as the viewer may see. */
  async forStudent(studentId: string, viewer: Viewer) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        userId: true,
        classSectionId: true,
        disability: true,
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const plan = await this.prisma.supportPlan.findUnique({
      where: { studentId },
      include: {
        updatedBy: { select: { firstName: true, lastName: true } },
      },
    });

    if (viewer.role === Role.TEACHER) {
      if (!(await this.teaches(viewer.id, student.classSectionId))) {
        throw new ForbiddenException(
          'Only the teachers of this student see their exam arrangements',
        );
      }
      return {
        plan: plan
          ? { arrangements: arrangementWords(plan), reviewOn: plan.reviewOn }
          : null,
        teacherView: true,
      };
    }

    if (viewer.role === Role.PARENT || viewer.role === Role.STUDENT) {
      // A family's own child; an adult child may keep this from them, as
      // with the rest of their health.
      await this.ownership.verifyStudentAccess(
        viewer.id,
        viewer.role,
        studentId,
        'health',
      );
    } else if (!READERS.includes(viewer.role)) {
      throw new ForbiddenException('You cannot see support plans');
    } else {
      await this.opened(viewer.id, studentId);
    }

    return {
      plan: plan ? this.whole(plan) : null,
      // What was written at enrolment, for the keeper to start from.
      recordedAtEnrolment: READERS.includes(viewer.role)
        ? student.disability
        : undefined,
      mayChange: KEEPERS.includes(viewer.role),
    };
  }

  /** Make or change a plan. */
  async save(studentId: string, dto: SupportPlanDto, byUserId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, status: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    if (dto.arrangements.includes('EXTRA_TIME') && !dto.extraTimePercent) {
      throw new BadRequestException('Say how much extra time, as a percentage');
    }
    const data = {
      needs: [...new Set(dto.needs)],
      needNote: dto.needNote?.trim() || null,
      arrangements: [...new Set(dto.arrangements)],
      extraTimePercent: dto.arrangements.includes('EXTRA_TIME')
        ? (dto.extraTimePercent ?? null)
        : null,
      otherArrangement: dto.otherArrangement?.trim() || null,
      reviewOn: dto.reviewOn
        ? new Date(`${dto.reviewOn.slice(0, 10)}T00:00:00.000Z`)
        : null,
      agreedWith: dto.agreedWith?.trim() || null,
      updatedByUserId: byUserId,
    };
    const plan = await this.prisma.supportPlan.upsert({
      where: { studentId },
      create: { studentId, ...data },
      update: data,
      include: {
        updatedBy: { select: { firstName: true, lastName: true } },
      },
    });
    return { plan: this.whole(plan), mayChange: true };
  }

  async remove(studentId: string) {
    const { count } = await this.prisma.supportPlan.deleteMany({
      where: { studentId },
    });
    if (count === 0) throw new NotFoundException('There is no plan to remove');
    return { removed: true };
  }

  /**
   * The students of a class with arrangements, for the class list and the
   * exam room: names and what to do, never why.
   */
  async forClass(classSectionId: string, viewer: Viewer) {
    if (
      viewer.role === Role.TEACHER &&
      !(await this.teaches(viewer.id, classSectionId))
    ) {
      throw new ForbiddenException('You do not teach this class');
    }
    if (viewer.role !== Role.TEACHER && !READERS.includes(viewer.role)) {
      throw new ForbiddenException('You cannot see exam arrangements');
    }
    const plans = await this.prisma.supportPlan.findMany({
      where: {
        student: { classSectionId, status: StudentStatus.ACTIVE },
      },
      include: {
        student: {
          select: {
            id: true,
            studentIdNumber: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    return plans
      .map((p) => ({
        studentId: p.student.id,
        name: `${p.student.user.firstName} ${p.student.user.lastName}`,
        studentIdNumber: p.student.studentIdNumber,
        arrangements: arrangementWords(p),
        extraTimePercent: p.extraTimePercent,
      }))
      .filter((p) => p.arrangements.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The sheet an invigilator takes into one exam. */
  async examSheet(examId: string, viewer: Viewer) {
    const exam = await this.prisma.examSchedule.findUnique({
      where: { id: examId },
      include: {
        subject: { select: { name: true } },
        term: { select: { name: true } },
        classSection: {
          include: {
            classLevel: { select: { name: true } },
            trade: { select: { code: true } },
          },
        },
      },
    });
    if (!exam) throw new NotFoundException('Exam not found');
    const students = await this.forClass(exam.classSectionId, viewer);
    return {
      exam: {
        id: exam.id,
        subject: exam.subject.name,
        class: classDisplayName(exam.classSection),
        term: exam.term.name,
        examDate: exam.examDate,
        startTime: exam.startTime,
        endTime: exam.endTime,
        room: exam.room,
      },
      students: students.map((s) => ({
        ...s,
        extraMinutes: extraMinutes(
          exam.startTime,
          exam.endTime,
          s.extraTimePercent,
        ),
      })),
    };
  }

  /**
   * Every plan in the school, for the keepers and the principal: the list a
   * school sends with its national exam registration.
   */
  async register() {
    const plans = await this.prisma.supportPlan.findMany({
      where: { student: { status: StudentStatus.ACTIVE } },
      include: {
        student: {
          select: {
            id: true,
            userId: true,
            studentIdNumber: true,
            user: { select: { firstName: true, lastName: true } },
            classSection: {
              include: {
                classLevel: { select: { name: true } },
                trade: { select: { code: true } },
              },
            },
          },
        },
      },
    });
    return plans
      .map((p) => ({
        studentId: p.student.id,
        userId: p.student.userId,
        name: `${p.student.user.firstName} ${p.student.user.lastName}`,
        studentIdNumber: p.student.studentIdNumber,
        class: classDisplayName(p.student.classSection),
        needs: p.needs.map((n) => NEED_LABEL[n]),
        arrangements: arrangementWords(p),
        reviewOn: p.reviewOn,
      }))
      .sort(
        (a, b) =>
          a.class.localeCompare(b.class) || a.name.localeCompare(b.name),
      );
  }

  // ─── inside ───────────────────────────────────────────────────────────────

  private whole(plan: {
    needs: (keyof typeof NEED_LABEL)[];
    needNote: string | null;
    arrangements: Parameters<typeof arrangementWords>[0]['arrangements'];
    extraTimePercent: number | null;
    otherArrangement: string | null;
    reviewOn: Date | null;
    agreedWith: string | null;
    updatedAt: Date;
    updatedBy: { firstName: string; lastName: string } | null;
  }) {
    return {
      needs: plan.needs,
      needWords: plan.needs.map((n) => NEED_LABEL[n]),
      needNote: plan.needNote,
      arrangementCodes: plan.arrangements,
      extraTimePercent: plan.extraTimePercent,
      otherArrangement: plan.otherArrangement,
      arrangements: arrangementWords(plan),
      reviewOn: plan.reviewOn,
      agreedWith: plan.agreedWith,
      updatedAt: plan.updatedAt,
      updatedBy: plan.updatedBy
        ? `${plan.updatedBy.firstName} ${plan.updatedBy.lastName}`
        : null,
    };
  }

  /** Whether a teacher teaches a class: a subject in it, or its class teacher. */
  private async teaches(userId: string, classSectionId: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!teacher) return false;
    const [subject, classTeacher] = await Promise.all([
      this.prisma.teacherSubjectClass.count({
        where: { teacherId: teacher.id, classSectionId },
      }),
      this.prisma.teacherRole.count({
        where: { teacherId: teacher.id, role: 'CLASS_TEACHER', classSectionId },
      }),
    ]);
    return subject + classTeacher > 0;
  }

  /** Opening a whole plan is written down: it holds a child's health. */
  private async opened(userId: string, studentId: string) {
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'VIEW',
        entityType: 'support-plan',
        entityId: studentId,
      },
    });
  }
}
