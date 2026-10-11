/**
 * A student's standing and time out of school, in words.
 *
 * The rules themselves live in the API (backend/src/common/student-standing.ts);
 * this only says them. See docs/STUDENT-LIFE-DESIGN.md.
 */

export type StudentStatus =
  | "ACTIVE"
  | "WITHDRAWN"
  | "GRADUATED"
  | "TRANSFERRED"
  | "EXPELLED"
  | "PASSED_AWAY";

export type PauseKind = "SUSPENDED" | "AWAY";

export const STANDING_LABEL: Record<StudentStatus, string> = {
  ACTIVE: "On the roll",
  WITHDRAWN: "Withdrawn",
  GRADUATED: "Graduated",
  TRANSFERRED: "Transferred",
  EXPELLED: "Expelled",
  PASSED_AWAY: "Passed away",
};

/** The ways of leaving that are a decision, offered when a student leaves. */
export const LEAVING: { value: StudentStatus; label: string }[] = [
  { value: "WITHDRAWN", label: "Withdrawn (left: moved away, dropped out)" },
  { value: "TRANSFERRED", label: "Transferred to another school" },
  { value: "GRADUATED", label: "Graduated" },
  { value: "EXPELLED", label: "Expelled" },
];

export const JOURNEY_STEP_LABEL: Record<string, string> = {
  SUSPENDED: "Suspended",
  AWAY: "Away",
  BACK: "Back at school",
  WITHDRAWN: "Withdrawn",
  EXPELLED: "Expelled",
  TRANSFERRED: "Transferred",
  GRADUATED: "Graduated",
  PASSED_AWAY: "Passed away",
  READMITTED: "Readmitted",
};

/** "15 October", read as the day it is stored as, whatever the viewer's zone. */
export function dayWords(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** "Suspended until 15 October", or "Away" when the end is not known. */
export function pauseWords(pause: {
  kind: PauseKind;
  endsOn?: string | null;
}): string {
  const what = pause.kind === "SUSPENDED" ? "Suspended" : "Away";
  return pause.endsOn ? `${what} until ${dayWords(pause.endsOn)}` : what;
}

/** Today in Kigali, as "YYYY-MM-DD", for a date field's default. */
export function schoolToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kigali",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
