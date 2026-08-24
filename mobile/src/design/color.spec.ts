import {
  MIN_LC,
  atLightness,
  contrast,
  hexToOklch,
  hexToRgb,
  identityColors,
  oklch,
  oklchToHex,
  rgbToHex,
} from './color';

/**
 * The colour maths the whole design system rests on.
 *
 * A school picks its own brand colour and the app has to stay readable
 * whatever they pick. That is only possible if these two things are correct:
 * a round trip through OKLCH gives back the colour you started with, and
 * contrast is measured the way an eye actually perceives it.
 */

describe('reading a colour a school typed in', () => {
  it('reads the long form', () => {
    expect(hexToRgb('#FF8000')).toEqual([1, 128 / 255, 0]);
  });

  it('reads the short form as the same colour', () => {
    expect(hexToRgb('#F80')).toEqual(hexToRgb('#FF8800'));
  });

  it('does not mind a missing hash or stray spaces', () => {
    expect(hexToRgb('  ff8000 ')).toEqual(hexToRgb('#FF8000'));
  });

  it('writes one back in the same form', () => {
    expect(rgbToHex(1, 128 / 255, 0)).toBe('#ff8000');
  });

  // A derivation can land just outside the displayable range. Clamping keeps
  // it a colour instead of turning it into "#NaNNaNNaN".
  it('pins a value that fell outside what a screen can show', () => {
    expect(rgbToHex(-0.5, 0.5, 1.5)).toBe('#0080ff');
  });
});

describe('the trip through perceptual space and back', () => {
  it.each([
    '#000000',
    '#FFFFFF',
    '#1B4F72',
    '#E74C3C',
    '#2ECC71',
    '#F1C40F',
    '#8E44AD',
  ])('gives back %s unchanged', (hex) => {
    expect(oklchToHex(hexToOklch(hex))).toBe(hex.toLowerCase());
  });

  it('puts black at the bottom of the lightness range and white at the top', () => {
    expect(hexToOklch('#000000').l).toBeCloseTo(0, 3);
    expect(hexToOklch('#FFFFFF').l).toBeCloseTo(1, 3);
  });

  it('gives grey no colour at all', () => {
    expect(hexToOklch('#808080').c).toBeCloseTo(0, 3);
  });

  it('reports hue as a bearing on a circle, never negative', () => {
    for (const hex of ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#00FFFF']) {
      const { h } = hexToOklch(hex);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });

  /**
   * A screen cannot show every colour OKLCH can name. Rather than clip the
   * channels, which visibly shifts the hue, chroma is walked down until the
   * colour fits. The step keeps its place in the ramp; it just gets duller.
   */
  it('keeps the hue when a colour is too vivid for the screen', () => {
    const impossible = { l: 0.5, c: 0.4, h: 140 };
    const rendered = hexToOklch(oklchToHex(impossible));

    expect(rendered.h).toBeCloseTo(140, 0);
    expect(rendered.c).toBeLessThan(0.4);
  });

  it('handles a colour asked for with no chroma to walk down', () => {
    expect(oklchToHex({ l: 0.5, c: 0, h: 200 })).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('has a shorthand that means the same thing', () => {
    expect(oklch(0.5, 0.1, 200)).toBe(oklchToHex({ l: 0.5, c: 0.1, h: 200 }));
  });
});

/**
 * APCA, not the old luminance ratio. Positive means dark text on light, and
 * negative the reverse, so the sign carries which way round the pair is.
 */
describe('measuring what a reader can actually see', () => {
  it('scores black on white as high as the scale goes', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeGreaterThan(100);
  });

  it('scores white on black just as strongly, the other way round', () => {
    expect(contrast('#FFFFFF', '#000000')).toBeLessThan(-100);
  });

  it('scores a colour on itself as nothing', () => {
    expect(contrast('#1B4F72', '#1B4F72')).toBe(0);
  });

  it('reports a pair too close to distinguish as nothing, not as a little', () => {
    expect(contrast('#FEFEFE', '#FFFFFF')).toBe(0);
    expect(contrast('#FFFFFF', '#FEFEFE')).toBe(0);
  });

  it('grows as the two colours move apart', () => {
    const near = contrast('#767676', '#FFFFFF');
    const far = contrast('#333333', '#FFFFFF');

    expect(far).toBeGreaterThan(near);
  });

  // The thresholds the rest of the system checks against. Body copy is the
  // strictest, a divider the loosest, and they have to stay in that order.
  it('holds its thresholds in a sensible order', () => {
    expect(MIN_LC.body).toBeGreaterThan(MIN_LC.secondary);
    expect(MIN_LC.secondary).toBeGreaterThanOrEqual(MIN_LC.large);
    expect(MIN_LC.large).toBeGreaterThan(MIN_LC.nonText);
    expect(MIN_LC.nonText).toBeGreaterThan(MIN_LC.divider);
  });
});

describe('darkening a colour without changing what it is', () => {
  it('moves the lightness where it was asked to', () => {
    expect(hexToOklch(atLightness('#E74C3C', 0.3)).l).toBeCloseTo(0.3, 2);
  });

  it('keeps the hue the school chose', () => {
    const before = hexToOklch('#E74C3C').h;
    const after = hexToOklch(atLightness('#E74C3C', 0.3)).h;

    expect(after).toBeCloseTo(before, 0);
  });

  it('can wash a colour out without moving its hue', () => {
    const washed = hexToOklch(atLightness('#E74C3C', 0.96, 0.2));

    expect(washed.c).toBeLessThan(hexToOklch('#E74C3C').c);
    // Near white there is barely any colour left to carry a hue, so a degree
    // of drift is the cost of the wash, not a bug in it.
    expect(Math.abs(washed.h - hexToOklch('#E74C3C').h)).toBeLessThan(2);
  });
});

/**
 * The colour behind somebody's initials. It is derived from their name so the
 * same person is the same colour on every screen, which is what makes a long
 * list of people scannable before it is read.
 */
describe('the colour a person gets', () => {
  it('gives the same person the same colour every time', () => {
    expect(identityColors('Aline Uwase')).toEqual(identityColors('Aline Uwase'));
  });

  it('gives two different people different colours', () => {
    expect(identityColors('Aline Uwase').bg).not.toBe(
      identityColors('Jean Habimana').bg,
    );
  });

  // A name is arbitrary, so every hue it can land on has to work. The initials
  // must be readable and the disc must separate from the page, for all of them.
  it('stays readable whatever name it is handed', () => {
    const names = Array.from({ length: 500 }, (_, i) => `Person ${i}`);

    for (const name of names) {
      const { bg, fg } = identityColors(name);
      // Initials on an avatar are large and bold, so they are held to the
      // large-text bar rather than the body-copy one.
      expect(Math.abs(contrast(fg, bg))).toBeGreaterThanOrEqual(MIN_LC.large);
      expect(Math.abs(contrast(bg, '#FFFFFF'))).toBeGreaterThanOrEqual(
        MIN_LC.divider,
      );
    }
  });

  it('copes with an empty name rather than throwing', () => {
    const { bg, fg } = identityColors('');

    expect(bg).toMatch(/^#[0-9a-f]{6}$/);
    expect(fg).toMatch(/^#[0-9a-f]{6}$/);
  });
});
