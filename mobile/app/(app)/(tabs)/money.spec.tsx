import { fireEvent, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { defaultTheme } from '@/design/theme';
import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import {
  matron,
  renderScreen,
  resetHarness,
  signedInAs,
  styleOf,
} from '@/test/harness';

import Money from './money';

/**
 * The pocket money counter.
 *
 * A boarding school holds a child's cash: a parent hands it over on visiting
 * day and the student draws it down at the canteen. The counter is a person
 * standing at a window with a queue, which is a phone in a hand rather than a
 * desk, so this screen is the one that actually gets used.
 *
 * Scan the card, see the face and the balance, hand over the money, record
 * it. The face matters: the number on the card is not who is standing there.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;

const account = (over: Record<string, unknown> = {}) => ({
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
});

const counter = (over: Record<string, unknown> = {}) =>
  givenApi({
    '/pocket-money/lookup': account(),
    '/pocket-money/student/student-1/statement': { data: [], meta: {} },
    '/pocket-money/withdraw': account({ balance: 10000 }),
    '/pocket-money/deposit': account({ balance: 17000 }),
    '/pocket-money/refund': account({ balance: 13000 }),
    ...over,
  });

const open = async () => {
  signedInAs(matron);
  return renderScreen(<Money />);
};

const scan = async (
  screen: Awaited<ReturnType<typeof renderScreen>>,
  code = 'STD-2025-0417',
) => {
  await fireEvent.changeText(
    screen.getByLabelText('Card or student number'),
    code,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Look them up' }));
  await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
};

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  counter();
});

describe('before anybody is at the window', () => {
  it('says so and says what to do about it', async () => {
    const screen = await open();

    expect(screen.getByText('Nobody at the counter')).toBeTruthy();
    expect(
      screen.getByText(
        'Scan a card to see whose money you are holding and how much of it is left.',
      ),
    ).toBeTruthy();
  });

  it('sets the card field in mono, since a code is read character by character', async () => {
    const screen = await open();

    expect(
      styleOf(screen.getByLabelText('Card or student number')).fontFamily,
    ).toContain('JetBrains');
  });

  it('does not look up an empty field', async () => {
    const screen = await open();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Look them up' }),
    );

    expect(http.post).not.toHaveBeenCalled();
  });

  it('does not look up a field with only spaces in it', async () => {
    const screen = await open();
    await fireEvent.changeText(
      screen.getByLabelText('Card or student number'),
      '   ',
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Look them up' }),
    );

    expect(http.post).not.toHaveBeenCalled();
  });
});

/**
 * The API validates with forbidNonWhitelisted, so the field has to be named
 * `identifier` or every single scan is a 400.
 */
describe('finding whoever is standing there', () => {
  it('sends the scanned code as the identifier', async () => {
    const screen = await open();

    await scan(screen);

    expect(http.post).toHaveBeenCalledWith('/pocket-money/lookup', {
      identifier: 'STD-2025-0417',
    });
  });

  it('trims what was typed', async () => {
    const screen = await open();

    await scan(screen, '  STD-2025-0417  ');

    expect(http.post).toHaveBeenCalledWith('/pocket-money/lookup', {
      identifier: 'STD-2025-0417',
    });
  });

  it('looks up from the keyboard as well as the button', async () => {
    const screen = await open();
    await fireEvent.changeText(
      screen.getByLabelText('Card or student number'),
      'STD-2025-0417',
    );

    await fireEvent(
      screen.getByLabelText('Card or student number'),
      'submitEditing',
    );

    await waitFor(() => expect(http.post).toHaveBeenCalled());
  });

  it('clears the field so the next card can just be scanned', async () => {
    const screen = await open();

    await scan(screen);

    expect(
      screen.getByLabelText('Card or student number').props.value,
    ).toBe('');
  });

  it('says what the school said about a card it does not know', async () => {
    givenApiFails('/pocket-money/lookup', {
      response: { data: { message: 'That card is not registered' } },
    });
    const screen = await open();
    await fireEvent.changeText(
      screen.getByLabelText('Card or student number'),
      'nonsense',
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Look them up' }),
    );

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('That card is not registered'),
    );
  });

  it('has something to say when the school said nothing', async () => {
    givenApiFails('/pocket-money/lookup', new Error('offline'));
    const screen = await open();
    await fireEvent.changeText(
      screen.getByLabelText('Card or student number'),
      'nonsense',
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Look them up' }),
    );

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('No student with that card'),
    );
  });
});

/**
 * The face matters. The number on the card is not who is standing there, and
 * this is the only check between a card and somebody else's money.
 */
