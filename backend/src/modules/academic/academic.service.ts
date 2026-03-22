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
      data: { ...(dto.name && { name: dto.name }), ...(dto.order && { order: dto.order }) },
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
    const section = await this.prisma.classSection.findUnique({ where: { id } });
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
        ...(filters?.classSectionId && { classSectionId: filters.classSectionId }),
        ...(filters?.academicYearId && { academicYearId: filters.academicYearId }),
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
}
