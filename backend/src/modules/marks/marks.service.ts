import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { SubjectScope } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TERM_CONDUCT_MARK,
  conductPercentage,
  termConduct,
} from '../../common/conduct';
import { classDisplayName } from '../../common/class-name';
import { PaginatedResponse } from '../../common/dto';
import {
  computeSubjectTotal,
  countsTowardAggregate,
  gradeFor,
  overallGrade,
  MAX_POINTS_PER_SUBJECT,
} from '../../common/grading';
import {
  CreateMarkDto,
  UpdateMarkDto,
  BatchMarkEntryDto,
  CalculateTermResultDto,
  CalculateYearResultDto,
  UpdateTermResultCommentDto,
  PublishTermResultsDto,
  ConfirmReportCardsDto,
  PublishReportCardsDto,
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

    /* The head teacher has no teacher profile of their own, so a mark they
       enter is credited to whoever teaches that subject to that class. */
    let resolvedTeacherId = teacherId;
    if (!resolvedTeacherId && role === 'HEAD_TEACHER') {
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

    // Upsert on the unique (student, subject, term, assessment) key so
    // re-entering a score updates it instead of throwing a duplicate (matches
    // batch entry; a plain create() here 500'd on the unique constraint).
    return this.prisma.mark.upsert({
      where: {
        studentId_subjectId_termId_assessmentTypeId: {
          studentId: dto.studentId,
          subjectId: dto.subjectId,
          termId: dto.termId,
          assessmentTypeId: dto.assessmentTypeId,
        },
      },
      update: { score: dto.score, maxScore, teacherId: resolvedTeacherId },
      create: {
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
    /* A subject teacher edits their own marks; the head teacher edits any,
       because correcting the mark book across the school is the post. */
    if (role !== 'HEAD_TEACHER' && mark.teacherId !== teacherId) {
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

    /* The head teacher has no teacher profile of their own, so a mark they
       enter is credited to whoever teaches that subject to that class. */
    let resolvedTeacherId = teacherId;
    if (!resolvedTeacherId && role === 'HEAD_TEACHER') {
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
        classSection: { include: { classLevel: true, trade: true } },
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

      const results = [];
      for (const student of students) {
        // Get all marks for this student in this term
        const marks = await tx.mark.findMany({
          where: { studentId: student.id, termId },
          include: { subject: true, assessmentType: true },
        });

        if (marks.length === 0) continue;

        // Each subject's term total is the weighted mix of its assessments
        // (CATs + practical + exam, per the subject's scope).
        const bySubject = new Map<
          string,
          {
            scope: SubjectScope;
            assessments: {
              assessmentName: string;
              score: number;
              maxScore: number;
            }[];
          }
        >();
        for (const mark of marks) {
          const entry = bySubject.get(mark.subjectId) || {
            scope: mark.subject.scope,
            assessments: [],
          };
          entry.assessments.push({
            assessmentName: mark.assessmentType.name,
            score: mark.score,
            maxScore: mark.maxScore,
          });
          bySubject.set(mark.subjectId, entry);
        }

        let totalMarks = 0;
        let subjectCount = 0;
        let aggregate = 0;
        let aggregateMax = 0;
        for (const [, { scope, assessments }] of bySubject) {
          const total = computeSubjectTotal(scope, assessments);
          if (total === null) continue;
          totalMarks += total;
          subjectCount++;
          // O-Level: the 9 core papers count (max 54). A-Level: every module.
          if (countsTowardAggregate(scope)) {
            aggregate += gradeFor(scope, total).points;
            aggregateMax += MAX_POINTS_PER_SUBJECT;
          }
        }

        const average = subjectCount > 0 ? totalMarks / subjectCount : 0;
        const letterGrade = overallGrade(average).letter;
        const aggregateData =
          aggregateMax > 0
            ? { aggregate, aggregateMax }
            : { aggregate: null, aggregateMax: null };

        const result = await tx.termResult.upsert({
          where: {
            studentId_classSectionId_termId: {
              studentId: student.id,
              classSectionId,
              termId,
            },
          },
          update: { totalMarks, average, letterGrade, ...aggregateData },
          create: {
            studentId: student.id,
            classSectionId,
            termId,
            totalMarks,
            average,
            letterGrade,
            ...aggregateData,
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

  /**
   * One student's results for a term.
   *
   * `viewerRole` decides whether unpublished figures come back at all. Staff
   * need to read them before releasing - that is the whole point of a draft -
   * but a student or a parent must not, and until this argument existed they
   * did: the route checked that the right family was asking and then handed
   * over marks the school had not published. A term appeared on the student's
   * page the moment a teacher typed it in.
   *
   * Answering "not published yet" rather than throwing keeps this a normal
   * empty state on the page instead of an error the student has to decode.
   */
  async getStudentTermResult(
    studentId: string,
    termId: string,
    viewerRole?: string,
  ) {
    const gated = viewerRole === 'STUDENT' || viewerRole === 'PARENT';

    if (gated) {
      const released = await this.prisma.termResult.findFirst({
        where: { studentId, termId, isPublished: true },
        select: { id: true },
      });
      if (!released) {
        return { result: null, marks: [], published: false };
      }
    }

    const result = await this.prisma.termResult.findFirst({
      where: { studentId, termId },
      include: {
        student: {
          include: {
            user: {
              select: { firstName: true, lastName: true, photoUrl: true },
            },
            classSection: { include: { classLevel: true, trade: true } },
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

    return { result, marks, published: result?.isPublished ?? false };
  }

  /**
   * Writing one of the two comments on a card.
   *
   * Who may write where is the whole point of there being two boxes, so it
   * is settled here rather than left to the screen:
   *
   *   A teacher writes the class teacher's comment, and only on the class
   *   they are the class teacher of. A subject teacher who taught this child
   *   Mathematics is not the person who reports on their term - they saw one
   *   subject of eleven, and the comment is about the whole child.
   *
   *   The head teacher writes their own, on any card. Reading every child's
   *   sheet is the post: they confirm each one before it is issued, and a
   *   comment they could not write on half the school would be a
   *   countersignature they could not give.
   *
   * There is no exception for the principal. Report cards, marks and
   * attendance are the Director of Studies' to run, so a comment is written
   * by one of the two people whose name appears under it and by nobody else.
   */
  async updateTermResultComment(
    id: string,
    dto: UpdateTermResultCommentDto,
    actor?: { role: string; teacherId?: string },
  ) {
    const result = await this.prisma.termResult.findUnique({ where: { id } });
    if (!result) throw new NotFoundException('Term result not found');

    if (actor) {
      if (dto.teacherComment !== undefined && actor.role !== 'TEACHER') {
        throw new ForbiddenException(
          "The class teacher's comment is written by the class teacher.",
        );
      }
      if (
        dto.headmasterComment !== undefined &&
        actor.role !== 'HEAD_TEACHER'
      ) {
        throw new ForbiddenException(
          "The head teacher's comment is written by the head teacher.",
        );
      }
      if (actor.role === 'TEACHER') {
        const isClassTeacher = await this.prisma.teacherRole.findFirst({
          where: {
            role: 'CLASS_TEACHER',
            teacherId: actor.teacherId,
            classSectionId: result.classSectionId,
          },
          select: { id: true },
        });
        if (!isClassTeacher) {
          throw new ForbiddenException(
            'You are not the class teacher of this class.',
          );
        }
      }
    }

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

  /**
   * The classes a person may work on report cards for.
   *
   * A class teacher sees their own class and no other, which is what stops
   * the picker offering twenty-eight classes they cannot act on and then
   * refusing the one they choose. Everybody else who reaches this screen -
   * the head teacher, the admin - sees the school.
   */
  async classesForComments(actor: { role: string; teacherId?: string }) {
    let where = {};

    if (actor.role === 'TEACHER') {
      /* TeacherRole carries the section as a plain id rather than a relation,
         so the classes are gathered first and the sections filtered by them.
         A teacher who is class teacher of nothing gets an empty list, which
         is the honest answer rather than the whole school. */
      const roles = await this.prisma.teacherRole.findMany({
        where: { role: 'CLASS_TEACHER', teacherId: actor.teacherId },
        select: { classSectionId: true },
      });
      const ids = roles
        .map((r) => r.classSectionId)
        .filter((id): id is string => !!id);
      where = { id: { in: ids } };
    }

    return this.prisma.classSection.findMany({
      where,
      include: { classLevel: true, trade: true },
      orderBy: [{ classLevel: { order: 'asc' } }, { name: 'asc' }],
    });
  }

  /**
   * Release the marks - the subject breakdown, average and position - to the
   * students of a class and their parents.
   *
   * This is not the same act as issuing the report card. A school routinely
   * lets marks out as soon as they have been checked and issues the formal
   * document later, once deliberation is done and the comments are written.
   * See `publishReportCards`.
   */
  async publishTermResults(dto: PublishTermResultsDto) {
    const now = new Date();
    return this.prisma.termResult.updateMany({
      where: { classSectionId: dto.classSectionId, termId: dto.termId },
      data: {
        isPublished: dto.isPublished,
        publishedAt: dto.isPublished ? now : null,
        // Withdrawing the marks withdraws the report card with them: the
        // document carries the marks, so leaving it out would publish through
        // the back door exactly what was just taken back.
        ...(dto.isPublished
          ? {}
          : { reportCardPublished: false, reportCardPublishedAt: null }),
      },
    });
  }

  /**
   * The head teacher standing behind a class's report cards, or handing them
   * back to be worked on.
   *
   * This is the step between the comments being written and the principal
   * issuing the cards, and it is the only point at which somebody reads a
   * sheet whole before a family does. A school that issues without it has
   * nobody who checked; `publishReportCards` refuses until it is done.
   *
   * Handing a class back clears the confirmation for every card in it. That
   * is deliberate: the head teacher confirms a class, not a card, because
   * what they are actually certifying is that the set is consistent - the
   * same term, the same marking, the same standard applied to thirty
   * children - and half a confirmed class certifies nothing.
   */
  async confirmReportCards(dto: ConfirmReportCardsDto, userId: string) {
    const where = { classSectionId: dto.classSectionId, termId: dto.termId };

    if (dto.isConfirmed) {
      const unpublished = await this.prisma.termResult.count({
        where: { ...where, isPublished: false },
      });
      if (unpublished > 0) {
        throw new BadRequestException(
          `Publish the marks first: ${unpublished} of this class's results are still unpublished, and there is nothing to confirm until the figures are settled.`,
        );
      }

      /* Nothing to stand behind. A card with no comment on it is a card the
         class teacher has not finished, and confirming it would put the head
         teacher's name to an empty box. */
      const uncommented = await this.prisma.termResult.count({
        where: {
          ...where,
          OR: [{ teacherComment: null }, { teacherComment: '' }],
        },
      });
      if (uncommented > 0) {
        throw new BadRequestException(
          `${uncommented} of these cards have no class teacher's comment yet. A card is not ready to confirm until it has been written on.`,
        );
      }
    }

    const now = new Date();
    const updated = await this.prisma.termResult.updateMany({
      where,
      data: dto.isConfirmed
        ? { dosConfirmed: true, dosConfirmedAt: now, dosConfirmedById: userId }
        : {
            dosConfirmed: false,
            dosConfirmedAt: null,
            dosConfirmedById: null,
            /* Handing a class back withdraws any card already issued from it.
               Leaving one out would mean a family holding a card the head
               teacher has just said is not right. */
            reportCardPublished: false,
            reportCardPublishedAt: null,
          },
    });

    return { ...updated, isConfirmed: dto.isConfirmed };
  }

  /**
   * Issue (or withdraw) the report cards for a class.
   *
   * Refused while the marks are unpublished, because the card carries them -
   * issuing one would put in front of a family precisely the figures the
   * school has not released. Refused again until the head teacher has
   * confirmed the class, because that is the school's own read of the sheet
   * and the principal is signing on the strength of it.
   */
  async publishReportCards(dto: PublishReportCardsDto) {
    const where = { classSectionId: dto.classSectionId, termId: dto.termId };

    if (dto.isPublished) {
      const unpublished = await this.prisma.termResult.count({
        where: { ...where, isPublished: false },
      });
      if (unpublished > 0) {
        throw new BadRequestException(
          `Publish the marks first: ${unpublished} of this class's results are still unpublished, and a report card carries them.`,
        );
      }

      const unconfirmed = await this.prisma.termResult.count({
        where: { ...where, dosConfirmed: false },
      });
      if (unconfirmed > 0) {
        throw new BadRequestException(
          `The head teacher has not confirmed this class yet: ${unconfirmed} of these cards are still waiting. A card is issued on the strength of that check.`,
        );
      }
    }

    const now = new Date();
    return this.prisma.termResult.updateMany({
      where,
      data: {
        reportCardPublished: dto.isPublished,
        reportCardPublishedAt: dto.isPublished ? now : null,
      },
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

        /*
          Conduct across the whole year: each term's mark out of forty, added
          up and read as a percentage of what those terms are worth.

          Read from the incidents and merits of each term rather than from the
          running field on the student, so a year read in Term 1 is a
          percentage of Term 1 and not of a year that has not happened.
        */
        const termConducts = await Promise.all(
          terms.map(async (t) => {
            const [off, back] = await Promise.all([
              tx.disciplineIncident.aggregate({
                where: { studentId: student.id, termId: t.id },
                _sum: { pointsDeducted: true },
              }),
              tx.meritAward.aggregate({
                where: { studentId: student.id, termId: t.id },
                _sum: { points: true },
              }),
            ]);
            return termConduct(
              off._sum.pointsDeducted ?? 0,
              back._sum.points ?? 0,
              startingPoints,
            );
          }),
        );
        const conductTotal = termConducts.reduce((sum, m) => sum + m, 0);
        const conductOutOf = terms.length * startingPoints;
        const disciplineAverage = conductPercentage(conductTotal, conductOutOf);

        const letterGrade =
          yearlyAverage !== null ? overallGrade(yearlyAverage).letter : null;
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
            classSection: { include: { classLevel: true, trade: true } },
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

  /**
   * Has this student's report card been issued for this term?
   *
   * Issuing the card is a separate act from releasing the marks (see
   * `publishReportCards`), so it is asked separately. The controller gates on
   * this before building the card, which keeps authorization where the
   * ownership check already lives and leaves this method returning one shape.
   */
  async isReportCardIssued(studentId: string, termId: string) {
    const issued = await this.prisma.termResult.findFirst({
      where: { studentId, termId, reportCardPublished: true },
      select: { id: true },
    });
    return !!issued;
  }

  async getReportCardData(studentId: string, termId: string) {
    // Student info
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: { select: { firstName: true, lastName: true, photoUrl: true } },
        classSection: { include: { classLevel: true, trade: true } },
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
        motto: configMap['school_motto'] || configMap['motto'] || '',
        logoUrl: configMap['logo_url'] || null,
        stampUrl: configMap['stamp_url'] || null,
        signatureUrl: configMap['signature_url'] || null,
      },
      student: {
        name: `${student.user.firstName} ${student.user.lastName}`,
        studentIdNumber: student.studentIdNumber,
        photoUrl: student.user.photoUrl,
        class: classDisplayName(student.classSection),
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
      throw new ForbiddenException('Cannot modify marks - term is closed');
    }
  }

  private async getPassThreshold(): Promise<number> {
    const config = await this.prisma.schoolConfig.findUnique({
      where: { key: 'pass_threshold' },
    });
    return Number(config?.value || '50');
  }

  /**
   * What a student starts each term on. Forty a term, a hundred and twenty a
   * year - see common/conduct.ts for why it is marked per term at all.
   */
  private async getStartingDisciplinePoints(): Promise<number> {
    const config = await this.prisma.schoolConfig.findUnique({
      where: { key: 'starting_discipline_points' },
    });
    return Number(config?.value || String(TERM_CONDUCT_MARK));
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
