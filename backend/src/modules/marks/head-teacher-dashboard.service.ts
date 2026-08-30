import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { classDisplayName } from '../../common/class-name';

/**
 * What the Director of Studies opens in the morning.
 *
 * A dashboard is worth building only where the post has a question it asks
 * every day and cannot answer at a glance anywhere else. The bursar has no
 * dashboard for exactly that reason: their question is "who has not paid",
 * and the register answers it, so a page of counts in front of it would be a
 * click to nowhere.
 *
 * The DOS is different. Their day is spent unblocking a pipeline they do not
 * run themselves - subject teachers enter marks, class teachers write
 * comments, the principal issues - and the question that starts it is "what
 * is stuck, and on whom". That question is genuinely spread across four
 * screens today, which is what makes it worth answering in one.
 *
 * So every number here is something they can act on this morning, and each
 * one names who the action falls to:
 *
 *   Marks not entered - the subject teacher's, and it blocks everything.
 *   Comments not written - the class teacher's, and it blocks confirmation.
 *   Classes waiting on confirmation - their own, and it blocks issuing.
 *   Teachers absent today - their own, and it needs cover before break.
 *
 * There is deliberately no chart of pass rates over five years. That is a
 * thing to review once a term with the principal, not a thing to do at
 * eight in the morning, and putting it here would bury the four rows above.
 */

/** One class, and where its report cards have got to. */
export interface ClassProgress {
  classSectionId: string;
  name: string;
  students: number;
  marksReleased: number;
  commentsWritten: number;
  confirmed: number;
  issued: number;
  /** Subjects with at least one mark, over subjects taught to this class. */
  subjectsMarked: number;
  subjectsTaught: number;
  /** The class average this term, where the results have been worked out. */
  average: number | null;
}

/** What is holding a class up, in the order it has to be unblocked. */
export type Blocker =
  | 'MARKS_NOT_ENTERED'
  | 'MARKS_NOT_RELEASED'
  | 'COMMENTS_NOT_WRITTEN'
  | 'AWAITING_CONFIRMATION'
  | 'AWAITING_ISSUE'
  | 'DONE';

/**
 * The first thing standing in a class's way.
 *
 * One blocker rather than a list, because a class teacher cannot write a
 * comment on marks nobody entered and the head teacher cannot confirm a card
 * nobody wrote on. Showing all three at once would be showing two things
 * that are not yet anybody's to do.
 */
export function blockerFor(c: ClassProgress): Blocker {
  if (c.students === 0) return 'DONE';
  if (c.subjectsTaught > 0 && c.subjectsMarked < c.subjectsTaught)
    return 'MARKS_NOT_ENTERED';
  if (c.marksReleased < c.students) return 'MARKS_NOT_RELEASED';
  if (c.commentsWritten < c.students) return 'COMMENTS_NOT_WRITTEN';
  if (c.confirmed < c.students) return 'AWAITING_CONFIRMATION';
  if (c.issued < c.students) return 'AWAITING_ISSUE';
  return 'DONE';
}

/** Whose move it is. Named as a person, because somebody has to be asked. */
export const OWNER_OF: Record<Blocker, string> = {
  MARKS_NOT_ENTERED: 'Subject teachers',
  MARKS_NOT_RELEASED: 'The office',
  COMMENTS_NOT_WRITTEN: 'Class teacher',
  AWAITING_CONFIRMATION: 'You',
  AWAITING_ISSUE: 'The principal',
  DONE: '',
};

@Injectable()
export class HeadTeacherDashboardService {
  constructor(private prisma: PrismaService) {}

