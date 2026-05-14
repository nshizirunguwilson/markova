import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginatedResponse } from '../../common/dto';
import {
  CreateMarkDto,
  UpdateMarkDto,
  BatchMarkEntryDto,
  CalculateTermResultDto,
  CalculateYearResultDto,
  UpdateTermResultCommentDto,
  PublishTermResultsDto,
  QueryMarksDto,
} from './dto';

@Injectable()
export class MarksService {
  constructor(private prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // MARK CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  async create(
    dto: CreateMarkDto,
    teacherId: string | null,
    role: string = 'TEACHER',
  ) {
    // Validate term is not closed
    await this.ensureTermOpen(dto.termId);

    // Validate score does not exceed subject max marks
    const subject = await this.prisma.subject.findUnique({
      where: { id: dto.subjectId },
    });
    if (!subject) throw new NotFoundException('Subject not found');
    const maxScore = dto.maxScore || subject.maxMarks;
    if (dto.score > maxScore) {
      throw new BadRequestException(
        `Score ${dto.score} exceeds max ${maxScore}`,
      );
    }

    // Admin without a teacher profile: find the teacher assigned to this subject+class
    let resolvedTeacherId = teacherId;
    if (!resolvedTeacherId && role === 'ADMIN') {
      const assignment = await this.prisma.teacherSubjectClass.findFirst({
        where: { subjectId: dto.subjectId, classSectionId: dto.classSectionId },
      });
      if (assignment) resolvedTeacherId = assignment.teacherId;
    }
    if (!resolvedTeacherId) {
      throw new BadRequestException(
        'No teacher found for this subject and class',
      );
    }

    return this.prisma.mark.create({
      data: {
        studentId: dto.studentId,
        subjectId: dto.subjectId,
        classSectionId: dto.classSectionId,
        termId: dto.termId,
        assessmentTypeId: dto.assessmentTypeId,
        score: dto.score,
        maxScore,
        teacherId: resolvedTeacherId,
      },
      include: {
        student: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        subject: true,
        assessmentType: true,
      },
    });
  }

  async update(
    id: string,
    dto: UpdateMarkDto,
    teacherId: string | null,
    role: string = 'TEACHER',
  ) {
    const mark = await this.prisma.mark.findUnique({
      where: { id },
      include: { subject: true, term: true },
    });
    if (!mark) throw new NotFoundException('Mark not found');
    if (role !== 'ADMIN' && mark.teacherId !== teacherId) {
      throw new ForbiddenException('You can only edit your own marks');
    }
    await this.ensureTermOpen(mark.termId);

    const maxScore = dto.maxScore || mark.maxScore;
    if (dto.score > maxScore) {
      throw new BadRequestException(
        `Score ${dto.score} exceeds max ${maxScore}`,
      );
    }

    return this.prisma.mark.update({
      where: { id },
      data: { score: dto.score, maxScore },
      include: {
        student: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        subject: true,
        assessmentType: true,
      },
    });
  }

  async delete(id: string, teacherId: string | null, role: string = 'TEACHER') {
    const mark = await this.prisma.mark.findUnique({
      where: { id },
      include: { term: true },
    });
    if (!mark) throw new NotFoundException('Mark not found');
    if (role !== 'ADMIN' && mark.teacherId !== teacherId) {
      throw new ForbiddenException('You can only delete your own marks');
    }
    await this.ensureTermOpen(mark.termId);
    return this.prisma.mark.delete({ where: { id } });
  }

