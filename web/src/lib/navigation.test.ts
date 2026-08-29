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
    const shared = ["/messages", "/help", "/profile"];
    for (const href of hrefsFor(role)) {
      const allowed =
        href.startsWith(own) || shared.some((s) => href.startsWith(s));
      expect(allowed, `${role} menu links to ${href}`).toBe(true);
    }
  });

  it("never offers a non-admin the admin subtree", () => {
    for (const role of ROLES.filter((r) => r !== "ADMIN")) {
      expect(hrefsFor(role).some((h) => h.startsWith("/admin"))).toBe(false);
    }
  });

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
