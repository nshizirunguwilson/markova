import { AbsenceReason, AttendanceStatus } from '@prisma/client';

/*
  How a register is counted.

  A day on the register is one of four things: present, late, absent, or
  excused. Excused is an absence the school has accepted: the child was
  sick, the family asked, or the school gave leave. It is written down, and
  it is counted apart from absences everywhere: it does not lower the
  attendance rate, it is not what "absent too often" watches for, and the
  family is not told their child was missing on a day they asked for.

  Before this there were three statuses and an excused absence was an
  absence that happened to carry a reason, so a week in hospital and a week
  of truancy read the same on the report card.
*/

/** The reasons that excuse a day. UNEXCUSED is the one that does not. */
export const EXCUSING: AbsenceReason[] = [
  AbsenceReason.SICK,
  AbsenceReason.FAMILY,
  AbsenceReason.PERMISSION,
];

export const excuses = (reason: string | null | undefined): boolean =>
  !!reason && (EXCUSING as string[]).includes(reason);

/**
 * What is stored for a mark on the register.
 *
 * The status and the reason have to agree, so they are settled together:
 *  - an absence given a reason that excuses it is an excused day (the mobile
 *    app has always sent "absent, sick", and that is what it meant);
 *  - an excused day with no reason was leave the school gave;
 *  - an excused day cannot be "unexcused";
 *  - present and late carry no reason.
 */
export function settle(
  status: string,
  reason?: string | null,
): { status: AttendanceStatus; reasonCategory: AbsenceReason | null } {
  if (status === AttendanceStatus.ABSENT && excuses(reason)) {
    return {
      status: AttendanceStatus.EXCUSED,
      reasonCategory: reason as AbsenceReason,
    };
  }
  if (status === AttendanceStatus.EXCUSED) {
    return {
      status: AttendanceStatus.EXCUSED,
      reasonCategory: excuses(reason)
        ? (reason as AbsenceReason)
        : AbsenceReason.PERMISSION,
    };
  }
  if (status === AttendanceStatus.ABSENT) {
    return {
      status: AttendanceStatus.ABSENT,
      reasonCategory: AbsenceReason.UNEXCUSED,
    };
  }
  return { status: status as AttendanceStatus, reasonCategory: null };
}

/** Whether the family is told about this mark the same day. */
export const familyIsTold = (status: string): boolean =>
  status === AttendanceStatus.ABSENT || status === AttendanceStatus.LATE;

export interface Tally {
  present: number;
  late: number;
  absent: number;
  excused: number;
  /** Every day on the register. */
  total: number;
  /** The days the rate is worked out over: every day but the excused ones. */
  counted: number;
  /** Present or late, out of the days counted, as a whole percentage. */
  rate: number;
}

/**
 * The attendance rate: present or late, out of the days that count.
 *
 * Excused days are left out of both halves. A child excused on every day
 * there is has missed none of the days that count, which is 100, not 0; a
 * child with no days at all has no rate, and that stays 0 as it always was.
 */
export function attendanceRate(
  present: number,
  late: number,
  counted: number,
  excused = 0,
): number {
  if (counted > 0) return Math.round(((present + late) / counted) * 100);
  return excused > 0 ? 100 : 0;
}

/** Count a list of register marks. */
export function tally(marks: { status: string }[]): Tally {
  let present = 0;
  let late = 0;
  let absent = 0;
  let excused = 0;
  for (const mark of marks) {
    if (mark.status === AttendanceStatus.PRESENT) present++;
    else if (mark.status === AttendanceStatus.LATE) late++;
    else if (mark.status === AttendanceStatus.EXCUSED) excused++;
    else absent++;
  }
  const total = marks.length;
  const counted = total - excused;
  return {
    present,
    late,
    absent,
    excused,
    total,
    counted,
    rate: attendanceRate(present, late, counted, excused),
  };
}
