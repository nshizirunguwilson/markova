import { fireEvent, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { screenTitle } from '@/test/router-mock';
import { admin, renderScreen, resetHarness, signedInAs } from '@/test/harness';

import Years from './years';

/**
 * Years and terms.
 *
 * The only action that belongs on a phone here is opening and closing a term,
 * and it is the highest consequence switch in the whole system: closing a
 * term stops every teacher in the school from entering marks. So it is a
 * deliberate two step, it says what will happen in plain words, and it is
 * never the primary button on the row.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;

const term = (over: Record<string, unknown> = {}) => ({
  id: 'term-2',
  academicYearId: 'year-2',
  name: 'Term 2',
  startDate: '2026-05-01',
  endDate: '2026-08-31',
  isCurrent: true,
  isClosed: false,
  ...over,
});

const calendar = (over: Record<string, unknown> = {}) =>
  givenApi({
    '/academic/years': [
      {
        id: 'year-2',
        name: '2026',
        startDate: '2026-01-10',
        endDate: '2026-11-30',
        isCurrent: true,
      },
    ],
    '/academic/terms': [term()],
    '/academic/terms/term-2/close': { ok: true },
    '/academic/terms/term-2/reopen': { ok: true },
    ...over,
  });

const open = async () => {
  signedInAs(admin);
  return renderScreen(<Years />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  calendar();
});

describe('the year the school is in', () => {
  it('says what it is and when it runs', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('2026')).toBeTruthy());
    expect(
      screen.getByText(
        `${new Date('2026-01-10').toLocaleDateString()} to ${new Date(
          '2026-11-30',
        ).toLocaleDateString()}`,
      ),
    ).toBeTruthy();
    expect(screenTitle()).toBe('Years and terms');
  });

  it('says so when no year is marked current', async () => {
    calendar({
      '/academic/years': [{ id: 'year-1', name: '2025', isCurrent: false }],
    });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('None marked current')).toBeTruthy(),
    );
  });

  it('lists the years behind it', async () => {
    calendar({
      '/academic/years': [
        {
          id: 'year-2',
          name: '2026',
          startDate: '2026-01-10',
          endDate: '2026-11-30',
          isCurrent: true,
        },
        { id: 'year-1', name: '2025', isCurrent: false },
      ],
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('2025')).toBeTruthy());
  });

  it('says so when this is the first year on record', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('This is the first year on record')).toBeTruthy(),
    );
  });

  it('says what has to exist before anything else works', async () => {
    calendar({ '/academic/years': [] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('No years set up')).toBeTruthy());
    expect(
      screen.getByText(
        'An academic year has to exist on the web before anything else works.',
      ),
    ).toBeTruthy();
  });

  it('shows a placeholder while it reads', async () => {
    givenApi({ '/academic/years': () => new Promise(() => {}) });

    const screen = await open();

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });
});

describe('the terms in it', () => {
  it('says which is current and whether it is open', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('Term 2')).toBeTruthy());
    expect(screen.getByText('Current')).toBeTruthy();
    expect(screen.getByText('Open')).toBeTruthy();
  });

  it('says when one has been closed', async () => {
    calendar({ '/academic/terms': [term({ isClosed: true })] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Closed')).toBeTruthy());
  });

  it('says when each one runs', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          `${new Date('2026-05-01').toLocaleDateString()} to ${new Date(
            '2026-08-31',
          ).toLocaleDateString()}`,
        ),
      ).toBeTruthy(),
    );
  });
});

/**
 * Closing a term stops every teacher in the school entering marks, so it is a
 * deliberate two step that says exactly that.
 */
describe('closing a term', () => {
  it('asks first, and says what it will do to everybody', async () => {
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Term 2')).toBeTruthy());

    await fireEvent.press(screen.getByText('Term 2'));

    expect(screen.getByText('Close Term 2?')).toBeTruthy();
    expect(
      screen.getByText(
        'No teacher in the school will be able to enter or change marks for this term until it is reopened.',
      ),
    ).toBeTruthy();
    expect(http.post).not.toHaveBeenCalled();
  });

  // Never the primary button: it is the destructive one, and the safe choice
  // sits beside it.
  it('offers the safe choice beside it', async () => {
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Term 2')).toBeTruthy());
    await fireEvent.press(screen.getByText('Term 2'));

    await fireEvent.press(screen.getByRole('button', { name: 'Leave it' }));

    await waitFor(() => expect(screen.queryByText('Close Term 2?')).toBeNull());
    expect(http.post).not.toHaveBeenCalled();
  });

  it('closes it once confirmed', async () => {
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Term 2')).toBeTruthy());
    await fireEvent.press(screen.getByText('Term 2'));

    await fireEvent.press(screen.getByRole('button', { name: 'Close it' }));

    await waitFor(() =>
      expect(http.post.mock.calls[0][0]).toBe('/academic/terms/term-2/close'),
    );
    expect(notify.success).toHaveBeenCalledWith('Term closed.');
  });

  it('says what the school said when it refused', async () => {
    givenApiFails('/academic/terms/term-2/close', {
      response: { data: { message: 'Results have not been calculated yet' } },
    });
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Term 2')).toBeTruthy());
    await fireEvent.press(screen.getByText('Term 2'));

    await fireEvent.press(screen.getByRole('button', { name: 'Close it' }));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        'Results have not been calculated yet',
      ),
    );
  });

  it('has something to say when the school said nothing', async () => {
    givenApiFails('/academic/terms/term-2/close', new Error('offline'));
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Term 2')).toBeTruthy());
    await fireEvent.press(screen.getByText('Term 2'));

    await fireEvent.press(screen.getByRole('button', { name: 'Close it' }));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not change that'),
    );
  });
});

describe('reopening one closed too early', () => {
  beforeEach(() =>
    calendar({ '/academic/terms': [term({ isClosed: true })] }),
  );

  it('asks first, and says who gets marks entry back', async () => {
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Term 2')).toBeTruthy());

    await fireEvent.press(screen.getByText('Term 2'));

    expect(screen.getByText('Reopen Term 2?')).toBeTruthy();
    expect(
      screen.getByText(
        'Every teacher will be able to enter and change marks for this term again.',
      ),
    ).toBeTruthy();
  });

  it('reopens it once confirmed', async () => {
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Term 2')).toBeTruthy());
    await fireEvent.press(screen.getByText('Term 2'));

    await fireEvent.press(screen.getByRole('button', { name: 'Reopen it' }));

    await waitFor(() =>
      expect(http.post.mock.calls[0][0]).toBe('/academic/terms/term-2/reopen'),
    );
    expect(notify.success).toHaveBeenCalledWith(
      'Term reopened. Teachers can enter marks again.',
    );
  });
});

/**
 * Creating years and terms is a form of dates that has to be exactly right,
 * done twice a year at a desk. The screen says where that lives.
 */
describe('what stays on the web', () => {
  it('says so rather than pretending a phone can do it', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          'Creating years and terms stays on the web dashboard. It is a form of dates that has to be exactly right and it is done twice a year at a desk.',
        ),
      ).toBeTruthy(),
    );
  });
});
