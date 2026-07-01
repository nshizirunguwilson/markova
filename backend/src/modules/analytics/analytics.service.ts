import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

/** Admin analytics are aggregate scans; 60s of staleness is acceptable. */
const CACHE_TTL_SECONDS = 60;

@Injectable()
export class AnalyticsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  /**
   * Best-effort read-through cache: a Redis outage must never break
   * analytics, so cache errors fall through to a live compute.
   */
  private async cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
    try {
      const hit = await this.redis.get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch {
      /* fall through to compute */
    }
    const value = await compute();
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', CACHE_TTL_SECONDS);
    } catch {
      /* caching is optional */
    }
    return value;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════════

  getAdminDashboard(academicYearId?: string, termId?: string) {
    return this.cached(
      `analytics:admin-dashboard:${academicYearId ?? '-'}:${termId ?? '-'}`,
      () => this.computeAdminDashboard(academicYearId, termId),
    );
  }

  private async computeAdminDashboard(academicYearId?: string, termId?: string) {
    const [
      totalStudents,
      totalTeachers,
      totalParents,
      classLevels,
      totalUsers,
      totalSubjects,
    ] = await Promise.all([
      this.prisma.student.count(),
      this.prisma.teacher.count(),
      this.prisma.parentStudent
        .groupBy({ by: ['parentUserId'] })
        .then((r) => r.length),
      this.prisma.classLevel.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.subject.count(),
    ]);

    return {
      totalStudents,
      totalTeachers,
      totalParents,
      totalClasses: classLevels,
      totalUsers,
      totalSubjects,
    };
  }

  getPerformanceTrends(academicYearId: string) {
    return this.cached(`analytics:performance-trends:${academicYearId}`, () =>
      this.computePerformanceTrends(academicYearId),
    );
  }

  private async computePerformanceTrends(academicYearId: string) {
    const terms = await this.prisma.term.findMany({
      where: { academicYearId },
      orderBy: { startDate: 'asc' },
    });

    const trends = [];
    for (const term of terms) {
      const results = await this.prisma.termResult.findMany({
        where: { termId: term.id },
      });
      const avg =
        results.length > 0
          ? results.reduce((s, r) => s + (r.average ?? 0), 0) / results.length
          : 0;
      trends.push({
        termId: term.id,
        termName: term.name,
        averageScore: Math.round(avg * 100) / 100,
        studentCount: results.length,
      });
    }

    return trends;
  }

  getClassComparisons(termId: string) {
    return this.cached(`analytics:class-comparisons:${termId}`, () =>
      this.computeClassComparisons(termId),
    );
  }

  private async computeClassComparisons(termId: string) {
    const sections = await this.prisma.classSection.findMany({
      include: { classLevel: true },
    });

    const comparisons = [];
    for (const section of sections) {
      const students = await this.prisma.student.findMany({
        where: { classSectionId: section.id },
        select: { id: true },
      });
      const studentIds = students.map((s) => s.id);

      if (studentIds.length === 0) continue;

      const results = await this.prisma.termResult.findMany({
        where: { termId, studentId: { in: studentIds } },
      });

      const withAvg = results.filter((r) => r.average !== null);
      if (withAvg.length === 0) continue;

      const avgs = withAvg.map((r) => r.average!);
      const avg = avgs.reduce((s, v) => s + v, 0) / avgs.length;
      const highest = Math.max(...avgs);
      const lowest = Math.min(...avgs);

      comparisons.push({
        classSectionId: section.id,
        className: `${section.classLevel.name} ${section.name}`,
        studentCount: withAvg.length,
        averageScore: Math.round(avg * 100) / 100,
        highest: Math.round(highest * 100) / 100,
        lowest: Math.round(lowest * 100) / 100,
      });
    }

    return comparisons.sort((a, b) => b.averageScore - a.averageScore);
  }

  getDisciplineStats(academicYearId?: string) {
    return this.cached(`analytics:discipline:${academicYearId ?? '-'}`, () =>
      this.computeDisciplineStats(academicYearId),
    );
  }

  private async computeDisciplineStats(academicYearId?: string) {
    const where: any = {};
    if (academicYearId) {
      const terms = await this.prisma.term.findMany({
        where: { academicYearId },
        select: { id: true },
      });
      if (terms.length > 0) {
        where.termId = { in: terms.map((t) => t.id) };
      }
    }

    const incidents = await this.prisma.disciplineIncident.findMany({ where });

    const byAction: Record<string, number> = {};
    for (const inc of incidents) {
      byAction[inc.actionTaken] = (byAction[inc.actionTaken] || 0) + 1;
    }

    return {
      totalIncidents: incidents.length,
      byAction: Object.entries(byAction).map(([name, count]) => ({
        name,
        count,
      })),
    };
  }

  getLibraryStats() {
    return this.cached('analytics:library', () => this.computeLibraryStats());
  }

  private async computeLibraryStats() {
    const [totalBooks, totalLoans, activeLoans, overdueLoans] =
      await Promise.all([
        this.prisma.book.count(),
        this.prisma.bookLoan.count(),
        this.prisma.bookLoan.count({ where: { status: 'ACTIVE' } }),
        // Loans stay ACTIVE past their due date (no auto-transition to an
        // OVERDUE status), so overdue = active loans whose dueDate has passed.
        // This matches LibraryService.getAnalytics and the loans list UI.
        this.prisma.bookLoan.count({
          where: { status: 'ACTIVE', dueDate: { lt: new Date() } },
        }),
      ]);

    const popularBooks = await this.prisma.bookLoan.groupBy({
      by: ['bookId'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    const bookDetails = await this.prisma.book.findMany({
      where: { id: { in: popularBooks.map((b) => b.bookId) } },
      select: { id: true, title: true, author: true },
    });

    const bookMap = new Map(bookDetails.map((b) => [b.id, b]));

    return {
      totalBooks,
      totalLoans,
      activeLoans,
      overdueLoans,
      popularBooks: popularBooks.map((b) => ({
        ...bookMap.get(b.bookId),
        loanCount: b._count.id,
      })),
    };
  }

  getAttendanceStats(termId?: string) {
    return this.cached(`analytics:attendance:${termId ?? '-'}`, () =>
      this.computeAttendanceStats(termId),
    );
  }

  private async computeAttendanceStats(termId?: string) {
    const where: any = {};
    if (termId) {
      const term = await this.prisma.term.findUnique({ where: { id: termId } });
      if (term) {
        where.date = { gte: term.startDate, lte: term.endDate };
      }
    }

    const records = await this.prisma.attendance.findMany({ where });

    const total = records.length;
    const present = records.filter((r) => r.status === 'PRESENT').length;
    const absent = records.filter((r) => r.status === 'ABSENT').length;
    const late = records.filter((r) => r.status === 'LATE').length;

    return {
      totalRecords: total,
      present,
      absent,
      late,
      attendanceRate: total > 0 ? Math.round((present / total) * 100) : 0,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEACHER ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════════

  async getTeacherClassAnalytics(
    teacherId: string,
    classSectionId: string,
    termId: string,
  ) {
    const assignments = await this.prisma.teacherSubjectClass.findMany({
      where: { teacherId, classSectionId },
      include: { subject: true },
    });

    // A teacher may only see analytics for a section they are assigned to.
    // Without this, any teacher could read another class's results by id.
    if (assignments.length === 0) {
      throw new ForbiddenException(
        'You are not assigned to this class section',
      );
    }

    const students = await this.prisma.student.findMany({
      where: { classSectionId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    const studentIds = students.map((s) => s.id);

    const subjectAnalytics = [];
    for (const assignment of assignments) {
      const marks = await this.prisma.mark.findMany({
        where: {
          subjectId: assignment.subjectId,
          termId,
          studentId: { in: studentIds },
        },
      });

      if (marks.length === 0) continue;

      const scores = marks.map((m) => m.score);
      const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
      const max = Math.max(...scores);
      const min = Math.min(...scores);

      subjectAnalytics.push({
        subjectId: assignment.subjectId,
        subjectName: assignment.subject.name,
        averageScore: Math.round(avg * 100) / 100,
        highestScore: max,
        lowestScore: min,
        totalMarks: marks.length,
      });
    }

    // Underperforming students (term average < 50)
    const termResults = await this.prisma.termResult.findMany({
      where: { termId, studentId: { in: studentIds } },
      include: {
        student: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    const underperforming = termResults
      .filter((r) => (r.average ?? 0) < 50)
      .sort((a, b) => (a.average ?? 0) - (b.average ?? 0))
      .slice(0, 10)
      .map((r) => ({
        studentId: r.studentId,
        name: `${r.student.user.firstName} ${r.student.user.lastName}`,
        average: r.average,
        letterGrade: r.letterGrade,
      }));

    return { subjectAnalytics, underperforming };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STUDENT ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════════

  async getStudentAnalytics(studentId: string, termId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { classSection: true },
    });
    if (!student) return null;

    // Student's marks by subject
    const marks = await this.prisma.mark.findMany({
      where: { studentId, termId },
      include: { subject: true },
    });

    const subjectScores: Record<string, { name: string; scores: number[] }> =
      {};
    for (const m of marks) {
      if (!subjectScores[m.subjectId]) {
        subjectScores[m.subjectId] = { name: m.subject.name, scores: [] };
      }
      subjectScores[m.subjectId].scores.push(m.score);
    }

    const studentSubjects = Object.entries(subjectScores).map(
      ([subjectId, data]) => {
        const avg = data.scores.reduce((s, v) => s + v, 0) / data.scores.length;
        return {
          subjectId,
          subjectName: data.name,
          average: Math.round(avg * 100) / 100,
        };
      },
    );

    // Class average for comparison
    const classmateIds = (
      await this.prisma.student.findMany({
        where: { classSectionId: student.classSectionId },
        select: { id: true },
      })
    ).map((s) => s.id);

    const classResults = await this.prisma.termResult.findMany({
      where: { termId, studentId: { in: classmateIds } },
    });
    const withAvg = classResults.filter((r) => r.average !== null);
    const classAverage =
      withAvg.length > 0
        ? Math.round(
            (withAvg.reduce((s, r) => s + r.average!, 0) / withAvg.length) *
              100,
          ) / 100
        : 0;

    const studentResult = await this.prisma.termResult.findFirst({
      where: { studentId, termId },
    });

    return {
      subjects: studentSubjects,
      studentAverage: studentResult?.average ?? 0,
      classAverage,
      rank: studentResult?.rank ?? null,
      totalStudents: classmateIds.length,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PARENT ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════════

  async getParentChildTrends(studentId: string, academicYearId: string) {
    const terms = await this.prisma.term.findMany({
      where: { academicYearId },
      orderBy: { startDate: 'asc' },
    });

    const trends = [];
    for (const term of terms) {
      const result = await this.prisma.termResult.findFirst({
        where: { studentId, termId: term.id },
      });
      trends.push({
        termId: term.id,
        termName: term.name,
        average: result?.average ?? null,
        letterGrade: result?.letterGrade ?? null,
        rank: result?.rank ?? null,
      });
    }

    // Attendance summary across terms
    const attendanceRecords = await this.prisma.attendance.findMany({
      where: { studentId },
    });
    const totalDays = attendanceRecords.length;
    const presentDays = attendanceRecords.filter(
      (r) => r.status === 'PRESENT' || r.status === 'LATE',
    ).length;

    return {
      performanceTrends: trends,
      attendance: {
        totalDays,
        presentDays,
        absentDays: totalDays - presentDays,
        rate: totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0,
      },
    };
  }
}
