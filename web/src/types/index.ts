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
