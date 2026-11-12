import { ForbiddenException } from '@nestjs/common';
import { Gender } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Which children a member of the boarding staff looks after.
 *
 * The patron is the boys' boarding master and the matron the girls' boarding
 * mistress. The sides are kept apart: the patron does not take a girl's money
 * at the counter or read her conduct record, and the matron does not do it
 * for a boy. Every other role is not on a side and gets null.
 */
export function sideOf(role: string): Gender | null {
  if (role === 'PATRON') return Gender.MALE;
  if (role === 'MATRON') return Gender.FEMALE;
  return null;
}

/**
 * Refuse a patron or matron a child from the other side.
 *
 * A child with no gender recorded is not refused: nobody else could serve
 * them at the counter, and the missing answer is the office's to fill in.
 */
export async function assertOnSide(
  prisma: Pick<PrismaService, 'student'>,
  role: string,
  studentId: string,
): Promise<void> {
  const side = sideOf(role);
  if (!side) return;
  const student = await prisma.student.findFirst({
    where: { id: studentId },
    select: { gender: true },
  });
  if (!student) throw new ForbiddenException('Access denied');
  if (student.gender && student.gender !== side) {
    throw new ForbiddenException(
      side === Gender.MALE
        ? 'The patron looks after the boys. The matron looks after this student.'
        : 'The matron looks after the girls. The patron looks after this student.',
    );
  }
}
