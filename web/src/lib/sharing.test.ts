import { describe, expect, it } from "vitest";
import { isAdult } from "./sharing";

describe("eighteen or over", () => {
  const now = new Date("2026-10-12T08:00:00Z");
  it("counts from the birthday itself", () => {
    expect(isAdult("2008-10-12T00:00:00.000Z", now)).toBe(true);
    expect(isAdult("2008-10-13T00:00:00.000Z", now)).toBe(false);
  });
  it("treats no date of birth as under 18", () => {
    expect(isAdult(null, now)).toBe(false);
    expect(isAdult(undefined, now)).toBe(false);
  });
  it("uses the day in Kigali", () => {
    // 23:30 UTC on the 11th is already the 12th in Kigali.
    expect(isAdult("2008-10-12T00:00:00.000Z", new Date("2026-10-11T23:30:00Z"))).toBe(true);
  });
});
