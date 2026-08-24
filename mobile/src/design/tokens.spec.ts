import { contrast, hexToOklch, MIN_LC } from './color';
import {
  curve,
  depth,
  font,
  gutter,
  hairline,
  neutral,
  radius,
  space,
  status,
  tabular,
  touch,
  type,
} from './tokens';
import { brandDefault, fontFamily, monoFont, sansFont } from './generated';

/**
 * The fixed half of the design system.
 *
 * These numbers are decided once and never change per school, which makes
 * them exactly the kind of thing that quietly drifts. Each test below is a
 * claim the docs make about the system, checked against the values.
 */

describe('the type scale', () => {
  const styles = Object.entries(type);

  // 12pt is the floor. Anything smaller is unreadable on a phone held at
  // arm's length in a corridor, which is where this app gets used.
  it.each(styles)('sets %s at 12pt or above', (_name, style) => {
    expect(style.fontSize).toBeGreaterThanOrEqual(12);
  });

  it.each(styles)('gives %s a line taller than its letters', (_name, style) => {
    expect(style.lineHeight).toBeGreaterThan(style.fontSize);
  });

  it.each(styles)('sets %s in a family the app actually bundles', (_name, style) => {
    const bundled = [
      ...Object.values(sansFont),
      ...Object.values(monoFont),
    ];
    expect(bundled).toContain(style.fontFamily);
  });

  it('anchors reading size on 16', () => {
    expect(type.body.fontSize).toBe(16);
  });

  it('steps down without repeating a size between the reading styles', () => {
    const reading = [
      type.body.fontSize,
      type.callout.fontSize,
      type.subhead.fontSize,
      type.footnote.fontSize,
      type.caption.fontSize,
    ];
    expect(reading).toEqual([...reading].sort((a, b) => b - a));
    expect(new Set(reading).size).toBe(reading.length);
  });

  it('steps down from display to body without repeating a size', () => {
    const headings = [
      type.display.fontSize,
      type.title1.fontSize,
      type.title2.fontSize,
      type.title3.fontSize,
      type.body.fontSize,
    ];
    expect(headings).toEqual([...headings].sort((a, b) => b - a));
    expect(new Set(headings).size).toBe(headings.length);
  });

  /**
   * Tracking follows the shape of optical compensation: tight at display
   * sizes where letters drift apart, open at the small end where they crowd.
   */
  it('tightens the large sizes and opens the small ones', () => {
    expect(type.display.letterSpacing).toBeLessThan(0);
    expect(type.body.letterSpacing).toBe(0);
    expect(type.caption.letterSpacing).toBeGreaterThan(0);
  });

  it('sets machine codes in the mono family, never the interface one', () => {
    expect(type.code.fontFamily).toBe(font.mono.regular);
    expect(type.codeSmall.fontFamily).toBe(font.mono.regular);
  });

  it('lines figures up in a column where they have to', () => {
    expect(tabular.fontVariant).toEqual(['tabular-nums']);
  });
});

/**
 * Twelve neutrals, each with one job. The order is the whole point: if two
 * steps swap places, a border becomes lighter than the hairline above it and
 * the layout stops making sense.
 */
