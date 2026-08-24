import { fireEvent, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { router } from '@/test/router-mock';
import { librarian, renderScreen, resetHarness, signedInAs } from '@/test/harness';

import Circulate from './circulate';

/**
 * The desk.
 *
 * This is the screen a librarian has open while a queue of students is in
 * front of them, so it is built around one action repeated quickly rather
 * than around browsing. Overdue leads, because that is the pile that needs
 * saying something about, and returning is a single tap on the row rather
 * than a detail screen and a confirm.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;

const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString();

const loan = (over: Record<string, unknown> = {}) => ({
  id: 'loan-1',
  bookId: 'book-1',
  borrowerUserId: 'user-9',
  checkedOutAt: daysAgo(20),
  dueDate: daysAgo(4),
  status: 'OVERDUE',
  book: { title: 'Things Fall Apart', author: 'Chinua Achebe' },
  borrower: { firstName: 'Aline', lastName: 'Uwase' },
  ...over,
});

const desk = (over: Record<string, unknown> = {}) =>
  givenApi({
    '/library/loans/overdue': [],
    '/library/loans/active': [],
    '/library/return': { returned: true },
    '/library/reminders/send': { sent: 3 },
    ...over,
  });

const open = async () => {
  signedInAs(librarian);
  return renderScreen(<Circulate />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  desk();
});

/**
 * Overdue leads because it is the pile that needs saying something about.
 */
describe('the pile that needs attention', () => {
  it('opens on what is overdue', async () => {
    desk({ '/library/loans/overdue': [loan()] });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Past their due date')).toBeTruthy(),
    );
    expect(screen.getByText('Things Fall Apart')).toBeTruthy();
  });

  it('names who has it', async () => {
    desk({ '/library/loans/overdue': [loan()] });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText(/Aline Uwase/)).toBeTruthy(),
    );
  });

  /**
   * "4 days over" rather than a date: at a desk the useful fact is the size
   * of the problem, not the calendar.
   */
  it('says how late it is, not when it was due', async () => {
    desk({ '/library/loans/overdue': [loan({ dueDate: daysAgo(4) })] });

    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText('Aline Uwase   ·   4 days over'),
      ).toBeTruthy(),
    );
  });

  it('says one day properly', async () => {
    desk({ '/library/loans/overdue': [loan({ dueDate: daysAgo(1) })] });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Aline Uwase   ·   1 day over')).toBeTruthy(),
    );
  });

  it('says nothing about lateness on a loan still within its date', async () => {
    desk({
      '/library/loans/active': [
        { ...loan({ status: 'ACTIVE' }), dueDate: new Date(Date.now() + 86400000).toISOString() },
      ],
    });
    const screen = await open();
    await waitFor(() => expect(screen.getByText(/On loan/)).toBeTruthy());

    await fireEvent.press(screen.getByText(/On loan/));

    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
  });

  it('counts each pile on its own tab', async () => {
    desk({
      '/library/loans/overdue': [loan()],
      '/library/loans/active': [loan(), loan({ id: 'loan-2' })],
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Overdue 1')).toBeTruthy());
    expect(screen.getByText('On loan 2')).toBeTruthy();
  });

  it('switches to everything that is out', async () => {
    desk({ '/library/loans/active': [loan({ status: 'ACTIVE' })] });
    const screen = await open();
    await waitFor(() => expect(screen.getByText('On loan 1')).toBeTruthy());

    await fireEvent.press(screen.getByText('On loan 1'));

    await waitFor(() => expect(screen.getByText('Currently out')).toBeTruthy());
  });

  it('copes with a loan whose borrower record has gone', async () => {
    desk({ '/library/loans/overdue': [loan({ borrower: undefined })] });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText(/Unknown borrower/)).toBeTruthy(),
    );
  });

  it('copes with a loan whose book record has gone', async () => {
    desk({ '/library/loans/overdue': [loan({ book: undefined })] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Untitled')).toBeTruthy());
  });
});