describe('who is at the counter', () => {
  it('shows the face, the name and the class', async () => {
    const screen = await open();

    await scan(screen);

    expect(screen.getByLabelText('Aline Uwase')).toBeTruthy();
    expect(
      screen.getByText('STD-2025-0417   ·   Senior 3 A'),
    ).toBeTruthy();
  });

  it('shows what is being held for them, in Rwandan francs', async () => {
    const screen = await open();

    await scan(screen);

    expect(screen.getByText('12,000 RWF')).toBeTruthy();
    expect(screen.getByText('Held for them')).toBeTruthy();
    expect(screen.getByText('500 RWF')).toBeTruthy();
  });

  it('warns when the balance is running low', async () => {
    counter({ '/pocket-money/lookup': account({ isLow: true }) });
    const screen = await open();

    await scan(screen);

    expect(styleOf(screen.getByText('12,000 RWF')).color).toBe(
      defaultTheme.status.caution.text,
    );
  });

  it('says so when an account has been frozen', async () => {
    counter({ '/pocket-money/lookup': account({ isFrozen: true }) });
    const screen = await open();

    await scan(screen);

    expect(screen.getByText('Frozen')).toBeTruthy();
  });

  it('says nothing about a daily cap where there is none', async () => {
    const screen = await open();

    await scan(screen);

    expect(screen.queryByText('Left today')).toBeNull();
  });

  it('shows what is left under a daily cap', async () => {
    counter({
      '/pocket-money/lookup': account({ dailyLimit: 2000, remainingToday: 1500 }),
    });
    const screen = await open();

    await scan(screen);

    expect(screen.getByText('Left today')).toBeTruthy();
    expect(screen.getByText('1,500 RWF')).toBeTruthy();
    expect(screen.getByText('Daily cap 2,000 RWF')).toBeTruthy();
  });

  it('reads a cap with no figure behind it as nothing left', async () => {
    counter({
      '/pocket-money/lookup': account({ dailyLimit: 2000, remainingToday: null }),
    });
    const screen = await open();

    await scan(screen);

    expect(screen.getByText('0 RWF')).toBeTruthy();
  });

  it('reads a cap already spent as something to stop at', async () => {
    counter({
      '/pocket-money/lookup': account({ dailyLimit: 2000, remainingToday: 0 }),
    });
    const screen = await open();

    await scan(screen);

    expect(screen.getByText('0 RWF')).toBeTruthy();
    expect(styleOf(screen.getByText('0 RWF')).color).toBe(
      defaultTheme.status.critical.text,
    );
  });
});

describe('handing money over', () => {
  it('records a withdrawal against the student at the counter', async () => {
    const screen = await open();
    await scan(screen);

    await fireEvent.changeText(screen.getByLabelText('Amount'), '2000');
    await fireEvent.changeText(screen.getByLabelText('What for'), 'Canteen');
    await fireEvent.press(
      screen.getByRole('button', { name: 'Hand it over' }),
    );

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/pocket-money/withdraw', {
        studentId: 'student-1',
        amount: 2000,
        note: 'Canteen',
      }),
    );
  });

  it('confirms it with the balance that is left', async () => {
    const screen = await open();
    await scan(screen);
    await fireEvent.changeText(screen.getByLabelText('Amount'), '2000');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Hand it over' }),
    );

    await waitFor(() =>
      expect(notify.success).toHaveBeenCalledWith(
        'Handed over. Balance 10,000 RWF',
      ),
    );
  });

  it('takes money in on visiting day', async () => {
    const screen = await open();
    await scan(screen);

    await fireEvent.press(screen.getByText('Take in'));
    await fireEvent.changeText(screen.getByLabelText('Amount'), '5000');
    await fireEvent.press(
      screen.getByRole('button', { name: 'Take the money in' }),
    );

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        '/pocket-money/deposit',
        expect.objectContaining({ amount: 5000 }),
      ),
    );
    expect(notify.success).toHaveBeenCalledWith('Taken in. Balance 17,000 RWF');
  });

  it('gives money back', async () => {
    const screen = await open();
    await scan(screen);

    await fireEvent.press(screen.getByText('Give back'));
    await fireEvent.changeText(screen.getByLabelText('Amount'), '1000');
    await fireEvent.press(
      screen.getByRole('button', { name: 'Give it back' }),
    );

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        '/pocket-money/refund',
        expect.objectContaining({ amount: 1000 }),
      ),
    );
  });

  it('suggests what a deposit is usually for', async () => {
    const screen = await open();
    await scan(screen);

    await fireEvent.press(screen.getByText('Take in'));

    expect(
      screen.getByPlaceholderText('Visiting day, from mother'),
    ).toBeTruthy();
  });

  it('sends no note where none was written', async () => {
    const screen = await open();
    await scan(screen);

    await fireEvent.changeText(screen.getByLabelText('Amount'), '2000');
    await fireEvent.changeText(screen.getByLabelText('What for'), '   ');
    await fireEvent.press(
      screen.getByRole('button', { name: 'Hand it over' }),
    );

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/pocket-money/withdraw', {
        studentId: 'student-1',
        amount: 2000,
        note: undefined,
      }),
    );
  });

  it('clears the form so the next person can be served', async () => {
    const screen = await open();
    await scan(screen);
    await fireEvent.changeText(screen.getByLabelText('Amount'), '2000');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Hand it over' }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Amount').props.value).toBe(''),
    );
  });

  it('shows the new balance without another scan', async () => {
    const screen = await open();
    await scan(screen);
    await fireEvent.changeText(screen.getByLabelText('Amount'), '2000');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Hand it over' }),
    );

    await waitFor(() => expect(screen.getByText('10,000 RWF')).toBeTruthy());
  });

  it.each(['', '0', '-500'])('will not record an amount of "%s"', async (value) => {
    const screen = await open();
    await scan(screen);

    await fireEvent.changeText(screen.getByLabelText('Amount'), value);

    expect(
      screen.getByRole('button', { name: 'Hand it over' }).props
        .accessibilityState.disabled,
    ).toBe(true);
  });

  /**
   * The API refuses an overdraft and names the actual number, which is more
   * use at a counter than anything this screen could invent.
   */
  it('passes on exactly what the school refused', async () => {
    givenApiFails('/pocket-money/withdraw', {
      response: { data: { message: 'Only 1,200 RWF is left today' } },
    });
    const screen = await open();
    await scan(screen);
    await fireEvent.changeText(screen.getByLabelText('Amount'), '2000');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Hand it over' }),
    );

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Only 1,200 RWF is left today'),
    );
  });

  it('has something to say when the school said nothing', async () => {
    givenApiFails('/pocket-money/withdraw', new Error('offline'));
    const screen = await open();
    await scan(screen);
    await fireEvent.changeText(screen.getByLabelText('Amount'), '2000');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Hand it over' }),
    );

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not record that'),
    );
  });
});

