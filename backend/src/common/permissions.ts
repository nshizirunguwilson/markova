import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * The rules that depend on who somebody is, rather than only on their role.
 *
 * A role guard answers "may a TEACHER reach this route". It cannot answer "is
 * this teacher the class teacher of that class", or "is the marks release the
 * thing standing in the way", because those depend on the specific record
 * being asked about.
 *
 * Those questions were answered in each service that needed them, written out
 * again every time. That is how the same rule came to be wrong on two
 * different screens in the same week: the marks page and the report cards page
 * each had their own idea of who was holding a class up, and they disagreed.
 *
 * One place, so there is one answer. Every rule here is phrased as a question
 * with a yes or no, and each carries the reason it exists rather than only
 * what it checks.
 */
@Injectable()
export class Permissions {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Is this teacher the class teacher of this class?
   *
   * The relationship rule the whole report card pipeline turns on. A class
   * teacher writes the comment on their own class's cards and on nobody
   * else's, and the API refuses the write rather than the screen hiding it.
   */
  async isClassTeacherOf(
    teacherId: string | undefined,
    classSectionId: string,
  ): Promise<boolean> {
    if (!teacherId) return false;
    const role = await this.prisma.teacherRole.findFirst({
      where: { role: 'CLASS_TEACHER', teacherId, classSectionId },
      select: { id: true },
    });
    return !!role;
  }

  /** Every class this teacher leads, which is usually one and sometimes none. */
  async classesLedBy(teacherId: string | undefined): Promise<string[]> {
    if (!teacherId) return [];
    const roles = await this.prisma.teacherRole.findMany({
      where: { role: 'CLASS_TEACHER', teacherId },
      select: { classSectionId: true },
    });
    return roles
      .map((r) => r.classSectionId)
      .filter((id): id is string => id !== null);
  }

  /**
   * May this person write the class teacher's comment on this card?
   *
   * Two conditions, and both matter. The role has to be TEACHER, because the
   * head teacher writing in the class teacher's box would be one person
   * signing in another's name. And it has to be *this* class, because a
   * teacher leads one class and teaches several.
   */
  async mayWriteClassTeacherComment(
    actor: { role: string; teacherId?: string },
    classSectionId: string,
  ): Promise<boolean> {
    if (actor.role !== 'TEACHER') return false;
    return this.isClassTeacherOf(actor.teacherId, classSectionId);
  }

  /**
   * May this person write the head teacher's comment?
   *
   * The mirror of the rule above, and deliberately not "is senior enough". A
   * principal is more senior than the DOS and still may not write here: the
   * comment is signed by the Director of Studies, and a signature has one
   * author.
   */
  mayWriteHeadTeacherComment(actor: { role: string }): boolean {
    return actor.role === 'HEAD_TEACHER';
  }

  /**
   * Is this person one of the child's parents?
   *
   * The relationship every family-facing route turns on. Asked here rather
   * than joined into each query so that the answer cannot differ between the
   * marks page and the fees page.
   */
  async isParentOf(userId: string, studentId: string): Promise<boolean> {
    const link = await this.prisma.parentStudent.findFirst({
      where: { parentUserId: userId, studentId },
      select: { id: true },
    });
    return !!link;
  }

  /**
   * Does this teacher also hold the Director of Studies duty?
   *
   * A teacher who is the school's DOS looks after every class's mark book,
   * not only the classes they teach, so the limits below do not apply to them.
   */
  async holdsDosDuty(teacherId: string | undefined): Promise<boolean> {
    if (!teacherId) return false;
    const duty = await this.prisma.teacherRole.findFirst({
      where: { role: 'DOS', teacherId },
      select: { id: true },
    });
    return !!duty;
  }

  /**
   * May this teacher enter marks in this subject for this class?
   *
   * Only for a subject they teach to that class in the year the term belongs
   * to. A mark is credited to the teacher who entered it, so a mark entered
   * for somebody else's class would put one teacher's name on another's work.
   */
  async mayEnterMarks(
    teacherId: string | undefined,
    where: { subjectId: string; classSectionId: string; termId: string },
  ): Promise<boolean> {
    if (!teacherId) return false;
    if (await this.holdsDosDuty(teacherId)) return true;
    const term = await this.prisma.term.findFirst({
      where: { id: where.termId },
      select: { academicYearId: true },
    });
    if (!term) return false;
    const teaches = await this.prisma.teacherSubjectClass.findFirst({
      where: {
        teacherId,
        subjectId: where.subjectId,
        classSectionId: where.classSectionId,
        academicYearId: term.academicYearId,
      },
      select: { id: true },
    });
    return !!teaches;
  }

  /**
   * Which marks may this teacher read?
   *
   * Their own subjects in the classes they teach, and every subject of a
   * class they lead, because the class teacher writes the comment on the
   * whole card. Null means no limit (the DOS duty). An empty list means none.
   */
  async marksReadableBy(
    teacherId: string | undefined,
  ): Promise<null | Array<{ subjectId?: string; classSectionId: string }>> {
    if (!teacherId) return [];
    if (await this.holdsDosDuty(teacherId)) return null;
    const [taught, led] = await Promise.all([
      this.prisma.teacherSubjectClass.findMany({
        where: { teacherId },
        select: { subjectId: true, classSectionId: true },
      }),
      this.classesLedBy(teacherId),
    ]);
    return [
      ...taught.map((t) => ({
        subjectId: t.subjectId,
        classSectionId: t.classSectionId,
      })),
      ...led.map((classSectionId) => ({ classSectionId })),
    ];
  }

  /** Is this the student's own record? */
  async isSelf(userId: string, studentId: string): Promise<boolean> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, userId },
      select: { id: true },
    });
    return !!student;
  }

  /**
   * Whose move is it on this class's report cards?
   *
   * The pipeline runs four gates in order and each refuses until the one
   * before it is met, so the only useful answer is the first unmet one. Both
   * the marks page and the report cards page ask this now; they each had their
   * own version, and the versions disagreed.
   */
  static blockingStep(counts: {
    total: number;
    published: number;
    commented: number;
    confirmed: number;
    issued: number;
  }): 'NO_RESULTS' | 'MARKS' | 'COMMENTS' | 'CHECK' | 'ISSUE' | 'DONE' {
    if (counts.total === 0) return 'NO_RESULTS';
    if (counts.issued === counts.total) return 'DONE';
    if (counts.published < counts.total) return 'MARKS';
    if (counts.commented < counts.total) return 'COMMENTS';
    if (counts.confirmed < counts.total) return 'CHECK';
    return 'ISSUE';
  }

  /**
   * Who has to act, for each step.
   *
   * Named as a person rather than as a state, because "awaiting confirmation"
   * is a status and "the Director of Studies" is somebody who can be asked.
   * The DOS cannot write a class teacher's comment, so a class stuck at
   * COMMENTS is one they have to chase rather than finish.
   */
  static readonly OWNER_OF = {
    NO_RESULTS: 'Nobody yet',
    MARKS: 'Subject teachers',
    COMMENTS: 'The class teacher',
    CHECK: 'The Director of Studies',
    ISSUE: 'The Director of Studies',
    DONE: '',
  } as const;
}