  async batchEntry(
    dto: BatchMarkEntryDto,
    teacherId: string | null,
    role: string = 'TEACHER',
  ) {
    await this.ensureTermOpen(dto.termId);

    const subject = await this.prisma.subject.findUnique({
      where: { id: dto.subjectId },
    });
    if (!subject) throw new NotFoundException('Subject not found');

    // Admin without a teacher profile: find the teacher assigned to this subject+class
    let resolvedTeacherId = teacherId;
    if (!resolvedTeacherId && role === 'ADMIN') {
      const assignment = await this.prisma.teacherSubjectClass.findFirst({
        where: { subjectId: dto.subjectId, classSectionId: dto.classSectionId },
      });
      if (assignment) resolvedTeacherId = assignment.teacherId;
    }
    if (!resolvedTeacherId) {
      throw new BadRequestException(
        'No teacher found for this subject and class',
      );
    }

    // Validate all scores
    for (const m of dto.marks) {
      const max = m.maxScore || subject.maxMarks;
      if (m.score > max) {
        throw new BadRequestException(
          `Score ${m.score} exceeds max ${max} for student ${m.studentId}`,
        );
      }
    }

    const results = [];
    for (const m of dto.marks) {
      const maxScore = m.maxScore || subject.maxMarks;
      const result = await this.prisma.mark.upsert({
        where: {
          studentId_subjectId_termId_assessmentTypeId: {
            studentId: m.studentId,
            subjectId: dto.subjectId,
            termId: dto.termId,
            assessmentTypeId: dto.assessmentTypeId,
          },
        },
        update: { score: m.score, maxScore, teacherId: resolvedTeacherId },
        create: {
          studentId: m.studentId,
          subjectId: dto.subjectId,
          classSectionId: dto.classSectionId,
          termId: dto.termId,
          assessmentTypeId: dto.assessmentTypeId,
          score: m.score,
          maxScore,
          teacherId: resolvedTeacherId,
        },
      });
      results.push(result);
    }

    return { count: results.length, marks: results };
  }

