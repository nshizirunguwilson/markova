import type { PrismaService } from '../prisma/prisma.service';
import { currentRequest } from '../prisma/request-context';

/**
 * The name of the school the code is running in, for a message to put its
 * name on, or `fallback` outside any school.
 *
 * A parent with children at two schools receives texts and emails from both;
 * one that says "Markova" leaves them guessing which school wrote.
 */
export async function currentSchoolName(
  prisma: Pick<PrismaService, 'school'>,
  fallback = 'Markova',
): Promise<string> {
  const schoolId = currentRequest()?.schoolId;
  if (!schoolId) return fallback;
  const school = await prisma.school
    .findUnique({ where: { id: schoolId }, select: { name: true } })
    .catch(() => null);
  return school?.name ?? fallback;
}
