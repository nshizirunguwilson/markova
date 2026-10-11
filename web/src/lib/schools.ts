import api from "@/lib/api";
import type { Role } from "@/types";
import { beginSession, refreshToken } from "@/lib/session";

/**
 * A person's schools, and moving between them.
 *
 * One login opens every school a person belongs to, one at a time (see
 * docs/MULTI-SCHOOL-DESIGN.md). Each entry is one school record: a teacher
 * who is also a parent at the same school has that school twice, once for
 * each role.
 */
export interface SchoolRef {
  id: string;
  name: string;
  slug: string;
}

export interface Membership {
  /** The school record to open. */
  userId: string;
  role: Role;
  school: SchoolRef;
  /** Whether this is the one open now. Only on the list from /auth/schools. */
  current?: boolean;
  unreadMessages?: number;
}

/**
 * Open another of the person's schools.
 *
 * No password: the session in hand proves who they are. It moves with them,
 * so the refresh token stops working and a new pair takes its place.
 * Returns the school record now open.
 */
export async function switchSchool(userId: string) {
  const { data } = await api.post("/auth/switch", {
    userId,
    refreshToken: refreshToken(),
  });
  // A student's record always opens as on a shared computer.
  beginSession(data);
  return data.user as { id: string; role: Role; forcePasswordChange: boolean };
}
