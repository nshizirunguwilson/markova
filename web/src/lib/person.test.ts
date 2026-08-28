import { describe, expect, it } from "vitest";

import {
  personDetail,
  personLabel,
  personMatches,
  personName,
  type Person,
} from "./person";

/**
 * Shapes taken from `GET /messaging/contacts` and the participant list on
 * `GET /messaging/conversations`: the class hangs off `student`, not off the
 * user.
 */
const student = (over: Partial<Person> = {}): Person => ({
  firstName: "Aline",
  lastName: "Uwase",
  role: "STUDENT",
  student: {
    studentIdNumber: "STD-2026-011",
    classSection: {
      name: "A",
      classLevel: { name: "Senior 2" },
      trade: null,
    },
  },
  ...over,
});

describe("naming a person", () => {
  it("joins the two halves", () => {
    expect(personName(student())).toBe("Aline Uwase");
  });

  it("copes with half a name", () => {
    expect(personName({ firstName: "Aline" })).toBe("Aline");
    expect(personName({ lastName: "Uwase" })).toBe("Uwase");
  });

  // An account removed from the school leaves messages behind.
  it("says something honest when the name is gone", () => {
    expect(personName({ firstName: "", lastName: "" })).toBe("Someone");
    expect(personName(null)).toBe("Someone");
    expect(personName(undefined)).toBe("Someone");
  });
});

/**
 * The line under the name. A school has four Alines, and a list of bare names
 * is unusable the moment it does.
 */
describe("telling two people with the same name apart", () => {
  it("gives a student their class", () => {
    expect(personDetail(student())).toBe("Senior 2 A");
  });

  it("names the trade where a class has one", () => {
    expect(
      personDetail(
        student({
          student: {
            classSectionId: null,
            classSection: {
              name: "B",
              classLevel: { name: "Level 4" },
              trade: { code: "SWD" },
            },
          } as Person["student"],
        }),
      ),
    ).toBe("Level 4 SWD B");
  });

  it("gives staff their role instead", () => {
    expect(personDetail({ firstName: "Josiane", role: "LIBRARIAN" })).toBe(
      "Librarian",
    );
    expect(personDetail({ firstName: "Claudine", role: "NURSE" })).toBe("Nurse");
  });

  it("writes a two-word role out properly", () => {
    expect(personDetail({ firstName: "X", role: "CLASS_TEACHER" })).toBe(
      "Class teacher",
    );
  });

  // "Student" under a student's name is noise; the class is the useful part,
  // and a student without one has nothing worth saying.
  it("says nothing for a student with no class", () => {
    expect(personDetail({ firstName: "Aline", role: "STUDENT" })).toBe("");
  });

  it("says nothing when there is nothing to say", () => {
    expect(personDetail({ firstName: "Aline" })).toBe("");
    expect(personDetail(null)).toBe("");
  });
});

describe("name and detail on one line", () => {
  it("joins them for a student", () => {
    expect(personLabel(student())).toBe("Aline Uwase · Senior 2 A");
  });

  it("leaves the name alone when there is no detail", () => {
    expect(personLabel({ firstName: "Aline", role: "STUDENT" })).toBe("Aline");
  });
});

/**
 * Finding somebody in a long list. All three of the name, the class and the
 * student number are things a person would reasonably type.
 */
describe("searching for a person", () => {
  it("matches the name, either half", () => {
    expect(personMatches(student(), "aline")).toBe(true);
    expect(personMatches(student(), "uwase")).toBe(true);
  });

  it("ignores case", () => {
    expect(personMatches(student(), "ALINE")).toBe(true);
  });

  it("matches the class", () => {
    expect(personMatches(student(), "senior 2")).toBe(true);
  });

  it("matches the student number", () => {
    expect(personMatches(student(), "STD-2026-011")).toBe(true);
  });

  // Two words narrow rather than widen: "aline senior" is one person, not
  // everybody called Aline plus everybody in a Senior year.
  it("requires every word to match something", () => {
    expect(personMatches(student(), "aline senior")).toBe(true);
    expect(personMatches(student(), "aline level")).toBe(false);
  });

  it("matches everybody on an empty search", () => {
    expect(personMatches(student(), "")).toBe(true);
    expect(personMatches(student(), "   ")).toBe(true);
  });

  it("matches nobody who is not there", () => {
    expect(personMatches(null, "aline")).toBe(false);
  });
});
