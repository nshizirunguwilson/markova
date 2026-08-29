import { describe, expect, it } from "vitest";
import { ROLE_LABEL, labelForRole, type Role } from "./index";

/**
 * What each role is called in front of a person.
 *
 * Roles were printed raw for a long time and nobody noticed, because every
 * one of them happened to read acceptably in capitals. Then HEAD_TEACHER
 * arrived with an underscore in it and put "HEAD_TEACHER" on a badge beside
 * somebody's name, which is the kind of thing a demo is judged on.
 *
 * So the map exists, and what these tests hold is that it stays complete: the
 * next role added to the enum has to be named here too, and the test is what
 * says so before a user does.
 */

const ROLES: Role[] = [
  "ADMIN",
  "HEAD_TEACHER",
  "TEACHER",
  "STUDENT",
  "PARENT",
  "LIBRARIAN",
  "PATRON",
  "MATRON",
  "NURSE",
  "BURSAR",
];

describe("naming a role", () => {
  it("names every one of them", () => {
    expect(Object.keys(ROLE_LABEL).sort()).toEqual([...ROLES].sort());
  });

  /*
    The whole point. An enum is the API's word for a role; this is the
    school's, and the school's has no underscores and no shouting in it.
  */
  it("prints none of them as an enum", () => {
    for (const role of ROLES) {
      expect(ROLE_LABEL[role]).not.toMatch(/_/);
      expect(ROLE_LABEL[role]).not.toBe(role);
    }
  });

  it("writes them in sentence case, the way a person is addressed", () => {
    for (const role of ROLES) {
      const label = ROLE_LABEL[role];
      expect(label[0]).toBe(label[0].toUpperCase());
      expect(label.slice(1)).toBe(label.slice(1).toLowerCase());
    }
  });

  it("gives the head teacher a name with no underscore in it", () => {
    expect(labelForRole("HEAD_TEACHER")).toBe("Head teacher");
  });

  it("gives two different roles two different names", () => {
    expect(new Set(Object.values(ROLE_LABEL)).size).toBe(ROLES.length);
  });
});

/**
 * A role the web does not know is still a role somebody holds, and printing
 * it raw is better than printing a blank beside their name.
 */
describe("a role we have no name for", () => {
  it("prints it as it came", () => {
    expect(labelForRole("REGISTRAR")).toBe("REGISTRAR");
  });

  it("prints nothing where there is no role at all", () => {
    expect(labelForRole(null)).toBe("");
    expect(labelForRole(undefined)).toBe("");
    expect(labelForRole("")).toBe("");
  });
});
