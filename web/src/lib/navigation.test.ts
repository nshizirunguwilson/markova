import { describe, it, expect } from "vitest";
import {
  FORMER_STUDENT_PAGES,
  getNavigation,
  isFormerStudent,
} from "./navigation";
import type { Role } from "@/types";

const ROLES: Role[] = ["ADMIN", "TEACHER", "STUDENT", "PARENT", "LIBRARIAN"];

const hrefsFor = (role: Role) =>
  getNavigation(role).flatMap((s) => s.items.map((i) => i.href));

describe("getNavigation", () => {
  it.each(ROLES)("gives %s a non-empty menu", (role) => {
    expect(hrefsFor(role).length).toBeGreaterThan(0);
  });

  it.each(ROLES)("keeps every %s link inside that role's subtree", (role) => {
    const own = `/${role.toLowerCase()}`;
    /*
      Pages that belong to nobody in particular. Grading is reference
      material: how a mark becomes a grade is the same answer whoever asks,
      so it is one page rather than a copy per role. The report cards screen
      is shared for a stronger reason - the class teacher, the head teacher
      and the principal all work on the same cards, and the failure it
      replaces is precisely two of them disagreeing about whether a class is
      finished.
    */
    const shared = [
      "/messages",
      "/help",
      "/profile",
      "/grading",
      "/admin/report-cards",
    ];
    for (const href of hrefsFor(role)) {
      const allowed =
        href.startsWith(own) || shared.some((s) => href.startsWith(s));
      expect(allowed, `${role} menu links to ${href}`).toBe(true);
    }
  });

  /**
   * One shared page is not a door into /admin. A class teacher reaches the
   * report cards they write on and nothing else under that prefix.
   */
  it("offers a non-admin no admin page but the one they share", () => {
    for (const role of ROLES.filter((r) => r !== "ADMIN")) {
      const admin = hrefsFor(role).filter((h) => h.startsWith("/admin"));
      expect(admin.every((h) => h === "/admin/report-cards")).toBe(true);
    }
  });

  it("gives a class teacher the report cards they write on", () => {
    expect(hrefsFor("TEACHER")).toContain("/admin/report-cards");
  });

  // They write; they do not certify their own work, and nothing in the menu
  // should suggest otherwise.
  it.each(["STUDENT", "PARENT", "LIBRARIAN"] as Role[])(
    "does not offer the report cards screen to a %s",
    (role) => {
      expect(hrefsFor(role)).not.toContain("/admin/report-cards");
    },
  );

  it("lists no duplicate destinations within a role", () => {
    for (const role of ROLES) {
      const hrefs = hrefsFor(role);
      expect(new Set(hrefs).size, `${role} has duplicate links`).toBe(
        hrefs.length
      );
    }
  });

  it("gives every item a label and an icon", () => {
    for (const role of ROLES) {
      for (const section of getNavigation(role)) {
        for (const item of section.items) {
          expect(item.label.trim()).not.toBe("");
          expect(item.icon).toBeTruthy();
        }
      }
    }
  });

  /**
   * The welfare staff. Their Dashboard link pointed at /admin, which the
   * shell bounces them straight back out of - a menu item that could not be
   * clicked, on the first row of the sidebar.
   */
  it.each([
    ["PATRON", "/boarding"],
    ["MATRON", "/boarding"],
    ["NURSE", "/nurse"],
  ])("gives a %s a Dashboard link to %s", (role, href) => {
    const dashboard = getNavigation(role as Role)
      .flatMap((s) => s.items)
      .find((i) => i.label === "Dashboard");
    expect(dashboard?.href).toBe(href);
  });

  it("gives the patron and the matron the same menu", () => {
    expect(getNavigation("PATRON" as Role)).toEqual(getNavigation("MATRON" as Role));
  });

  // Deliberately narrow: they handle money, welfare and health, and nothing
  // academic. A matron has no business reading marks.
  it.each(["PATRON", "MATRON", "NURSE"])(
    "keeps anything academic out of the %s menu",
    (role) => {
      const hrefs = getNavigation(role as Role).flatMap((s) =>
        s.items.map((i) => i.href),
      );
      for (const forbidden of ["/marks", "/reports", "/students", "/users", "/subjects", "/promotion"]) {
        expect(hrefs.some((h) => h.includes(forbidden))).toBe(false);
      }
    },
  );

  it("gives the nurse the clinic and nothing else to run", () => {
    const hrefs = getNavigation("NURSE" as Role).flatMap((s) =>
      s.items.map((i) => i.href),
    );
    expect(hrefs).toContain("/admin/health");
    expect(hrefs).not.toContain("/admin/pocket-money");
  });

  it("falls back to the admin menu for an unknown role", () => {
    expect(getNavigation("NOPE" as Role)).toEqual(getNavigation("ADMIN"));
  });
});

