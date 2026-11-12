import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConsentHow, PhotoAnswer, Role, StudentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnershipService } from '../../common/ownership.service';
import { isAdult } from '../../common/parent-sharing';
import { classDisplayName } from '../../common/class-name';
import { PhotoConsentDto } from './photo-consent.dto';

type Viewer = { id: string; role: string };

/**
 * What a family agreed to for a student's photo (B6 in
 * docs/STUDENT-LIFE-DESIGN.md). The rules for what each answer changes are
 * in common/photo-consent.ts; this keeps the answers.
 *
 * A parent answers for a child under 18; from 18 the student answers for
 * themselves, and their parents no longer can. The office copies in a paper
 * form, naming who signed it. Every answer is kept, never overwritten.
 */
@Injectable()
export class PhotoConsentService {
  constructor(
    private prisma: PrismaService,
    private ownership: OwnershipService,
  ) {}

  async forStudent(studentId: string, viewer: Viewer) {
    if (viewer.role !== Role.ADMIN) {
      await this.ownership.verifyStudentAccess(
        viewer.id,
        viewer.role,
        studentId,
      );
    }
    const student = await this.student(studentId);
    const records = await this.prisma.photoConsentRecord.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        forId: true,
        inApp: true,
        publicity: true,
        how: true,
        answeredBy: true,
        createdAt: true,
      },
    });
    const adult = isAdult(student.dateOfBirth);
    return {
      forId: student.photoForId,
      inApp: student.photoInApp,
      publicity: student.photoPublicity,
      // Who answers now: the family, or the student from 18.
      answeredBy: adult ? 'STUDENT' : 'FAMILY',
      mayAnswer: this.mayAnswer(viewer.role, adult),
      history: records,
    };
  }

  async answer(studentId: string, dto: PhotoConsentDto, viewer: Viewer) {
    const student = await this.student(studentId);
    const adult = isAdult(student.dateOfBirth);
    const name = student.user.firstName;
    let how: ConsentHow = ConsentHow.IN_THE_APP;
    let answeredBy: string;

    if (viewer.role === Role.ADMIN) {
      if (!dto.answeredBy?.trim()) {
        throw new BadRequestException(
          'Say who signed the form, for example "Jean Habimana (father)"',
        );
      }
      how = ConsentHow.PAPER_FORM;
      answeredBy = dto.answeredBy.trim();
    } else {
      await this.ownership.verifyStudentAccess(
        viewer.id,
        viewer.role,
        studentId,
      );
      if (viewer.role === Role.PARENT && adult) {
        throw new ForbiddenException(
          `${name} is 18 or over, so ${name} decides this now.`,
        );
      }
      if (viewer.role === Role.STUDENT && !adult) {
        throw new ForbiddenException(
          'Until you are 18 your parents answer this. From your 18th birthday it is yours.',
        );
      }
      const me = await this.prisma.user.findUnique({
        where: { id: viewer.id },
        select: { firstName: true, lastName: true },
      });
      const myName = [me?.firstName, me?.lastName].filter(Boolean).join(' ');
      const parent = viewer.role === Role.PARENT;
      answeredBy = myName
        ? `${myName} (${parent ? 'parent' : 'the student'})`
        : parent
          ? 'A parent'
          : 'The student';
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.photoConsentRecord.create({
        data: {
          studentId,
          forId: dto.forId,
          inApp: dto.inApp,
          publicity: dto.publicity,
          how,
          answeredBy,
          recordedByUserId: viewer.id,
        },
      });
      await tx.student.update({
        where: { id: studentId },
        data: {
          photoForId: dto.forId,
          photoInApp: dto.inApp,
          photoPublicity: dto.publicity,
        },
      });
    });
    return this.forStudent(studentId, viewer);
  }

  /**
   * Every student on the roll and their answers, for the office: who may
   * appear in the school's photos, who may not, and how many families have
   * not been asked yet.
   */
  async register() {
    const students = await this.prisma.student.findMany({
      where: { status: StudentStatus.ACTIVE },
      select: {
        id: true,
        userId: true,
        studentIdNumber: true,
        photoForId: true,
        photoInApp: true,
        photoPublicity: true,
        user: { select: { firstName: true, lastName: true, photoUrl: true } },
        classSection: {
          include: {
            classLevel: { select: { name: true } },
            trade: { select: { code: true } },
          },
        },
      },
    });
    const rows = students
      .map((s) => ({
        studentId: s.id,
        userId: s.userId,
        name: `${s.user.firstName} ${s.user.lastName}`,
        studentIdNumber: s.studentIdNumber,
        class: classDisplayName(s.classSection),
        hasPhoto: !!s.user.photoUrl,
        forId: s.photoForId,
        inApp: s.photoInApp,
        publicity: s.photoPublicity,
      }))
      .sort(
        (a, b) =>
          a.class.localeCompare(b.class) || a.name.localeCompare(b.name),
      );
    const count = (pick: (r: (typeof rows)[number]) => boolean) =>
      rows.filter(pick).length;
    return {
      counts: {
        students: rows.length,
        notAsked: count((r) =>
          [r.forId, r.inApp, r.publicity].includes(PhotoAnswer.NOT_ASKED),
        ),
        mayPublish: count((r) => r.publicity === PhotoAnswer.YES),
        notInApp: count((r) => r.inApp === PhotoAnswer.NO),
        notOnCard: count((r) => r.forId === PhotoAnswer.NO),
      },
      students: rows,
    };
  }

  private mayAnswer(role: string, adult: boolean) {
    if (role === Role.ADMIN) return true;
    if (role === Role.PARENT) return !adult;
    if (role === Role.STUDENT) return adult;
    return false;
  }

  private async student(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        dateOfBirth: true,
        photoForId: true,
        photoInApp: true,
        photoPublicity: true,
        user: { select: { firstName: true } },
      },
    });
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }
}
