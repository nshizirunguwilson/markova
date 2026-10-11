import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SHARING_SELECT, isAdult } from '../../common/parent-sharing';
import { schoolDay } from '../../common/student-standing';
import { NotificationSubject } from '../../common/notification-target';
import { SharingDto } from './sharing.dto';

/**
 * A student of 18 or over deciding what their parents see (A8 in
 * docs/STUDENT-LIFE-DESIGN.md). The rule itself is in
 * common/parent-sharing.ts.
 */
@Injectable()
export class SharingService {
  constructor(private prisma: PrismaService) {}

  /** The student's own switches, and whether they are theirs to change yet. */
  async mine(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
      select: { ...SHARING_SELECT, sharingChangedAt: true },
    });
    if (!student) throw new NotFoundException('No student record');
    return {
      adult: isAdult(student.dateOfBirth),
      knowsBirthday: !!student.dateOfBirth,
      results: student.sharesResults,
      conduct: student.sharesConduct,
      health: student.sharesHealth,
      changedAt: student.sharingChangedAt,
    };
  }

  /**
   * On their 18th birthday, each student on the roll is told that what their
   * parents see is now theirs to decide. Nothing changes for the family
   * unless the student acts.
   */
  async greetNewAdults(today: Date = schoolDay()) {
    const students = await this.prisma.student.findMany({
      where: { status: 'ACTIVE', dateOfBirth: { not: null } },
      select: { dateOfBirth: true, userId: true },
    });
    const born18YearsAgo = (dob: Date) =>
      dob.getUTCFullYear() + 18 === today.getUTCFullYear() &&
      dob.getUTCMonth() === today.getUTCMonth() &&
      dob.getUTCDate() === today.getUTCDate();
    const turning = students.filter((s) => born18YearsAgo(s.dateOfBirth!));
    for (const s of turning) {
      await this.prisma.notification.create({
        data: {
          userId: s.userId,
          type: 'IN_APP',
          title: 'Happy 18th birthday',
          message:
            'From today you decide what your parents can see of your results, attendance and health visits. Nothing has changed yet: open your profile to choose.',
          relatedEntityType: NotificationSubject.SHARING,
        },
      });
    }
    return { greeted: turning.length };
  }

  async change(userId: string, dto: SharingDto) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
      select: { id: true, dateOfBirth: true },
    });
    if (!student) throw new NotFoundException('No student record');
    if (!student.dateOfBirth) {
      throw new BadRequestException(
        'The school has no date of birth for you yet. Ask the office to add it; from your 18th birthday you decide this.',
      );
    }
    if (!isAdult(student.dateOfBirth)) {
      throw new BadRequestException(
        'From your 18th birthday you decide what your parents see. Until then they see your records.',
      );
    }
    await this.prisma.student.update({
      where: { id: student.id },
      data: {
        ...(dto.results !== undefined && { sharesResults: dto.results }),
        ...(dto.conduct !== undefined && { sharesConduct: dto.conduct }),
        ...(dto.health !== undefined && { sharesHealth: dto.health }),
        sharingChangedAt: new Date(),
      },
    });
    return this.mine(userId);
  }
}
