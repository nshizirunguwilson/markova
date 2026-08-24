import { Text as RNText } from 'react-native';
import { fireEvent } from '@testing-library/react-native';

import { defaultTheme } from '@/design/theme';
import { touch } from '@/design/tokens';
import { hasIcon, pressableCount, renderScreen, resetHarness, styleOf } from '@/test/harness';

import { Row, RowGroup } from './row';

/**
 * A line in a list, and the most repeated element in the app by a wide
 * margin. A person, a book, a loan, a mark, a conversation, an incident.
 * Getting its rhythm right is most of what makes the app feel consistent, so
 * it takes a fixed shape and does not negotiate.
 */

// The chevron is the only icon a row ever draws, so an icon on the screen is
// the chevron.
const hasChevron = hasIcon;

beforeEach(resetHarness);

describe('what a row shows', () => {
  it('leads with its title', async () => {
    const screen = await renderScreen(<Row title="Aline Uwase" />);

    expect(screen.getByText('Aline Uwase')).toBeTruthy();
  });

  it('carries a second line under it when there is one', async () => {
    const screen = await renderScreen(
      <Row title="Aline Uwase" subtitle="Senior 3 A   ·   Mathematics" />,
    );

    expect(screen.getByText('Senior 3 A   ·   Mathematics')).toBeTruthy();
  });

  it('shows nothing where there is no second line', async () => {
    const screen = await renderScreen(<Row title="Aline Uwase" />);

    expect(screen.queryByText('undefined')).toBeNull();
  });

  it('shows what identifies it at a glance', async () => {
    const screen = await renderScreen(
      <Row title="Aline Uwase" lead={<RNText>AU</RNText>} />,
    );

    expect(screen.getByText('AU')).toBeTruthy();
  });

  // A figure on the right is a figure, so it gets tabular digits and lines up
  // down the column without anybody having to think about it.
  it('lines up a plain figure on the right', async () => {
    const screen = await renderScreen(<Row title="Mathematics" value="17.5" />);

    expect(styleOf(screen.getByText('17.5')).fontVariant).toEqual([
      'tabular-nums',
    ]);
  });

  it('lines up a number as readily as a string', async () => {
    const screen = await renderScreen(<Row title="Mathematics" value={17} />);

    expect(screen.getByText('17')).toBeTruthy();
  });

  it('leaves a badge on the right exactly as it was given', async () => {
    const screen = await renderScreen(
      <Row title="Overdue book" value={<RNText>OVERDUE</RNText>} />,
    );

    expect(screen.getByText('OVERDUE')).toBeTruthy();
  });

  it('reads in red when it removes something', async () => {
    const screen = await renderScreen(<Row title="Delete account" destructive />);

    expect(styleOf(screen.getByText('Delete account')).color).toBe(
      defaultTheme.status.critical.text,
    );
  });

  // A name that runs off the edge would push the figure on the right out of
  // the row entirely.
  it('cuts a long title rather than letting it push the figure off', async () => {
    const screen = await renderScreen(
      <Row title="Nshimiyimana Habimana Jean Baptiste" value="17.5" />,
    );

    expect(
      screen.getByText('Nshimiyimana Habimana Jean Baptiste').props.numberOfLines,
    ).toBe(1);
  });

  it('allows a second line to wrap once', async () => {
    const screen = await renderScreen(
      <Row title="Aline Uwase" subtitle="A long note about this row" />,
    );

    expect(
      screen.getByText('A long note about this row').props.numberOfLines,
    ).toBe(2);
  });
});

