import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateAcademicYearDto,
  UpdateAcademicYearDto,
  CreateTermDto,
  UpdateTermDto,
  CreateClassLevelDto,
  UpdateClassLevelDto,
  CreateClassSectionDto,
  UpdateClassSectionDto,
  CreateSubjectDto,
  UpdateSubjectDto,
  CreateAssessmentTypeDto,
  CreateAssignmentDto,
  BulkAssignmentDto,
  PromoteStudentsDto,
  PromotionPreviewDto,
  CommitPromotionDto,
  CreateTimetableDto,
  UpdateTimetableDto,
  BulkTimetableDto,
  CreateExamScheduleDto,
  UpdateExamScheduleDto,
  BulkExamScheduleDto,
} from './dto';

@Injectable()
export class AcademicService {
  constructor(private prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // ACADEMIC YEARS
  // ═══════════════════════════════════════════════════════════════════════════

  async findAllYears() {
    return this.prisma.academicYear.findMany({
      include: { terms: { orderBy: { startDate: 'asc' } } },
      orderBy: { startDate: 'desc' },
    });
  }

  async findYearById(id: string) {
    const year = await this.prisma.academicYear.findUnique({
      where: { id },
      include: { terms: { orderBy: { startDate: 'asc' } } },
    });
    if (!year) throw new NotFoundException('Academic year not found');
    return year;
  }

  async createYear(dto: CreateAcademicYearDto) {
    if (dto.isCurrent) {
      await this.prisma.academicYear.updateMany({
        where: { isCurrent: true },
        data: { isCurrent: false },
      });
    }
    return this.prisma.academicYear.create({
      data: {
        name: dto.name,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        isCurrent: dto.isCurrent || false,
      },
    });
  }

  async updateYear(id: string, dto: UpdateAcademicYearDto) {
    await this.findYearById(id);
    if (dto.isCurrent) {
      await this.prisma.academicYear.updateMany({
        where: { isCurrent: true },
        data: { isCurrent: false },
      });
    }
    return this.prisma.academicYear.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.startDate && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate && { endDate: new Date(dto.endDate) }),
        ...(dto.isCurrent !== undefined && { isCurrent: dto.isCurrent }),
      },
    });
  }

  async deleteYear(id: string) {
    await this.findYearById(id);
    await this.prisma.academicYear.delete({ where: { id } });
    return { message: 'Academic year deleted' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TERMS
  // ═══════════════════════════════════════════════════════════════════════════

  async findAllTerms(academicYearId?: string) {
    return this.prisma.term.findMany({
      where: academicYearId ? { academicYearId } : undefined,
      include: { academicYear: { select: { name: true } } },
      orderBy: { startDate: 'asc' },
    });
  }

  async findTermById(id: string) {
    const term = await this.prisma.term.findUnique({
      where: { id },
      include: { academicYear: true },
    });
    if (!term) throw new NotFoundException('Term not found');
    return term;
  }

  async createTerm(dto: CreateTermDto) {
    if (dto.isCurrent) {
      await this.prisma.term.updateMany({
        where: { isCurrent: true },
        data: { isCurrent: false },
      });
    }
    return this.prisma.term.create({
      data: {
        academicYearId: dto.academicYearId,
        name: dto.name,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        isCurrent: dto.isCurrent || false,
      },
    });
  }

  async updateTerm(id: string, dto: UpdateTermDto) {
    await this.findTermById(id);
    if (dto.isCurrent) {
      await this.prisma.term.updateMany({
        where: { isCurrent: true },
        data: { isCurrent: false },
      });
    }
    return this.prisma.term.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.startDate && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate && { endDate: new Date(dto.endDate) }),
        ...(dto.isCurrent !== undefined && { isCurrent: dto.isCurrent }),
        ...(dto.isClosed !== undefined && { isClosed: dto.isClosed }),
      },
    });
  }

  async closeTerm(id: string) {
    const term = await this.findTermById(id);
    if (term.isClosed) {
      throw new BadRequestException('Term is already closed');
    }
    return this.prisma.term.update({
      where: { id },
      data: { isClosed: true, isCurrent: false },
    });
  }

  async reopenTerm(id: string) {
    const term = await this.findTermById(id);
    if (!term.isClosed) {
      throw new BadRequestException('Term is not closed');
    }
    return this.prisma.term.update({
      where: { id },
      data: { isClosed: false },
    });
  }

  async deleteTerm(id: string) {
    await this.findTermById(id);
    await this.prisma.term.delete({ where: { id } });
    return { message: 'Term deleted' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLASS LEVELS
  // ═══════════════════════════════════════════════════════════════════════════

  async findAllClassLevels() {
    return this.prisma.classLevel.findMany({
      include: {
        sections: {
          orderBy: { name: 'asc' },
          include: {
            _count: { select: { students: true } },
          },
        },
      },
      orderBy: { order: 'asc' },
    });
  }

  async createClassLevel(dto: CreateClassLevelDto) {
    return this.prisma.classLevel.create({ data: dto });
  }

  async updateClassLevel(id: string, dto: UpdateClassLevelDto) {
    const level = await this.prisma.classLevel.findUnique({ where: { id } });
    if (!level) throw new NotFoundException('Class level not found');
    return this.prisma.classLevel.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.order && { order: dto.order }),
      },
    });
  }

  async deleteClassLevel(id: string) {
    await this.prisma.classLevel.delete({ where: { id } });
    return { message: 'Class level deleted' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLASS SECTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async findAllSections(classLevelId?: string) {
    return this.prisma.classSection.findMany({
      where: classLevelId ? { classLevelId } : undefined,
      include: {
        classLevel: { select: { name: true, order: true } },
        _count: { select: { students: true } },
      },
      orderBy: [{ classLevel: { order: 'asc' } }, { name: 'asc' }],
    });
  }

  async createSection(dto: CreateClassSectionDto) {
    return this.prisma.classSection.create({
      data: dto,
      include: { classLevel: { select: { name: true } } },
    });
  }

  async updateSection(id: string, dto: UpdateClassSectionDto) {
    const section = await this.prisma.classSection.findUnique({
      where: { id },
    });
    if (!section) throw new NotFoundException('Class section not found');
    return this.prisma.classSection.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.classLevelId && { classLevelId: dto.classLevelId }),
      },
    });
  }

  async deleteSection(id: string) {
    await this.prisma.classSection.delete({ where: { id } });
    return { message: 'Class section deleted' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUBJECTS
  // ═══════════════════════════════════════════════════════════════════════════

  async findAllSubjects() {
    return this.prisma.subject.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async createSubject(dto: CreateSubjectDto) {
    return this.prisma.subject.create({
      data: {
        name: dto.name,
        category: dto.category,
        maxMarks: dto.maxMarks || 100,
      },
    });
  }

  async updateSubject(id: string, dto: UpdateSubjectDto) {
    const subject = await this.prisma.subject.findUnique({ where: { id } });
    if (!subject) throw new NotFoundException('Subject not found');
    return this.prisma.subject.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.maxMarks !== undefined && { maxMarks: dto.maxMarks }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async deleteSubject(id: string) {
    await this.prisma.subject.delete({ where: { id } });
    return { message: 'Subject deleted' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ASSESSMENT TYPES
  // ═══════════════════════════════════════════════════════════════════════════

  async findAllAssessmentTypes() {
    return this.prisma.assessmentType.findMany({ orderBy: { name: 'asc' } });
  }

  async createAssessmentType(dto: CreateAssessmentTypeDto) {
    return this.prisma.assessmentType.create({ data: { name: dto.name } });
  }

  async deleteAssessmentType(id: string) {
    await this.prisma.assessmentType.delete({ where: { id } });
    return { message: 'Assessment type deleted' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEACHER-SUBJECT-CLASS ASSIGNMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  async findAllAssignments(filters?: {
    teacherId?: string;
    classSectionId?: string;
    academicYearId?: string;
  }) {
    return this.prisma.teacherSubjectClass.findMany({
      where: {
        ...(filters?.teacherId && { teacherId: filters.teacherId }),
        ...(filters?.classSectionId && {
          classSectionId: filters.classSectionId,
        }),
        ...(filters?.academicYearId && {
          academicYearId: filters.academicYearId,
        }),
      },
      include: {
        teacher: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
        subject: { select: { name: true, category: true } },
        classSection: {
          include: { classLevel: { select: { name: true } } },
        },
        academicYear: { select: { name: true } },
      },
      orderBy: { subject: { name: 'asc' } },
    });
  }

  async createAssignment(dto: CreateAssignmentDto) {
    // Check for duplicates
    const existing = await this.prisma.teacherSubjectClass.findFirst({
      where: {
        teacherId: dto.teacherId,
        subjectId: dto.subjectId,
        classSectionId: dto.classSectionId,
        academicYearId: dto.academicYearId,
      },
    });
    if (existing) {
      throw new ConflictException('This assignment already exists');
    }

    return this.prisma.teacherSubjectClass.create({
      data: dto,
      include: {
        teacher: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        subject: { select: { name: true } },
        classSection: {
          include: { classLevel: { select: { name: true } } },
        },
      },
    });
  }

  async bulkCreateAssignments(dto: BulkAssignmentDto) {
    const results = { created: 0, errors: [] as string[] };

    for (let i = 0; i < dto.assignments.length; i++) {
      try {
        await this.createAssignment(dto.assignments[i]);
        results.created++;
      } catch (error: any) {
        results.errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }

    return results;
  }

  async deleteAssignment(id: string) {
    await this.prisma.teacherSubjectClass.delete({ where: { id } });
    return { message: 'Assignment deleted' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIMETABLE
  // ═══════════════════════════════════════════════════════════════════════════

  async findTimetable(classSectionId: string, teacherId?: string) {
    const where: any = { classSectionId };
    if (teacherId) where.teacherId = teacherId;

    return this.prisma.timetable.findMany({
      where,
      include: {
        subject: { select: { name: true } },
        teacher: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async findTeacherTimetable(teacherId: string) {
    return this.prisma.timetable.findMany({
      where: { teacherId },
      include: {
        subject: { select: { name: true } },
        classSection: {
          include: { classLevel: { select: { name: true } } },
        },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async createTimetable(dto: CreateTimetableDto) {
    return this.prisma.timetable.create({
      data: dto,
      include: {
        subject: { select: { name: true } },
        teacher: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        classSection: {
          include: { classLevel: { select: { name: true } } },
        },
      },
    });
  }

  async updateTimetable(id: string, dto: UpdateTimetableDto) {
    const entry = await this.prisma.timetable.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Timetable entry not found');

    return this.prisma.timetable.update({
      where: { id },
      data: {
        ...(dto.classSectionId && { classSectionId: dto.classSectionId }),
        ...(dto.subjectId && { subjectId: dto.subjectId }),
        ...(dto.teacherId && { teacherId: dto.teacherId }),
        ...(dto.dayOfWeek !== undefined && { dayOfWeek: dto.dayOfWeek }),
        ...(dto.startTime && { startTime: dto.startTime }),
        ...(dto.endTime && { endTime: dto.endTime }),
        ...(dto.room !== undefined && { room: dto.room }),
      },
      include: {
        subject: { select: { name: true } },
        teacher: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
    });
  }

  async deleteTimetable(id: string) {
    const entry = await this.prisma.timetable.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Timetable entry not found');
    await this.prisma.timetable.delete({ where: { id } });
    return { message: 'Timetable entry deleted' };
  }

  async bulkCreateTimetable(dto: BulkTimetableDto) {
    const results = { created: 0, errors: [] as string[] };

    for (let i = 0; i < dto.entries.length; i++) {
      try {
        await this.createTimetable(dto.entries[i]);
        results.created++;
      } catch (error: any) {
        results.errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXAM SCHEDULES
  // ═══════════════════════════════════════════════════════════════════════════

  async findExamSchedules(classSectionId?: string, termId?: string) {
    const where: any = {};
    if (classSectionId) where.classSectionId = classSectionId;
    if (termId) where.termId = termId;

    return this.prisma.examSchedule.findMany({
      where,
      include: {
        subject: { select: { name: true } },
        classSection: {
          include: { classLevel: { select: { name: true } } },
        },
        term: { select: { name: true } },
      },
      orderBy: [{ examDate: 'asc' }, { startTime: 'asc' }],
    });
  }

  async createExamSchedule(dto: CreateExamScheduleDto) {
    return this.prisma.examSchedule.create({
      data: {
        classSectionId: dto.classSectionId,
        subjectId: dto.subjectId,
        termId: dto.termId,
        examDate: new Date(dto.examDate),
        startTime: dto.startTime,
        endTime: dto.endTime,
        room: dto.room,
        syllabus: dto.syllabus,
      },
      include: {
        subject: { select: { name: true } },
        classSection: {
          include: { classLevel: { select: { name: true } } },
        },
        term: { select: { name: true } },
      },
    });
  }

  async updateExamSchedule(id: string, dto: UpdateExamScheduleDto) {
    const entry = await this.prisma.examSchedule.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Exam schedule not found');

    return this.prisma.examSchedule.update({
      where: { id },
      data: {
        ...(dto.classSectionId && { classSectionId: dto.classSectionId }),
        ...(dto.subjectId && { subjectId: dto.subjectId }),
        ...(dto.termId && { termId: dto.termId }),
        ...(dto.examDate && { examDate: new Date(dto.examDate) }),
        ...(dto.startTime && { startTime: dto.startTime }),
        ...(dto.endTime && { endTime: dto.endTime }),
        ...(dto.room !== undefined && { room: dto.room }),
        ...(dto.syllabus !== undefined && { syllabus: dto.syllabus }),
      },
      include: {
        subject: { select: { name: true } },
        classSection: {
          include: { classLevel: { select: { name: true } } },
        },
        term: { select: { name: true } },
      },
    });
  }

  async deleteExamSchedule(id: string) {
    const entry = await this.prisma.examSchedule.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Exam schedule not found');
    await this.prisma.examSchedule.delete({ where: { id } });
    return { message: 'Exam schedule deleted' };
  }

  async bulkCreateExamSchedules(dto: BulkExamScheduleDto) {
    const results = { created: 0, errors: [] as string[] };

    for (let i = 0; i < dto.entries.length; i++) {
      try {
        await this.createExamSchedule(dto.entries[i]);
        results.created++;
      } catch (error: any) {
        results.errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STUDENT PROMOTION
  // ═══════════════════════════════════════════════════════════════════════════

  async promoteStudents(dto: PromoteStudentsDto) {
    const threshold = dto.passThreshold || 50;

    // Get all students in source class with their year results
    const students = await this.prisma.student.findMany({
      where: {
        classSectionId: dto.fromClassSectionId,
        status: 'ACTIVE',
      },
      include: {
        yearResults: {
          where: { academicYearId: dto.academicYearId },
        },
        user: { select: { firstName: true, lastName: true } },
      },
    });

    const promoted: string[] = [];
    const retained: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const student of students) {
        const yearResult = student.yearResults[0];
        const avg = yearResult?.yearlyAverage || 0;

        if (avg >= threshold) {
          // Promote
          await tx.student.update({
            where: { id: student.id },
            data: { classSectionId: dto.toClassSectionId },
          });

          if (yearResult) {
            await tx.yearResult.update({
              where: { id: yearResult.id },
              data: { isPromoted: true },
            });
          }

          promoted.push(
            `${student.user.firstName} ${student.user.lastName} (${avg.toFixed(1)}%)`,
          );
        } else {
          retained.push(
            `${student.user.firstName} ${student.user.lastName} (${avg.toFixed(1)}%)`,
          );
        }
      }
    });

    return {
      total: students.length,
      promoted: promoted.length,
      retained: retained.length,
      promotedStudents: promoted,
      retainedStudents: retained,
    };
  }

  /**
   * Deliberation preview: for every student in the source class, compute their
   * yearly average and discipline standing and a system recommendation
   * (PROMOTE only if both the academic pass mark and the discipline minimum are
   * met). Staff review this and can override each decision before committing.
   */
  async getPromotionPreview(dto: PromotionPreviewDto) {
    const passThreshold = dto.passThreshold ?? 50;
    const disciplineThreshold = dto.disciplineThreshold ?? 50;

    const students = await this.prisma.student.findMany({
      where: { classSectionId: dto.fromClassSectionId, status: 'ACTIVE' },
      include: {
        yearResults: { where: { academicYearId: dto.academicYearId } },
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: { user: { firstName: 'asc' } },
    });

    // Fallback academic average from raw marks when no year result is computed yet
    const terms = await this.prisma.term.findMany({
      where: { academicYearId: dto.academicYearId },
      select: { id: true },
    });
    const termIds = terms.map((t) => t.id);
    const studentIds = students.map((s) => s.id);
    const marks =
      termIds.length && studentIds.length
        ? await this.prisma.mark.findMany({
            where: {
              studentId: { in: studentIds },
              termId: { in: termIds },
              maxScore: { gt: 0 },
            },
            select: { studentId: true, score: true, maxScore: true },
          })
        : [];
    const markAvg = new Map<string, { sum: number; n: number }>();
    for (const m of marks) {
      const pct = (m.score / m.maxScore) * 100;
      const a = markAvg.get(m.studentId) ?? { sum: 0, n: 0 };
      a.sum += pct;
      a.n += 1;
      markAvg.set(m.studentId, a);
    }

    const rows = students.map((s) => {
      const yr = s.yearResults[0];
      const fromMarks = markAvg.get(s.id);
      const average =
        yr?.yearlyAverage ??
        (fromMarks && fromMarks.n > 0 ? fromMarks.sum / fromMarks.n : 0);
      const disciplinePoints = s.disciplinePoints;
      const passedAcademic = average >= passThreshold;
      const passedDiscipline = disciplinePoints >= disciplineThreshold;
      const recommendation =
        passedAcademic && passedDiscipline ? 'PROMOTE' : 'RETAIN';

      let reason: string;
      if (recommendation === 'PROMOTE') {
        reason = 'Meets academic and discipline criteria';
      } else if (!passedAcademic && !passedDiscipline) {
        reason = `Below pass mark (${average.toFixed(1)}% < ${passThreshold}%) and discipline (${disciplinePoints} < ${disciplineThreshold})`;
      } else if (!passedAcademic) {
        reason = `Below pass mark (${average.toFixed(1)}% < ${passThreshold}%)`;
      } else {
        reason = `Discipline below threshold (${disciplinePoints} < ${disciplineThreshold})`;
      }

      return {
        studentId: s.id,
        name: `${s.user.firstName} ${s.user.lastName}`,
        studentIdNumber: s.studentIdNumber,
        average: Number(average.toFixed(1)),
        disciplinePoints,
        hasResult: !!yr,
        recommendation,
        reason,
      };
    });

    return {
      passThreshold,
      disciplineThreshold,
      total: rows.length,
      recommendedPromote: rows.filter((r) => r.recommendation === 'PROMOTE')
        .length,
      recommendedRetain: rows.filter((r) => r.recommendation === 'RETAIN')
        .length,
      students: rows,
    };
  }

  /** Commit the staff's final per-student promotion decisions. */
  async commitPromotion(dto: CommitPromotionDto) {
    const ids = dto.decisions.map((d) => d.studentId);
    const students = await this.prisma.student.findMany({
      where: { id: { in: ids } },
      include: {
        yearResults: { where: { academicYearId: dto.academicYearId } },
        user: { select: { firstName: true, lastName: true } },
      },
    });
    const byId = new Map(students.map((s) => [s.id, s]));

    const promoted: string[] = [];
    const retained: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const d of dto.decisions) {
        const s = byId.get(d.studentId);
        if (!s) continue;
        const yr = s.yearResults[0];
        const name = `${s.user.firstName} ${s.user.lastName}`;

        if (d.decision === 'PROMOTE') {
          await tx.student.update({
            where: { id: s.id },
            data: { classSectionId: dto.toClassSectionId },
          });
          if (yr) {
            await tx.yearResult.update({
              where: { id: yr.id },
              data: { isPromoted: true },
            });
          }
          promoted.push(name);
        } else {
          if (yr) {
            await tx.yearResult.update({
              where: { id: yr.id },
              data: { isPromoted: false },
            });
          }
          retained.push(name);
        }
      }
    });

    return {
      total: dto.decisions.length,
      promoted: promoted.length,
      retained: retained.length,
      promotedStudents: promoted,
      retainedStudents: retained,
    };
  }
}
