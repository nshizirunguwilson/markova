import { ForbiddenException } from '@nestjs/common';
import { schoolDay } from './student-standing';

/**
 * What a parent may see of a child who is an adult (A8 in
 * docs/STUDENT-LIFE-DESIGN.md).
 *
 * In Rwanda 18 is adulthood, and an adult's records are theirs. From that
 * birthday the student decides, with three switches, what their parents keep
 * seeing. All three start on, so nothing changes for a family unless the
 * student acts. Fees are not among them: those are between whoever pays and
 * the school, and are always shown.
 *
 * Every page and message a parent receives about a child asks here, through
 * OwnershipService.verifyStudentAccess, ClinicService.assertMaySee and
 * familyMayHear. `parent-routes.spec.ts` fails for a parent route that has
 * not been given its kind.
 */
export type Sharing = 'results' | 'conduct' | 'health';

export const SHARING_LABEL: Record<Sharing, string> = {
  results: 'results (marks and report cards)',
  conduct: 'attendance and discipline',
  health: 'health visits',
};

/** What a student's record holds about their sharing. */
export interface SharingRecord {
  dateOfBirth: Date | null;
  sharesResults: boolean;
  sharesConduct: boolean;
  sharesHealth: boolean;
}

export const SHARING_SELECT = {
  dateOfBirth: true,
  sharesResults: true,
  sharesConduct: true,
  sharesHealth: true,
} as const;

/**
 * Eighteen or over, on the school's day. A student with no date of birth is
 * treated as under 18: nothing is hidden from a family on a guess.
 */
export function isAdult(
  dateOfBirth: Date | null | undefined,
  today: Date = schoolDay(),
): boolean {
  if (!dateOfBirth) return false;
  const eighteenth = new Date(
    Date.UTC(
      dateOfBirth.getUTCFullYear() + 18,
      dateOfBirth.getUTCMonth(),
      dateOfBirth.getUTCDate(),
    ),
  );
  return eighteenth.getTime() <= today.getTime();
}

/** Whether this kind of thing is kept from the student's parents. */
export function keptFromParents(
  student: SharingRecord,
  sharing: Sharing,
  today?: Date,
): boolean {
  if (!isAdult(student.dateOfBirth, today)) return false;
  const shared = {
    results: student.sharesResults,
    conduct: student.sharesConduct,
    health: student.sharesHealth,
  }[sharing];
  return !shared;
}

/**
 * The answer a parent gets for something kept private: a calm sentence, and
 * a reason the app can show as a notice rather than as an error.
 */
export class KeptPrivateException extends ForbiddenException {
  constructor(firstName: string, sharing: Sharing) {
    super({
      statusCode: 403,
      reason: 'KEPT_PRIVATE',
      detail: { sharing },
      message: `${firstName} has chosen to keep their ${SHARING_LABEL[sharing]} private.`,
    });
  }
}

interface SharingReader {
  student: {
    findUnique(args: {
      where: { id: string };
      select: typeof SHARING_SELECT & {
        user: { select: { firstName: true } };
      };
    }): Promise<(SharingRecord & { user: { firstName: string } }) | null>;
  };
}

/** Refuse a parent something their adult child keeps private. */
export async function assertParentMaySee(
  db: SharingReader,
  studentId: string,
  sharing: Sharing,
): Promise<void> {
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { ...SHARING_SELECT, user: { select: { firstName: true } } },
  });
  if (student && keptFromParents(student, sharing)) {
    throw new KeptPrivateException(student.user.firstName, sharing);
  }
}

/** Whether a parent is kept from this kind of thing about this student. */
export async function parentKept(
  db: SharingReader,
  studentId: string,
  sharing: Sharing,
): Promise<boolean> {
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { ...SHARING_SELECT, user: { select: { firstName: true } } },
  });
  return !!student && keptFromParents(student, sharing);
}
