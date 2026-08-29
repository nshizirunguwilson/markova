// Shared types for the web dashboard

/**
 * PATRON and MATRON are the boarding master and mistress; NURSE runs the
 * clinic; BURSAR keeps the fee ledger; HEAD_TEACHER is the Director of
 * Studies, who runs the academic side. Real jobs in a Rwandan boarding
 * school, not administrators with extra duties, so they get their own logins
 * and their own narrow view.
 *
 * HEAD_TEACHER is a post, distinct from the SpecialRole "DOS" below, which
 * marks a teacher who also holds the duty alongside their own classes.
 */
export type Role =
  | "ADMIN"
  | "HEAD_TEACHER"
  | "TEACHER"
  | "STUDENT"
  | "PARENT"
  | "LIBRARIAN"
  | "PATRON"
  | "MATRON"
  | "NURSE"
  | "BURSAR";

/**
 * What each role is called in front of a person.
 *
 * The enum is the API's word; this is the school's. Every other role happened
 * to read acceptably raw, which is why they were printed raw for so long -
 * and then HEAD_TEACHER arrived with an underscore in it and made the habit
 * visible. Naming them all here is what stops the next one being a surprise.
 */
export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  HEAD_TEACHER: "Head teacher",
  TEACHER: "Teacher",
  STUDENT: "Student",
  PARENT: "Parent",
  LIBRARIAN: "Librarian",
  PATRON: "Patron",
  MATRON: "Matron",
  NURSE: "Nurse",
  BURSAR: "Bursar",
};

/** The label for a role, or the role itself if it is one we do not know. */
export const labelForRole = (role: string | null | undefined): string =>
  (role && ROLE_LABEL[role as Role]) || role || "";

export type SpecialRole = "DOS" | "HOD" | "CLASS_TEACHER";

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}
