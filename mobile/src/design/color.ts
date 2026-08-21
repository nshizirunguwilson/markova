/**
 * Colour maths for the design system.
 *
 * Two things live here and nothing else:
 *
 *   1. OKLCH conversion, so every colour in the system can be reasoned about
 *      in a perceptually uniform space. In HSL, adding lightness to blue and
 *      adding the same lightness to yellow give two different perceived
 *      results, which makes a systematic ramp impossible to build by hand.
 *      OKLCH holds perceived lightness steady across hue, so a ramp built on
 *      fixed L values reads as evenly stepped whatever hue you feed it.
 *      That matters here because the brand hue is not ours to choose: each
 *      school sets its own primary_color, and the app has to stay legible
 *      whatever they pick.
 *
 *   2. APCA, so contrast is measured the way a reader actually perceives it.
 *      WCAG 2's luminance ratio treats a hairline weight and a bold weight as
 *      identical if the colours match, and it materially overstates contrast
 *      for dark pairs. APCA reports Lc, which accounts for polarity and can be
 *      read against size and weight.
 *
 * Sources are listed in docs/mobile-design-system.md.
 */

export type Oklch = { l: number; c: number; h: number };

// ─── sRGB transfer function ─────────────────────────────────────────────────

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full.slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to255 = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0');
  return `#${to255(r)}${to255(g)}${to255(b)}`;
}

// ─── OKLab / OKLCH, after Björn Ottosson ────────────────────────────────────

function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb(L: number, A: number, B: number): [number, number, number] {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;

  return [
    toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export function hexToOklch(hex: string): Oklch {
  const [L, A, B] = rgbToOklab(...hexToRgb(hex));
  const c = Math.sqrt(A * A + B * B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

/**
 * OKLCH back to a hex the display can actually show.
 *
 * A given lightness and hue cannot always hold a given chroma inside sRGB.
 * Rather than clip the channels, which shifts the hue visibly, chroma is
 * walked down until the colour fits. Lightness and hue are preserved, which
 * is the whole point of working in this space: the step keeps its position in
 * the ramp even when the display cannot render it at full saturation.
 */
export function oklchToHex({ l, c, h }: Oklch): string {
  const rad = (h * Math.PI) / 180;
  let chroma = c;

  for (let i = 0; i < 64; i++) {
    const [r, g, b] = oklabToRgb(l, Math.cos(rad) * chroma, Math.sin(rad) * chroma);
    const inGamut = [r, g, b].every((v) => v >= -0.0001 && v <= 1.0001);
    if (inGamut || chroma <= 0) return rgbToHex(r, g, b);
    chroma -= c / 64;
  }
  const [r, g, b] = oklabToRgb(l, 0, 0);
  return rgbToHex(r, g, b);
}

export const oklch = (l: number, c: number, h: number) => oklchToHex({ l, c, h });

// ─── APCA ───────────────────────────────────────────────────────────────────

const APCA = {
  mainTRC: 2.4,
  Rco: 0.2126729,
  Gco: 0.7151522,
  Bco: 0.072175,
  normBG: 0.56,
  normTXT: 0.57,
  revTXT: 0.62,
  revBG: 0.65,
  blkThrs: 0.022,
  blkClmp: 1.414,
  deltaYmin: 0.0005,
  scaleBoW: 1.14,
  scaleWoB: 1.14,
  loConOffset: 0.027,
  loClip: 0.1,
};

function apcaY(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const y =
    APCA.Rco * r ** APCA.mainTRC + APCA.Gco * g ** APCA.mainTRC + APCA.Bco * b ** APCA.mainTRC;
  return y > APCA.blkThrs ? y : y + (APCA.blkThrs - y) ** APCA.blkClmp;
}

/**
 * Perceived lightness contrast of text on a background, as an Lc value.
 * Positive means dark text on a light background, negative the reverse.
 * The magnitude is what matters when reading it against the size and weight
 * table in the design doc.
 */
export function contrast(textHex: string, bgHex: string): number {
  const txt = apcaY(textHex);
  const bg = apcaY(bgHex);

  if (Math.abs(bg - txt) < APCA.deltaYmin) return 0;

  let sapc: number;
  let out: number;

  if (bg > txt) {
    sapc = (bg ** APCA.normBG - txt ** APCA.normTXT) * APCA.scaleBoW;
    out = sapc < APCA.loClip ? 0 : sapc - APCA.loConOffset;
  } else {
    sapc = (bg ** APCA.revBG - txt ** APCA.revTXT) * APCA.scaleWoB;
    out = sapc > -APCA.loClip ? 0 : sapc + APCA.loConOffset;
  }

  return Math.round(out * 100 * 10) / 10;
}

/**
 * The smallest Lc the design system will accept for a given role.
 * Read against APCA's own size and weight guidance: body copy at 16px/400
 * wants Lc 75 and prefers Lc 90, larger or heavier text can sit at Lc 60,
 * and anything below Lc 30 is not dependable even for solid icons.
 */
export const MIN_LC = {
  body: 75,
  secondary: 60,
  large: 60,
  nonText: 30,
  divider: 15,
} as const;

/**
 * Darken or lighten a colour to a target lightness while holding its hue.
 * Used to derive the readable text form of a brand colour a school chose
 * without regard for whether it would pass on paper white.
 */
export function atLightness(hex: string, l: number, chromaScale = 1): string {
  const src = hexToOklch(hex);
  return oklchToHex({ l, c: src.c * chromaScale, h: src.h });
}

/**
 * A stable colour pair for a person, derived from their name.
 *
 * The hue comes from a hash so the same person is the same colour everywhere
 * in the app, which makes a list of people scannable by shape before it is
 * read. Lightness and chroma are fixed rather than hashed, which is what stops
 * the set looking like confetti and guarantees the initials stay legible
 * whichever hue a name happens to land on.
 *
 * Lives here rather than beside the Avatar component so the contrast check can
 * prove it without pulling React Native into a node script.
 */
export function identityColors(seed: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  // 0.88 is not a taste decision. Sweeping all 360 hues, it is the first
  // lightness at which the disc still separates from the page for every hue,
  // including the yellows that sit closest to paper white. At 0.90 the palest
  // hues drop to Lc 14.7 and the circle disappears for some names and not
  // others, which reads as a bug rather than as a style.
  return {
    bg: oklchToHex({ l: 0.88, c: 0.06, h }),
    fg: oklchToHex({ l: 0.38, c: 0.1, h }),
  };
}
