import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SpecialRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Naming a teacher to a duty: class teacher, head of department, or Director
 * of Studies alongside their own lessons.
 *
 * Nothing wrote these but the seed, so a real school could not name its class
 * teachers, and the class teacher's comment on every report card depends on
 * who leads the class (Permissions.isClassTeacherOf).
 *
 * A class has one class teacher and a department one head. Naming somebody
 * else hands the duty over, and the answer says who held it, so the screen
 * can tell the person doing it what changed. A teacher may lead more than
 * one class: a small school does that, and the report card rules allow it.
 */
@Injectable()
export class TeacherDutiesService {
  constructor(private readonly prisma: PrismaService) {}

  async add(
    teacherId: string,
    duty: { role: SpecialRole; classSectionId?: string; department?: string },
  ) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id: teacherId },
      select: { id: true, user: { select: { isActive: true } } },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');
    if (!teacher.user.isActive) {
      throw new BadRequestException(
        'This teacher has left. Name somebody who is still at the school.',
      );
    }

    if (duty.role === SpecialRole.CLASS_TEACHER) {
      if (!duty.classSectionId) {
        throw new BadRequestException('Say which class they will lead');
      }
      const klass = await this.prisma.classSection.findFirst({
        where: { id: duty.classSectionId },
        select: { id: true },
      });
      if (!klass) throw new NotFoundException('Class not found');
      return this.handOver(
        teacherId,
        { role: duty.role, classSectionId: duty.classSectionId },
        { role: duty.role, classSectionId: duty.classSectionId },
        'already leads this class',
      );
    }

    if (duty.role === SpecialRole.HOD) {
      const department = duty.department?.trim();
      if (!department) {
        throw new BadRequestException('Say which department they will head');
      }
      return this.handOver(
        teacherId,
        { role: duty.role, department },
        {
          role: duty.role,
          department: { equals: department, mode: 'insensitive' },
        },
        'already heads this department',
      );
    }

    // The Director of Studies duty belongs to the teacher, not to a class.
    const held = await this.prisma.teacherRole.findFirst({
      where: { teacherId, role: SpecialRole.DOS },
      select: { id: true },
    });
    if (held) {
      throw new ConflictException(
        'This teacher is already Director of Studies',
      );
    }
    return {
      duty: await this.prisma.teacherRole.create({
        data: { teacherId, role: SpecialRole.DOS },
        include: DUTY_INCLUDE,
      }),
      replaced: null,
    };
  }

  async remove(teacherId: string, dutyId: string) {
    const duty = await this.prisma.teacherRole.findFirst({
      where: { id: dutyId, teacherId },
      select: { id: true },
    });
    if (!duty) throw new NotFoundException('Duty not found');
    await this.prisma.teacherRole.delete({ where: { id: dutyId } });
    return { message: 'Duty ended' };
  }

  /**
   * Give the duty to this teacher, taking it from whoever held it.
   *
   * In one transaction, so the class is never left with two class teachers or
   * with none halfway through.
   */
  private async handOver(
    teacherId: string,
    data: { role: SpecialRole; classSectionId?: string; department?: string },
    sameDuty: Record<string, unknown>,
    alreadyMessage: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const holders = await tx.teacherRole.findMany({
        where: sameDuty,
        select: {
          id: true,
          teacherId: true,
          teacher: {
            select: { user: { select: { firstName: true, lastName: true } } },
          },
        },
      });
      if (holders.some((h) => h.teacherId === teacherId)) {
        throw new ConflictException(`This teacher ${alreadyMessage}`);
      }
      if (holders.length) {
        await tx.teacherRole.deleteMany({
          where: { id: { in: holders.map((h) => h.id) } },
        });
      }
      const duty = await tx.teacherRole.create({
        data: { teacherId, ...data },
        include: DUTY_INCLUDE,
      });
      const previous = holders[0]?.teacher.user;
      return {
        duty,
        replaced: previous
          ? `${previous.firstName} ${previous.lastName}`
          : null,
      };
    });
  }
}

const DUTY_INCLUDE = {
  classSection: {
    select: {
      id: true,
      name: true,
      classLevel: { select: { name: true } },
      trade: { select: { code: true } },
    },
  },
} as const;
