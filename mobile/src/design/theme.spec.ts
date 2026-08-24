import { buildTheme, defaultTheme, deriveBrand } from './theme';
import { contrast, hexToOklch, MIN_LC } from './color';
import { neutral, status } from './tokens';

/**
 * The half of the design system a school controls.
 *
 * Every school sets its own primary colour and none of them are checked
 * against a contrast table first. A school that picks a bright yellow gets
 * white-on-brand at around Lc 33, less than half of what a button label needs.
 * So nothing here trusts the input: every role is derived and then proven.
 */

// Hues right around the circle, including the yellows and greens that are
// hardest to put white text on.
const anyBrand = [
  '#1B4F72',
  '#E74C3C',
  '#F1C40F',
  '#2ECC71',
  '#00FFFF',
  '#8E44AD',
  '#FFFFFF',
  '#000000',
];

describe('whatever colour a school picks', () => {
  it.each(anyBrand)('%s still carries a button label', (primary) => {
    const { solid, onSolid } = deriveBrand(primary);

    expect(Math.abs(contrast(onSolid, solid))).toBeGreaterThanOrEqual(
      MIN_LC.body,
    );
  });

  it.each(anyBrand)('%s still gives readable brand text', (primary) => {
    const { text, tint } = deriveBrand(primary);

    expect(Math.abs(contrast(text, tint))).toBeGreaterThanOrEqual(MIN_LC.body);
    expect(Math.abs(contrast(text, neutral[1]))).toBeGreaterThanOrEqual(
      MIN_LC.body,
    );
  });

  it.each(anyBrand)('%s keeps the hue the school chose', (primary) => {
    const { solid } = deriveBrand(primary);
    const chosen = hexToOklch(primary);
    const derived = hexToOklch(solid);

    // Grey has no hue to preserve, so there is nothing to compare.
    if (chosen.c > 0.02) {
      expect(Math.abs(derived.h - chosen.h)).toBeLessThan(3);
    }
  });

  it.each(anyBrand.filter((c) => c !== '#000000'))(
    '%s gets a pressed state darker than its resting one',
    (primary) => {
      const { solid, solidPressed } = deriveBrand(primary);

      expect(hexToOklch(solidPressed).l).toBeLessThan(hexToOklch(solid).l);
    },
  );

  /**
   * A school that picks black has nothing left to darken. The floor stops the
   * pressed state from being identical to the resting one, so the button still
   * visibly responds to a touch.
   */
  it('still shows a press on a brand that is already black', () => {
    const { solid, solidPressed } = deriveBrand('#000000');

    expect(solidPressed).not.toBe(solid);
    expect(hexToOklch(solidPressed).l).toBeGreaterThan(0);
  });

  // The tint sits behind a selected row. It has to be a wash, not a block of
  // colour, or the text sitting on it stops being readable.
  it.each(anyBrand)('%s gets a tint pale enough to sit text on', (primary) => {
    const { tint } = deriveBrand(primary);

    expect(hexToOklch(tint).l).toBeGreaterThan(0.9);
  });
});

describe('a colour that was never a colour', () => {
  it.each([
    ['nothing at all', undefined],
    ['an empty string', ''],
    ['a name rather than a value', 'ubururu'],
    ['too few digits', '#12'],
    ['too many digits', '#1234567'],
    ['digits that are not hex', '#GGGGGG'],
    ['null from a school that never set one', null],
  ])('falls back to the house colour for %s', (_label, value) => {
    expect(deriveBrand(value as never).raw).toBe(defaultTheme.brand.raw);
  });

  it('accepts a value typed without its hash', () => {
    expect(deriveBrand('1B4F72').raw).toBe('#1B4F72');
  });

  it('accepts the short form and writes it out in full', () => {
    expect(deriveBrand('#1a4').raw).toBe('#11AA44');
  });

  it('does not care about case or stray spaces', () => {
    expect(deriveBrand('  #1b4f72  ').raw).toBe('#1B4F72');
  });
});

describe('the rest of the theme, which is ours', () => {
  const theme = buildTheme('#1B4F72');

  it('puts the page and its surfaces in order of depth', () => {
    expect(theme.bg.page).toBe(neutral[1]);
    expect(theme.bg.surface).toBe(neutral[2]);
    expect(theme.bg.fill).toBe(neutral[3]);
    expect(theme.bg.fillPressed).toBe(neutral[4]);
  });

  // Selection is the school's own colour rather than a darker grey: a grey
  // dark enough to read as selected is too dark to carry secondary text.
  it('colours a selected row with the school rather than with grey', () => {
    expect(theme.bg.fillSelected).toBe(theme.brand.tint);
  });

  it('puts its three grades of ink in order of weight', () => {
    const l = (hex: string) => hexToOklch(hex).l;

    expect(l(theme.fg.primary)).toBeLessThan(l(theme.fg.secondary));
    expect(l(theme.fg.secondary)).toBeLessThan(l(theme.fg.tertiary));
    expect(l(theme.fg.tertiary)).toBeLessThan(l(theme.fg.placeholder));
  });

  it('carries body text on the page', () => {
    expect(
      Math.abs(contrast(theme.fg.primary, theme.bg.page)),
    ).toBeGreaterThanOrEqual(MIN_LC.body);
  });

  it('carries secondary text on the page too', () => {
    expect(
      Math.abs(contrast(theme.fg.secondary, theme.bg.page)),
    ).toBeGreaterThanOrEqual(MIN_LC.secondary);
  });

  it('puts its three weights of line in order', () => {
    const l = (hex: string) => hexToOklch(hex).l;

    expect(l(theme.line.hairline)).toBeGreaterThan(l(theme.line.border));
    expect(l(theme.line.border)).toBeGreaterThan(l(theme.line.strong));
  });

  it('keeps the status colours, which no school overrides', () => {
    expect(theme.status).toBe(status);
  });

  it('builds the house theme when nobody has configured one', () => {
    expect(buildTheme().brand.raw).toBe(defaultTheme.brand.raw);
  });
});
