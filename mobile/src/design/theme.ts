import { atLightness, contrast, hexToOklch, oklchToHex, MIN_LC } from './color';
import { neutral, status } from './tokens';

/**
 * The half of the system that is not ours to decide.
 *
 * Every school sets its own primary_color through school-config, and the app
 * has to stay legible whatever they choose. A school that picks a yellow gets
 * white-on-brand at Lc 33, which is less than half of what a button label
 * needs, so the brand colour cannot be used raw and cannot be assumed to take
 * white text.
 *
 * Nothing here trusts the input. Each role is derived and then checked, and
 * where a derivation cannot reach the contrast the role requires, it is walked
 * until it does. Hue is always preserved, because the hue is the part the
 * school actually chose.
 */

export type Brand = {
  /** Exactly what the school configured. Decorative use only, never behind text. */
  raw: string;
  /** A filled, pressable surface. Guaranteed to carry onSolid at body size. */
  solid: string;
  /** The same, pressed. */
  solidPressed: string;
  /** What goes on top of solid. Proven, not assumed. */
  onSolid: string;
  /** Brand-coloured text and icons on the page. Proven at body size. */
  text: string;
  /** A quiet wash behind a selected row or an informational block. */
  tint: string;
  /** The edge of a selected control. */
  border: string;
};

const passes = (text: string, bg: string, min: number) => Math.abs(contrast(text, bg)) >= min;

/**
 * Walk lightness in one direction until the pair carries, holding hue and
 * chroma. Returns the last value tried if the target is unreachable, which
 * only happens for inputs that are already at the end of the ramp.
 */
function darkenUntil(hex: string, on: string, min: number, step = 0.02): string {
  const src = hexToOklch(hex);
  let l = src.l;
  for (let i = 0; i < 50 && l > 0.05; i++) {
    const candidate = oklchToHex({ l, c: src.c, h: src.h });
    if (passes(on, candidate, min)) return candidate;
    l -= step;
  }
  return oklchToHex({ l: Math.max(l, 0.05), c: src.c, h: src.h });
}

function textOn(hex: string, bg: string, min: number): string {
  const src = hexToOklch(hex);
  let l = Math.min(src.l, 0.5);
  for (let i = 0; i < 50 && l > 0.05; i++) {
    const candidate = oklchToHex({ l, c: src.c * 0.95, h: src.h });
    if (passes(candidate, bg, min)) return candidate;
    l -= 0.02;
  }
  return oklchToHex({ l: 0.2, c: src.c * 0.6, h: src.h });
}

export function deriveBrand(primaryColor: string | undefined | null): Brand {
  const raw = normaliseHex(primaryColor) ?? DEFAULT_BRAND;
  const page = neutral[1];

  // A filled control has to carry its own label. Try white first, because a
  // school picking a brand colour almost always pictures white on it, and only
  // fall back to darkening when the hue simply cannot hold it.
  const white = '#FFFFFF';
  const solid = passes(white, raw, MIN_LC.body) ? raw : darkenUntil(raw, white, MIN_LC.body);

  const src = hexToOklch(solid);

  // Brand text gets used on the page and on the tint, and the tint is the
  // darker of the two. Derive against the harder background so the one value
  // is safe in both places, rather than deriving against the page and
  // discovering later that it fails everywhere it actually gets used.
  const tint = atLightness(raw, 0.968, 0.2);

  return {
    raw,
    solid,
    solidPressed: oklchToHex({ l: Math.max(src.l - 0.06, 0.08), c: src.c, h: src.h }),
    onSolid: white,
    text: textOn(raw, tint, MIN_LC.body),
    tint,
    border: atLightness(raw, 0.85, 0.5),
  };
}

const DEFAULT_BRAND = '#1B4F72';

function normaliseHex(value: string | undefined | null): string | null {
  if (!value) return null;
  const v = value.trim();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (!m) return null;
  const body = m[1];
  const full = body.length === 3 ? body.split('').map((c) => c + c).join('') : body;
  return `#${full.toUpperCase()}`;
}

// ─── The assembled theme ────────────────────────────────────────────────────

export type Theme = {
  brand: Brand;
  /** Page and surfaces. */
  bg: { page: string; surface: string; fill: string; fillPressed: string; fillSelected: string };
  /** Ink. */
  fg: { primary: string; secondary: string; tertiary: string; placeholder: string; onSolid: string };
  /** Lines. */
  line: { hairline: string; border: string; strong: string };
  status: typeof status;
};

export function buildTheme(primaryColor?: string | null): Theme {
  const brand = deriveBrand(primaryColor);
  return {
    brand,
    bg: {
      page: neutral[1],
      surface: neutral[2],
      fill: neutral[3],
      fillPressed: neutral[4],
      // Selection is the brand tint, not a darker grey. A grey dark enough to
      // read as selected is too dark to carry secondary text, and a selected
      // row is a state a person sits in rather than passes through. Using the
      // brand here also means the thing you picked is coloured by your school.
      fillSelected: brand.tint,
    },
    fg: {
      primary: neutral[12],
      secondary: neutral[11],
      tertiary: neutral[10],
      placeholder: neutral[9],
      onSolid: '#FFFFFF',
    },
    line: {
      hairline: neutral[6],
      border: neutral[7],
      strong: neutral[8],
    },
    status,
  };
}

export const defaultTheme = buildTheme(DEFAULT_BRAND);
