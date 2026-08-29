import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OwnershipService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verify that the requesting user has access to the given student's data.
   * - ADMIN / HEAD_TEACHER / TEACHER: always allowed
   * - STUDENT: must be their own student record
   * - PARENT: the student must be one of their linked children
   *
   * The head teacher sits with the first group because reading every child's
   * record is the post: they confirm each report card before it is issued,
   * which cannot be done without opening it.
   */
  async verifyStudentAccess(
    userId: string,
    role: string,
    studentId: string,
  ): Promise<void> {
    if (role === 'ADMIN' || role === 'HEAD_TEACHER' || role === 'TEACHER')
      return;

    if (role === 'STUDENT') {
      const student = await this.prisma.student.findFirst({
        where: { userId },
        select: { id: true },
      });
      if (!student || student.id !== studentId) {
        throw new ForbiddenException(
          'Access denied: you can only view your own data',
        );
      }
      return;
    }

    if (role === 'PARENT') {
      const link = await this.prisma.parentStudent.findFirst({
        where: { parentUserId: userId, studentId },
      });
      if (!link) {
        throw new ForbiddenException(
          'Access denied: student is not linked to your account',
        );
      }
      return;
    }

    // Unknown role - deny by default
    throw new ForbiddenException('Access denied');
  }

  /**
   * Verify that the requesting teacher is assigned to the class that the
   * homework belongs to (via TeacherSubjectClass).
   * ADMINs are always allowed.
   */
  async verifyTeacherHomeworkAccess(
    userId: string,
    role: string,
    homeworkId: string,
  ): Promise<void> {
    if (role === 'ADMIN') return;

    if (role !== 'TEACHER') {
      throw new ForbiddenException('Access denied');
    }

    const homework = await this.prisma.homework.findUnique({
      where: { id: homeworkId },
      select: { classSectionId: true, subjectId: true },
    });
    if (!homework) return; // let the service handle not-found

    const teacher = await this.prisma.teacher.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!teacher) {
      throw new ForbiddenException('Access denied: teacher record not found');
    }

    const assignment = await this.prisma.teacherSubjectClass.findFirst({
      where: {
        teacherId: teacher.id,
        classSectionId: homework.classSectionId,
        subjectId: homework.subjectId,
      },
    });
    if (!assignment) {
      throw new ForbiddenException(
        'Access denied: you are not assigned to this class/subject',
      );
    }
  }
}
