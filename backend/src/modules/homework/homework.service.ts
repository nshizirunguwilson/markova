import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateHomeworkDto,
  UpdateHomeworkDto,
  SubmitHomeworkDto,
  GradeSubmissionDto,
  QueryHomeworkDto,
} from './dto';
import { NotificationSubject } from '../../common/notification-target';

@Injectable()
export class HomeworkService {
  constructor(private prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // HOMEWORK CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  async create(dto: CreateHomeworkDto, teacherId: string, _role?: string) {
    const resolvedTeacherId = teacherId || dto.teacherId;
    if (!resolvedTeacherId) {
      throw new ForbiddenException('Teacher ID is required');
    }
    return this.prisma.homework.create({
      data: {
        teacherId: resolvedTeacherId,
        subjectId: dto.subjectId,
        classSectionId: dto.classSectionId,
        termId: dto.termId,
        title: dto.title,
        description: dto.description,
        dueDate: new Date(dto.dueDate),
        maxMarks: dto.maxMarks,
        lateDeductionPerDay: dto.lateDeductionPerDay || 0,
      },
      include: {
        subject: { select: { name: true } },
        classSection: { include: { classLevel: true, trade: true } },
      },
    });
  }

  async update(
    id: string,
    dto: UpdateHomeworkDto,
    teacherId: string,
    role?: string,
  ) {
    const homework = await this.prisma.homework.findUnique({ where: { id } });
    if (!homework) throw new NotFoundException('Homework not found');
    if (role !== 'ADMIN' && homework.teacherId !== teacherId)
      throw new ForbiddenException('Not your homework');

    return this.prisma.homework.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.dueDate && { dueDate: new Date(dto.dueDate) }),
        ...(dto.maxMarks !== undefined && { maxMarks: dto.maxMarks }),
        ...(dto.lateDeductionPerDay !== undefined && {
          lateDeductionPerDay: dto.lateDeductionPerDay,
        }),
      },
    });
  }

  async delete(id: string, teacherId: string, role?: string) {
    const homework = await this.prisma.homework.findUnique({ where: { id } });
    if (!homework) throw new NotFoundException('Homework not found');
    if (role !== 'ADMIN' && homework.teacherId !== teacherId)
      throw new ForbiddenException('Not your homework');
    return this.prisma.homework.delete({ where: { id } });
  }

  async findAll(query: QueryHomeworkDto) {
    const where: any = {};
    if (query.classSectionId) where.classSectionId = query.classSectionId;
    if (query.termId) where.termId = query.termId;
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.teacherId) where.teacherId = query.teacherId;
    if (query.kind) where.kind = query.kind;

    const include = {
      subject: { select: { name: true } },
      classSection: { include: { classLevel: true, trade: true } },
      teacher: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
      _count: { select: { submissions: true } },
    };

    // Unpaged when nobody asks for a page, because the teacher and student
    // views read this as a plain list and a whole school runs to hundreds of
    // rows only on the admin screen.
    if (!query.page && !query.limit) {
      return this.prisma.homework.findMany({
        where,
        include,
        orderBy: { dueDate: 'desc' },
      });
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const [total, data] = await Promise.all([
      this.prisma.homework.count({ where }),
      this.prisma.homework.findMany({
        where,
        include,
        orderBy: { dueDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findById(id: string) {
    const homework = await this.prisma.homework.findUnique({
      where: { id },
      include: {
        subject: { select: { name: true } },
        classSection: { include: { classLevel: true, trade: true } },
        teacher: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        submissions: {
          include: {
            student: {
              include: {
                user: { select: { firstName: true, lastName: true } },
              },
            },
            gradedBy: { select: { firstName: true, lastName: true } },
          },
          orderBy: { submittedAt: 'desc' },
        },
      },
    });
    if (!homework) throw new NotFoundException('Homework not found');

    // Count total students in class
    const totalStudents = await this.prisma.student.count({
      where: { classSectionId: homework.classSectionId, status: 'ACTIVE' },
    });

    return { ...homework, totalStudents };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUBMISSIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async submit(dto: SubmitHomeworkDto, studentId: string) {
    const homework = await this.prisma.homework.findUnique({
      where: { id: dto.homeworkId },
    });
    if (!homework) throw new NotFoundException('Homework not found');

    // A student may only submit to homework set for their own class section.
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { classSectionId: true },
    });
    if (!student || student.classSectionId !== homework.classSectionId) {
      throw new ForbiddenException(
        'You can only submit homework assigned to your class',
      );
    }

    const now = new Date();
    const isLate = now > homework.dueDate;

    return this.prisma.homeworkSubmission.upsert({
      where: {
        homeworkId_studentId: {
          homeworkId: dto.homeworkId,
          studentId,
        },
      },
      update: {
        fileUrl: dto.fileUrl,
        submittedAt: now,
        isLate,
      },
      create: {
        homeworkId: dto.homeworkId,
        studentId,
        fileUrl: dto.fileUrl,
        submittedAt: now,
        isLate,
      },
    });
  }

  async grade(
    submissionId: string,
    dto: GradeSubmissionDto,
    gradedByUserId: string,
  ) {
    const submission = await this.prisma.homeworkSubmission.findUnique({
      where: { id: submissionId },
      include: { homework: true },
    });
    if (!submission) throw new NotFoundException('Submission not found');

    // Apply late deduction
    let finalMarks = dto.marks;
    if (submission.isLate && submission.homework.lateDeductionPerDay) {
      const daysLate = Math.ceil(
        (submission.submittedAt.getTime() -
          submission.homework.dueDate.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      finalMarks = Math.max(
        0,
        dto.marks - daysLate * submission.homework.lateDeductionPerDay,
      );
    }

    if (
      submission.homework.maxMarks &&
      finalMarks > submission.homework.maxMarks
    ) {
      throw new BadRequestException(
        `Marks exceed maximum of ${submission.homework.maxMarks}`,
      );
    }

    const updated = await this.prisma.homeworkSubmission.update({
      where: { id: submissionId },
      data: {
        marks: finalMarks,
        gradedAt: new Date(),
        gradedByUserId,
      },
      include: {
        student: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        homework: { select: { title: true } },
      },
    });

    // Send notification to student
    const student = await this.prisma.student.findUnique({
      where: { id: submission.studentId },
      include: { user: { select: { id: true } } },
    });
    if (student) {
      try {
        await this.prisma.notification.create({
          data: {
            userId: student.user.id,
            type: 'PUSH',
            title: 'Homework Graded',
            message: `Your homework "${submission.homework.title}" has been graded: ${finalMarks}${submission.homework.maxMarks ? `/${submission.homework.maxMarks}` : ''}`,
            // What it is about, so the bell can open it. Without this the
            // notice was a dead end: clicking it marked it read and nothing
            // else.
            relatedEntityType: NotificationSubject.HOMEWORK,
            relatedEntityId: submission.homeworkId,
          },
        });
      } catch {
        // Non-critical
      }
    }

    return updated;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STUDENT QUERIES
  // ═══════════════════════════════════════════════════════════════════════════

  async getStudentHomework(studentId: string, classSectionId: string) {
    const homeworks = await this.prisma.homework.findMany({
      where: { classSectionId },
      include: {
        subject: { select: { name: true } },
        teacher: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        submissions: {
          where: { studentId },
        },
      },
      orderBy: { dueDate: 'desc' },
    });

    return homeworks.map((hw) => ({
      ...hw,
      submission: hw.submissions[0] || null,
      submissions: undefined,
    }));
  }
}
