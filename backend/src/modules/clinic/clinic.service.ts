import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClinicVisitOutcome, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginatedResponse } from '../../common/dto/pagination.dto';
import {
  CreateVisitDto,
  GiveMedicineDto,
  HealthRecordDto,
  UpdateVisitDto,
  VisitQueryDto,
} from './dto';
import { assertParentMaySee } from '../../common/parent-sharing';

/**
 * The sick bay.
 *
 * A boarding school is responsible for a child's body as well as their marks,
 * and today that responsibility is discharged into an exercise book. Nobody
 * can answer "how many times has she been in this term", "did she already have
 * her paracetamol today", or "who is lying in the sick bay right now" without
 * turning pages.
 *
 * Three rules follow from this being a health record rather than a log:
 *
 *  - **Nothing is deleted.** A record that can be tidied away is worth nothing
 *    the day somebody has to account for what happened. Wrong entries are
 *    corrected in place and the correction is dated.
 *  - **Who may read it is narrow.** The nurse, the boarding staff and the
 *    office, plus the child's own parent. Teachers never, no matter how senior:
 *    a class teacher has no business knowing a student is on epilepsy
 *    medication.
 *  - **Telling the family is part of the record.** A parent should not learn
 *    from their child that the school kept them in overnight, so notification
 *    is a dated field and not an afterthought.
 */
@Injectable()
export class ClinicService {
  constructor(private prisma: PrismaService) {}

  /** Everyone who may see any student's health record. */
  private static readonly CLINICAL: Role[] = [
    Role.NURSE,
    Role.MATRON,
    Role.PATRON,
    Role.ADMIN,
  ];

  private readonly studentBrief = {
    select: {
      id: true,
      studentIdNumber: true,
      gender: true,
      dateOfBirth: true,
      bloodType: true,
      allergies: true,
      isBoarder: true,
      classSection: {
        select: {
          id: true,
          name: true,
          classLevel: { select: { name: true } },
        },
      },
      user: { select: { firstName: true, lastName: true, photoUrl: true } },
    },
  };

  private readonly staffBrief = {
    select: { id: true, firstName: true, lastName: true, role: true },
  };

  /**
   * Whether this viewer may see this student's health.
   *
   * Deliberately not a role guard on the controller alone: a parent passes the
   * role check for their own child and must fail it for anybody else's, and
   * that distinction can only be made here where the student is known.
   */
  async assertMaySee(
    studentId: string,
    viewer: { userId: string; role: Role },
  ) {
    if (ClinicService.CLINICAL.includes(viewer.role)) return;

    if (viewer.role === Role.PARENT) {
      const link = await this.prisma.parentStudent.findFirst({
        where: { parentUserId: viewer.userId, studentId },
        select: { id: true },
      });
      if (link) {
        // An adult child may keep their health visits from their parents.
        await assertParentMaySee(this.prisma, studentId, 'health');
        return;
      }
      throw new ForbiddenException(
        'You can only see the health record of your own child',
      );
    }

    if (viewer.role === Role.STUDENT) {
      const student = await this.prisma.student.findUnique({
        where: { id: studentId },
        select: { userId: true },
      });
      if (student?.userId === viewer.userId) return;
    }

    throw new ForbiddenException('You cannot see this health record');
  }

  // ─── THE SICK BAY ─────────────────────────────────────────────────────────

  /**
   * A student arrives at the sick bay.
   *
   * The complaint is required and everything else is not, because a nurse
   * writes the findings after looking, and forcing them up front would mean
   * the row gets created later or not at all.
   */
  async createVisit(dto: CreateVisitDto, seenByUserId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: dto.studentId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Student not found');

    if (dto.outcome === ClinicVisitOutcome.REFERRED_OUT && !dto.referredTo) {
      throw new BadRequestException(
        'Say where the student was referred to, so the family can follow them there',
      );
    }

    return this.prisma.clinicVisit.create({
      data: {
        studentId: dto.studentId,
        complaint: dto.complaint,
        findings: dto.findings,
        treatment: dto.treatment,
        severity: dto.severity,
        outcome: dto.outcome,
        temperature: dto.temperature,
        referredTo: dto.referredTo,
        seenByUserId,
      },
      include: { student: this.studentBrief, seenBy: this.staffBrief },
    });
  }

