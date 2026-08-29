import { describe, it, expect } from "vitest";
import { getNavigation } from "./navigation";
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
    ["NURSE", ["/admin/health"]],
    [
      "HEAD_TEACHER",
      [
        "/admin/report-cards",
        "/admin/marks",
        "/admin/classes",
        "/admin/timetable",
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

  // The one screen they open every morning in exam season.
  it("leads the head teacher with the cards waiting on them", () => {
    expect(hrefsFor("HEAD_TEACHER")[0]).toBe("/admin/report-cards");
  });
});

/**
 * Everybody who reads a mark can reach the page that explains one.
 *
 * It came off the report card, where it was printed identically on every
 * sheet the school ever issued. It has to be somewhere a reader can find it,
 * and "somewhere" means the menu of every role that sees a grade.
 */
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
