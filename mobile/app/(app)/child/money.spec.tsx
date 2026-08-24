import { waitFor } from '@testing-library/react-native';

import { defaultTheme } from '@/design/theme';
import { givenApi, resetApi } from '@/test/api-mock';
import { routerState, screenTitle } from '@/test/router-mock';
import {
  parent,
  pressableCount,
  renderScreen,
  resetHarness,
  signedInAs,
  styleOf,
} from '@/test/harness';

import ChildMoney from './money';

/**
 * Where the money went.
 *
 * The only question a parent has about pocket money, and the one an exercise
 * book at the counter has never been able to answer. So the statement is the
 * whole screen: every entry, what it was for, and who was at the counter.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const entry = (over: Record<string, unknown> = {}) => ({
  id: 'entry-1',
  kind: 'WITHDRAWAL',
  amount: 500,
  signedAmount: -500,
  note: 'Canteen',
  createdAt: '2026-08-20T10:00:00.000Z',
  recordedBy: 'Marie Uwimana',
  reversesId: null,
  isReversed: false,
  ...over,
});

const purse = (over: Record<string, unknown> = {}, entries: unknown[] = []) =>
  givenApi({
    '/pocket-money/student/student-1': {
      studentId: 'student-1',
      student: {
        name: 'Aline Uwase',
        studentIdNumber: 'STD-2025-0417',
        level: 'Senior 3 A',
        photoUrl: null,
      },
      balance: 12000,
      spentToday: 500,
      dailyLimit: null,
      remainingToday: null,
      lowBalanceAlert: null,
      isFrozen: false,
      isLow: false,
      ...over,
    },
    '/pocket-money/student/student-1/statement': { data: entries, meta: {} },
  });

const open = async () => {
  signedInAs(parent);
  routerState.params = { studentId: 'student-1', name: 'Aline Uwase' };
  return renderScreen(<ChildMoney />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  purse();
});

describe('what the school is holding', () => {
  it('names the child in the header', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Held by the school')).toBeTruthy(),
    );
    expect(screenTitle()).toBe('Aline Uwase, pocket money');
  });

  it('shows what is left, in Rwandan francs', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('12,000 RWF')).toBeTruthy());
    expect(screen.getByText('Left')).toBeTruthy();
    expect(screen.getByText('500 RWF')).toBeTruthy();
  });

  it('warns a parent when the balance is running low', async () => {
    purse({ isLow: true });

    const screen = await open();

    await waitFor(() =>
      expect(styleOf(screen.getByText('12,000 RWF')).color).toBe(
        defaultTheme.status.caution.text,
      ),
    );
  });

  /**
   * The cap is a parent's own instrument, so the screen says whose it is and
   * what it is for rather than showing a bare number.
   */
  it('says a daily cap is theirs, and why it exists', async () => {
    purse({ dailyLimit: 2000 });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Daily cap')).toBeTruthy());
    expect(screen.getByText('2,000 RWF')).toBeTruthy();
    expect(
      screen.getByText("Set by you, so a term's money lasts a term"),
    ).toBeTruthy();
  });

  it('says nothing about a cap where none is set', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('Left')).toBeTruthy());
    expect(screen.queryByText('Daily cap')).toBeNull();
  });

  it('says when the school has frozen the account', async () => {
    purse({ isFrozen: true });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Frozen by the school')).toBeTruthy(),
    );
  });

  it('shows a placeholder while it reads', async () => {
    givenApi({ '/pocket-money/student/student-1': () => new Promise(() => {}) });

    const screen = await open();

    await waitFor(() => expect(screen.getByLabelText('Loading')).toBeTruthy());
  });
});

describe('every entry', () => {
  it.each([
    ['DEPOSIT', 'Money in'],
    ['WITHDRAWAL', 'Spent'],
    ['REFUND', 'Returned to you'],
    ['REVERSAL', 'Correction'],
    ['ADJUSTMENT', 'Adjustment'],
  ])('names a %s entry "%s"', async (kind, label) => {
    purse({}, [entry({ kind })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText(label)).toBeTruthy());
  });

  it('says what it was for, who recorded it and when', async () => {
    purse({}, [entry()]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText(/Canteen.*Marie Uwimana/)).toBeTruthy(),
    );
  });

  it('copes with an entry nobody wrote a note against', async () => {
    purse({}, [entry({ note: null, recordedBy: null })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Spent')).toBeTruthy());
  });

  // Money in reads as a plus; money out reads as the bare figure it is.
  it('marks money in with a plus and money out without one', async () => {
    purse({}, [
      entry(),
      entry({ id: 'entry-2', kind: 'DEPOSIT', signedAmount: 5000 }),
    ]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('-500 RWF')).toBeTruthy());
    expect(screen.getByText('+5,000 RWF')).toBeTruthy();
  });

  it('shows the whole statement rather than the last few', async () => {
    purse(
      {},
      Array.from({ length: 30 }, (_, i) =>
        entry({ id: `entry-${i}`, note: `Note ${i}` }),
      ),
    );

    const screen = await open();

    await waitFor(() => expect(screen.getAllByText('Spent')).toHaveLength(30));
  });

  it('says what will appear here when nothing has yet', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('Nothing yet')).toBeTruthy());
    expect(
      screen.getByText(
        'Money handed in on visiting day shows up here, and so does everything spent.',
      ),
    ).toBeTruthy();
  });

  // A parent reads this record; they do not keep it.
  it('offers a parent nothing to change', async () => {
    purse({}, [entry()]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Spent')).toBeTruthy());
    expect(pressableCount(screen)).toBe(0);
  });
});
