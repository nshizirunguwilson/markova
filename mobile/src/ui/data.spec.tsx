import { Text as RNText } from 'react-native';
import { fireEvent } from '@testing-library/react-native';

import { defaultTheme } from '@/design/theme';
import { touch } from '@/design/tokens';
import {
  pressableCount,
  renderScreen,
  resetHarness,
  styleOf,
} from '@/test/harness';

import { Fact, Meter, Segmented, Stat, StatRow } from './data';

/**
 * The pieces that show numbers, which is most of what this app is.
 */

beforeEach(resetHarness);

describe('one figure and what it is', () => {
  it('leads with the number', async () => {
    const screen = await renderScreen(<Stat value="94%" label="Attendance" />);

    expect(screen.getByText('94%')).toBeTruthy();
    expect(screen.getByText('Attendance')).toBeTruthy();
  });

  it('takes a figure as readily as a string', async () => {
    const screen = await renderScreen(<Stat value={412} label="Students" />);

    expect(screen.getByText('412')).toBeTruthy();
  });

  // The number changes in place on a dashboard that refreshes. Tabular figures
  // stop the label under it from shifting sideways each time.
  it('lines the figure up so it can change without the layout moving', async () => {
    const screen = await renderScreen(<Stat value="94%" label="Attendance" />);

    expect(styleOf(screen.getByText('94%')).fontVariant).toEqual([
      'tabular-nums',
    ]);
  });

  it('gives the number the display size and the label a quiet one', async () => {
    const screen = await renderScreen(<Stat value="94%" label="Attendance" />);

    expect(styleOf(screen.getByText('94%')).fontSize).toBeGreaterThan(
      styleOf(screen.getByText('Attendance')).fontSize,
    );
  });

  it('adds a third line of context when there is one', async () => {
    const screen = await renderScreen(
      <Stat value="94%" label="Attendance" detail="Up 2 since last term" />,
    );

    expect(screen.getByText('Up 2 since last term')).toBeTruthy();
  });

  it.each([
    ['positive', defaultTheme.status.positive.text],
    ['caution', defaultTheme.status.caution.text],
    ['critical', defaultTheme.status.critical.text],
    ['brand', defaultTheme.brand.text],
  ])('colours the figure %s when it means that', async (tone, expected) => {
    const screen = await renderScreen(
      <Stat value="94%" label="Attendance" tone={tone as 'positive'} />,
    );

    expect(styleOf(screen.getByText('94%')).color).toBe(expected);
  });

  it('is not pressable unless it leads somewhere', async () => {
    const screen = await renderScreen(<Stat value="94%" label="Attendance" />);

    expect(pressableCount(screen)).toBe(0);
  });

  it('opens the detail behind it when it does', async () => {
    const onPress = jest.fn();
    const screen = await renderScreen(
      <Stat value="94%" label="Attendance" onPress={onPress} />,
    );

    expect(pressableCount(screen)).toBe(1);
    await fireEvent.press(screen.getByText('94%'));
    expect(onPress).toHaveBeenCalled();
  });

  // Separated by space rather than by boxes: a row of four bordered cards is
  // four objects competing, where four numbers is one comparison.
  it('sits beside its neighbours with space between, not boxes', async () => {
    const screen = await renderScreen(
      <StatRow>
        <Stat value="94%" label="Attendance" />
        <Stat value="412" label="Students" />
      </StatRow>,
    );

    expect(screen.getByText('94%')).toBeTruthy();
    expect(screen.getByText('412')).toBeTruthy();
  });
});

/**
 * A proportion drawn as a bar rather than a ring, because these are all read
 * against a threshold and a bar makes "past halfway" legible at a glance.
 */
describe('a proportion', () => {
  const barOf = (screen: { getByRole: (r: string) => never }) =>
    (screen.getByRole('progressbar') as { children: { props: { style: never } }[] })
      .children[0];

  it('fills to the share it represents', async () => {
    const screen = await renderScreen(<Meter value={75} />);

    expect(styleOf(barOf(screen as never)).width).toBe('75%');
  });

  it('reads the share against a maximum that is not a hundred', async () => {
    const screen = await renderScreen(<Meter value={5} max={20} />);

    expect(styleOf(barOf(screen as never)).width).toBe('25%');
    expect(screen.getByText('25%')).toBeTruthy();
  });

  // A conduct score can go negative and a completion count can overshoot. The
  // bar has to stay inside its own track either way.
  it('does not run past its own track', async () => {
    const over = await renderScreen(<Meter value={150} />);
    expect(styleOf(barOf(over as never)).width).toBe('100%');

    const under = await renderScreen(<Meter value={-20} />);
    expect(styleOf(barOf(under as never)).width).toBe('0%');
  });

  it('shows nothing rather than dividing by nothing', async () => {
    const screen = await renderScreen(<Meter value={5} max={0} />);

    expect(styleOf(barOf(screen as never)).width).toBe('0%');
  });

  it('says the share out loud as well as drawing it', async () => {
    const screen = await renderScreen(<Meter value={75} />);

    expect(screen.getByText('75%')).toBeTruthy();
  });

  it('can be drawn without its figure', async () => {
    const screen = await renderScreen(<Meter value={75} showValue={false} />);

    expect(screen.queryByText('75%')).toBeNull();
  });

  it('carries a label when it needs one', async () => {
    const screen = await renderScreen(<Meter value={75} label="Marks entered" />);

    expect(screen.getByText('Marks entered')).toBeTruthy();
  });

  it('tells a screen reader where it stands', async () => {
    const screen = await renderScreen(<Meter value={75} max={100} />);

    expect(
      screen.getByRole('progressbar').props.accessibilityValue,
    ).toEqual({ min: 0, max: 100, now: 75 });
  });

  it('wears the school colour unless the number means something', async () => {
    const brand = await renderScreen(<Meter value={75} />);
    expect(styleOf(barOf(brand as never)).backgroundColor).toBe(
      defaultTheme.brand.solid,
    );

    const bad = await renderScreen(<Meter value={20} tone="critical" />);
    expect(styleOf(barOf(bad as never)).backgroundColor).toBe(
      defaultTheme.status.critical.solid,
    );
  });
});

