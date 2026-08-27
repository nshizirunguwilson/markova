import { describe, expect, it } from "vitest";

import {
  MIN_TEXT_CONTRAST,
  MUTED_TEXT,
  brandPalette,
  contrastRatio,
  parseHex,
  shade,
  washFor,
} from "./brand-color";

/**
 * A school picks one colour and the rest of the palette is worked out from it.
 *
 * The washes are what badges, the sidebar highlight and info panels sit on,
 * and they carry brand-coloured text. A fixed mix toward white does not hold
 * across hues: 86% leaves a navy at 7:1 and a mid-green at 4.2:1, which is
 * how a school that chose green ended up with badge text below AA on every
 * page in the app.
 */

/** Hues far enough apart to catch a derivation that only works for blue. */
const COLOURS = [
  ["Markova navy", "#1B4F72"],
  ["a green", "#25741b"],
  ["a maroon", "#7B1F45"],
  ["a teal", "#0E6655"],
  ["a purple", "#6C3483"],
  ["a burnt orange", "#A04000"],
  ["a near-black", "#111111"],
  ["a mid grey", "#767676"],
] as const;

describe("reading a colour", () => {
  it("takes a hex with or without the hash", () => {
    expect(parseHex("#1B4F72")).toEqual([27, 79, 114]);
    expect(parseHex("1b4f72")).toEqual([27, 79, 114]);
  });

  it("refuses anything that is not a six-digit hex", () => {
    expect(parseHex("rebeccapurple")).toBeNull();
    expect(parseHex("#abc")).toBeNull();
    expect(parseHex("")).toBeNull();
  });

  it("leaves a colour it cannot read alone rather than producing NaN", () => {
    expect(shade("not-a-colour", 0.5)).toBe("not-a-colour");
    expect(washFor("not-a-colour")).toBe("not-a-colour");
  });
});

describe("mixing", () => {
  it("moves toward white and toward black", () => {
    expect(shade("#000000", 1)).toBe("#ffffff");
    expect(shade("#ffffff", -1)).toBe("#000000");
    expect(shade("#1B4F72", 0)).toBe("#1b4f72");
  });
});

describe("the contrast ratio", () => {
  it("scores the extremes at 21 and 1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#1B4F72", "#1B4F72")).toBeCloseTo(1, 5);
  });

  it("does not care which way round the pair is given", () => {
    expect(contrastRatio("#1B4F72", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#1B4F72"),
      5,
    );
  });
});

describe("the wash a colour reads on", () => {
  it.each(COLOURS)("clears AA for %s", (_name, hex) => {
    const wash = washFor(hex);
    expect(contrastRatio(hex, wash)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });

  // As close to the brand as the ratio allows: a wash paler than it needs to
  // be is a wash that has stopped looking like the school's colour.
  it("stops at the first mix that clears, rather than going to white", () => {
    const wash = washFor("#1B4F72");
    expect(wash).not.toBe("#ffffff");
    expect(contrastRatio("#1B4F72", wash)).toBeLessThan(9);
  });

  it("can be asked for a higher bar", () => {
    const wash = washFor("#1B4F72", 7);
    expect(contrastRatio("#1B4F72", wash)).toBeGreaterThanOrEqual(7);
  });

  /**
   * Some hues cannot reach a high bar against any tint of themselves — a
   * mid-green tops out around 5.9:1 even on pure white. The answer is then
   * the palest thing there is, not a darker mix that fails by more.
   */
  it("answers with white when no tint can reach the bar", () => {
    expect(washFor("#25741b", 7)).toBe("#ffffff");
  });

  /**
   * A colour so pale that nothing between it and white clears the ratio. The
   * derivation has to answer something rather than looping or returning a
   * mix that fails.
   */
  it("gives up on white for a colour nothing can be paler than", () => {
    const wash = washFor("#f5f5f5");
    expect(parseHex(wash)).not.toBeNull();
  });
});

describe("the palette a school's colour implies", () => {
  /**
   * Either both washes hold AA, or neither is offered and the caller keeps
   * the designed neutrals. What must never happen is a wash that is applied
   * and fails, which is what a fixed 86% mix produced for a mid-green: badge
   * text at 4.23:1 on every page in the app.
   */
  it.each(COLOURS)("never offers a wash that fails AA for %s", (_name, hex) => {
    const p = brandPalette(hex);
    if (p.accent === null) {
      expect(p.accentLight).toBeNull();
      return;
    }
    expect(contrastRatio(p.primary, p.accent)).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
    expect(contrastRatio(p.primary, p.accentLight!)).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
  });

  // The washes sit next to each other — a badge on a hovered row — so they
  // have to be distinguishable, not just both readable.
  it.each(COLOURS)("keeps the two washes apart for %s", (_name, hex) => {
    const p = brandPalette(hex);
    if (p.accent) expect(p.accentLight).not.toBe(p.accent);
  });

  // The colours a school is actually likely to choose all work; the null
  // answer is for the pathological end of the range, not the normal one.
  it.each([
    ["Markova navy", "#1B4F72"],
    ["a green", "#25741b"],
    ["a maroon", "#7B1F45"],
    ["a teal", "#0E6655"],
    ["a purple", "#6C3483"],
    ["a burnt orange", "#A04000"],
  ] as const)("derives usable washes for %s", (_name, hex) => {
    expect(brandPalette(hex).accent).not.toBeNull();
  });

  /**
   * The palest wash is what every table header sits on, and those use
   * `--color-muted` — a fixed neutral, not the brand colour. Deriving the
   * wash against the brand alone left that pairing at 4.49:1, one hundredth
   * short, on every list page in the app.
   */
  it.each(COLOURS)("holds AA for muted text on the palest wash of %s", (_n, hex) => {
    const p = brandPalette(hex);
    if (!p.accentLight) return;
    expect(contrastRatio(MUTED_TEXT, p.accentLight)).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
  });

  /**
   * A colour that only just reads on white has no room for two tints that
   * both still hold AA. Offering none is what keeps the designed neutrals in
   * place rather than shipping a pair that fails.
   */
  it("offers no wash for a colour too weak to carry one", () => {
    const p = brandPalette("#767676");
    expect(p.accent).toBeNull();
    expect(p.accentLight).toBeNull();
    // The primary variants are still derived: buttons and the sidebar work.
    expect(p.primaryLight).not.toBe(p.primaryDark);
  });

  it("offers no wash for something that is not a colour", () => {
    const p = brandPalette("rebeccapurple");
    expect(p.accent).toBeNull();
  });

  it.each(COLOURS)("gives %s a lighter and a darker variant", (_name, hex) => {
    const p = brandPalette(hex);
    expect(p.primaryLight).not.toBe(p.primaryDark);
    expect(p.primary).toBe(hex);
  });

  // White text on the primary is the other pairing in the app: every button,
  // and the sidebar. A school that picks something too pale for it is a
  // separate problem, but the derivation must not make it worse.
  it("leaves the designed navy exactly where the designers put it", () => {
    const p = brandPalette("#1B4F72");
    expect(p.primaryLight).toBe("#446f8b");
    expect(p.primaryDark).toBe("#16415d");
  });
});
