import { classDisplayName } from "@/lib/utils";

/**
 * Telling two people with the same name apart.
 *
 * A school of fourteen hundred children has several of every common name —
 * four Alines, three Kezas — and a list of bare names is unusable the moment
 * that happens. The class is what a teacher would ask for, so it is what
 * appears beside the name.
 *
 * Only students carry one. A second Aline who happens to be a teacher is told
 * apart by her role instead, and staff names are few enough to be unambiguous
 * on their own.
 */

export interface Person {
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
  student?: {
    studentIdNumber?: string | null;
    classSection?: {
      name?: string | null;
      classLevel?: { name?: string | null } | null;
      trade?: { code?: string | null } | null;
    } | null;
  } | null;
}

/** Their name, or something honest when the account has lost it. */
export function personName(person: Person | null | undefined): string {
  const name = `${person?.firstName ?? ""} ${person?.lastName ?? ""}`.trim();
  return name || "Someone";
}

/**
 * The line under the name: the class for a student, the role for everybody
 * else. Empty when there is nothing worth saying — a bare "Student" under a
 * student's name is noise.
 */
export function personDetail(person: Person | null | undefined): string {
  if (!person) return "";

  const klass = classDisplayName(person.student?.classSection);
  if (klass) return klass;

  const role = person.role ?? "";
  if (!role || role === "STUDENT") return "";

  // ADMIN → Admin, CLASS_TEACHER → Class teacher.
  return role
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Name and detail as one string, for the places that have a single line to
 * work with — a chip, a search result, a title attribute.
 */
export function personLabel(person: Person | null | undefined): string {
  const detail = personDetail(person);
  return detail ? `${personName(person)} · ${detail}` : personName(person);
}

/**
 * Does this person match what was typed?
 *
 * Matches the name, the class and the student number, because all three are
 * things somebody would reasonably type to find a person: "Aline", "Senior 2"
 * and "STD-2026-011" should each work.
 */
export function personMatches(
  person: Person | null | undefined,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (!person) return false;

  const haystack = [
    personName(person),
    personDetail(person),
    person.student?.studentIdNumber ?? "",
  ]
    .join(" ")
    .toLowerCase();

  // Every word has to match something, so "aline senior" narrows rather than
  // widening the way a plain OR would.
  return q.split(/\s+/).every((word) => haystack.includes(word));
}
