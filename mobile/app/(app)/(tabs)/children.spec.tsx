import { fireEvent, waitFor } from '@testing-library/react-native';

import { givenApi, givenApiFails, resetApi } from '@/test/api-mock';
import { router } from '@/test/router-mock';
import { parent, renderScreen, resetHarness, signedInAs } from '@/test/harness';

import Children from './children';

/**
 * A parent's children.
 *
 * Most parents here have one or two, so this is usually a very short list,
 * and a short list should not be dressed up as a dashboard.
 *
 * Conduct points lead rather than marks, because marks only exist once a term
 * is published, and a parent opening this in week four wants to know whether
 * anything has gone wrong, not what the average was last April.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const child = (over: Record<string, unknown> = {}) => ({
  id: 'student-1',
  user: { firstName: 'Aline', lastName: 'Uwase' },
  classSection: { name: 'Senior 3 A' },
  studentIdNumber: 'STD-2025-0417',
  ...over,
});

const linked = (children: unknown[]) =>
  givenApi({ '/auth/profile': { children } });

const open = async () => {
  signedInAs(parent);
  return renderScreen(<Children />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  linked([]);
});

describe('the list', () => {
  it('names each child and the class they are in', async () => {
    linked([child()]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
    expect(
      screen.getByText('Senior 3 A   ·   STD-2025-0417'),
    ).toBeTruthy();
  });

  it('counts them in the heading', async () => {
    linked([child(), child({ id: 'student-2' })]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Your 2 children')).toBeTruthy(),
    );
  });

  it('says "your child" when there is only one', async () => {
    linked([child()]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Your child')).toBeTruthy());
  });

  // The profile endpoint has answered with the name nested and flat.
  it('reads a name given flat as readily as nested', async () => {
    linked([
      { id: 'student-1', firstName: 'Aline', lastName: 'Uwase' },
    ]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
  });

  it('copes with a child whose class is not set yet', async () => {
    linked([child({ classSection: undefined, studentIdNumber: undefined })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
  });

  it('opens a child when their row is pressed', async () => {
    linked([child()]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());

    await fireEvent.press(screen.getByText('Aline Uwase'));

    expect(router.push).toHaveBeenCalledWith('/(app)/child/student-1');
  });

  it('offers the way to message a teacher', async () => {
    linked([child()]);
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByText('Message a teacher')).toBeTruthy(),
    );

    await fireEvent.press(screen.getByText('Message a teacher'));

    expect(router.push).toHaveBeenCalledWith('/(app)/(tabs)/messages');
  });
});

/**
 * A clean sheet is worth nothing on screen. Points only appear once something
 * has actually gone against a child, which is the only time a parent needs to
 * look.
 */
describe('how conduct is shown', () => {
  it('says nothing about a child with a clean sheet', async () => {
    linked([child({ disciplinePoints: 100 })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
    expect(screen.queryByText('100 pts')).toBeNull();
  });

  it.each([
    [92, 'neutral'],
    [72, 'caution'],
    [40, 'critical'],
  ])('shows %s points and reads it as %s', async (points, tone) => {
    const { defaultTheme } = require('@/design/theme');
    linked([child({ disciplinePoints: points })]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText(`${points} pts`)).toBeTruthy(),
    );
    const style = Object.assign(
      {},
      ...[screen.getByText(`${points} pts`).props.style].flat(Infinity),
    );
    expect(style.color).toBe(
      tone === 'neutral'
        ? defaultTheme.fg.secondary
        : tone === 'caution'
          ? defaultTheme.status.caution.text
          : defaultTheme.status.critical.text,
    );
  });
});

describe('when there is nothing to show', () => {
  /**
   * A parent whose account is not linked has done nothing wrong and cannot
   * fix it themselves, so the screen says who can rather than offering a
   * button that would go nowhere.
   */
  it('says who can put an unlinked account right', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('No children linked yet')).toBeTruthy(),
    );
    expect(screen.getByText(/the office can put it right/)).toBeTruthy();
  });

  it('shows a placeholder shaped like the list while it loads', async () => {
    givenApi({ '/auth/profile': () => new Promise(() => {}) });

    const screen = await open();

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  it('says so, and offers another go, when the read fails', async () => {
    givenApiFails('/auth/profile');

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('That did not load')).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