/**
 * Nothing here is edited or deleted. A mistake is put right with a correcting
 * entry, so the ledger still stands up months later.
 */
describe('the ledger', () => {
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

  it('says out loud that nothing is ever edited', async () => {
    const screen = await open();
    await scan(screen);

    expect(screen.getByText(/put right with a\s+correcting entry/)).toBeTruthy();
  });

  it('says so when a student has no history yet', async () => {
    const screen = await open();

    await scan(screen);

    await waitFor(() =>
      expect(
        screen.getByText('Nothing recorded for this student yet.'),
      ).toBeTruthy(),
    );
  });

  it.each([
    ['DEPOSIT', 'Money in'],
    ['WITHDRAWAL', 'Spent'],
    ['REFUND', 'Returned'],
    ['REVERSAL', 'Correction'],
    ['ADJUSTMENT', 'Adjustment'],
  ])('names a %s entry "%s"', async (kind, label) => {
    counter({
      '/pocket-money/student/student-1/statement': {
        data: [entry({ kind })],
        meta: {},
      },
    });
    const screen = await open();

    await scan(screen);

    await waitFor(() => expect(screen.getByText(label)).toBeTruthy());
  });

  it('shows money out as a bare figure and money in with a plus', async () => {
    counter({
      '/pocket-money/student/student-1/statement': {
        data: [
          entry(),
          entry({ id: 'entry-2', kind: 'DEPOSIT', signedAmount: 5000 }),
        ],
        meta: {},
      },
    });
    const screen = await open();

    await scan(screen);

    await waitFor(() => expect(screen.getByText('-500 RWF')).toBeTruthy());
    expect(screen.getByText('+5,000 RWF')).toBeTruthy();
  });

  it('says who recorded it and when', async () => {
    counter({
      '/pocket-money/student/student-1/statement': {
        data: [entry()],
        meta: {},
      },
    });
    const screen = await open();

    await scan(screen);

    await waitFor(() =>
      expect(screen.getByText(/Canteen.*Marie Uwimana/)).toBeTruthy(),
    );
  });

  // A counter is not a place to scroll. Twelve is what fits.
  it('shows the last twelve and no more', async () => {
    counter({
      '/pocket-money/student/student-1/statement': {
        data: Array.from({ length: 20 }, (_, i) =>
          entry({ id: `entry-${i}`, note: `Note ${i}` }),
        ),
        meta: {},
      },
    });
    const screen = await open();

    await scan(screen);

    await waitFor(() => expect(screen.getByText(/Note 0/)).toBeTruthy());
    expect(screen.getAllByText('Spent')).toHaveLength(12);
  });
});
