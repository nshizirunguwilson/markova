import { describe, expect, it } from "vitest";

import {
  MIN_TEXT_CONTRAST,
  MUTED_TEXT,
  ON_PRIMARY_DARK,
  ON_PRIMARY_LIGHT,
  brandPalette,
  readableAsText,
  onPrimaryFor,
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
   * A colour with no room for two readable tints is darkened until it has
   * room, rather than being handed the designed neutrals.
   *
   * Those neutrals are a pale blue, checked once against the designed navy.
   * Giving them to a school that chose green produced green-on-blue at
   * 3.7:1 on every sidebar item and every avatar in the app.
   */
  it("darkens a weak colour until it can carry its own washes", () => {
    const p = brandPalette("#767676");
    expect(p.accent).not.toBeNull();
    expect(p.accentLight).not.toBeNull();
    expect(contrastRatio(p.primary, p.accent!)).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
    expect(p.primaryLight).not.toBe(p.primaryDark);
  });

  it("offers no wash for something that is not a colour", () => {
    const p = brandPalette("rebeccapurple");
    expect(p.accent).toBeNull();
  });

  it.each(COLOURS)("gives %s a lighter and a darker variant", (_name, hex) => {
    const p = brandPalette(hex);
    expect(p.primaryLight).not.toBe(p.primaryDark);
    // The primary is the readable form of what the school chose, which for
    // most colours is the hex itself.
    expect(p.primary).toBe(readableAsText(hex));
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

/**
 * Text drawn on a solid fill of the school's own colour.
 *
 * A badge that reads white-on-navy is the common case, but a school is free
 * to pick a bright yellow, and white on that is around 1.4:1.
 */
describe("choosing text for a solid brand fill", () => {
  it("uses white on a dark colour", () => {
    expect(onPrimaryFor("#1B4F72")).toBe(ON_PRIMARY_LIGHT);
  });

  it("uses near-black on a light colour", () => {
    expect(onPrimaryFor("#F1C40F")).toBe(ON_PRIMARY_DARK);
    expect(onPrimaryFor("#FFFFFF")).toBe(ON_PRIMARY_DARK);
  });

  it("always clears AA on the colour it was chosen for", () => {
    for (const hex of [
      "#1B4F72",
      "#F1C40F",
      "#2ECC71",
      "#E74C3C",
      "#000000",
      "#FFFFFF",
      // The hardest case there is: white and black are equally poor here.
      "#767676",
      "#808080",
    ]) {
      expect(contrastRatio(onPrimaryFor(hex), hex)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("falls back to white for a colour it cannot read", () => {
    expect(onPrimaryFor("not-a-colour")).toBe(ON_PRIMARY_LIGHT);
  });

  /**
   * The palette derives everything from the readable form of the colour, so
   * `onPrimary` is chosen against the fill that will actually be drawn — not
   * against the raw hex the school typed.
   */
  it("is chosen against the fill the palette actually uses", () => {
    const palette = brandPalette("#F1C40F");
    expect(
      contrastRatio(palette.onPrimary, palette.primary),
    ).toBeGreaterThanOrEqual(4.5);
    expect(brandPalette("#1B4F72").onPrimary).toBe(ON_PRIMARY_LIGHT);
  });
});

/**
 * `--color-primary` is not only a fill. It is the colour of every link, every
 * active label and every brand-coloured caption in the app, all on white. A
 * school picking a mid-green gets 4.18:1 there and fails AA on every page at
 * once, with no way of knowing — the colour looks perfectly good.
 */
describe("keeping the school's colour readable as text", () => {
  it("leaves a colour that already passes exactly as it was typed", () => {
    expect(readableAsText("#1B4F72")).toBe("#1B4F72");
    expect(readableAsText("#000000")).toBe("#000000");
  });

  // The real case: the green this school chose.
  it("darkens a colour that falls just short", () => {
    const readable = readableAsText("#2A8D50");
    expect(readable).not.toBe("#2A8D50");
    expect(contrastRatio(readable, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  it("brings even the brightest colours up to the mark", () => {
    for (const hex of ["#F1C40F", "#2ECC71", "#FFFFFF", "#F39C12", "#1ABC9C"]) {
      expect(contrastRatio(readableAsText(hex), "#FFFFFF")).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it("hands back anything it cannot read rather than mangling it", () => {
    expect(readableAsText("not-a-colour")).toBe("not-a-colour");
  });

  /**
   * The whole palette is built on the readable form, so a school whose colour
   * had to be adjusted still gets a set that agrees with itself.
   */
  it("builds the rest of the palette on the readable colour", () => {
    const palette = brandPalette("#2A8D50");
    expect(contrastRatio(palette.primary, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(palette.primaryLight).not.toBe(palette.primary);
    expect(palette.primaryDark).not.toBe(palette.primary);
  });
});