  /**
   * Correcting a visit already written down.
   *
   * Never a delete. A nurse who mistyped a temperature fixes the number; the
   * visit itself stays, because it happened.
   */
  async updateVisit(id: string, dto: UpdateVisitDto) {
    const visit = await this.prisma.clinicVisit.findUnique({ where: { id } });
    if (!visit) throw new NotFoundException('Visit not found');

    const outcome = dto.outcome ?? visit.outcome;
    const referredTo = dto.referredTo ?? visit.referredTo;
    if (outcome === ClinicVisitOutcome.REFERRED_OUT && !referredTo) {
      throw new BadRequestException(
        'Say where the student was referred to, so the family can follow them there',
      );
    }

    return this.prisma.clinicVisit.update({
      where: { id },
      data: {
        findings: dto.findings,
        treatment: dto.treatment,
        severity: dto.severity,
        outcome: dto.outcome,
        temperature: dto.temperature,
        referredTo: dto.referredTo,
      },
      include: { student: this.studentBrief, seenBy: this.staffBrief },
    });
  }

  /**
   * Sending a student back from the sick bay.
   *
   * Discharge is what closes a stay, so the sick bay list is "kept in and not
   * yet discharged" rather than a flag somebody has to remember to clear.
   */
  async discharge(id: string) {
    const visit = await this.prisma.clinicVisit.findUnique({ where: { id } });
    if (!visit) throw new NotFoundException('Visit not found');
    if (visit.dischargedAt) {
      throw new BadRequestException('This student has already been discharged');
    }

    return this.prisma.clinicVisit.update({
      where: { id },
      data: { dischargedAt: new Date() },
      include: { student: this.studentBrief, seenBy: this.staffBrief },
    });
  }

  /** Recording that the family has been told, and when. */
  async markParentNotified(id: string) {
    const visit = await this.prisma.clinicVisit.findUnique({ where: { id } });
    if (!visit) throw new NotFoundException('Visit not found');

    return this.prisma.clinicVisit.update({
      where: { id },
      data: { parentNotifiedAt: visit.parentNotifiedAt ?? new Date() },
      include: { student: this.studentBrief, seenBy: this.staffBrief },
    });
  }

