/**
 * Deriving a usable palette from the one colour a school chooses.
 *
 * A school picks a single brand colour in Settings. Everything else — the
 * lighter and darker variants, and the pale washes that badges, the sidebar
 * highlight and info panels sit on — is worked out from it. That derivation
 * has to hold WCAG AA, because it is the same washes the designed navy was
 * hand-checked against (see scripts/check-contrast.mjs) and nobody re-checks
 * it when a school types in a green.
 *
 * Lives apart from BrandProvider so the contrast arithmetic can be checked on
 * its own, against colours no demo school happens to use.
 */

/** Text on a wash has to clear this. WCAG AA for normal-size text. */
export const MIN_TEXT_CONTRAST = 4.5;

/** A focus ring or a border is non-text, which AA scores at 3:1. */
export const MIN_NON_TEXT_CONTRAST = 3;

/**
 * `--color-muted`, the fixed neutral the design system uses for secondary
 * text. It is not derived from the brand colour, but it is routinely set on
 * `bg-accent-light` — every table header in the app — so the palest wash has
 * to clear AA against it as well as against the brand colour itself. The
 * designed navy wash does, at 4.68:1; a wash derived only against the brand
 * left it at 4.49:1.
 */
export const MUTED_TEXT = "#5F6E85";

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Mix a colour toward white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const t = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  return toHex(
    rgb.map((c) => Math.round((t - c) * p + c)) as [number, number, number],
  );
}

function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours, 1:1 to 21:1. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The palest tint of `hex` that the colour itself still reads on.
 *
 * A fixed mix does not work across hues: 86% toward white leaves a navy at
 * 7:1 and a mid-green at 4.2:1, which is how a school that chose green ended
 * up with badge text nobody could read. This walks the mix up until the pair
 * clears AA, so the answer is as close to the brand as the ratio allows
 * rather than as pale as the palest hue would need.
 */
export function washFor(
  hex: string,
  minRatio: number = MIN_TEXT_CONTRAST,
  start = 0.8,
): string {
  if (!parseHex(hex)) return hex;
  let candidate = shade(hex, start);
  for (let mix = start; mix <= 0.97; mix += 0.01) {
    candidate = shade(hex, mix);
    if (contrastRatio(hex, candidate) >= minRatio) return candidate;
  }
  // Nothing between here and white cleared it. White is the palest thing
  // there is, so it is the best available answer even when it falls short —
  // returning the darker candidate instead would be strictly worse.
  return contrastRatio(hex, "#ffffff") > contrastRatio(hex, candidate)
    ? "#ffffff"
    : candidate;
}

export interface BrandPalette {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  /**
   * Badge and sidebar-highlight background, and the palest surface below it.
   *
   * Null when the school's colour cannot support them: a colour that only
   * just reads on white has no room for two distinguishable tints that both
   * still hold AA. The caller then leaves the designed neutral washes in
   * place, which were hand-checked and always pass.
   */
  accent: string | null;
  accentLight: string | null;
}

/**
 * The whole palette a school's one colour implies.
 *
 * Both washes carry brand-coloured text, so both are held to the text ratio,
 * and they have to be distinguishable from each other as well — a badge sits
 * on a hovered row.
 */
export function brandPalette(hex: string): BrandPalette {
  const base = {
    primary: hex,
    primaryLight: shade(hex, 0.18),
    primaryDark: shade(hex, -0.18),
  };
  if (!parseHex(hex)) return { ...base, accent: null, accentLight: null };

  // `accentLight` starts its walk further along, which makes it the paler of
  // the two whatever the hue.
  const accent = washFor(hex, MIN_TEXT_CONTRAST, 0.78);
  let accentLight = washFor(hex, MIN_TEXT_CONTRAST, 0.9);

  // The palest wash carries `--color-muted` as well as brand-coloured text —
  // it is what every table header sits on — so keep lightening until the
  // neutral clears too.
  for (
    let mix = 0.9;
    mix <= 0.99 && contrastRatio(MUTED_TEXT, accentLight) < MIN_TEXT_CONTRAST;
    mix += 0.01
  ) {
    accentLight = shade(hex, mix);
  }

  const usable =
    accent !== accentLight &&
    contrastRatio(hex, accent) >= MIN_TEXT_CONTRAST &&
    contrastRatio(hex, accentLight) >= MIN_TEXT_CONTRAST &&
    contrastRatio(MUTED_TEXT, accentLight) >= MIN_TEXT_CONTRAST;

  return usable
    ? { ...base, accent, accentLight }
    : { ...base, accent: null, accentLight: null };
}
