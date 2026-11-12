/*
  Today's lessons, off a weekly timetable.

  A timetable row carries a day of the week (1 is Monday, 7 is Sunday) and
  two "08:30" strings. This turns the week into "what do I have today, and
  where am I in it", which is the first thing a teacher wants from a home
  page and the thing theirs did not say.
*/

export interface TimetableRow {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string | null;
  subject?: { name?: string } | null;
  classSection?: unknown;
}

export type LessonState = "done" | "now" | "next" | "later";

export interface Lesson<T extends TimetableRow = TimetableRow> {
  row: T;
  state: LessonState;
}

/** "08:30" as minutes since midnight. NaN for anything that is not a time. */
export function toMinutes(hhmm: string): number {
  const [h, m] = (hhmm || "").split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
}

/** JS counts Sunday as 0; the timetable counts Monday as 1 and Sunday as 7. */
export function schoolDay(now: Date): number {
  return now.getDay() === 0 ? 7 : now.getDay();
}

/**
 * Today's rows in the order they happen, each marked against the clock.
 *
 * Exactly one row is "next": the first that has not started. A lesson that
 * ends at 09:30 is done at 09:30, not still running, so two lessons back to
 * back never both read "now".
 */
export function todaysLessons<T extends TimetableRow>(
  timetable: T[] | undefined,
  now: Date = new Date(),
): Lesson<T>[] {
  const day = schoolDay(now);
  const minutes = now.getHours() * 60 + now.getMinutes();

  const today = (timetable ?? [])
    .filter((row) => row.dayOfWeek === day)
    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));

  let nextTaken = false;
  return today.map((row) => {
    const start = toMinutes(row.startTime);
    const end = toMinutes(row.endTime);
    let state: LessonState;
    if (end <= minutes) state = "done";
    else if (start <= minutes) state = "now";
    else if (!nextTaken) {
      state = "next";
      nextTaken = true;
    } else state = "later";
    return { row, state };
  });
}
