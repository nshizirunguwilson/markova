import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertOnSide } from './boarding-side';
import { Sharing, assertParentMaySee, parentKept } from './parent-sharing';

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
   *
   * `sharing` says what kind of record this is. A parent is refused a kind
   * their adult child keeps private (see common/parent-sharing.ts); every
   * route a parent can reach names its kind, and parent-routes.spec.ts
   * fails for one that does not.
   */
  async verifyStudentAccess(
    userId: string,
    role: string,
    studentId: string,
    sharing?: Sharing,
  ): Promise<void> {
    if (role === 'ADMIN' || role === 'HEAD_TEACHER') return;

    if (role === 'TEACHER') {
      if (sharing === 'results')
        await this.teacherReadsResults(userId, studentId);
      return;
    }

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
      if (sharing) await assertParentMaySee(this.prisma, studentId, sharing);
      return;
    }

    /* The boarding staff see the children on their own side, for the few
       records they need (conduct standing, pocket money). They were listed
       on those routes and then refused by this check every time. */
    if (role === 'PATRON' || role === 'MATRON') {
      await assertOnSide(this.prisma, role, studentId);
      return;
    }

    // Unknown role - deny by default
    throw new ForbiddenException('Access denied');
  }

  /**
   * A teacher reads a pupil's results only for a class of their own: one they
   * teach a subject to, or lead as class teacher. A Director of Studies or a
   * head of department holds the duty across classes. Every teacher was let
   * through, so any of them could open any pupil's report card, year report
   * and mark-based comments, which s3-2 says they cannot.
   */
  private async teacherReadsResults(userId: string, studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { classSectionId: true },
    });
    if (!student) return; // the route answers not found
    const teacher = await this.prisma.teacher.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (teacher) {
      const [duty, teaches] = await Promise.all([
        this.prisma.teacherRole.findFirst({
          where: {
            teacherId: teacher.id,
            OR: [
              { role: { in: ['DOS', 'HOD'] } },
              { role: 'CLASS_TEACHER', classSectionId: student.classSectionId },
            ],
          },
          select: { id: true },
        }),
        student.classSectionId
          ? this.prisma.teacherSubjectClass.findFirst({
              where: {
                teacherId: teacher.id,
                classSectionId: student.classSectionId,
              },
              select: { id: true },
            })
          : null,
      ]);
      if (duty || teaches) return;
    }
    throw new ForbiddenException(
      'You can read the results only of pupils in a class you teach',
    );
  }

  /** Whether a parent is kept from this kind of record about the student. */
  parentKept(studentId: string, sharing: Sharing): Promise<boolean> {
    return parentKept(this.prisma, studentId, sharing);
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
