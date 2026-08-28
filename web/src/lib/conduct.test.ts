import { describe, expect, it } from "vitest";

import {
  TERM_CONDUCT_MARK,
  TERMS_IN_YEAR,
  YEAR_CONDUCT_MARK,
  conductPercentage,
  conductRemark,
  conductTone,
} from "./conduct";

describe("what conduct is marked out of", () => {
  it("is forty a term and a hundred and twenty a year", () => {
    expect(TERM_CONDUCT_MARK).toBe(40);
    expect(TERMS_IN_YEAR).toBe(3);
    expect(YEAR_CONDUCT_MARK).toBe(120);
  });
});

describe("conduct as a percentage", () => {
  it("reads a term out of forty", () => {
    expect(conductPercentage(32, 40)).toBe(80);
    expect(conductPercentage(40, 40)).toBe(100);
  });

  it("reads a year out of a hundred and twenty the same way", () => {
    expect(conductPercentage(108, 120)).toBe(90);
  });

  // Printing 0% would read as a student who behaved appallingly, when in fact
  // nobody has marked anything at all.
  it("has no percentage when there is nothing to divide by", () => {
    expect(conductPercentage(32, 0)).toBeNull();
    expect(conductPercentage(null, 40)).toBeNull();
    expect(conductPercentage(undefined, undefined)).toBeNull();
  });
});

/**
 * Read off the percentage, so the bands mean the same thing for a term out of
 * forty and a year out of a hundred and twenty.
 */
describe("the word for a conduct mark", () => {
  it.each([
    [100, "Excellent"],
    [90, "Very good"],
    [78, "Good"],
    [60, "Fair"],
    [30, "Poor"],
  ])("calls %i%% %s", (pct, word) => {
    expect(conductRemark(pct)).toBe(word);
  });

  it("says nothing when there is no percentage", () => {
    expect(conductRemark(null)).toBe("–");
  });

  it("reads a term and a year at the same standing identically", () => {
    expect(conductRemark(conductPercentage(36, 40))).toBe(
      conductRemark(conductPercentage(108, 120)),
    );
  });
});

/**
 * Whole class names, never assembled at runtime: Tailwind reads the source
 * for the classes it has to generate and cannot see a constructed one, which
 * comes out as no colour at all.
 */
describe("the colour of a conduct bar", () => {
  it("hands back a whole Tailwind class", () => {
    expect(conductTone(90)).toBe("bg-success");
    expect(conductTone(50)).toBe("bg-warning");
    expect(conductTone(20)).toBe("bg-danger");
  });

  it("is neutral for a mark nobody has given", () => {
    expect(conductTone(null)).toBe("bg-muted");
  });

  // Three bands rather than five: a bar is read at a glance and five shades
  // of it are not distinguishable at that speed.
  it("uses three bands, not five", () => {
    expect(new Set([90, 80, 70, 60, 50, 40, 30, 10].map(conductTone)).size).toBe(
      3,
    );
  });
});
