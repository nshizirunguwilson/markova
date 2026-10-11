import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TERM_CONDUCT_MARK } from '../../common/conduct';
import { classDisplayName } from '../../common/class-name';
import { OwnershipService } from '../../common/ownership.service';
import {
  CreateIncidentDto,
  UpdateIncidentDto,
  CreateAppealDto,
  ReviewAppealDto,
  QueryIncidentsDto,
} from './dto';
import { NotificationSubject } from '../../common/notification-target';
import { familyMayHear } from '../../common/student-standing';

@Injectable()
export class DisciplineService {
  constructor(
    private prisma: PrismaService,
    private ownership: OwnershipService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // INCIDENTS
  // ═══════════════════════════════════════════════════════════════════════════

  async createIncident(dto: CreateIncidentDto, recordedByUserId: string) {
    // Validate student
    const student = await this.prisma.student.findUnique({
      where: { id: dto.studentId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!student) throw new NotFoundException('Student not found');

    // Deduct points
    const newPoints = Math.max(
      0,
      student.disciplinePoints - dto.pointsDeducted,
    );

    const [incident] = await this.prisma.$transaction(async (tx) => [
      await tx.disciplineIncident.create({
        data: {
          studentId: dto.studentId,
          termId: dto.termId,
          recordedByUserId,
          date: new Date(dto.date),
          time: dto.time,
          location: dto.location,
          description: dto.description,
          pointsDeducted: dto.pointsDeducted,
          actionTaken: dto.actionTaken as any,
        },
        include: {
          student: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
          recordedBy: { select: { firstName: true, lastName: true } },
        },
      }),
      await tx.student.update({
        where: { id: dto.studentId },
        data: { disciplinePoints: newPoints },
      }),
    ]);

    // Notify parent
    await this.notifyParent(
      dto.studentId,
      dto.description,
      dto.pointsDeducted,
      newPoints,
    );

    return { ...incident, newDisciplinePoints: newPoints };
  }

  async updateIncident(id: string, dto: UpdateIncidentDto) {
    const incident = await this.prisma.disciplineIncident.findUnique({
      where: { id },
    });
    if (!incident) throw new NotFoundException('Incident not found');

    // If points changed, adjust student's discipline points
    if (
      dto.pointsDeducted !== undefined &&
      dto.pointsDeducted !== incident.pointsDeducted
    ) {
      const diff = dto.pointsDeducted - incident.pointsDeducted;
      const student = await this.prisma.student.findUnique({
        where: { id: incident.studentId },
      });
      if (student) {
        await this.prisma.student.update({
          where: { id: incident.studentId },
          data: {
            disciplinePoints: Math.max(0, student.disciplinePoints - diff),
          },
        });
      }
    }

    return this.prisma.disciplineIncident.update({
      where: { id },
      data: {
        ...(dto.description && { description: dto.description }),
        ...(dto.pointsDeducted !== undefined && {
          pointsDeducted: dto.pointsDeducted,
        }),
        ...(dto.actionTaken && { actionTaken: dto.actionTaken as any }),
      },
      include: {
        student: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        recordedBy: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async deleteIncident(id: string) {
    const incident = await this.prisma.disciplineIncident.findUnique({
      where: { id },
    });
    if (!incident) throw new NotFoundException('Incident not found');

    // Restore points
    await this.prisma.student.update({
      where: { id: incident.studentId },
      data: { disciplinePoints: { increment: incident.pointsDeducted } },
    });

    return this.prisma.disciplineIncident.delete({ where: { id } });
  }

  async findIncidents(query: QueryIncidentsDto) {
    const where: any = {};
    if (query.studentId) where.studentId = query.studentId;
    if (query.termId) where.termId = query.termId;
    if (query.classSectionId) {
      where.student = { classSectionId: query.classSectionId };
    }
    if (query.dateFrom || query.dateTo) {
      where.date = {};
      if (query.dateFrom) where.date.gte = new Date(query.dateFrom);
      if (query.dateTo) where.date.lte = new Date(query.dateTo);
    }

    return this.prisma.disciplineIncident.findMany({
      where,
      include: {
        student: {
          include: {
            user: { select: { firstName: true, lastName: true } },
            classSection: { include: { classLevel: true, trade: true } },
          },
        },
        recordedBy: { select: { firstName: true, lastName: true } },
        appeals: { select: { id: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getIncidentById(id: string) {
    const incident = await this.prisma.disciplineIncident.findUnique({
      where: { id },
      include: {
        student: {
          include: {
            user: {
              select: { firstName: true, lastName: true, photoUrl: true },
            },
            classSection: { include: { classLevel: true, trade: true } },
          },
        },
        recordedBy: { select: { firstName: true, lastName: true } },
        term: true,
        appeals: {
          include: {
            submittedBy: { select: { firstName: true, lastName: true } },
            reviewedBy: { select: { firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }

  async getStudentDiscipline(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!student) throw new NotFoundException('Student not found');

    const startingPoints = await this.getStartingPoints();
    const incidents = await this.prisma.disciplineIncident.findMany({
      where: { studentId },
      include: {
        recordedBy: { select: { firstName: true, lastName: true } },
        appeals: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      student: {
        name: `${student.user.firstName} ${student.user.lastName}`,
        currentPoints: student.disciplinePoints,
        startingPoints,
        percentage:
          startingPoints > 0
            ? Math.round((student.disciplinePoints / startingPoints) * 100)
            : 100,
      },
      incidents,
      totalIncidents: incidents.length,
      totalPointsDeducted: incidents.reduce((s, i) => s + i.pointsDeducted, 0),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // APPEALS
  // ═══════════════════════════════════════════════════════════════════════════

  async createAppeal(
    dto: CreateAppealDto,
    submittedByUserId: string,
    role: string,
  ) {
    const incident = await this.prisma.disciplineIncident.findUnique({
      where: { id: dto.incidentId },
      include: { appeals: true },
    });
    if (!incident) throw new NotFoundException('Incident not found');

    // A student/parent may only appeal an incident for their own/their child's
    // record - not an arbitrary incident id.
    await this.ownership.verifyStudentAccess(
      submittedByUserId,
      role,
      incident.studentId,
    );

    // Check for existing pending appeal
    const pending = incident.appeals.find((a) => a.status === 'PENDING');
    if (pending) {
      throw new BadRequestException(
        'An appeal is already pending for this incident',
      );
    }

    return this.prisma.disciplineAppeal.create({
      data: {
        incidentId: dto.incidentId,
        submittedByUserId,
        statement: dto.statement,
        evidenceUrls: dto.evidenceUrls || [],
      },
      include: {
        incident: {
          include: {
            student: {
              include: {
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
        submittedBy: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async reviewAppeal(
    id: string,
    dto: ReviewAppealDto,
    reviewedByUserId: string,
  ) {
    const appeal = await this.prisma.disciplineAppeal.findUnique({
      where: { id },
      include: { incident: true },
    });
    if (!appeal) throw new NotFoundException('Appeal not found');
    if (appeal.status !== 'PENDING') {
      throw new BadRequestException('Appeal has already been reviewed');
    }

    const updatedAppeal = await this.prisma.disciplineAppeal.update({
      where: { id },
      data: {
        status: dto.status as any,
        reviewNotes: dto.reviewNotes,
        reviewedByUserId,
      },
      include: {
        incident: {
          include: {
            student: {
              include: {
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
        submittedBy: { select: { firstName: true, lastName: true } },
        reviewedBy: { select: { firstName: true, lastName: true } },
      },
    });

    // If approved, restore points
    if (dto.status === 'APPROVED') {
      await this.prisma.student.update({
        where: { id: appeal.incident.studentId },
        data: {
          disciplinePoints: { increment: appeal.incident.pointsDeducted },
        },
      });
    }

    return updatedAppeal;
  }

  async getPendingAppeals() {
    return this.prisma.disciplineAppeal.findMany({
      where: { status: 'PENDING' },
      include: {
        incident: {
          include: {
            student: {
              include: {
                user: { select: { firstName: true, lastName: true } },
                classSection: { include: { classLevel: true, trade: true } },
              },
            },
          },
        },
        submittedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PARENT ACKNOWLEDGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  async acknowledgeIncident(incidentId: string, parentUserId: string) {
    const incident = await this.prisma.disciplineIncident.findUnique({
      where: { id: incidentId },
      include: {
        student: { include: { parentStudents: true } },
      },
    });
    if (!incident) throw new NotFoundException('Incident not found');

    // Verify parent is linked to this student
    const isLinked = incident.student.parentStudents.some(
      (ps) => ps.parentUserId === parentUserId,
    );
    if (!isLinked)
      throw new ForbiddenException(
        'Not authorized to acknowledge this incident',
      );

    return this.prisma.disciplineIncident.update({
      where: { id: incidentId },
      data: { parentAcknowledged: true, parentAcknowledgedAt: new Date() },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════

  async getDashboard(termId?: string) {
    const where: any = {};
    if (termId) where.termId = termId;

    const incidents = await this.prisma.disciplineIncident.findMany({
      where,
      include: {
        student: {
          include: {
            classSection: { include: { classLevel: true, trade: true } },
          },
        },
      },
    });

    // By action type
    const byAction: Record<string, number> = {};
    for (const i of incidents) {
      byAction[i.actionTaken] = (byAction[i.actionTaken] || 0) + 1;
    }

    // Top offenders
    const studentMap = new Map<
      string,
      { name: string; class: string; count: number; totalPoints: number }
    >();
    for (const i of incidents) {
      const key = i.studentId;
      if (!studentMap.has(key)) {
        studentMap.set(key, {
          name: key,
          class: classDisplayName(i.student.classSection),
          count: 0,
          totalPoints: 0,
        });
      }
      const entry = studentMap.get(key)!;
      entry.count++;
      entry.totalPoints += i.pointsDeducted;
    }

    const pendingAppeals = await this.prisma.disciplineAppeal.count({
      where: { status: 'PENDING' },
    });

    return {
      totalIncidents: incidents.length,
      totalPointsDeducted: incidents.reduce((s, i) => s + i.pointsDeducted, 0),
      pendingAppeals,
      byAction,
      topOffenders: Array.from(studentMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private async getStartingPoints(): Promise<number> {
    const config = await this.prisma.schoolConfig.findFirst({
      where: { key: 'starting_discipline_points' },
    });
    return Number(config?.value || String(TERM_CONDUCT_MARK));
  }

  private async notifyParent(
    studentId: string,
    description: string,
    pointsDeducted: number,
    newPoints: number,
  ) {
    // Not to a family whose child has left or passed away.
    if (!(await familyMayHear(this.prisma, studentId, 'news'))) return;
    const parentLinks = await this.prisma.parentStudent.findMany({
      where: { studentId, parent: { isActive: true } },
      include: {
        parent: { select: { id: true, firstName: true, phone: true } },
        student: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    for (const link of parentLinks) {
      try {
        await this.prisma.notification.create({
          data: {
            userId: link.parent.id,
            type: 'SMS',
            title: 'Discipline Incident',
            message: `Dear ${link.parent.firstName}, ${link.student.user.firstName} ${link.student.user.lastName} received a discipline incident: "${description}". ${pointsDeducted} points deducted. Remaining: ${newPoints}.`,
            relatedEntityType: NotificationSubject.DISCIPLINE,
            relatedEntityId: studentId,
          },
        });
      } catch {
        // Non-critical
      }
    }
  }
}
