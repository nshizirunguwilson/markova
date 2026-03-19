import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════════

  async getAdminDashboard(academicYearId?: string, termId?: string) {
    const [
      totalStudents,
      totalTeachers,
      totalParents,
      classLevels,
    ] = await Promise.all([
      this.prisma.student.count(),
      this.prisma.teacher.count(),
      this.prisma.parentStudent.groupBy({ by: ['parentUserId'] }).then((r) => r.length),
      this.prisma.classLevel.count(),
    ]);

    return { totalStudents, totalTeachers, totalParents, totalClasses: classLevels };
  }

  async getPerformanceTrends(academicYearId: string) {
    const terms = await this.prisma.term.findMany({
      where: { academicYearId },
      orderBy: { startDate: 'asc' },
    });

    const trends = [];
    for (const term of terms) {
      const results = await this.prisma.termResult.findMany({
        where: { termId: term.id },
      });
      const avg = results.length > 0
        ? results.reduce((s, r) => s + (r.average ?? 0), 0) / results.length
        : 0;
      trends.push({ termId: term.id, termName: term.name, averageScore: Math.round(avg * 100) / 100, studentCount: results.length });
    }

    return trends;
  }

  async getClassComparisons(termId: string) {
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

  async getDisciplineStats(academicYearId?: string) {
    const where: any = {};
    if (academicYearId) {
      const terms = await this.prisma.term.findMany({ where: { academicYearId }, select: { id: true } });
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
      byAction: Object.entries(byAction).map(([name, count]) => ({ name, count })),
    };
  }

  async getLibraryStats() {
    const [totalBooks, totalLoans, activeLoans, overdueLoans] = await Promise.all([
      this.prisma.book.count(),
      this.prisma.bookLoan.count(),
      this.prisma.bookLoan.count({ where: { status: 'ACTIVE' } }),
      this.prisma.bookLoan.count({ where: { status: 'OVERDUE' } }),
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

  async getAttendanceStats(termId?: string) {
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

  async getTeacherClassAnalytics(teacherId: string, classSectionId: string, termId: string) {
    const assignments = await this.prisma.teacherSubjectClass.findMany({
      where: { teacherId, classSectionId },
      include: { subject: true },
    });

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
      include: { student: { include: { user: { select: { firstName: true, lastName: true } } } } },
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

    const subjectScores: Record<string, { name: string; scores: number[] }> = {};
    for (const m of marks) {
      if (!subjectScores[m.subjectId]) {
        subjectScores[m.subjectId] = { name: m.subject.name, scores: [] };
      }
      subjectScores[m.subjectId].scores.push(m.score);
    }

    const studentSubjects = Object.entries(subjectScores).map(([subjectId, data]) => {
      const avg = data.scores.reduce((s, v) => s + v, 0) / data.scores.length;
      return { subjectId, subjectName: data.name, average: Math.round(avg * 100) / 100 };
    });

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
    const classAverage = withAvg.length > 0
      ? Math.round((withAvg.reduce((s, r) => s + r.average!, 0) / withAvg.length) * 100) / 100
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
    const presentDays = attendanceRecords.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;

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