  async overview(termId?: string) {
    const term = termId
      ? await this.prisma.term.findUnique({
          where: { id: termId },
          include: { academicYear: true },
        })
      : await this.prisma.term.findFirst({
          where: { isCurrent: true },
          include: { academicYear: true },
        });

    if (!term) {
      return {
        term: null,
        classes: [] as ClassProgress[],
        staff: { total: 0, present: 0, absent: 0, absentToday: [] },
      };
    }

    const [sections, results, marks, taught, students] = await Promise.all([
      this.prisma.classSection.findMany({
        include: { classLevel: true, trade: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.termResult.findMany({
        where: { termId: term.id },
        select: {
          classSectionId: true,
          isPublished: true,
          dosConfirmed: true,
          reportCardPublished: true,
          teacherComment: true,
          average: true,
        },
      }),
      /* Which subjects have been marked at all, per class. `distinct` rather
         than every mark: a class of thirty times eleven subjects times four
         assessments is thirteen hundred rows nobody needs counted. */
      this.prisma.mark.findMany({
        where: { termId: term.id },
        select: { classSectionId: true, subjectId: true },
        distinct: ['classSectionId', 'subjectId'],
      }),
      this.prisma.teacherSubjectClass.findMany({
        where: { academicYearId: term.academicYearId },
        select: { classSectionId: true, subjectId: true },
        distinct: ['classSectionId', 'subjectId'],
      }),
      this.prisma.student.groupBy({
        by: ['classSectionId'],
        where: { status: 'ACTIVE' },
        _count: { _all: true },
      }),
    ]);

    const count = <T>(rows: T[], of: (r: T) => boolean) =>
      rows.filter(of).length;
    const tally = (rows: { classSectionId: string }[]) => {
      const m = new Map<string, number>();
      for (const r of rows)
        m.set(r.classSectionId, (m.get(r.classSectionId) ?? 0) + 1);
      return m;
    };

    const marked = tally(marks);
    const assigned = tally(taught);
    const enrolled = new Map(
      students.map((s) => [s.classSectionId, s._count._all]),
    );

    const classes: ClassProgress[] = sections.map((section) => {
      const rows = results.filter((r) => r.classSectionId === section.id);
      const averages = rows
        .map((r) => r.average)
        .filter((a): a is number => a !== null);

      return {
        classSectionId: section.id,
        name: classDisplayName(section),
        students: enrolled.get(section.id) ?? 0,
        marksReleased: count(rows, (r) => r.isPublished),
        commentsWritten: count(rows, (r) => !!r.teacherComment?.trim()),
        confirmed: count(rows, (r) => r.dosConfirmed),
        issued: count(rows, (r) => r.reportCardPublished),
        subjectsMarked: marked.get(section.id) ?? 0,
        subjectsTaught: assigned.get(section.id) ?? 0,
        average: averages.length
          ? Math.round(
              (averages.reduce((s, a) => s + a, 0) / averages.length) * 10,
            ) / 10
          : null,
      };
    });

    return {
      term: {
        id: term.id,
        name: term.name,
        academicYear: term.academicYear.name,
      },
      classes: classes.map((c) => ({
        ...c,
        blocker: blockerFor(c),
        owner: OWNER_OF[blockerFor(c)],
      })),
      staff: await this.staffToday(),
    };
  }

  /**
   * Who is not in today.
   *
   * The one number on this page with a deadline attached: a class whose
   * teacher is absent needs cover before the first lesson, not by lunchtime.
   */
  private async staffToday() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const [total, marked] = await Promise.all([
      this.prisma.teacher.count(),
      this.prisma.teacherAttendance.findMany({
        where: { date: start },
        include: {
          teacher: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
    ]);

    const away = marked.filter((a) => a.status !== 'PRESENT');
    return {
      total,
      present: marked.filter((a) => a.status === 'PRESENT').length,
      absent: away.length,
      /* Named, not counted. "3 absent" is a number; "Aline, Jean and Rose are
         absent" is something a head teacher can act on without opening
         another page. */
      absentToday: away.map((a) => ({
        id: a.teacherId,
        name: `${a.teacher.user.firstName} ${a.teacher.user.lastName}`,
        status: a.status,
      })),
      /* A register nobody has taken is not a school with nobody absent, and
         the difference matters at half past eight. */
      taken: marked.length > 0,
    };
  }
}
