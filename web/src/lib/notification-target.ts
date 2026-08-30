/**
 * Where a notification should take the reader.
 *
 * The bell used to decide by looking at `Notification.type`, which is the
 * channel the notice went out on - SMS, EMAIL or PUSH. No channel name has
 * ever contained the word "attendance", so every branch was dead and clicking
 * a notification only ever marked it read. What a notice is ABOUT lives on
 * `relatedEntityType` (see backend/src/common/notification-target.ts).
 *
 * The destination also depends on who is reading: a discipline notice sends an
 * admin to the school's discipline register and a parent to their own child's
 * record. Every href here is a real route in `navigation.ts`; a subject with
 * no page for that role returns null and the notice stays a plain notice
 * rather than dropping the reader on a 404.
 */

import type { Role } from "@/types";

export type NotificationSubject =
  | "ATTENDANCE"
  | "MARKS"
  | "TERM_RESULT"
  | "REPORT_CARD"
  | "HOMEWORK"
  | "DISCIPLINE"
  | "MERIT"
  | "BOOK_LOAN"
  | "MESSAGE"
  | "MENTION"
  | "ANNOUNCEMENT"
  | "ACTIVITY"
  | "CLINIC"
  | "POCKET_MONEY"
  | "SYSTEM";

export interface NotificationLike {
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  title?: string | null;
}

/**
 * Best guess at what an older notification is about.
 *
 * Mirrors the server's own fallback: every row written before the subject
 * column was filled in, and the whole demo seed, has nothing to route on.
 * Ordered most specific first - "report card published" is a report card, not
 * marks, and both words appear in it.
 */
const TITLE_HINTS: [RegExp, NotificationSubject][] = [
  [/report card/i, "REPORT_CARD"],
  [/transcript/i, "REPORT_CARD"],
  [/attendance|absent|absence|late arrival/i, "ATTENDANCE"],
  [/homework|assignment|graded/i, "HOMEWORK"],
  [/discipline|incident|appeal|suspension/i, "DISCIPLINE"],
  [/merit|good news|recognised/i, "MERIT"],
  [/librar|book|overdue|borrow/i, "BOOK_LOAN"],
  [/mentioned you/i, "MENTION"],
  [/message/i, "MESSAGE"],
  [/announcement/i, "ANNOUNCEMENT"],
  [/activity|club|trip/i, "ACTIVITY"],
  [/clinic|health|sick bay/i, "CLINIC"],
  [/pocket money|allowance/i, "POCKET_MONEY"],
  [/marks|results|grade/i, "MARKS"],
];

/** The page each subject opens, per role. A missing entry means no page. */
const ROUTES: Record<NotificationSubject, Partial<Record<Role, string>>> = {
  ATTENDANCE: {
    ADMIN: "/admin/attendance",
    TEACHER: "/teacher/attendance",
    STUDENT: "/student/attendance",
    PARENT: "/parent/attendance",
  },
  MARKS: {
    ADMIN: "/admin/marks",
    TEACHER: "/teacher/marks",
    STUDENT: "/student/marks",
    PARENT: "/parent/marks",
  },
  // A term result is a mark to whoever enters it and a report card to whoever
  // receives it, so it lands where that role would look for it.
  TERM_RESULT: {
    ADMIN: "/admin/marks",
    TEACHER: "/teacher/marks",
    STUDENT: "/student/reports",
    PARENT: "/parent/reports",
  },
  REPORT_CARD: {
    ADMIN: "/admin/reports",
    STUDENT: "/student/reports",
    PARENT: "/parent/reports",
  },
  HOMEWORK: {
    ADMIN: "/admin/homework",
    TEACHER: "/teacher/homework",
    STUDENT: "/student/homework",
  },
  DISCIPLINE: {
    ADMIN: "/admin/discipline",
    TEACHER: "/teacher/discipline",
    STUDENT: "/student/discipline",
    PARENT: "/parent/discipline",
  },
  // A merit is recorded in the same register as an incident.
  MERIT: {
    ADMIN: "/admin/discipline",
    TEACHER: "/teacher/discipline",
    STUDENT: "/student/discipline",
    PARENT: "/parent/discipline",
  },
  BOOK_LOAN: {
    ADMIN: "/admin/library",
    LIBRARIAN: "/librarian/loans",
    STUDENT: "/student/library",
  },
  MESSAGE: {
    ADMIN: "/admin/messages",
    TEACHER: "/teacher/messages",
    STUDENT: "/student/messages",
    PARENT: "/parent/messages",
    LIBRARIAN: "/librarian/messages",
    HEAD_TEACHER: "/messages",
    BURSAR: "/messages",
    PATRON: "/messages",
    MATRON: "/messages",
    NURSE: "/messages",
  },
  /* Somebody was named. It opens the same place a message does - the point
     of a mention is to get the reader to the conversation. */
  MENTION: {
    ADMIN: "/admin/messages",
    TEACHER: "/teacher/messages",
    STUDENT: "/student/messages",
    PARENT: "/parent/messages",
    LIBRARIAN: "/librarian/messages",
    HEAD_TEACHER: "/messages",
    BURSAR: "/messages",
    PATRON: "/messages",
    MATRON: "/messages",
    NURSE: "/messages",
  },
  ANNOUNCEMENT: {
    ADMIN: "/admin/announcements",
    TEACHER: "/teacher/announcements",
    // Everyone else reads announcements as a conversation.
    STUDENT: "/student/messages",
    PARENT: "/parent/messages",
    LIBRARIAN: "/librarian/messages",
  },
  ACTIVITY: {
    ADMIN: "/admin/activities",
    TEACHER: "/teacher/activities",
    STUDENT: "/student/activities",
    PARENT: "/parent/activities",
  },
  CLINIC: {
    ADMIN: "/admin/health",
    PARENT: "/parent/health",
  },
  POCKET_MONEY: {
    ADMIN: "/admin/pocket-money",
    PARENT: "/parent/pocket-money",
  },
  // Nothing to open: a "System Ready" notice is not about a place.
  SYSTEM: {},
};

/** What a notification is about, declared or inferred from its title. */
export function notificationSubject(
  notification: NotificationLike | null | undefined,
): NotificationSubject | null {
  if (!notification) return null;

  const declared = notification.relatedEntityType?.trim().toUpperCase();
  if (declared && declared in ROUTES) {
    return declared as NotificationSubject;
  }

  const title = notification.title ?? "";
  for (const [pattern, subject] of TITLE_HINTS) {
    if (pattern.test(title)) return subject;
  }
  return null;
}

/**
 * The page this notification opens for this reader, or null when there is
 * none. A subject that names a particular record passes its id along as
 * `?highlight=`, so the page can scroll to and mark the row the notice is
 * actually about rather than dropping the reader at the top of a list.
 */
export function notificationHref(
  notification: NotificationLike | null | undefined,
  role: Role | string | null | undefined,
): string | null {
  const subject = notificationSubject(notification);
  if (!subject || !role) return null;

  const href = ROUTES[subject][role as Role];
  if (!href) return null;

  const id = notification?.relatedEntityId?.trim();
  if (!id) return href;

  /*
    A conversation has an address of its own - `/messages/<id>` - so a
    notification about one opens the thread rather than the inbox with the
    thread highlighted somewhere in it. That is the whole point of keeping
    the notification: somebody who missed the toast clicks this an hour later
    and lands on the message, not on a list to search through.
  */
  if (subject === "MESSAGE" || subject === "MENTION") {
    return `${href}/${encodeURIComponent(id)}`;
  }
  return `${href}?highlight=${encodeURIComponent(id)}`;
}