/**
 * The roles that share pages under /admin.
 *
 * A bursar, a patron and a head teacher are not administrators, and their
 * menus are checked separately because the rule above does not fit them: the
 * fee register, the pocket money book and the report cards live under /admin
 * as one copy rather than as a second prefix holding the same code.
 *
 * What has to hold instead is narrower and more important: each of them
 * reaches exactly the pages of that job, and nothing else in /admin.
 */
describe("the roles that share pages under /admin", () => {
  const SHARED: [Role, string[]][] = [
    ["BURSAR", ["/admin/finance"]],
    ["PATRON", ["/admin/pocket-money", "/admin/health", "/admin/activities"]],
    /* The patron and the matron share one menu: the same job on opposite
       sides of the school. */
    ["MATRON", ["/admin/pocket-money", "/admin/health", "/admin/activities"]],
    ["NURSE", ["/admin/health", "/admin/support"]],
    [
      "HEAD_TEACHER",
      [
        "/admin/report-cards",
        "/admin/marks",
        "/admin/reports",
        "/admin/classes",
        "/admin/timetable",
        /* The exam timetable, for the same reason as the lesson one: the DOS
           sets it and the principal reads it. */
        "/admin/exams",
        "/admin/support",
        "/admin/teachers",
        "/admin/attendance",
      ],
    ],
  ];

  it.each(SHARED)("gives %s a menu", (role) => {
    expect(hrefsFor(role).length).toBeGreaterThan(0);
  });

  it.each(SHARED)("keeps %s to the admin pages of that job", (role, allowed) => {
    for (const href of hrefsFor(role).filter((h) => h.startsWith("/admin"))) {
      expect(
        allowed.some((a) => href.startsWith(a)),
        `${role} menu links to ${href}`,
      ).toBe(true);
    }
  });

  it.each(SHARED)("lists no duplicate destinations for %s", (role) => {
    const hrefs = hrefsFor(role);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  /**
   * The head teacher runs the academic side and nothing else. Fees, the sick
   * bay and the dormitories belong to other posts, and a menu that offered
   * them would be a menu inviting a 403.
   */
  it("keeps the head teacher out of the money and the welfare pages", () => {
    const hrefs = hrefsFor("HEAD_TEACHER");
    for (const forbidden of [
      "/admin/finance",
      "/admin/health",
      "/admin/pocket-money",
      "/boarding",
      "/nurse",
      "/admin/users",
      "/admin/settings",
    ]) {
      expect(hrefs.some((h) => h.startsWith(forbidden))).toBe(false);
    }
  });

  /**
   * The overview first, and the report cards straight after it.
   *
   * The overview answers "what is stuck and on whom"; the report cards are
   * where they act on the half of that answer which is theirs. Anything else
   * between the two would be a page they scroll past every morning.
   */
  it("leads the head teacher with what is stuck, then where to act", () => {
    expect(hrefsFor("HEAD_TEACHER").slice(0, 2)).toEqual([
      "/head-teacher",
      "/admin/report-cards",
    ]);
  });

  /* Their own subtree, so the rule about staying inside it holds without an
     exception for the dashboard. */
  it("keeps the dashboard inside their own subtree", () => {
    expect(hrefsFor("HEAD_TEACHER")).toContain("/head-teacher");
  });
});

/**
 * Everybody who reads a mark can reach the page that explains one.
 *
 * It came off the report card, where it was printed identically on every
 * sheet the school ever issued. It has to be somewhere a reader can find it,
 * and "somewhere" means the menu of every role that sees a grade.
 */
/**
 * Who runs the academic side.
 *
 * Report cards, marks and attendance are the Director of Studies', not the
 * principal's. The menu has to agree with the API: a principal offered the
 * mark book and then refused by every request is worse off than one who was
 * never offered it.
 */
describe("what the principal no longer runs", () => {
  const MOVED: [string, string][] = [
    ["the mark book", "/admin/marks"],
    ["the register", "/admin/attendance"],
    ["the report card desk", "/admin/report-cards"],
  ];

  it.each(MOVED)("does not offer the principal %s", (_what, href) => {
    expect(hrefsFor("ADMIN")).not.toContain(href);
  });

  it.each(MOVED)("offers the head teacher %s", (_what, href) => {
    expect(hrefsFor("HEAD_TEACHER")).toContain(href);
  });

  /*
    /admin/reports is the exception, and it is a shared page rather than a
    moved one: the report cards on it are the DOS's and the transfer letters
    and transcripts are the principal's, so both are offered it and each is
    shown only their own tab. Listing it as moved left the letters unreachable
    by anybody - the principal was bounced from the page and the DOS was
    refused by the API.
  */
  it("offers the page they share to both of them", () => {
    expect(hrefsFor("ADMIN")).toContain("/admin/reports");
    expect(hrefsFor("HEAD_TEACHER")).toContain("/admin/reports");
  });

  /* What the principal keeps: the institution rather than the classroom. */
  it.each([
    "/admin/users",
    "/admin/finance",
    "/admin/id-cards",
    "/admin/settings",
    "/admin/discipline",
  ])("leaves the principal %s", (href) => {
    expect(hrefsFor("ADMIN")).toContain(href);
  });

  // A subject teacher still enters marks and takes their own register.
  it("leaves a teacher their own marks and register", () => {
    const hrefs = hrefsFor("TEACHER");
    expect(hrefs).toContain("/teacher/marks");
    expect(hrefs).toContain("/teacher/attendance");
  });
});

describe("the grading page", () => {
  it.each(["ADMIN", "TEACHER", "STUDENT", "PARENT", "HEAD_TEACHER"] as Role[])(
    "is in the %s menu",
    (role) => {
      expect(hrefsFor(role)).toContain("/grading");
    },
  );

  // A bursar, a patron and a nurse never see a grade, so it would be noise.
  it.each(["BURSAR", "PATRON", "NURSE", "LIBRARIAN"] as Role[])(
    "is not in the %s menu",
    (role) => {
      expect(hrefsFor(role)).not.toContain("/grading");
    },
  );
});

describe("a student who has left", () => {
  it("is a student whose standing is not on the roll", () => {
    expect(isFormerStudent({ role: "STUDENT", studentStatus: "GRADUATED" })).toBe(true);
    expect(isFormerStudent({ role: "STUDENT", studentStatus: "ACTIVE" })).toBe(false);
    expect(isFormerStudent({ role: "STUDENT" })).toBe(false);
    expect(isFormerStudent({ role: "PARENT", studentStatus: "GRADUATED" })).toBe(false);
    expect(isFormerStudent(null)).toBe(false);
  });

  it("sees only their report cards in the menu", () => {
    const items = getNavigation("STUDENT", true).flatMap((s) => s.items);
    expect(items.map((i) => i.href)).toEqual(["/student/reports"]);
    expect(FORMER_STUDENT_PAGES).toContain("/student/reports");
  });

  it("leaves everybody else's menu as it was", () => {
    expect(getNavigation("PARENT", true)).toEqual(getNavigation("PARENT"));
  });
});
