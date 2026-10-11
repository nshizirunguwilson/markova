import { SetMetadata } from '@nestjs/common';

export const FORMER_STUDENTS_KEY = 'openToFormerStudents';

/**
 * A route a student who has left the school may still use.
 *
 * A student who was withdrawn, expelled, transferred or graduated keeps a way
 * in to what was theirs: their past report cards, and their own account.
 * Everything else answers that they have left. See FormerStudentInterceptor.
 */
export const OpenToFormerStudents = () =>
  SetMetadata(FORMER_STUDENTS_KEY, true);
