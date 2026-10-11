import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { classDisplayName } from '../../common/class-name';
import { SubjectScope } from '@prisma/client';
import {
  computeSubjectTotal,
  gradeFor,
  overallGrade,
} from '../../common/grading';
import { CacheService } from '../../common/cache.service';

/** Admin analytics are aggregate scans; 60s of staleness is acceptable. */
const CACHE_TTL_SECONDS = 60;

@Injectable()
export class AnalyticsService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  /**
   * Best-effort read-through cache: a Redis outage must never break
   * analytics, so cache errors fall through to a live compute.
   *
   * Through the shared cache, which keeps each school's answer under its own
   * key. This had a cache of its own whose keys named only the question
   * ("analytics:library"), so with several schools one school's figures were
   * answered to the next for a minute.
   */
  private cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
    return this.cache.remember(key, CACHE_TTL_SECONDS, compute);
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

  // Params are part of the cache key and the public signature; the dashboard
  // is not scoped by year or term yet.
  private async computeAdminDashboard(
    _academicYearId?: string,
    _termId?: string,
  ) {
    const [
      totalStudents,
      totalTeachers,
      totalParents,
      classLevels,
      totalUsers,
      totalSubjects,
    ] = await Promise.all([
      this.prisma.student.count({ where: { status: 'ACTIVE' } }),
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
      include: { classLevel: true, trade: true },
    });

    /*
      Three queries, not two per class.

      This used to ask for each section's students and then that section's
      results, one section at a time: 28 classes was 57 round trips, and it
      grew with the school. The work is the same either way, so it is done
      once and grouped in memory.
    */
    const students = await this.prisma.student.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, classSectionId: true },
    });

    /* Nobody enrolled anywhere: there is nothing to compare, and asking for
       the results of an empty list is a query with a known answer. */
    if (students.length === 0) return [];

    const results = await this.prisma.termResult.findMany({
      where: { termId, studentId: { in: students.map((s) => s.id) } },
      select: { studentId: true, average: true },
    });

    const sectionOf = new Map(students.map((s) => [s.id, s.classSectionId]));
    const averagesBySection = new Map<string, number[]>();
    for (const result of results) {
      if (result.average === null) continue;
      const section = sectionOf.get(result.studentId);
      if (!section) continue;
      const list = averagesBySection.get(section) ?? [];
      list.push(result.average);
      averagesBySection.set(section, list);
    }

    const comparisons = [];
    for (const section of sections) {
      const avgs = averagesBySection.get(section.id) ?? [];
      if (avgs.length === 0) continue;
      const withAvg = avgs;
      const avg = avgs.reduce((s, v) => s + v, 0) / avgs.length;
      const highest = Math.max(...avgs);
      const lowest = Math.min(...avgs);

      comparisons.push({
        classSectionId: section.id,
        className: classDisplayName(section),
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

    // Day-by-day counts for the trend chart.
    const byDateMap = new Map<
      string,
      { present: number; late: number; absent: number }
    >();
    for (const r of records) {
      const key = r.date.toISOString().slice(0, 10);
      const e = byDateMap.get(key) ?? { present: 0, late: 0, absent: 0 };
      if (r.status === 'PRESENT') e.present++;
      else if (r.status === 'LATE') e.late++;
      else e.absent++;
      byDateMap.set(key, e);
    }
    const byDate = [...byDateMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, counts]) => ({ date, ...counts }));

    return {
      totalRecords: total,
      present,
      absent,
      late,
      attendanceRate: total > 0 ? Math.round((present / total) * 100) : 0,
      byDate,
    };
  }

  getGradeDistribution(termId: string) {
    return this.cached(`analytics:grade-distribution:${termId ?? '-'}`, () =>
      this.computeGradeDistribution(termId),
    );
  }

  // Letter-grade counts per class level, for the grade heatmap.
  private async computeGradeDistribution(termId: string) {
    const results = await this.prisma.termResult.findMany({
      where: { ...(termId ? { termId } : {}), letterGrade: { not: null } },
      include: {
        classSection: {
          include: { classLevel: { select: { name: true, order: true } } },
        },
      },
    });

    const byLevel = new Map<
      string,
      { order: number; total: number; counts: Record<string, number> }
    >();
    for (const r of results) {
      const lvl = r.classSection.classLevel;
      const e = byLevel.get(lvl.name) ?? {
        order: lvl.order,
        total: 0,
        counts: {},
      };
      const g = r.letterGrade!;
      e.counts[g] = (e.counts[g] ?? 0) + 1;
      e.total++;
      byLevel.set(lvl.name, e);
    }

    return [...byLevel.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([level, e]) => ({ level, total: e.total, counts: e.counts }));
  }

  getEnrollmentBreakdown() {
    return this.cached('analytics:enrollment', () =>
      this.computeEnrollmentBreakdown(),
    );
  }

  // Active students per level split by gender, for the enrollment pyramid.
  private async computeEnrollmentBreakdown() {
    const students = await this.prisma.student.findMany({
      where: { status: 'ACTIVE' },
      select: {
        gender: true,
        classSection: {
          select: { classLevel: { select: { name: true, order: true } } },
        },
      },
    });

    const byLevel = new Map<
      string,
      { order: number; male: number; female: number }
    >();
    for (const s of students) {
      const lvl = s.classSection.classLevel;
      const e = byLevel.get(lvl.name) ?? {
        order: lvl.order,
        male: 0,
        female: 0,
      };
      if (s.gender === 'MALE') e.male++;
      else if (s.gender === 'FEMALE') e.female++;
      byLevel.set(lvl.name, e);
    }

    return [...byLevel.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([level, e]) => ({ level, male: e.male, female: e.female }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STUDENT PROFILE ANALYTICS (admin/teacher view: subjects × terms × year)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * The terms whose marks this student is allowed to see.
   *
   * Analytics reads raw marks rather than the calculated results, so it
   * bypassed publication entirely: a student could open their own Analytics
   * page and read subject scores the school had not released, days before
   * they appeared anywhere else. Staff are unrestricted - checking figures
   * before release is the point of a draft.
   */
  private async releasedTermIds(
    studentId: string,
    viewerRole?: string,
  ): Promise<string[] | null> {
    if (viewerRole !== 'STUDENT' && viewerRole !== 'PARENT') return null;
    const published = await this.prisma.termResult.findMany({
      where: { studentId, isPublished: true },
      select: { termId: true },
    });
    return published.map((r) => r.termId);
  }

  async getStudentProfileAnalytics(studentId: string, viewerRole?: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            photoUrl: true,
            email: true,
          },
        },
        classSection: { include: { classLevel: true, trade: true } },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const releasedTerms = await this.releasedTermIds(studentId, viewerRole);

    const [marks, ownResults, attendance] = await Promise.all([
      this.prisma.mark.findMany({
        where: {
          studentId,
          ...(releasedTerms ? { termId: { in: releasedTerms } } : {}),
        },
        include: {
          subject: { select: { name: true, scope: true } },
          assessmentType: { select: { name: true } },
          term: {
            select: {
              id: true,
              name: true,
              startDate: true,
              endDate: true,
              academicYear: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.termResult.findMany({
        where: { studentId },
        include: {
          classSection: { include: { classLevel: true, trade: true } },
        },
      }),
      this.prisma.attendance.findMany({
        where: { studentId },
        select: { date: true, status: true },
      }),
    ]);

    // Class averages come from the class the student actually sat in each
    // term - a Senior 2 term compares against that year's Senior 2 class.
    const pairs = ownResults.map((r) => ({
      termId: r.termId,
      classSectionId: r.classSectionId,
    }));
    const classResults = pairs.length
      ? await this.prisma.termResult.findMany({
          where: { OR: pairs },
          select: { termId: true, classSectionId: true, average: true },
        })
      : [];

    // Group marks per term per subject and compute weighted totals with the
    // same module the report cards use.
    type TermAgg = {
      term: { id: string; name: string; startDate: Date };
      bySubject: Map<
        string,
        {
          scope: SubjectScope;
          rows: { assessmentName: string; score: number; maxScore: number }[];
        }
      >;
    };
    const byTerm = new Map<string, TermAgg>();
    for (const m of marks) {
      const t = byTerm.get(m.term.id) ?? { term: m.term, bySubject: new Map() };
      const subj = t.bySubject.get(m.subject.name) ?? {
        scope: m.subject.scope,
        rows: [],
      };
      subj.rows.push({
        assessmentName: m.assessmentType.name,
        score: m.score,
        maxScore: m.maxScore,
      });
      t.bySubject.set(m.subject.name, subj);
      byTerm.set(m.term.id, t);
    }

    const ownByTerm = new Map(ownResults.map((r) => [r.termId, r]));
    const classAvgByTerm = new Map<string, number>();
    {
      const grouped = new Map<string, number[]>();
      for (const r of classResults) {
        if (r.average === null) continue;
        const key = `${r.termId}|${r.classSectionId}`;
        const list = grouped.get(key) ?? [];
        list.push(r.average);
        grouped.set(key, list);
      }
      for (const [key, avgs] of grouped) {
        classAvgByTerm.set(key, avgs.reduce((a, b) => a + b, 0) / avgs.length);
      }
    }

    const terms = [...byTerm.values()]
      .sort((a, b) => a.term.startDate.getTime() - b.term.startDate.getTime())
      .map(({ term, bySubject }) => {
        const subjects = [...bySubject.entries()]
          .map(([name, { scope, rows }]) => {
            const total = computeSubjectTotal(scope, rows);
            const band = total !== null ? gradeFor(scope, total) : null;
            return {
              name,
              scope,
              total,
              grade: band?.letter ?? null,
              points: band?.points ?? null,
            };
          })
          .sort((a, b) => (b.total ?? 0) - (a.total ?? 0));

        const own = ownByTerm.get(term.id);
        const termAttendance = attendance.filter(
          (a) =>
            a.date >= (term as any).startDate &&
            a.date <= (term as any).endDate,
        );
        const presentish = termAttendance.filter(
          (a) => a.status === 'PRESENT' || a.status === 'LATE',
        ).length;

        return {
          termId: term.id,
          termName: term.name,
          yearName: (term as any).academicYear?.name ?? null,
          className: own ? classDisplayName((own as any).classSection) : null,
          subjects,
          average: own?.average ?? null,
          letterGrade:
            own?.letterGrade ??
            (own?.average != null ? overallGrade(own.average).letter : null),
          aggregate: own?.aggregate ?? null,
          aggregateMax: own?.aggregateMax ?? null,
          rank: own?.rank ?? null,
          classSize: own
            ? classResults.filter(
                (r) =>
                  r.termId === term.id &&
                  r.classSectionId === own.classSectionId,
              ).length
            : null,
          classAverage: own
            ? (classAvgByTerm.get(`${term.id}|${own.classSectionId}`) ?? null)
            : null,
          attendancePct: termAttendance.length
            ? Math.round((presentish / termAttendance.length) * 100)
            : null,
        };
      });

    const classSize = await this.prisma.student.count({
      where: { classSectionId: student.classSectionId, status: 'ACTIVE' },
    });

    return {
      student: {
        id: student.id,
        name: `${student.user.firstName} ${student.user.lastName}`,
        email: student.user.email,
        photoUrl: student.user.photoUrl,
        studentIdNumber: student.studentIdNumber,
        gender: student.gender,
        status: student.status,
        disciplinePoints: student.disciplinePoints,
        class: classDisplayName(student.classSection),
        stage: student.classSection.classLevel.stage,
        trade: student.classSection.trade
          ? {
              code: student.classSection.trade.code,
              name: student.classSection.trade.name,
            }
          : null,
        classSize,
      },
      terms,
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
      where: { classSectionId, status: 'ACTIVE' },
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

  async getStudentAnalytics(
    studentId: string,
    termId: string,
    viewerRole?: string,
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { classSection: true },
    });
    if (!student) return null;

    // Nothing to analyse from a term the school has not released. Answering
    // with an empty term rather than throwing keeps this an ordinary empty
    // state on the page.
    const releasedTerms = await this.releasedTermIds(studentId, viewerRole);
    if (releasedTerms && !releasedTerms.includes(termId)) {
      return { published: false, subjects: [], average: null, trend: [] };
    }

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
        where: { classSectionId: student.classSectionId, status: 'ACTIVE' },
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
