// Shared types for the web dashboard

export type Role = "ADMIN" | "TEACHER" | "STUDENT" | "PARENT" | "LIBRARIAN";

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