/**
 * Switching between views of the same thing. Selection is the brand tint,
 * which is the one place in the whole system where a filled background means
 * "this one".
 */
describe('picking between views of the same thing', () => {
  const terms = [
    { value: 'term-1', label: 'Term 1' },
    { value: 'term-2', label: 'Term 2' },
    { value: 'term-3', label: 'Term 3' },
  ];

  it('offers every option', async () => {
    const screen = await renderScreen(
      <Segmented options={terms} value="term-1" onChange={jest.fn()} />,
    );

    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('switches when one is pressed', async () => {
    const onChange = jest.fn();
    const screen = await renderScreen(
      <Segmented options={terms} value="term-1" onChange={onChange} />,
    );

    await fireEvent.press(screen.getByText('Term 2'));

    expect(onChange).toHaveBeenCalledWith('term-2');
  });

  it('fills the one that is chosen with the school colour', async () => {
    const screen = await renderScreen(
      <Segmented options={terms} value="term-2" onChange={jest.fn()} />,
    );
    const [first, second] = screen.getAllByRole('tab');

    expect(styleOf(second).backgroundColor).toBe(defaultTheme.brand.tint);
    expect(styleOf(first).backgroundColor).toBe('transparent');
  });

  it('says which one is chosen out loud', async () => {
    const screen = await renderScreen(
      <Segmented options={terms} value="term-2" onChange={jest.fn()} />,
    );
    const [, second] = screen.getAllByRole('tab');

    expect(second.props.accessibilityState).toMatchObject({ selected: true });
  });

  it('keeps every option big enough to hit', async () => {
    const screen = await renderScreen(
      <Segmented options={terms} value="term-1" onChange={jest.fn()} />,
    );

    for (const tab of screen.getAllByRole('tab')) {
      expect(styleOf(tab).minHeight).toBeGreaterThanOrEqual(touch.min);
    }
  });

  // A school with three terms across four years cannot be a fixed row.
  it('copes with more options than fit on a phone', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      value: `t${i}`,
      label: `Term ${i}`,
    }));
    const screen = await renderScreen(
      <Segmented options={many} value="t0" onChange={jest.fn()} />,
    );

    expect(screen.getAllByRole('tab')).toHaveLength(12);
  });

  it('shows nothing where there is nothing to pick between', async () => {
    const screen = await renderScreen(
      <Segmented options={[]} value="" onChange={jest.fn()} />,
    );

    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });
});

/**
 * A labelled fact on a detail screen. This is what a record looks like on
 * paper and it is what it should look like here.
 */
describe('a labelled fact', () => {
  it('puts the label on the left and the value on the right', async () => {
    const screen = await renderScreen(
      <Fact label="Class" value="Senior 3 A" />,
    );

    expect(screen.getByText('Class')).toBeTruthy();
    expect(styleOf(screen.getByText('Senior 3 A')).textAlign).toBe('right');
  });

  it('takes a figure as readily as a string', async () => {
    const screen = await renderScreen(<Fact label="Age" value={14} />);

    expect(screen.getByText('14')).toBeTruthy();
  });

  // A student ID is read character by character off a card, so it gets the
  // mono face rather than the tabular figures a number gets.
  it('sets a machine code in mono rather than lining it up', async () => {
    const screen = await renderScreen(
      <Fact label="Student ID" value="STD-2025-0417" mono />,
    );
    const style = styleOf(screen.getByText('STD-2025-0417'));

    expect(style.fontFamily).toContain('JetBrains');
    expect(style.fontVariant).toBeUndefined();
  });

  it('lets it be copied, since somebody will need to quote it', async () => {
    const screen = await renderScreen(
      <Fact label="Student ID" value="STD-2025-0417" mono />,
    );

    expect(screen.getByText('STD-2025-0417').props.selectable).toBe(true);
  });

  it('leaves a badge on the right exactly as it was given', async () => {
    const screen = await renderScreen(
      <Fact label="Status" value={<RNText>ACTIVE</RNText>} />,
    );

    expect(screen.getByText('ACTIVE')).toBeTruthy();
  });

  it('draws a hairline under itself, except on the last one', async () => {
    const middle = await renderScreen(<Fact label="Class" value="S3 A" />);
    expect(styleOf(middle.getByText('Class').parent!).borderBottomWidth).toBe(1);

    const last = await renderScreen(<Fact label="Class" value="S3 A" last />);
    expect(styleOf(last.getByText('Class').parent!).borderBottomWidth).toBe(0);
  });
});
