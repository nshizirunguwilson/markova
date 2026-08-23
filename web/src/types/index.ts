// Shared types for the web dashboard

/**
 * PATRON and MATRON are the boarding master and mistress; NURSE runs the
 * clinic. Real jobs in a Rwandan boarding school, not administrators with
 * extra duties, so they get their own logins and their own narrow view.
 */
export type Role =
  | "ADMIN"
  | "TEACHER"
  | "STUDENT"
  | "PARENT"
  | "LIBRARIAN"
  | "PATRON"
  | "MATRON"
  | "NURSE";

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
