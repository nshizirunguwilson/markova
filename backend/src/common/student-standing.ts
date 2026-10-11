import { PauseKind, Prisma, StudentStatus } from '@prisma/client';

/**
 * What a student's standing means, written once.
 *
 * A student is either on the roll (ACTIVE) or has left, and a student on the
 * roll may be paused: suspended, or away for a while. Registers, absence
 * texts, the class chat, sign in and the ID card all ask here, so none of
 * them can come to a different answer. See docs/STUDENT-LIFE-DESIGN.md.
 */

/** The standings a student can leave the roll with, as people say them. */
export const STANDING_LABEL: Record<StudentStatus, string> = {
  ACTIVE: 'On the roll',
  WITHDRAWN: 'Withdrawn',
  GRADUATED: 'Graduated',
  TRANSFERRED: 'Transferred',
  EXPELLED: 'Expelled',
  PASSED_AWAY: 'Passed away',
};

export const PAUSE_LABEL: Record<PauseKind, string> = {
  SUSPENDED: 'Suspended',
  AWAY: 'Away',
};

/** What a message to a family is about, which decides whether it may go. */
export type FamilyNews =
  /** "Your child was absent or late today." */
  | 'absence'
  /** Homework, merits, discipline, announcements: school life. */
  | 'news'
  /** Something still owed: a library book. */
  | 'debt';

export interface WhatStops {
  /** On the class register at all. */
  onRegister: boolean;
  /** Present or absent can be marked. A paused student shows their pause. */
  takesAttendance: boolean;
  /** Whether a message of this kind about the student may reach the family. */
  family: Record<FamilyNews, boolean>;
  /** New fee invoices are raised. */
  newInvoices: boolean;
  classChat: 'member' | 'read-only' | 'removed';
  /** Sign in at all, or only to see their own past report cards. */
  signIn: 'full' | 'records-only' | 'none';
  card: 'valid' | 'suspended' | 'revoked';
}

export function whatStops(
  status: StudentStatus,
  pause: PauseKind | null = null,
): WhatStops {
  const onRoll = status === StudentStatus.ACTIVE;
  const passedAway = status === StudentStatus.PASSED_AWAY;
  return {
    onRegister: onRoll,
    takesAttendance: onRoll && !pause,
    family: {
      absence: onRoll && !pause,
      news: onRoll,
      debt: !passedAway,
    },
    newInvoices: onRoll,
    classChat: !onRoll
      ? 'removed'
      : pause === PauseKind.SUSPENDED
        ? 'read-only'
        : 'member',
    signIn: passedAway ? 'none' : onRoll ? 'full' : 'records-only',
    card: !onRoll
      ? 'revoked'
      : pause === PauseKind.SUSPENDED
        ? 'suspended'
        : 'valid',
  };
}

/**
 * The day it is at the school, the way a date column holds it: midnight UTC
 * of the date in Kigali. A suspension "until the 20th" ends at the end of the
 * 20th in Rwanda, not at 22:00 the day before.
 */
export function schoolDay(at: Date = new Date()): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kigali',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** A "YYYY-MM-DD" (or a full ISO time) as the day a date column holds. */
export function asDay(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

/** The day before, for ending a pause the day somebody comes back. */
export function dayBefore(day: Date): Date {
  return new Date(day.getTime() - 24 * 60 * 60 * 1000);
}

export interface PauseOnDay {
  kind: PauseKind;
  startsOn: Date;
  endsOn: Date | null;
  reason: string;
}

/** Whatever can read pauses: the service's client or a transaction. */
interface PauseReader {
  studentPause: {
    findMany(args: Prisma.StudentPauseFindManyArgs): Promise<
      {
        studentId: string;
        kind: PauseKind;
        startsOn: Date;
        endsOn: Date | null;
        reason: string;
      }[]
    >;
  };
}

/** Where a pause covers a day. */
export const coversDay = (day: Date): Prisma.StudentPauseWhereInput => ({
  startsOn: { lte: day },
  OR: [{ endsOn: null }, { endsOn: { gte: day } }],
});

/**
 * The students among these who are paused on a day, and how.
 *
 * Two pauses should never cover one day (the journey refuses an overlap); if
 * old data has them, a suspension wins, since it stops more.
 */
export async function pausesOn(
  db: PauseReader,
  studentIds: string[],
  day: Date,
): Promise<Map<string, PauseOnDay>> {
  const found = new Map<string, PauseOnDay>();
  if (studentIds.length === 0) return found;
  const rows = await db.studentPause.findMany({
    where: { studentId: { in: studentIds }, ...coversDay(day) },
    select: {
      studentId: true,
      kind: true,
      startsOn: true,
      endsOn: true,
      reason: true,
    },
  });
  for (const row of rows) {
    const held = found.get(row.studentId);
    if (held?.kind === PauseKind.SUSPENDED) continue;
    found.set(row.studentId, {
      kind: row.kind,
      startsOn: row.startsOn,
      endsOn: row.endsOn,
      reason: row.reason,
    });
  }
  return found;
}

/** "until 20 October", or nothing for time away with no end yet. */
export function untilWords(endsOn: Date | null): string {
  if (!endsOn) return '';
  return `until ${endsOn.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })}`;
}

/** Whatever can read a student's standing and pauses. */
interface StandingReader extends PauseReader {
  student: {
    findUnique(args: {
      where: { id: string };
      select: { status: true };
    }): Promise<{ status: StudentStatus } | null>;
  };
}

/**
 * Whether a message of this kind about this student may reach their family.
 *
 * Every place that writes to a family about a student asks this first. A
 * family whose child passed away hears nothing more, ever; a suspended
 * child's family is not told each morning that their child was absent.
 */
export async function familyMayHear(
  db: StandingReader,
  studentId: string,
  kind: FamilyNews,
  day: Date = schoolDay(),
): Promise<boolean> {
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { status: true },
  });
  if (!student) return false;
  const pause = (await pausesOn(db, [studentId], day)).get(studentId);
  return whatStops(student.status, pause?.kind ?? null).family[kind];
}
