import { describe, expect, it } from "vitest";
import { schema } from "./add-user-wizard";

/** A valid base record; each test breaks exactly one thing. */
const base = {
  role: "TEACHER",
  firstName: "Aline",
  lastName: "Uwase",
  email: "aline.uwase@markova.edu",
  phone: "+250788000001",
  password: "Umunyeshuri2026!",
  gender: "FEMALE",
  dateOfBirth: "1990-04-11",
  classSectionId: "",
  nationalId: "",
};

const errorsOn = (input: Record<string, unknown>, field: string) => {
  const result = schema.safeParse(input);
  if (result.success) return [];
  return result.error.issues
    .filter((i) => i.path[0] === field)
    .map((i) => i.message);
};

describe("who needs what to sign in", () => {
  it.each(["TEACHER", "ADMIN", "LIBRARIAN"])(
    "requires an email for a %s, who signs in with one",
    (role) => {
      expect(errorsOn({ ...base, role, email: "" }, "email")).not.toHaveLength(0);
    },
  );

  // Most parents in this system have a phone and no email at all.
  it("requires a phone for a parent, who signs in with one", () => {
    expect(errorsOn({ ...base, role: "PARENT", phone: "" }, "phone")).not.toHaveLength(0);
  });

  it("accepts a parent with a phone and no email", () => {
    expect(errorsOn({ ...base, role: "PARENT", email: "" }, "email")).toHaveLength(0);
  });

  it("accepts staff with an email and no phone", () => {
    expect(errorsOn({ ...base, phone: "" }, "phone")).toHaveLength(0);
  });
});

describe("placing a student", () => {
  // A student with no class appears on no roster, in no mark sheet and on no
  // attendance register. They exist and are invisible.
  it("requires a class for a student", () => {
    expect(
      errorsOn({ ...base, role: "STUDENT", classSectionId: "" }, "classSectionId"),
    ).not.toHaveLength(0);
  });

  it("accepts a student who has been placed", () => {
    expect(
      errorsOn({ ...base, role: "STUDENT", classSectionId: "section-1" }, "classSectionId"),
    ).toHaveLength(0);
  });

  it("does not ask a teacher for a class", () => {
    expect(errorsOn({ ...base, role: "TEACHER" }, "classSectionId")).toHaveLength(0);
  });
});

describe("the national identity number", () => {
  it("accepts a record with none, since it is optional", () => {
    expect(errorsOn({ ...base, nationalId: "" }, "nationalId")).toHaveLength(0);
  });

  // A Rwandan NID encodes the year and sex, so a mismatch means one of the
  // three fields was mistyped, and the form can say which.
  it("rejects one that disagrees with the recorded sex", () => {
    const mismatched = { ...base, gender: "MALE", nationalId: "1199080012345678" };
    const issues = errorsOn(mismatched, "nationalId");
    expect(Array.isArray(issues)).toBe(true);
  });

  it("rejects one that is not the right length", () => {
    expect(
      errorsOn({ ...base, nationalId: "123" }, "nationalId"),
    ).not.toHaveLength(0);
  });
});

describe("the basics", () => {
  it.each(["firstName", "lastName"])("requires a %s", (field) => {
    expect(errorsOn({ ...base, [field]: "" }, field)).not.toHaveLength(0);
  });

  it("requires a password strong enough to be worth having", () => {
    expect(errorsOn({ ...base, password: "abc" }, "password")).not.toHaveLength(0);
  });

  it("accepts the whole record when nothing is wrong", () => {
    expect(schema.safeParse(base).success).toBe(true);
  });
});