  async findVisits(query: VisitQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: any = {
      ...(query.studentId && { studentId: query.studentId }),
      ...(query.severity && { severity: query.severity }),
      ...(query.outcome && { outcome: query.outcome }),
      ...((query.from || query.to) && {
        visitedAt: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lte: new Date(query.to) }),
        },
      }),
      // Who is lying in the sick bay right now.
      ...(query.inSickBay === 'true' && {
        outcome: ClinicVisitOutcome.RESTING_IN_SICK_BAY,
        dischargedAt: null,
      }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.clinicVisit.findMany({
        where,
        include: {
          student: this.studentBrief,
          seenBy: this.staffBrief,
          medications: {
            select: { id: true, medicine: true, dose: true, givenAt: true },
          },
        },
        orderBy: { visitedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.clinicVisit.count({ where }),
    ]);

    return new PaginatedResponse(rows, total, page, limit);
  }

  async findVisit(id: string) {
    const visit = await this.prisma.clinicVisit.findUnique({
      where: { id },
      include: {
        student: this.studentBrief,
        seenBy: this.staffBrief,
        medications: {
          include: { givenBy: this.staffBrief },
          orderBy: { givenAt: 'desc' },
        },
      },
    });
    if (!visit) throw new NotFoundException('Visit not found');
    return visit;
  }

  // ─── MEDICATION ───────────────────────────────────────────────────────────

  /**
   * A dose given.
   *
   * The check that matters is the repeat: a student who was given paracetamol
   * an hour ago and asks a different member of staff must not get a second
   * dose because the first was in somebody else's handwriting.
   */
  async giveMedicine(dto: GiveMedicineDto, givenByUserId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: dto.studentId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Student not found');

    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const recent = await this.prisma.medicationAdministration.findFirst({
      where: {
        studentId: dto.studentId,
        medicine: { equals: dto.medicine, mode: 'insensitive' },
        givenAt: { gte: fourHoursAgo },
      },
      orderBy: { givenAt: 'desc' },
      select: { givenAt: true, dose: true },
    });
    if (recent) {
      const minutes = Math.round(
        (Date.now() - recent.givenAt.getTime()) / 60000,
      );
      throw new BadRequestException(
        `${dto.medicine} was already given ${minutes} minutes ago (${recent.dose}). Check before giving another dose.`,
      );
    }

    return this.prisma.medicationAdministration.create({
      data: {
        studentId: dto.studentId,
        visitId: dto.visitId,
        medicine: dto.medicine,
        dose: dto.dose,
        reason: dto.reason,
        givenByUserId,
      },
      include: { givenBy: this.staffBrief },
    });
  }

  /** Everything given to one student, newest first. */
  async medicationFor(studentId: string, limit = 50) {
    return this.prisma.medicationAdministration.findMany({
      where: { studentId },
      include: { givenBy: this.staffBrief },
      orderBy: { givenAt: 'desc' },
      take: limit,
    });
  }

  // ─── THE EMERGENCY CARD ───────────────────────────────────────────────────

  /**
   * The one page somebody needs at three in the morning.
   *
   * Returned even when no record has been filled in, with the allergies and
   * blood type already on the student, so the page is never blank when it is
   * most needed.
   */
  async emergencyCard(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        studentIdNumber: true,
        dateOfBirth: true,
        gender: true,
        bloodType: true,
        allergies: true,
        medicalConditions: true,
        insuranceNumber: true,
        isBoarder: true,
        classSection: {
          select: { name: true, classLevel: { select: { name: true } } },
        },
        user: { select: { firstName: true, lastName: true, photoUrl: true } },
        healthRecord: true,
        parentStudents: {
          select: {
            relationship: true,
            parent: {
              select: { firstName: true, lastName: true, phone: true },
            },
          },
        },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const [recentVisits, recentMedication] = await Promise.all([
      this.prisma.clinicVisit.findMany({
        where: { studentId },
        select: {
          id: true,
          complaint: true,
          severity: true,
          outcome: true,
          visitedAt: true,
        },
        orderBy: { visitedAt: 'desc' },
        take: 5,
      }),
      this.medicationFor(studentId, 5),
    ]);

    return { student, recentVisits, recentMedication };
  }

  /**
   * Filling in or changing the emergency card.
   *
   * Upserted, because the card exists conceptually from the day a student
   * enrolls and asking somebody to "create" one is a step that gets skipped.
   */
  async saveHealthRecord(
    studentId: string,
    dto: HealthRecordDto,
    updatedByUserId: string,
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Student not found');

    return this.prisma.studentHealthRecord.upsert({
      where: { studentId },
      create: { studentId, ...dto, updatedByUserId },
      update: { ...dto, updatedByUserId },
    });
  }

  // ─── WHAT THE SCHOOL NEEDS TO SEE ─────────────────────────────────────────

  /**
   * The numbers a head teacher and a nurse actually look at.
   *
   * "Repeat visitors" is the one that earns its place: a child in the sick bay
   * every week is telling the school something that no single visit does.
   */
  async summary(days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [visits, inSickBay, referred, dosesGiven, byStudent] =
      await Promise.all([
        this.prisma.clinicVisit.count({ where: { visitedAt: { gte: since } } }),
        this.prisma.clinicVisit.count({
          where: {
            outcome: ClinicVisitOutcome.RESTING_IN_SICK_BAY,
            dischargedAt: null,
          },
        }),
        this.prisma.clinicVisit.count({
          where: {
            visitedAt: { gte: since },
            outcome: ClinicVisitOutcome.REFERRED_OUT,
          },
        }),
        this.prisma.medicationAdministration.count({
          where: { givenAt: { gte: since } },
        }),
        this.prisma.clinicVisit.groupBy({
          by: ['studentId'],
          where: { visitedAt: { gte: since } },
          _count: { _all: true },
          orderBy: { _count: { studentId: 'desc' } },
          take: 5,
        }),
      ]);

    const repeatIds = byStudent
      .filter((row) => row._count._all >= 3)
      .map((row) => row.studentId);

    const repeatStudents = repeatIds.length
      ? await this.prisma.student.findMany({
          where: { id: { in: repeatIds } },
          select: {
            id: true,
            studentIdNumber: true,
            user: { select: { firstName: true, lastName: true } },
            classSection: { select: { name: true } },
          },
        })
      : [];

    return {
      days,
      visits,
      inSickBay,
      referred,
      dosesGiven,
      // A child in the sick bay three times in a month is a pattern, not a run
      // of bad luck, and somebody should be asking why.
      repeatVisitors: repeatStudents.map((s) => ({
        ...s,
        visits: byStudent.find((r) => r.studentId === s.id)?._count._all ?? 0,
      })),
    };
  }
}
