/**
 * The shapes the dashboard reads back from the API.
 *
 * These are read models, not a schema: the server owns the contract and sends
 * more fields than any one screen uses. Everything optional reflects that
 * honestly, so a page has to decide what to show when a field is absent instead
 * of assuming it will always be there. `any` used to make that decision
 * invisible, which is how an unguarded `hw._count.submissions` reached
 * production and could white-screen a page.
 */

export interface Named {
  id: string;
  name?: string;
}

export interface PersonSummary {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  role?: string;
  photoUrl?: string | null;
  isActive?: boolean;
}

export interface AcademicYearSummary extends Named {
  isActive?: boolean;
  startDate?: string;
  endDate?: string;
}

export interface TermSummary extends Named {
  academicYearId?: string;
  isActive?: boolean;
  isClosed?: boolean;
}

export interface ClassLevelSummary extends Named {
  stage?: string;
  order?: number;
}

export interface ClassSectionSummary extends Named {
  capacity?: number;
  classLevelId?: string;
  classLevel?: ClassLevelSummary;
  trade?: Named | null;
  studentCount?: number;
}

export interface SubjectSummary extends Named {
  code?: string;
  credits?: number;
  category?: string;
}

export interface StudentSummary {
  id: string;
  userId?: string;
  studentIdNumber?: string;
  classSectionId?: string;
  classSection?: ClassSectionSummary;
  disciplinePoints?: number;
  user?: PersonSummary;
}

/** The envelope every list endpoint uses. See backend PaginatedResponse. */
export interface Paginated<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}
