import { describe, it, expect } from 'vitest';
import { classDisplayName, cn, sectionLabel, toLocalDateString } from './utils';

describe('toLocalDateString', () => {
  it('should format date as YYYY-MM-DD', () => {
    const date = new Date(2026, 2, 22); // March 22, 2026
    expect(toLocalDateString(date)).toBe('2026-03-22');
  });

  it('should handle single-digit months and days with zero padding', () => {
    const date = new Date(2026, 0, 5); // January 5, 2026
    expect(toLocalDateString(date)).toBe('2026-01-05');
  });

  it('should handle December 31st correctly', () => {
    const date = new Date(2025, 11, 31); // December 31, 2025
    expect(toLocalDateString(date)).toBe('2025-12-31');
  });
});

describe('cn', () => {
  it('should merge tailwind classes correctly', () => {
    const result = cn('px-4', 'py-2', 'text-sm');
    expect(result).toBe('px-4 py-2 text-sm');
  });

  it('should handle conflicting classes via twMerge behavior', () => {
    // twMerge should resolve conflicts — last conflicting class wins
    const result = cn('px-4', 'px-6');
    expect(result).toBe('px-6');
  });

  it('should handle conditional classes via clsx', () => {
    const isActive = true;
    const result = cn('base', isActive && 'active', false && 'hidden');
    expect(result).toBe('base active');
  });

  it('should handle empty inputs', () => {
    expect(cn()).toBe('');
  });
});

/**
 * A section's label inside a level that has already been chosen.
 *
 * Every A-Level level runs one section per trade, so a picker listing the
 * bare name shows "A, A, A, A, B, B, B, B" — the software developers and the
 * tourism students are indistinguishable, and an admin promoting a class has
 * no way to tell which one they picked.
 */
describe("sectionLabel", () => {
  it("puts the trade code before the section name", () => {
    expect(sectionLabel({ name: "B", trade: { code: "TOR" } })).toBe("TOR B");
  });

  it("gives the bare name where there is no trade", () => {
    expect(sectionLabel({ name: "A", trade: null })).toBe("A");
    expect(sectionLabel({ name: "A" })).toBe("A");
  });

  // The level is deliberately left out: these lists always sit under a level
  // picker, so repeating it would read "Level 5 TOR B" in a Level 5 dropdown.
  it("leaves the level out, unlike classDisplayName", () => {
    const section = { name: "B", classLevel: { name: "Level 5" }, trade: { code: "TOR" } };
    expect(sectionLabel(section)).toBe("TOR B");
    expect(classDisplayName(section)).toBe("Level 5 TOR B");
  });

  it("says nothing for a section that is not there", () => {
    expect(sectionLabel(null)).toBe("");
    expect(sectionLabel(undefined)).toBe("");
  });

  it("copes with a trade that carries no code", () => {
    expect(sectionLabel({ name: "A", trade: { code: null } })).toBe("A");
  });
});
