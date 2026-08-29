import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Every role there is - for routes that are open to anyone signed in.
 *
 * Endpoints that serve a person their own data (their notifications, their
 * threads, their own user record) used to spell out
 * `'ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'LIBRARIAN'`, which was the
 * complete list on the day it was written. When the patron, matron and nurse
 * were added they were left out of every one of those lists, so the three new
 * roles signed in to a notification bell that answered 403 and a Messages
 * link they could not open.
 *
 * Derived from the enum, so the next role to be added is included the day it
 * exists rather than the day somebody notices.
 */
export const ANY_ROLE = Object.values(Role);