  async findAll(query: QueryMarksDto) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.studentId) where.studentId = query.studentId;
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.classSectionId) where.classSectionId = query.classSectionId;
    if (query.termId) where.termId = query.termId;
    if (query.assessmentTypeId) where.assessmentTypeId = query.assessmentTypeId;
    if (query.teacherId) where.teacherId = query.teacherId;

    const [data, total] = await Promise.all([
      this.prisma.mark.findMany({
        where,
        skip,
        take: limit,
        include: {
          student: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
          subject: true,
          assessmentType: true,
          teacher: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
        },
        orderBy: [{ subject: { name: 'asc' } }, { createdAt: 'desc' }],
      }),
      this.prisma.mark.count({ where }),
    ]);

    return new PaginatedResponse(data, total, page, limit);
  }

  async findById(id: string) {
    const mark = await this.prisma.mark.findUnique({
      where: { id },
      include: {
        student: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        subject: true,
        assessmentType: true,
        teacher: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        classSection: { include: { classLevel: true } },
        term: true,
      },
    });
    if (!mark) throw new NotFoundException('Mark not found');
    return mark;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPLETION TRACKER
  // ═══════════════════════════════════════════════════════════════════════════

  async getCompletionTracker(
    classSectionId: string,
    termId: string,
    subjectId: string,
    assessmentTypeId: string,
  ) {
    // Get all students in this class section
    const students = await this.prisma.student.findMany({
      where: { classSectionId, status: 'ACTIVE' },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    // Get existing marks
    const marks = await this.prisma.mark.findMany({
      where: { classSectionId, termId, subjectId, assessmentTypeId },
    });

    const gradedIds = new Set(marks.map((m) => m.studentId));
    const total = students.length;
    const graded = gradedIds.size;

    return {
      total,
      graded,
      remaining: total - graded,
      percentage: total > 0 ? Math.round((graded / total) * 100) : 0,
      students: students.map((s) => ({
        id: s.id,
        name: `${s.user.firstName} ${s.user.lastName}`,
        studentIdNumber: s.studentIdNumber,
        isGraded: gradedIds.has(s.id),
        mark: marks.find((m) => m.studentId === s.id) || null,
      })),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TERM RESULTS CALCULATION
  // ═══════════════════════════════════════════════════════════════════════════

  async calculateTermResults(dto: CalculateTermResultDto) {
    const { classSectionId, termId } = dto;

    return this.prisma.$transaction(async (tx) => {
      // Get all active students in section
      const students = await tx.student.findMany({
        where: { classSectionId, status: 'ACTIVE' },
      });

      // Get grading scale from school config
      const gradingScale = await this.getGradingScale();

      const results = [];
      for (const student of students) {
        // Get all marks for this student in this term
        const marks = await tx.mark.findMany({
          where: { studentId: student.id, termId },
          include: { subject: true },
        });

        if (marks.length === 0) continue;

        // Calculate average: sum of (score/maxScore*subjectMaxMarks) / number of subjects
        // Group by subject, take average across assessment types per subject
        const subjectAverages = new Map<
          string,
          { total: number; count: number; maxMarks: number }
        >();
        for (const mark of marks) {
          const existing = subjectAverages.get(mark.subjectId) || {
            total: 0,
            count: 0,
            maxMarks: mark.subject.maxMarks,
          };
          existing.total +=
            (mark.score / mark.maxScore) * mark.subject.maxMarks;
          existing.count += 1;
          subjectAverages.set(mark.subjectId, existing);
        }

        let totalMarks = 0;
        let subjectCount = 0;
        for (const [, val] of subjectAverages) {
          totalMarks += val.total / val.count;
          subjectCount++;
        }

        const average = subjectCount > 0 ? totalMarks / subjectCount : 0;
        const letterGrade = this.getLetterGrade(average, gradingScale);

        const result = await tx.termResult.upsert({
          where: {
            studentId_classSectionId_termId: {
              studentId: student.id,
              classSectionId,
              termId,
            },
          },
          update: { totalMarks, average, letterGrade },
          create: {
            studentId: student.id,
            classSectionId,
            termId,
            totalMarks,
            average,
            letterGrade,
          },
        });
        results.push(result);
      }

      // Calculate ranks
      results.sort((a, b) => (b.average || 0) - (a.average || 0));
      for (let i = 0; i < results.length; i++) {
        await tx.termResult.update({
          where: { id: results[i].id },
          data: { rank: i + 1 },
        });
        results[i].rank = i + 1;
      }

      return { count: results.length, results };
    });
  }

  async getTermResults(classSectionId: string, termId: string) {
    return this.prisma.termResult.findMany({
      where: { classSectionId, termId },
      include: {
        student: {
          include: {
            user: {
              select: { firstName: true, lastName: true, photoUrl: true },
            },
          },
        },
      },
      orderBy: { rank: 'asc' },
    });
  }

  async getStudentTermResult(studentId: string, termId: string) {
    const result = await this.prisma.termResult.findFirst({
      where: { studentId, termId },
      include: {
        student: {
          include: {
            user: {
              select: { firstName: true, lastName: true, photoUrl: true },
            },
            classSection: { include: { classLevel: true } },
          },
        },
        term: { include: { academicYear: true } },
      },
    });

    // Also get marks breakdown
    const marks = await this.prisma.mark.findMany({
      where: { studentId, termId },
      include: { subject: true, assessmentType: true },
      orderBy: { subject: { name: 'asc' } },
    });

    return { result, marks };
  }

  async updateTermResultComment(id: string, dto: UpdateTermResultCommentDto) {
    const result = await this.prisma.termResult.findUnique({ where: { id } });
    if (!result) throw new NotFoundException('Term result not found');

    return this.prisma.termResult.update({
      where: { id },
      data: {
        ...(dto.teacherComment !== undefined && {
          teacherComment: dto.teacherComment,
        }),
        ...(dto.headmasterComment !== undefined && {
          headmasterComment: dto.headmasterComment,
        }),
      },
    });
  }

  async publishTermResults(dto: PublishTermResultsDto) {
    return this.prisma.termResult.updateMany({
      where: { classSectionId: dto.classSectionId, termId: dto.termId },
      data: { isPublished: dto.isPublished },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // YEAR RESULTS CALCULATION
  // ═══════════════════════════════════════════════════════════════════════════

  async calculateYearResults(dto: CalculateYearResultDto) {
    const { classSectionId, academicYearId } = dto;

    // Get all terms for this academic year
    const terms = await this.prisma.term.findMany({
      where: { academicYearId },
      orderBy: { startDate: 'asc' },
    });

    if (terms.length === 0) {
      throw new BadRequestException('No terms found for this academic year');
    }

    // Get pass threshold from config
    const passThreshold = await this.getPassThreshold();
    const gradingScale = await this.getGradingScale();
    const startingPoints = await this.getStartingDisciplinePoints();

    return this.prisma.$transaction(async (tx) => {
      // Get active students
      const students = await tx.student.findMany({
        where: { classSectionId, status: 'ACTIVE' },
      });

      const results = [];
      for (const student of students) {
        // Get term results
        const termResults = await tx.termResult.findMany({
          where: {
            studentId: student.id,
            termId: { in: terms.map((t) => t.id) },
          },
          orderBy: { term: { startDate: 'asc' } },
        });

        const term1Avg = termResults[0]?.average || null;
        const term2Avg = termResults[1]?.average || null;
        const term3Avg = termResults[2]?.average || null;

        const validAvgs = [term1Avg, term2Avg, term3Avg].filter(
          (a) => a !== null,
        );
        const yearlyAverage =
          validAvgs.length > 0
            ? validAvgs.reduce((s, a) => s + a, 0) / validAvgs.length
            : null;

        // Discipline average (current points / starting points * 100)
        const disciplineAverage =
          startingPoints > 0
            ? (student.disciplinePoints / startingPoints) * 100
            : null;

        const letterGrade =
          yearlyAverage !== null
            ? this.getLetterGrade(yearlyAverage, gradingScale)
            : null;
        const isPromoted =
          yearlyAverage !== null && yearlyAverage >= passThreshold;

        const result = await tx.yearResult.upsert({
          where: {
            studentId_classSectionId_academicYearId: {
              studentId: student.id,
              classSectionId,
              academicYearId,
            },
          },
          update: {
            term1Avg,
            term2Avg,
            term3Avg,
            yearlyAverage,
            letterGrade,
            disciplineAverage,
            isPromoted,
          },
          create: {
            studentId: student.id,
            classSectionId,
            academicYearId,
            term1Avg,
            term2Avg,
            term3Avg,
            yearlyAverage,
            letterGrade,
            disciplineAverage,
            isPromoted,
          },
        });
        results.push(result);
      }

      // Calculate ranks
      results.sort((a, b) => (b.yearlyAverage || 0) - (a.yearlyAverage || 0));
      for (let i = 0; i < results.length; i++) {
        await tx.yearResult.update({
          where: { id: results[i].id },
          data: { rank: i + 1 },
        });
        results[i].rank = i + 1;
      }

      return { count: results.length, results };
    });
  }

  async getYearResults(classSectionId: string, academicYearId: string) {
    return this.prisma.yearResult.findMany({
      where: { classSectionId, academicYearId },
      include: {
        student: {
          include: {
            user: {
              select: { firstName: true, lastName: true, photoUrl: true },
            },
          },
        },
      },
      orderBy: { rank: 'asc' },
    });
  }

  async getStudentYearResult(studentId: string, academicYearId: string) {
    const result = await this.prisma.yearResult.findFirst({
      where: { studentId, academicYearId },
      include: {
        student: {
          include: {
            user: {
              select: { firstName: true, lastName: true, photoUrl: true },
            },
            classSection: { include: { classLevel: true } },
          },
        },
        academicYear: true,
      },
    });

    // Get all term results for context
    const terms = await this.prisma.term.findMany({
      where: { academicYearId },
      orderBy: { startDate: 'asc' },
    });
    const termResults = await this.prisma.termResult.findMany({
      where: { studentId, termId: { in: terms.map((t) => t.id) } },
      include: { term: true },
      orderBy: { term: { startDate: 'asc' } },
    });

    return { result, termResults };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORT CARD DATA
  // ═══════════════════════════════════════════════════════════════════════════

  async getReportCardData(studentId: string, termId: string) {
    // Student info
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: { select: { firstName: true, lastName: true, photoUrl: true } },
        classSection: { include: { classLevel: true } },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    // Term info
    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      include: { academicYear: true },
    });
    if (!term) throw new NotFoundException('Term not found');

    // Marks with subject & assessment type
    const marks = await this.prisma.mark.findMany({
      where: { studentId, termId },
      include: { subject: true, assessmentType: true },
      orderBy: { subject: { name: 'asc' } },
    });

    // Term result
    const termResult = await this.prisma.termResult.findFirst({
      where: { studentId, termId },
    });

    // Class stats for comparison
    const classResults = await this.prisma.termResult.findMany({
      where: { classSectionId: student.classSectionId, termId },
    });
    const classAverage =
      classResults.length > 0
        ? classResults.reduce((s, r) => s + (r.average || 0), 0) /
          classResults.length
        : null;
    const totalStudents = classResults.length;

    // Group marks by subject
    const subjectBreakdown = this.groupMarksBySubject(marks);

    // School info
    const schoolConfig = await this.prisma.schoolConfig.findMany();
    const configMap: Record<string, string> = {};
    for (const c of schoolConfig) {
      configMap[c.key] = c.value;
    }

    return {
      school: {
        name: configMap['school_name'] || '',
        motto: configMap['motto'] || '',
        logoUrl: configMap['logo_url'] || null,
        stampUrl: configMap['stamp_url'] || null,
        signatureUrl: configMap['signature_url'] || null,
      },
      student: {
        name: `${student.user.firstName} ${student.user.lastName}`,
        studentIdNumber: student.studentIdNumber,
        photoUrl: student.user.photoUrl,
        class: `${student.classSection.classLevel.name} ${student.classSection.name}`,
      },
      term: {
        name: term.name,
        academicYear: term.academicYear.name,
      },
      subjects: subjectBreakdown,
      result: termResult,
      classStats: {
        classAverage,
        totalStudents,
        rank: termResult?.rank || null,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private async ensureTermOpen(termId: string) {
    const term = await this.prisma.term.findUnique({ where: { id: termId } });
    if (!term) throw new NotFoundException('Term not found');
    if (term.isClosed) {
      throw new ForbiddenException('Cannot modify marks — term is closed');
    }
  }

  private async getGradingScale(): Promise<{ grade: string; min: number }[]> {
    const config = await this.prisma.schoolConfig.findUnique({
      where: { key: 'grading_scale' },
    });
    // Default: A:80,B:70,C:60,D:50,F:0
    const raw = config?.value || 'A:80,B:70,C:60,D:50,F:0';
    return raw
      .split(',')
      .map((pair) => {
        const [grade, min] = pair.split(':');
        return { grade: grade.trim(), min: Number(min) };
      })
      .sort((a, b) => b.min - a.min);
  }

  private getLetterGrade(
    average: number,
    scale: { grade: string; min: number }[],
  ): string {
    for (const s of scale) {
      if (average >= s.min) return s.grade;
    }
    return 'F';
  }

  private async getPassThreshold(): Promise<number> {
    const config = await this.prisma.schoolConfig.findUnique({
      where: { key: 'pass_threshold' },
    });
    return Number(config?.value || '50');
  }

  private async getStartingDisciplinePoints(): Promise<number> {
    const config = await this.prisma.schoolConfig.findUnique({
      where: { key: 'starting_discipline_points' },
    });
    return Number(config?.value || '100');
  }

  private groupMarksBySubject(marks: any[]) {
    const map = new Map<
      string,
      { subject: any; assessments: any[]; average: number }
    >();

    for (const mark of marks) {
      if (!map.has(mark.subjectId)) {
        map.set(mark.subjectId, {
          subject: {
            id: mark.subject.id,
            name: mark.subject.name,
            maxMarks: mark.subject.maxMarks,
          },
          assessments: [],
          average: 0,
        });
      }
      const entry = map.get(mark.subjectId)!;
      entry.assessments.push({
        assessmentType: mark.assessmentType.name,
        score: mark.score,
        maxScore: mark.maxScore,
        percentage: Math.round((mark.score / mark.maxScore) * 100),
      });
    }

    // Calculate per-subject averages
    for (const [, val] of map) {
      const total = val.assessments.reduce((s, a) => s + a.percentage, 0);
      val.average =
        val.assessments.length > 0
          ? Math.round(total / val.assessments.length)
          : 0;
    }

    return Array.from(map.values());
  }
}
