import { Text as RNText, AccessibilityInfo } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { defaultTheme } from '@/design/theme';
import {
  hasIcon,
  pressableCount,
  renderScreen,
  resetHarness,
  rootStyle,
  styleOf,
} from '@/test/harness';

import { Empty, Failed, LoadingRows, Skeleton } from './state';

/**
 * The three states every list can be in besides having content.
 *
 * They live in one file because they have to agree with each other. A list
 * that shows six skeleton rows and then a centred illustration when empty
 * makes the screen jump twice.
 */

beforeEach(() => {
  resetHarness();
  jest.restoreAllMocks();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() } as never);
});

/**
 * A spinner says "wait". A skeleton says "here is what you are about to read
 * and roughly how much of it", which is the more useful thing to tell a
 * teacher deciding whether they have time to do this now.
 */
describe('waiting for a list', () => {
  it('shows a placeholder shaped like the thing that is coming', async () => {
    const screen = await renderScreen(<LoadingRows />);

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  it('shows as many rows as it was told to expect', async () => {
    const screen = await renderScreen(<LoadingRows count={3} />);

    expect(screen.getByLabelText('Loading').children).toHaveLength(3);
  });

  it('shows five when nobody said', async () => {
    const screen = await renderScreen(<LoadingRows />);

    expect(screen.getByLabelText('Loading').children).toHaveLength(5);
  });

  // Rows of identical width read as a barcode rather than as names. Varying
  // them is what makes the placeholder look like a list of people.
  it('varies the widths so it reads as a list, not a barcode', async () => {
    const screen = await renderScreen(<LoadingRows count={4} />);
    const widths = [
      ...JSON.stringify(screen.toJSON()).matchAll(/"width":"(\d+)%"/g),
    ].map((m) => m[1]);

    expect(new Set(widths).size).toBeGreaterThan(1);
  });

  it('leaves room for an avatar where the real rows have one', async () => {
    const withLead = await renderScreen(<LoadingRows count={1} lead />);
    const without = await renderScreen(<LoadingRows count={1} />);

    expect(JSON.stringify(withLead.toJSON()).length).toBeGreaterThan(
      JSON.stringify(without.toJSON()).length,
    );
  });

  it('draws a placeholder at the size it was asked for', async () => {
    const screen = await renderScreen(<Skeleton height={40} width={40} round />);

    expect(rootStyle(screen).height).toBe(40);
    expect(rootStyle(screen).backgroundColor).toBe(defaultTheme.bg.fill);
  });

  it('rounds a placeholder standing in for an avatar', async () => {
    const round = await renderScreen(<Skeleton round />);
    const square = await renderScreen(<Skeleton />);

    expect(rootStyle(round).borderRadius).toBeGreaterThan(
      rootStyle(square).borderRadius,
    );
  });

  /**
   * An endless pulse is the clearest example of the motion the vestibular
   * guidance warns about. When motion is turned down the placeholder sits
   * still at a fixed opacity, which still says "something is coming".
   */
  it('pulses gently while it waits', async () => {
    const screen = await renderScreen(<Skeleton />);

    await waitFor(() => expect(rootStyle(screen).opacity).toBe(0.5));
  });

  it('stops pulsing for somebody who asked their phone for less motion', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(
      true,
    );

    const screen = await renderScreen(<Skeleton />);

    await waitFor(() => expect(rootStyle(screen).opacity).toBe(0.85));
  });
});

/**
 * Nielsen Norman set three jobs for an empty state: say what the system is
 * doing, teach what would fill the space, and offer a path to the task that
 * fills it. "No data" is not an empty state, it is a shrug.
 */
describe('nothing here, and why', () => {
  it('says what is missing', async () => {
    const screen = await renderScreen(
      <Empty title="No exams scheduled" body="Nothing is on the calendar yet." />,
    );

    expect(screen.getByText('No exams scheduled')).toBeTruthy();
    expect(screen.getByText('Nothing is on the calendar yet.')).toBeTruthy();
  });

  it('centres what it says', async () => {
    const screen = await renderScreen(<Empty title="No exams scheduled" />);

    expect(styleOf(screen.getByText('No exams scheduled')).textAlign).toBe(
      'center',
    );
  });

  it('offers the task when the person looking can do it', async () => {
    const onPress = jest.fn();
    const screen = await renderScreen(
      <Empty
        title="No homework set"
        action={{ label: 'Set homework', onPress }}
      />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Set homework' }));

    expect(onPress).toHaveBeenCalled();
  });

  /**
   * A parent waiting on a term to be published cannot publish it, and a full
   * attendance record is not a problem. Offering a button in either case
   * invents a task out of a healthy state or promises something the person
   * cannot do.
   */
  it('offers nothing when there is nothing honest to offer', async () => {
    const screen = await renderScreen(
      <Empty title="Nobody was absent" body="A full week." />,
    );

    expect(pressableCount(screen)).toBe(0);
  });

  it('can carry an illustration where one helps', async () => {
    const screen = await renderScreen(
      <Empty title="No books on loan" icon={<RNText>books</RNText>} />,
    );

    expect(screen.getByText('books')).toBeTruthy();
  });

  it('says only the title where there is nothing to add', async () => {
    const screen = await renderScreen(<Empty title="Nobody was absent" />);

    expect(screen.getByText('Nobody was absent')).toBeTruthy();
  });
});

/**
 * Something went wrong, said in the language of the person reading it. The
 * technical detail is kept and made selectable, because a teacher reporting a
 * problem needs to be able to copy it, but it sits under the plain sentence
 * rather than instead of it.
 */
describe('something went wrong', () => {
  it('says so in words a teacher can act on', async () => {
    const screen = await renderScreen(<Failed />);

    expect(screen.getByText('That did not load')).toBeTruthy();
    expect(
      screen.getByText('Check your connection and try again.'),
    ).toBeTruthy();
  });

  it('can be told what actually failed', async () => {
    const screen = await renderScreen(
      <Failed title="Marks did not load" body="The term may have closed." />,
    );

    expect(screen.getByText('Marks did not load')).toBeTruthy();
    expect(screen.getByText('The term may have closed.')).toBeTruthy();
  });

  it('offers another go when there is a point in one', async () => {
    const onRetry = jest.fn();
    const screen = await renderScreen(<Failed onRetry={onRetry} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(onRetry).toHaveBeenCalled();
  });

  it('offers no button when trying again would not help', async () => {
    const screen = await renderScreen(<Failed />);

    expect(pressableCount(screen)).toBe(0);
  });

  it('keeps the technical detail under the plain sentence', async () => {
    const screen = await renderScreen(
      <Failed detail="Request failed with status code 500" />,
    );

    expect(
      screen.getByText('Request failed with status code 500'),
    ).toBeTruthy();
  });

  it('lets that detail be copied, since somebody has to report it', async () => {
    const screen = await renderScreen(
      <Failed detail="Request failed with status code 500" />,
    );

    expect(
      screen.getByText('Request failed with status code 500').props.selectable,
    ).toBe(true);
  });

  it('sets the detail in mono, since it is not prose', async () => {
    const screen = await renderScreen(<Failed detail="ECONNABORTED" />);

    expect(styleOf(screen.getByText('ECONNABORTED')).fontFamily).toContain(
      'JetBrains',
    );
  });

  it('shows no detail block when there is nothing to show', async () => {
    const screen = await renderScreen(<Failed />);

    expect(hasIcon(screen)).toBe(false);
    expect(screen.queryByText('undefined')).toBeNull();
  });
});
