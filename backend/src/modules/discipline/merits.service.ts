import { Injectable, NotFoundException } from '@nestjs/common';
import { MeritCategory } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TERM_CONDUCT_MARK } from '../../common/conduct';
import { PaginatedResponse } from '../../common/dto/pagination.dto';
import { AwardMeritDto, QueryMeritsDto } from './dto';
import { NotificationSubject } from '../../common/notification-target';
import { familyMayHear } from '../../common/student-standing';

/**
 * The other half of behaviour.
 *
 * A conduct system with only deductions teaches a student one lesson: the best
 * possible outcome is to be unnoticed. Every school already praises effort at
 * assembly, and none of it is written anywhere, so the only durable record a
 * student carries is the list of what they did wrong.
 *
 * Two decisions shape this:
 *
 *  - **Points restore, they do not inflate.** The conduct score is capped at a
 *    clean sheet, so 100 keeps meaning "nothing against you" and a merit is a
 *    way back rather than a currency to bank against future trouble.
 *  - **Recognition is not capped.** The award stands on the record whether or
 *    not there were points left to restore, because "she was thanked for this"
 *    is the part worth keeping.
 */
@Injectable()
export class MeritsService {
  constructor(private prisma: PrismaService) {}

  private readonly detail = {
    student: {
      select: {
        id: true,
        studentIdNumber: true,
        disciplinePoints: true,
        classSection: {
          select: { name: true, classLevel: { select: { name: true } } },
        },
        user: { select: { firstName: true, lastName: true, photoUrl: true } },
      },
    },
    awardedBy: { select: { firstName: true, lastName: true, role: true } },
  };

  /** The clean-sheet score a student starts a year on. */
  private async startingPoints(): Promise<number> {
    const config = await this.prisma.schoolConfig.findFirst({
      where: { key: 'starting_discipline_points' },
    });
    return Number(config?.value || String(TERM_CONDUCT_MARK));
  }

  /**
   * Awarding a merit.
   *
   * The points restored are only ever the gap back to a clean sheet, so a
   * student already on full marks receives the recognition and no inflation.
   */
  async award(dto: AwardMeritDto, awardedByUserId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: dto.studentId },
      select: {
        id: true,
        disciplinePoints: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const ceiling = await this.startingPoints();
    const restored = Math.min(
      dto.points,
      Math.max(0, ceiling - student.disciplinePoints),
    );
    const newPoints = student.disciplinePoints + restored;

    const [merit] = await this.prisma.$transaction(async (tx) => [
      await tx.meritAward.create({
        data: {
          studentId: dto.studentId,
          termId: dto.termId,
          awardedByUserId,
          category: dto.category,
          description: dto.description,
          points: dto.points,
          date: new Date(dto.date),
        },
        include: this.detail,
      }),
      await tx.student.update({
        where: { id: dto.studentId },
        data: { disciplinePoints: newPoints },
      }),
    ]);

    // Told the same way trouble is told. A family that only ever hears from
    // the school when something is wrong learns to dread the message.
    await this.tellTheFamily(
      dto.studentId,
      dto.description,
      restored,
      newPoints,
    );

    return {
      ...merit,
      pointsRestored: restored,
      newDisciplinePoints: newPoints,
    };
  }

