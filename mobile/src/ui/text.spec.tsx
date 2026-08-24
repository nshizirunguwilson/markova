import { type as typeScale } from '@/design/tokens';
import { defaultTheme } from '@/design/theme';
import { renderScreen, resetHarness, styleOf } from '@/test/harness';

import { Text } from './text';

/**
 * Every word in the app goes through this. Its job is to make the type scale
 * and the ink colours the only options, so no screen can invent a fourteenth
 * size or a grey that fails on the page.
 */

beforeEach(resetHarness);

describe('setting a line of text', () => {
  it('reads as body copy unless told otherwise', async () => {
    const screen = await renderScreen(<Text>Bwakeye</Text>);

    expect(styleOf(screen.getByText('Bwakeye'))).toMatchObject(typeScale.body);
  });

  it.each(Object.keys(typeScale))('sets %s from the scale', async (variant) => {
    const screen = await renderScreen(
      <Text variant={variant as 'body'}>Bwakeye</Text>,
    );

    expect(styleOf(screen.getByText('Bwakeye'))).toMatchObject(
      typeScale[variant as 'body'],
    );
  });

  it('inks it in primary unless told otherwise', async () => {
    const screen = await renderScreen(<Text>Bwakeye</Text>);

    expect(styleOf(screen.getByText('Bwakeye')).color).toBe(
      defaultTheme.fg.primary,
    );
  });

  it.each([
    ['secondary', defaultTheme.fg.secondary],
    ['tertiary', defaultTheme.fg.tertiary],
    ['placeholder', defaultTheme.fg.placeholder],
    ['brand', defaultTheme.brand.text],
    ['onSolid', defaultTheme.fg.onSolid],
    ['positive', defaultTheme.status.positive.text],
    ['caution', defaultTheme.status.caution.text],
    ['critical', defaultTheme.status.critical.text],
  ])('inks it in %s when asked', async (tone, expected) => {
    const screen = await renderScreen(
      <Text tone={tone as 'secondary'}>Bwakeye</Text>,
    );

    expect(styleOf(screen.getByText('Bwakeye')).color).toBe(expected);
  });

  /**
   * A column of marks has to line up, and a countdown has to change without
   * the layout jumping. Tabular figures give digits a shared width, which is a
   * feature of the typeface rather than a monospace substitute.
   */
  it('lines figures up when they sit in a column', async () => {
    const screen = await renderScreen(<Text numeric>17.5</Text>);

    expect(styleOf(screen.getByText('17.5')).fontVariant).toEqual([
      'tabular-nums',
    ]);
  });

  it('leaves ordinary words alone', async () => {
    const screen = await renderScreen(<Text>Bwakeye</Text>);

    expect(styleOf(screen.getByText('Bwakeye')).fontVariant).toBeUndefined();
  });

  it('centres a line when asked', async () => {
    const screen = await renderScreen(<Text align="center">Bwakeye</Text>);

    expect(styleOf(screen.getByText('Bwakeye')).textAlign).toBe('center');
  });

  it('sets a group label in caps', async () => {
    const screen = await renderScreen(<Text caps>Attendance</Text>);

    expect(styleOf(screen.getByText('Attendance')).textTransform).toBe(
      'uppercase',
    );
  });

  it('lets a caller override a colour last', async () => {
    const screen = await renderScreen(
      <Text style={{ color: '#123456' }}>Bwakeye</Text>,
    );

    expect(styleOf(screen.getByText('Bwakeye')).color).toBe('#123456');
  });

  it('passes accessibility props through to the platform', async () => {
    const screen = await renderScreen(
      <Text accessibilityLabel="Greeting">Bwakeye</Text>,
    );

    expect(screen.getByLabelText('Greeting')).toBeTruthy();
  });
});