// One tap on the row, not a detail screen and a confirm: there is a queue.
describe('taking a book back', () => {
  it('records the return from the row itself', async () => {
    desk({ '/library/loans/overdue': [loan()] });
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Return')).toBeTruthy());

    await fireEvent.press(screen.getByText('Return'));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/library/return', {
        loanId: 'loan-1',
      }),
    );
  });

  it('confirms it by naming the book', async () => {
    desk({ '/library/loans/overdue': [loan()] });
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Return')).toBeTruthy());

    await fireEvent.press(screen.getByText('Return'));

    await waitFor(() =>
      expect(notify.success).toHaveBeenCalledWith(
        'Things Fall Apart returned',
      ),
    );
  });

  it('says so when the return would not record', async () => {
    desk({ '/library/loans/overdue': [loan()] });
    givenApiFails('/library/return');
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Return')).toBeTruthy());

    await fireEvent.press(screen.getByText('Return'));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        'Could not record that return',
      ),
    );
  });

  it('names an untitled book something rather than nothing', async () => {
    desk({ '/library/loans/overdue': [loan({ book: undefined })] });
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Return')).toBeTruthy());

    await fireEvent.press(screen.getByText('Return'));

    await waitFor(() =>
      expect(notify.success).toHaveBeenCalledWith('Book returned'),
    );
  });
});

describe('the two things a librarian does from here', () => {
  it('opens the scanner', async () => {
    const screen = await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Scan a book' }));

    expect(router.push).toHaveBeenCalledWith('/(app)/scan');
  });

  it('reminds everybody who is late, in one go', async () => {
    desk({ '/library/loans/overdue': [loan()] });
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Remind everyone' }),
      ).toBeTruthy(),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Remind everyone' }),
    );

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/library/reminders/send'),
    );
    expect(notify.success).toHaveBeenCalledWith('Reminders sent');
  });

  it('says so when the reminders would not send', async () => {
    desk({ '/library/loans/overdue': [loan()] });
    givenApiFails('/library/reminders/send');
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Remind everyone' }),
      ).toBeTruthy(),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Remind everyone' }),
    );

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not send those'),
    );
  });

  // Nothing to remind anybody about is not a state that needs a button.
  it('offers no reminders when nothing is overdue', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Nothing overdue')).toBeTruthy(),
    );
    expect(
      screen.queryByRole('button', { name: 'Remind everyone' }),
    ).toBeNull();
  });

  it('offers no reminders from the on-loan view either', async () => {
    desk({ '/library/loans/overdue': [loan()] });
    const screen = await open();
    await waitFor(() => expect(screen.getByText('On loan 0')).toBeTruthy());

    await fireEvent.press(screen.getByText('On loan 0'));

    expect(
      screen.queryByRole('button', { name: 'Remind everyone' }),
    ).toBeNull();
  });
});

/**
 * Nothing overdue and nothing out are both healthy states, so neither offers
 * an action; they just say so.
 */
describe('when there is nothing in the pile', () => {
  it('says nothing is overdue', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Nothing overdue')).toBeTruthy(),
    );
    expect(
      screen.getByText('Every book that is out is still within its due date.'),
    ).toBeTruthy();
  });

  it('says the whole collection is on the shelves', async () => {
    const screen = await open();
    await waitFor(() => expect(screen.getByText('On loan 0')).toBeTruthy());

    await fireEvent.press(screen.getByText('On loan 0'));

    await waitFor(() => expect(screen.getByText('Nothing out')).toBeTruthy());
    expect(
      screen.getByText('The whole collection is on the shelves.'),
    ).toBeTruthy();
  });

  it('shows a placeholder while the desk loads', async () => {
    givenApi({ '/library/loans/overdue': () => new Promise(() => {}) });

    const screen = await open();

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  it('says so, and offers another go, when the read fails', async () => {
    givenApiFails('/library/loans/overdue');

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('That did not load')).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
