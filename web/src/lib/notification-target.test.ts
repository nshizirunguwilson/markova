import { describe, expect, it } from "vitest";

import { notificationHref, notificationSubject } from "./notification-target";

/**
 * Where the bell sends you.
 *
 * It used to decide by reading `Notification.type`, which is the channel the
 * notice went out on: SMS, EMAIL or PUSH. Every branch tested that string for
 * words like "ATTENDANCE", so none of them could ever match and clicking a
 * notification did nothing but mark it read.
 */
describe("what a notification is about", () => {
  it("takes the subject the server declared", () => {
    expect(notificationSubject({ relatedEntityType: "ATTENDANCE" })).toBe(
      "ATTENDANCE",
    );
  });

  // Services wrote 'attendance' and 'BOOK_LOAN' in different casings before
  // the vocabulary was written down in one place.
  it("reads a subject in any casing", () => {
    expect(notificationSubject({ relatedEntityType: " book_loan " })).toBe(
      "BOOK_LOAN",
    );
  });

  /**
   * Everything raised before the subject column was filled in, and the whole
   * demo seed, carries nothing to route on. Leaving those inert would mean
   * the bell only worked for notices raised after the fix.
   */
  it("falls back to what the title says", () => {
    expect(notificationSubject({ title: "Six books are overdue" })).toBe(
      "BOOK_LOAN",
    );
    expect(notificationSubject({ title: "Attendance below 90%" })).toBe(
      "ATTENDANCE",
    );
  });

  it("prefers the more specific reading of an ambiguous title", () => {
    expect(notificationSubject({ title: "Report card published" })).toBe(
      "REPORT_CARD",
    );
  });

  it("ignores a subject it has no page for", () => {
    expect(
      notificationSubject({ relatedEntityType: "SOMETHING_NEW", title: "x" }),
    ).toBeNull();
  });

  it("answers nothing for a notice that gives no clue", () => {
    expect(notificationSubject({ title: "System Ready" })).toBeNull();
    expect(notificationSubject(null)).toBeNull();
    expect(notificationSubject(undefined)).toBeNull();
  });
});

describe("the page a notification opens", () => {
  it("sends each role to their own version of the page", () => {
    const notif = { relatedEntityType: "ATTENDANCE" };
    expect(notificationHref(notif, "ADMIN")).toBe("/admin/attendance");
    expect(notificationHref(notif, "TEACHER")).toBe("/teacher/attendance");
    expect(notificationHref(notif, "PARENT")).toBe("/parent/attendance");
    expect(notificationHref(notif, "STUDENT")).toBe("/student/attendance");
  });

  /**
   * A term result is a mark to whoever enters it and a report card to whoever
   * receives it, so the same notice lands in different places.
   */
  it("sends a result where that role would look for it", () => {
    const notif = { relatedEntityType: "TERM_RESULT" };
    expect(notificationHref(notif, "TEACHER")).toBe("/teacher/marks");
    expect(notificationHref(notif, "PARENT")).toBe("/parent/reports");
  });

  // The record the notice is about, not just the list it lives in.
  it("carries the record's id through to the page", () => {
    expect(
      notificationHref(
        { relatedEntityType: "DISCIPLINE", relatedEntityId: "incident-1" },
        "ADMIN",
      ),
    ).toBe("/admin/discipline?highlight=incident-1");
  });

  it("escapes an id that would otherwise break the query string", () => {
    expect(
      notificationHref(
        { relatedEntityType: "MARKS", relatedEntityId: "a b&c" },
        "ADMIN",
      ),
    ).toBe("/admin/marks?highlight=a%20b%26c");
  });

  /**
   * A librarian has no attendance page and a student has no clinic page.
   * Sending them anyway would drop them on a route guard.
   */
  it("opens nothing for a role with no page for that subject", () => {
    expect(
      notificationHref({ relatedEntityType: "ATTENDANCE" }, "LIBRARIAN"),
    ).toBeNull();
    expect(notificationHref({ relatedEntityType: "CLINIC" }, "STUDENT")).toBeNull();
  });

  it("opens nothing for a notice about nothing in particular", () => {
    expect(notificationHref({ title: "System Ready" }, "ADMIN")).toBeNull();
    expect(
      notificationHref({ relatedEntityType: "SYSTEM" }, "ADMIN"),
    ).toBeNull();
  });

  it("opens nothing when we do not know who is reading", () => {
    expect(
      notificationHref({ relatedEntityType: "MARKS" }, null),
    ).toBeNull();
  });

  // The bell renders for every role, so every route it can produce has to be
  // one the app actually serves.
  it("only ever produces a path under a role's own subtree", () => {
    const roles = ["ADMIN", "TEACHER", "STUDENT", "PARENT", "LIBRARIAN"] as const;
    const subjects = [
      "ATTENDANCE", "MARKS", "TERM_RESULT", "REPORT_CARD", "HOMEWORK",
      "DISCIPLINE", "MERIT", "BOOK_LOAN", "MESSAGE", "ANNOUNCEMENT",
      "ACTIVITY", "CLINIC", "POCKET_MONEY", "SYSTEM",
    ];
    for (const role of roles) {
      for (const relatedEntityType of subjects) {
        const href = notificationHref({ relatedEntityType }, role);
        if (href) expect(href.startsWith(`/${role.toLowerCase()}/`)).toBe(true);
      }
    }
  });
});

/**
 * A message somebody missed.
 *
 * The whole reason a notification is kept rather than shown once and lost: a
 * person who was not looking clicks this an hour later, and it has to land
 * them on the message rather than on an inbox to search through.
 */
describe("a notification about a conversation", () => {
  const conv = "conv-1";

  it("opens the thread itself, not the inbox", () => {
    expect(
      notificationHref(
        { relatedEntityType: "MESSAGE", relatedEntityId: conv },
        "TEACHER",
      ),
    ).toBe("/teacher/messages/conv-1");
  });

  it("does the same for being mentioned", () => {
    expect(
      notificationHref(
        { relatedEntityType: "MENTION", relatedEntityId: conv },
        "PARENT",
      ),
    ).toBe("/parent/messages/conv-1");
  });

  /* The roles with no messages page of their own read the shared one. A
     notification a bursar cannot open is a bell that lies to them. */
  it.each(["HEAD_TEACHER", "BURSAR", "NURSE", "PATRON", "MATRON"])(
    "opens for a %s too",
    (role) => {
      expect(
        notificationHref(
          { relatedEntityType: "MENTION", relatedEntityId: conv },
          role as never,
        ),
      ).toBe("/messages/conv-1");
    },
  );

  it("falls back to the inbox when it names no conversation", () => {
    expect(
      notificationHref({ relatedEntityType: "MESSAGE" }, "TEACHER"),
    ).toBe("/teacher/messages");
  });

  /* An older row written before the subject column was filled in still has
     to route on what it says. */
  it("reads an older mention from its own words", () => {
    expect(
      notificationHref(
        { title: "Aline mentioned you in Senior 1 A", relatedEntityId: conv },
        "TEACHER",
      ),
    ).toBe("/teacher/messages/conv-1");
  });

  // Everything else still highlights a row rather than opening an address.
  it("leaves other subjects highlighting a row", () => {
    expect(
      notificationHref(
        { relatedEntityType: "HOMEWORK", relatedEntityId: "hw-1" },
        "STUDENT",
      ),
    ).toContain("highlight=hw-1");
  });
});
