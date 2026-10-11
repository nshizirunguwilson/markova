import { describe, expect, it } from "vitest";
import { STANDING_LABEL, dayWords, pauseWords, schoolToday } from "./standing";

describe("standing words", () => {
  it("names every standing", () => {
    expect(STANDING_LABEL.PASSED_AWAY).toBe("Passed away");
    expect(STANDING_LABEL.ACTIVE).toBe("On the roll");
  });

  it("reads a stored day as that day, wherever the viewer is", () => {
    expect(dayWords("2026-10-15T00:00:00.000Z")).toBe("15 October");
    expect(dayWords(null)).toBe("");
  });

  it("says until when, or just away", () => {
    expect(pauseWords({ kind: "SUSPENDED", endsOn: "2026-10-15T00:00:00.000Z" })).toBe(
      "Suspended until 15 October",
    );
    expect(pauseWords({ kind: "AWAY", endsOn: null })).toBe("Away");
  });

  it("knows the day in Kigali", () => {
    expect(schoolToday(new Date("2026-10-12T23:30:00Z"))).toBe("2026-10-13");
  });
});
