import { Role } from '@prisma/client';

/**
 * A role as a person reads it. The same words the web app uses
 * (`ROLE_LABEL` in web/src/types), for messages the API writes itself.
 */
export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  HEAD_TEACHER: 'Head teacher',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
  PARENT: 'Parent',
  LIBRARIAN: 'Librarian',
  PATRON: 'Patron',
  MATRON: 'Matron',
  NURSE: 'Nurse',
  BURSAR: 'Bursar',
};

export const labelForRole = (role: Role): string => ROLE_LABEL[role] ?? role;
