import { Text as RNText } from 'react-native';

import { defaultTheme } from '@/design/theme';
import { gutter } from '@/design/tokens';
import { renderScreen, resetHarness, styleOf } from '@/test/harness';

import { Screen, Section } from './screen';

/**
 * The page every screen in the app starts with. It exists so the gutter, the
 * safe area and the scroll behaviour are decided once rather than sixty-three
 * times.
 */

// The ScrollView is the only host node carrying the content container style.
const scrollBody = (screen: { container: unknown }) => {
  const found: Record<string, never>[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const n = node as { props?: Record<string, never>; children?: unknown[] };
    if (n.props?.contentContainerStyle) found.push(n.props);
    for (const child of n.children ?? []) walk(child);
  };
  walk(screen.container);
  return found[0];
};

const contentStyle = (screen: { container: unknown }) =>
  Object.assign(
    {},
    ...[scrollBody(screen)?.contentContainerStyle].flat(Infinity).filter(Boolean),
  ) as Record<string, number>;

beforeEach(resetHarness);

describe('the page', () => {
  it('shows what it was given', async () => {
    const screen = await renderScreen(
      <Screen>
        <RNText>Attendance</RNText>
      </Screen>,
    );

    expect(screen.getByText('Attendance')).toBeTruthy();
  });

  it('paints the page colour behind everything', async () => {
    const screen = await renderScreen(
      <Screen>
        <RNText>Attendance</RNText>
      </Screen>,
    );

    expect(JSON.stringify(screen.toJSON())).toContain(
      `"backgroundColor":"${defaultTheme.bg.page}"`,
    );
  });

  it('insets its content to the gutter', async () => {
    const screen = await renderScreen(
      <Screen>
        <RNText>Attendance</RNText>
      </Screen>,
    );

    expect(contentStyle(screen).paddingHorizontal).toBe(gutter);
  });

  // Full-bleed rows and hairlines have to reach the edges, so a screen made of
  // rows turns the gutter off and insets each row instead.
  it('runs to the edges when the rows do their own insetting', async () => {
    const screen = await renderScreen(
      <Screen bleed>
        <RNText>Attendance</RNText>
      </Screen>,
    );

    expect(contentStyle(screen).paddingHorizontal).toBe(0);
  });

  it('leaves room under the last thing on it', async () => {
    const screen = await renderScreen(
      <Screen>
        <RNText>Attendance</RNText>
      </Screen>,
    );

    expect(contentStyle(screen).paddingBottom).toBeGreaterThan(
      contentStyle(screen).paddingTop,
    );
  });

  it('lets a screen add to the padding without replacing it', async () => {
    const screen = await renderScreen(
      <Screen contentContainerStyle={{ gap: 4 }}>
        <RNText>Attendance</RNText>
      </Screen>,
    );

    expect(contentStyle(screen).gap).toBe(4);
    expect(contentStyle(screen).paddingHorizontal).toBe(gutter);
  });

  /**
   * A form has to stay open when a finger lands on a button behind the
   * keyboard, rather than dismissing the keyboard and swallowing the tap.
   */
  it('keeps taps working while the keyboard is up', async () => {
    const screen = await renderScreen(
      <Screen>
        <RNText>Attendance</RNText>
      </Screen>,
    );

    expect(scrollBody(screen)?.keyboardShouldPersistTaps).toBe('handled');
  });

  it('lets the platform work out the insets rather than adding them up', async () => {
    const screen = await renderScreen(
      <Screen>
        <RNText>Attendance</RNText>
      </Screen>,
    );

    expect(scrollBody(screen)?.contentInsetAdjustmentBehavior).toBe('automatic');
  });

  it('offers no pull to refresh unless there is something to refresh', async () => {
    const screen = await renderScreen(
      <Screen>
        <RNText>Attendance</RNText>
      </Screen>,
    );

    expect(scrollBody(screen)?.refreshControl).toBeUndefined();
  });

  it('pulls to refresh when the screen can reload', async () => {
    const onRefresh = jest.fn();
    const screen = await renderScreen(
      <Screen onRefresh={onRefresh} refreshing>
        <RNText>Attendance</RNText>
      </Screen>,
    );
    const control = scrollBody(screen)?.refreshControl as {
      props: { refreshing: boolean; onRefresh: () => void };
    };

    expect(control.props.refreshing).toBe(true);
    control.props.onRefresh();
    expect(onRefresh).toHaveBeenCalled();
  });

  // A screen that manages its own list scrolls that list, not the page. Two
  // nested scroll views is how a list stops reaching its own end.
  it('does not scroll when the screen owns its own list', async () => {
    const screen = await renderScreen(
      <Screen scroll={false}>
        <RNText>Attendance</RNText>
      </Screen>,
    );

    expect(scrollBody(screen)).toBeUndefined();
    expect(screen.getByText('Attendance')).toBeTruthy();
  });

  it('keeps a footer outside the scrolling part', async () => {
    const screen = await renderScreen(
      <Screen footer={<RNText>Save</RNText>}>
        <RNText>Attendance</RNText>
      </Screen>,
    );

    expect(screen.getByText('Save')).toBeTruthy();
  });
});

/**
 * The section label is the only place caps and wide tracking appear in the
 * whole system. Making it the single exception is what keeps it readable as a
 * label rather than as shouting.
 */
describe('a labelled group', () => {
  it('sets its label small, quiet and in caps', async () => {
    const screen = await renderScreen(
      <Section title="This week">
        <RNText>Monday</RNText>
      </Section>,
    );
    const label = styleOf(screen.getByText('This week'));

    expect(label.textTransform).toBe('uppercase');
    expect(label.color).toBe(defaultTheme.fg.tertiary);
    expect(label.fontSize).toBe(12);
  });

  it('shows what it groups', async () => {
    const screen = await renderScreen(
      <Section title="This week">
        <RNText>Monday</RNText>
      </Section>,
    );

    expect(screen.getByText('Monday')).toBeTruthy();
  });

  it('can carry an action beside the label', async () => {
    const screen = await renderScreen(
      <Section title="This week" action={<RNText>See all</RNText>}>
        <RNText>Monday</RNText>
      </Section>,
    );

    expect(screen.getByText('See all')).toBeTruthy();
  });

  it('can carry an action with no label at all', async () => {
    const screen = await renderScreen(
      <Section action={<RNText>See all</RNText>}>
        <RNText>Monday</RNText>
      </Section>,
    );

    expect(screen.getByText('See all')).toBeTruthy();
  });

  it('draws no header when it has neither', async () => {
    const screen = await renderScreen(
      <Section>
        <RNText>Monday</RNText>
      </Section>,
    );

    expect(screen.queryByText('undefined')).toBeNull();
    expect(screen.getByText('Monday')).toBeTruthy();
  });

  it('can be told how much air to leave between its children', async () => {
    const screen = await renderScreen(
      <Section gap={40}>
        <RNText>Monday</RNText>
      </Section>,
    );

    expect(styleOf(screen.getByText('Monday').parent!).gap).toBe(40);
  });
});
