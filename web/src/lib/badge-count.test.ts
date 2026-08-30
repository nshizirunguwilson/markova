import { describe, expect, it } from "vitest";
import { BADGE_CAP, badgeCount, badgeLabel } from "./badge-count";

/**
 * What a count badge says.
 *
 * Past ninety-nine the exact number stops carrying information and starts
 * breaking the row it sits in: nobody reads "247 unread" as anything more
 * precise than "a lot", and the badge grows wide enough to push the label it
 * belongs to off the end.
 *
 * One function because there are two badges - the bell and the sidebar - and
 * a rule applied in two places is a rule that will eventually be applied
 * differently in two places.
 */

describe("the number on a badge", () => {
  it("shows a small count exactly", () => {
    expect(badgeCount(1)).toBe("1");
    expect(badgeCount(42)).toBe("42");
  });

  it("shows the last exact number it can", () => {
    expect(badgeCount(BADGE_CAP)).toBe("99");
  });

  it("stops counting past it", () => {
    expect(badgeCount(100)).toBe("99+");
    expect(badgeCount(3480)).toBe("99+");
  });

  /* A badge is only drawn when there is something to count, but a component
     asking before its query has answered must not render "undefined". */
  it("says nothing has arrived rather than undefined", () => {
    expect(badgeCount(undefined)).toBe("0");
    expect(badgeCount(null)).toBe("0");
  });

  // A count is a count of things. Negative and fractional are neither.
  it("never shows a negative or a fraction", () => {
    expect(badgeCount(-4)).toBe("0");
    expect(badgeCount(2.7)).toBe("2");
  });
});

/**
 * What a screen reader says instead. "99+" read aloud is "ninety nine plus",
 * which is not a sentence, and a badge is only ever announced beside the
 * thing it counts.
 */
describe("what the badge is read out as", () => {
  it("names what is being counted", () => {
    expect(badgeLabel(3, "unread message")).toBe("3 unread messages");
  });

  it("says one thing in the singular", () => {
    expect(badgeLabel(1, "unread message")).toBe("1 unread message");
  });

  it("says a sentence rather than reading the cap aloud", () => {
    expect(badgeLabel(348, "unread message")).toBe(
      "More than 99 unread messages",
    );
  });

  // Some words do not take an s.
  it("takes a plural of its own where the s is wrong", () => {
    expect(badgeLabel(3, "person mentioning you", "people mentioning you")).toBe(
      "3 people mentioning you",
    );
  });

  it("copes with a count that has not arrived", () => {
    expect(badgeLabel(undefined, "unread message")).toBe("0 unread messages");
  });
});