  async find(query: QueryMeritsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: any = {
      ...(query.studentId && { studentId: query.studentId }),
      ...(query.termId && { termId: query.termId }),
      ...(query.category && { category: query.category }),
      ...(query.classSectionId && {
        student: { classSectionId: query.classSectionId },
      }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.meritAward.findMany({
        where,
        include: this.detail,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.meritAward.count({ where }),
    ]);

    return new PaginatedResponse(rows, total, page, limit);
  }

  /**
   * One student's standing, both sides of it.
   *
   * The point of putting them together is the number a student on a warning
   * actually wants: how many points back to a clean sheet.
   */
  async standing(studentId: string, termId?: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        studentIdNumber: true,
        disciplinePoints: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const scope = termId ? { termId } : {};
    const [merits, incidents, ceiling] = await Promise.all([
      this.prisma.meritAward.findMany({
        where: { studentId, ...scope },
        include: { awardedBy: { select: { firstName: true, lastName: true } } },
        orderBy: { date: 'desc' },
        take: 20,
      }),
      this.prisma.disciplineIncident.findMany({
        where: { studentId, ...scope },
        select: {
          id: true,
          date: true,
          description: true,
          pointsDeducted: true,
          actionTaken: true,
        },
        orderBy: { date: 'desc' },
        take: 20,
      }),
      this.startingPoints(),
    ]);

    const byCategory = merits.reduce<Record<string, number>>((acc, m) => {
      acc[m.category] = (acc[m.category] ?? 0) + 1;
      return acc;
    }, {});

    return {
      student,
      points: student.disciplinePoints,
      ceiling,
      // The number that makes the path back visible instead of theoretical.
      pointsToCleanSheet: Math.max(0, ceiling - student.disciplinePoints),
      meritCount: merits.length,
      incidentCount: incidents.length,
      byCategory,
      merits,
      incidents,
    };
  }

  /**
   * The students a head of discipline should look at this week.
   *
   * Not "who has the fewest points", which is a list of the same names all
   * year. This is about movement: who has picked up incidents recently and has
   * nothing on the other side of the ledger. A student losing points steadily
   * with no merits is the one a school still finds out about too late.
   */
  async watchList(days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const recent = await this.prisma.disciplineIncident.groupBy({
      by: ['studentId'],
      where: { date: { gte: since } },
      _count: { _all: true },
      _sum: { pointsDeducted: true },
    });

    const concerning = recent.filter(
      (r) => r._count._all >= 2 || (r._sum.pointsDeducted ?? 0) >= 15,
    );
    if (concerning.length === 0) return { days, students: [] };

    const ids = concerning.map((r) => r.studentId);
    const [students, merits] = await Promise.all([
      this.prisma.student.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          studentIdNumber: true,
          disciplinePoints: true,
          classSection: {
            select: { name: true, classLevel: { select: { name: true } } },
          },
          user: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.meritAward.groupBy({
        by: ['studentId'],
        where: { studentId: { in: ids }, date: { gte: since } },
        _count: { _all: true },
      }),
    ]);

    const rows = students.map((s) => {
      const trouble = concerning.find((r) => r.studentId === s.id)!;
      const merited =
        merits.find((m) => m.studentId === s.id)?._count._all ?? 0;
      return {
        ...s,
        incidents: trouble._count._all,
        pointsLost: trouble._sum.pointsDeducted ?? 0,
        merits: merited,
        // Nothing on the credit side is what turns a rough patch into a
        // reputation, and it is the cheapest thing for a school to fix.
        nothingPositive: merited === 0,
      };
    });

    rows.sort((a, b) => b.pointsLost - a.pointsLost);
    return { days, students: rows };
  }

  /**
   * What the school is recognising, and what it is not.
   *
   * A school that awards nothing but sport is telling every non-sporting
   * student where they stand, so the split by category is the number worth
   * putting in front of a head teacher.
   */
  async summary(termId?: string, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const scope = termId ? { termId } : { date: { gte: since } };

    const [awarded, incidents, byCategory, topStudents] = await Promise.all([
      this.prisma.meritAward.count({ where: scope }),
      this.prisma.disciplineIncident.count({ where: scope }),
      this.prisma.meritAward.groupBy({
        by: ['category'],
        where: scope,
        _count: { _all: true },
      }),
      this.prisma.meritAward.groupBy({
        by: ['studentId'],
        where: scope,
        _count: { _all: true },
        orderBy: { _count: { studentId: 'desc' } },
        take: 5,
      }),
    ]);

    const named = topStudents.length
      ? await this.prisma.student.findMany({
          where: { id: { in: topStudents.map((t) => t.studentId) } },
          select: {
            id: true,
            studentIdNumber: true,
            user: { select: { firstName: true, lastName: true } },
            classSection: { select: { name: true } },
          },
        })
      : [];

    return {
      awarded,
      incidents,
      // Below 1 means the school records more of what goes wrong than what
      // goes right, which is the state most schools are in and never see.
      ratio: incidents === 0 ? null : Number((awarded / incidents).toFixed(2)),
      byCategory: Object.fromEntries(
        Object.values(MeritCategory).map((c) => [
          c,
          byCategory.find((row) => row.category === c)?._count._all ?? 0,
        ]),
      ),
      mostRecognised: named.map((s) => ({
        ...s,
        merits: topStudents.find((t) => t.studentId === s.id)?._count._all ?? 0,
      })),
    };
  }

  private async tellTheFamily(
    studentId: string,
    description: string,
    restored: number,
    newPoints: number,
  ) {
    // Not to a family whose child has left or passed away.
    if (!(await familyMayHear(this.prisma, studentId, 'news'))) return;
    const links = await this.prisma.parentStudent.findMany({
      where: { studentId, parent: { isActive: true } },
      include: {
        parent: { select: { id: true, firstName: true } },
        student: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    for (const link of links) {
      try {
        await this.prisma.notification.create({
          data: {
            userId: link.parent.id,
            type: 'SMS',
            title: 'Good news from school',
            message: `Dear ${link.parent.firstName}, ${link.student.user.firstName} ${link.student.user.lastName} was recognised at school: "${description}".${restored > 0 ? ` ${restored} conduct points restored, now ${newPoints}.` : ''}`,
            relatedEntityType: NotificationSubject.MERIT,
            relatedEntityId: studentId,
          },
        });
      } catch {
        // Telling the family is important, but a failure here must not undo
        // the award itself.
      }
    }
  }
}