describe('a row you can press', () => {
  it('opens what it points at', async () => {
    const onPress = jest.fn();
    const screen = await renderScreen(<Row title="Aline Uwase" onPress={onPress} />);

    await fireEvent.press(screen.getByText('Aline Uwase'));

    expect(onPress).toHaveBeenCalled();
  });

  it('shows a chevron so it looks pressable', async () => {
    const screen = await renderScreen(<Row title="Aline Uwase" onPress={jest.fn()} />);

    expect(hasChevron(screen)).toBe(true);
  });

  // A disabled row does not render a pressable at all, so there is nothing to
  // touch rather than something that swallows the touch.
  it('cannot be pressed at all when it has been disabled', async () => {
    const screen = await renderScreen(
      <Row title="Aline Uwase" onPress={jest.fn()} disabled />,
    );

    expect(pressableCount(screen)).toBe(0);
  });

  it('is a real pressable when it is not', async () => {
    const screen = await renderScreen(<Row title="Aline Uwase" onPress={jest.fn()} />);

    expect(pressableCount(screen)).toBe(1);
  });

  it('fades when it has been disabled', async () => {
    const screen = await renderScreen(
      <Row title="Aline Uwase" onPress={jest.fn()} disabled />,
    );

    expect(styleOf(screen.getByText('Aline Uwase').parent!.parent!).opacity).toBe(
      0.45,
    );
  });

  // A chevron on a row that does nothing is a promise the row cannot keep.
  it('has no chevron when there is nowhere to go', async () => {
    const screen = await renderScreen(<Row title="A" />);

    expect(hasChevron(screen)).toBe(false);
  });

  it('can be told to keep its chevron to itself anyway', async () => {
    const screen = await renderScreen(
      <Row title="A" onPress={jest.fn()} chevron={false} />,
    );

    expect(hasChevron(screen)).toBe(false);
  });

  it('can be given one even where it does not open anything', async () => {
    const screen = await renderScreen(<Row title="A" chevron />);

    expect(hasChevron(screen)).toBe(true);
  });
});

describe('the shape a row holds to', () => {
  it('is tall enough to hit while standing up', async () => {
    const screen = await renderScreen(<Row title="Aline Uwase" />);

    expect(
      styleOf(screen.getByText('Aline Uwase').parent!.parent!).minHeight,
    ).toBeGreaterThanOrEqual(touch.min);
  });

  it('sits inside the screen gutter by default', async () => {
    const screen = await renderScreen(<Row title="Aline Uwase" />);

    expect(
      styleOf(screen.getByText('Aline Uwase').parent!.parent!).paddingHorizontal,
    ).toBeGreaterThan(0);
  });

  it('can run to the edges where a parent already inset it', async () => {
    const screen = await renderScreen(<Row title="Aline Uwase" inset={false} />);

    expect(
      styleOf(screen.getByText('Aline Uwase').parent!.parent!).paddingHorizontal,
    ).toBe(0);
  });

  /**
   * Rows are separated by a hairline rather than individually boxed. Ten cards
   * are ten competing objects; ten rows are one object with ten lines, which
   * is what a register actually is.
   */
  it('draws a hairline under itself', async () => {
    const withLine = await renderScreen(<Row title="A" />);
    const last = await renderScreen(<Row title="A" last />);

    expect(JSON.stringify(last.toJSON()).length).toBeLessThan(
      JSON.stringify(withLine.toJSON()).length,
    );
  });
});

describe('a run of rows', () => {
  it('reads as one surface rather than as a stack of cards', async () => {
    const screen = await renderScreen(
      <RowGroup>
        <Row title="Aline Uwase" />
        <Row title="Jean Habimana" last />
      </RowGroup>,
    );

    expect(screen.getByText('Aline Uwase')).toBeTruthy();
    expect(screen.getByText('Jean Habimana')).toBeTruthy();
  });

  it('is bounded above and below by a hairline and nothing else', async () => {
    const screen = await renderScreen(
      <RowGroup>
        <Row title="Aline Uwase" last />
      </RowGroup>,
    );
    const group = screen.getByText('Aline Uwase').parent!.parent!.parent!.parent!;

    expect(styleOf(group)).toMatchObject({
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: defaultTheme.line.hairline,
    });
  });
});
