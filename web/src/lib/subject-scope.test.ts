import { describe, expect, it } from "vitest";

import { SUBJECT_SCOPES, scopeInfo, scopeLabel } from "./subject-scope";

/**
 * The scope table is a copy of what the server grades on
 * (backend/src/common/grading.ts). The two drifting apart would mean the page
 * telling a school its marks are weighted one way while the report card
 * weights them another, which nobody would notice until results came out.
 */
describe("subject scopes", () => {
  it("covers every scope the schema has", () => {
    expect(SUBJECT_SCOPES.map((s) => s.value)).toEqual([
      "O_CORE",
      "O_ELECTIVE",
      "A_GENERAL",
      "A_SPECIFIC",
    ]);
  });

  // Only trade modules carry a practical, and it is 30% of the term mark.
  it("gives the trade module its practical weighting", () => {
    expect(scopeInfo("A_SPECIFIC")?.weighting).toMatch(/practical 30%/i);
    expect(scopeInfo("O_CORE")?.weighting).not.toMatch(/practical/i);
  });

  // An O-Level elective is marked on the stricter scale and left out of the
  // aggregate; everything else counts.
  it("marks the elective as the one outside the aggregate", () => {
    expect(scopeInfo("O_ELECTIVE")?.countsTowardAggregate).toBe(false);
    for (const scope of ["O_CORE", "A_GENERAL", "A_SPECIFIC"]) {
      expect(scopeInfo(scope)?.countsTowardAggregate).toBe(true);
    }
  });

  it("names the stricter scale only where it applies", () => {
    expect(scopeInfo("O_ELECTIVE")?.scale).toMatch(/80%/);
    expect(scopeInfo("O_CORE")?.scale).toMatch(/70%/);
  });

  // The server refuses a trade module with no trade, and refuses a trade on
  // anything else. The form has to agree, or the save is rejected.
  it("requires a trade for exactly one scope", () => {
    expect(SUBJECT_SCOPES.filter((s) => s.requiresTrade)).toHaveLength(1);
    expect(scopeInfo("A_SPECIFIC")?.requiresTrade).toBe(true);
  });

  it("names a scope in the words the school uses", () => {
    expect(scopeLabel("A_SPECIFIC")).toBe("Trade module");
  });

  it("draws a dash for a scope it has never heard of", () => {
    expect(scopeLabel("SOMETHING_NEW")).toBe("-");
    expect(scopeLabel(null)).toBe("-");
    expect(scopeInfo(undefined)).toBeNull();
  });
});