describe('the neutral ramp', () => {
  const steps = Object.keys(neutral).map(Number).sort((a, b) => a - b);

  it('has twelve steps', () => {
    expect(steps).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('gets darker at every single step', () => {
    const lightness = steps.map((s) => hexToOklch(neutral[s as 1]).l);

    for (let i = 1; i < lightness.length; i++) {
      expect(lightness[i]).toBeLessThan(lightness[i - 1]);
    }
  });

  it('reads as paper rather than as a screen', () => {
    for (const step of steps) {
      const { c } = hexToOklch(neutral[step as 1]);
      expect(c).toBeGreaterThan(0);
      expect(c).toBeLessThan(0.02);
    }
  });

  it('carries primary text on the page', () => {
    expect(Math.abs(contrast(neutral[12], neutral[1]))).toBeGreaterThanOrEqual(
      MIN_LC.body,
    );
  });

  it('carries secondary text on the page', () => {
    expect(Math.abs(contrast(neutral[11], neutral[1]))).toBeGreaterThanOrEqual(
      MIN_LC.secondary,
    );
  });

  // The placeholder step is documented as sitting exactly on the floor for
  // secondary text. It is the tightest claim in the file.
  it('puts the placeholder step on the secondary floor and no lower', () => {
    expect(Math.abs(contrast(neutral[9], neutral[1]))).toBeGreaterThanOrEqual(
      MIN_LC.secondary,
    );
  });

  it('keeps secondary text readable on a pressed fill too', () => {
    expect(Math.abs(contrast(neutral[11], neutral[4]))).toBeGreaterThanOrEqual(
      MIN_LC.secondary,
    );
  });

  it('draws the hairline quietly but visibly', () => {
    const lc = Math.abs(contrast(neutral[6], neutral[1]));
    expect(lc).toBeGreaterThanOrEqual(MIN_LC.divider);
    expect(lc).toBeLessThan(MIN_LC.body);
  });

  it('is not black at the dark end, because black on paper is a glare', () => {
    expect(hexToOklch(neutral[12]).l).toBeGreaterThan(0.15);
  });
});

/**
 * Status colours are fixed and deliberately separate from the brand. A school
 * whose colour is red must not end up with danger and identity as one signal.
 */
describe('the status colours', () => {
  const roles = Object.entries(status);

  it('covers the four things the app has to say', () => {
    expect(Object.keys(status).sort()).toEqual([
      'caution',
      'critical',
      'info',
      'positive',
    ]);
  });

  it.each(roles)('gives %s text that carries on its own tint', (_name, role) => {
    expect(Math.abs(contrast(role.text, role.tint))).toBeGreaterThanOrEqual(
      MIN_LC.body,
    );
  });

  it.each(roles)('gives %s text that carries on the page too', (_name, role) => {
    expect(Math.abs(contrast(role.text, neutral[1]))).toBeGreaterThanOrEqual(
      MIN_LC.body,
    );
  });

  // The solid is documented as being placed exactly where white stops passing
  // on top of it. Measured, not chosen.
  it.each(roles)('gives %s a solid that carries white', (_name, role) => {
    expect(Math.abs(contrast('#FFFFFF', role.solid))).toBeGreaterThanOrEqual(
      MIN_LC.body,
    );
  });

  it.each(roles)('gives %s a tint pale enough to be a background', (_name, role) => {
    expect(hexToOklch(role.tint).l).toBeGreaterThan(0.9);
  });

  it('gives each role a hue of its own', () => {
    const hues = roles.map(([, role]) => Math.round(hexToOklch(role.solid).h));
    expect(new Set(hues).size).toBe(hues.length);
  });
});

describe('space and shape', () => {
  it('keeps a four point rhythm', () => {
    for (const value of Object.values(space)) {
      expect(value % 4).toBe(0);
    }
  });

  it('is a scale rather than a licence to nudge', () => {
    const values = Object.values(space);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(values.length);
    expect(values).toHaveLength(8);
  });

  // Whitespace is what this design is made of, so the gutter is wider than
  // the 16 both platforms default to.
  it('sets a gutter wider than the platform default', () => {
    expect(gutter).toBe(space.xl);
    expect(gutter).toBeGreaterThan(16);
  });

  it('offers three radii and a pill, in order', () => {
    expect(radius.sm).toBeLessThan(radius.md);
    expect(radius.md).toBeLessThan(radius.lg);
    expect(radius.full).toBeGreaterThan(radius.lg * 10);
  });

  it('rounds the way both platforms actually round', () => {
    expect(curve.borderCurve).toBe('continuous');
  });

  it('draws a hairline one point thick in the quietest neutral', () => {
    expect(hairline.borderBottomWidth).toBe(1);
    expect(hairline.borderBottomColor).toBe(neutral[6]);
  });

  // A shadow under everything flattens hierarchy by giving it all the same
  // importance. Only two things in the app are allowed one.
  it('reserves shadow for surfaces that float', () => {
    expect(depth.none).toBeUndefined();
    expect(Object.keys(depth)).toEqual(['none', 'lifted', 'sheet']);
    expect(depth.lifted.boxShadow).toContain('rgba');
    expect(depth.sheet.boxShadow).toContain('rgba');
  });
});

/**
 * WCAG 2.2 puts the AA floor at 24 and AAA at 44. This app is used one-handed
 * in a corridor by somebody holding a register, so it takes the higher number
 * as its minimum rather than its target.
 */
describe('what a finger has to hit', () => {
  it('takes the strictest target size as the floor', () => {
    expect(touch.min).toBeGreaterThanOrEqual(44);
  });

  it('offers a roomier size for the things people reach for most', () => {
    expect(touch.comfortable).toBeGreaterThan(touch.min);
  });

  it('grows the tap area of a small glyph without changing how it looks', () => {
    expect(touch.slop).toEqual({
      top: 12,
      bottom: 12,
      left: 12,
      right: 12,
    });
  });
});

/**
 * These come from design/tokens.json, which web reads too, so the two clients
 * cannot drift onto different typefaces or a different default colour.
 */
describe('what is shared with the web client', () => {
  it('names the two families both clients load', () => {
    expect(fontFamily).toEqual({ sans: 'Poppins', mono: 'JetBrains Mono' });
  });

  it('bundles three sans weights and two mono, and no more', () => {
    expect(Object.keys(sansFont)).toHaveLength(3);
    expect(Object.keys(monoFont)).toHaveLength(2);
  });

  it('exposes them under the names the token file uses', () => {
    expect(font.sans).toBe(sansFont);
    expect(font.mono).toBe(monoFont);
  });

  it('has a house colour to fall back on before a school loads', () => {
    expect(brandDefault).toMatch(/^#[0-9A-F]{6}$/);
  });
});
