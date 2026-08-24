import { fireEvent, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { routerState, screenTitle } from '@/test/router-mock';
import { librarian, renderScreen, resetHarness, signedInAs } from '@/test/harness';

import BookDetail from './[id]';

/**
 * One title, and who has the copies.
 *
 * The count that matters is not how many exist but how many are on the shelf,
 * so that leads. Underneath is the list of people holding one, because "who
 * has the other three" is the question a librarian is standing there asking.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;

const daysFromNow = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString();

const loan = (over: Record<string, unknown> = {}) => ({
  id: 'loan-1',
  bookId: 'book-1',
  borrowerUserId: 'user-9',
  checkedOutAt: daysFromNow(-10),
  dueDate: daysFromNow(4),
  status: 'ACTIVE',
  borrower: { firstName: 'Aline', lastName: 'Uwase' },
  ...over,
});

const shelf = (over: Record<string, unknown> = {}, loans: unknown[] = []) =>
  givenApi({
    '/library/books/book-1': {
      id: 'book-1',
      title: 'Things Fall Apart',
      author: 'Chinua Achebe',
      isbn: '0385474547',
      barcode: '9780385474542',
      category: 'Fiction',
      shelfLocation: 'B3, upper',
      replacementCost: 12000,
      quantity: 5,
      availableCount: 2,
      isActive: true,
      ...over,
    },
    '/library/loans/active': loans,
    '/library/return': { returned: true },
    '/library/lost': { charged: true },
  });

const open = async () => {
  signedInAs(librarian);
  routerState.params = { id: 'book-1' };
  return renderScreen(<BookDetail />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  shelf();
});

/**
 * How many are on the shelf is the number somebody is standing there asking
 * about, so it leads.
 */
describe('the title itself', () => {
  it('names it in the header and on the page', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Things Fall Apart')).toBeTruthy(),
    );
    expect(screen.getByText('Chinua Achebe')).toBeTruthy();
    expect(screenTitle()).toBe('Things Fall Apart');
  });

  it('leads with what is actually on the shelf', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('On the shelf')).toBeTruthy());
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('reads a shelf with nothing left on it as a problem', async () => {
    const { defaultTheme } = require('@/design/theme');
    shelf({ availableCount: 0 });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('On the shelf')).toBeTruthy());
    const style = Object.assign(
      {},
      ...[screen.getByText('0').props.style].flat(Infinity),
    );
    expect(style.color).toBe(defaultTheme.status.critical.text);
  });

  it('shows where it lives and what it costs to replace', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('B3, upper')).toBeTruthy());
    expect(screen.getByText('Fiction')).toBeTruthy();
    expect(screen.getByText('12000')).toBeTruthy();
  });

  it('says a replacement cost is not set rather than showing nothing', async () => {
    shelf({ replacementCost: null });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Not set')).toBeTruthy());
  });

  it('leaves out the details nobody recorded', async () => {
    shelf({ category: null, shelfLocation: null, isbn: null, barcode: null });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Replacement cost')).toBeTruthy(),
    );
    expect(screen.queryByText('Category')).toBeNull();
    expect(screen.queryByText('ISBN')).toBeNull();
    expect(screen.queryByText('Where it lives')).toBeNull();
  });

  // Codes are read off a spine or a scanner, character by character.
  it('sets the codes in mono', async () => {
    const { styleOf } = require('@/test/harness');
    const screen = await open();

    await waitFor(() => expect(screen.getByText('0385474547')).toBeTruthy());
    expect(styleOf(screen.getByText('0385474547')).fontFamily).toContain(
      'JetBrains',
    );
  });

  it('shows a placeholder while it reads', async () => {
    givenApi({ '/library/books/book-1': () => new Promise(() => {}) });

    const screen = await open();

    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screenTitle()).toBe('Book');
  });

  it('says so, and offers another go, when the read fails', async () => {
    givenApiFails('/library/books/book-1');

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('That did not load')).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

// "Who has the other three" is the question a librarian is standing there
// asking, so the answer is named people rather than a count.
describe('who has a copy', () => {
  it('names them and says when it is due back', async () => {
    shelf({}, [loan()]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
    expect(screen.getByText('Who has a copy')).toBeTruthy();
    expect(
      screen.getByText(`Due ${new Date(loan().dueDate).toLocaleDateString()}`),
    ).toBeTruthy();
  });

  it('says plainly when one is already late', async () => {
    shelf({}, [loan({ dueDate: daysFromNow(-3) })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Overdue')).toBeTruthy());
  });

  it('leaves out loans on other titles', async () => {
    shelf({}, [loan(), loan({ id: 'loan-2', bookId: 'book-2' })]);

    const screen = await open();

    await waitFor(() => expect(screen.getAllByText('Return')).toHaveLength(1));
  });

  it('copes with a loan whose borrower record has gone', async () => {
    shelf({}, [loan({ borrower: undefined })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Unknown')).toBeTruthy());
  });

  it('says so when every copy is on the shelf', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Every copy is on the shelf.')).toBeTruthy(),
    );
    expect(screen.getByText('Nobody has a copy out')).toBeTruthy();
  });

  it('takes a copy back from the row itself', async () => {
    shelf({}, [loan()]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Return')).toBeTruthy());

    await fireEvent.press(screen.getByText('Return'));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/library/return', {
        loanId: 'loan-1',
      }),
    );
    expect(notify.success).toHaveBeenCalledWith('Returned');
  });
});

/**
 * Reporting a copy lost is here rather than at the desk, because it happens
 * days after the conversation and it costs somebody money, so it takes two
 * deliberate presses.
 */
describe('reporting a copy lost', () => {
  it('says how, since the gesture is not obvious', async () => {
    shelf({}, [loan()]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Tap a row to report that copy lost.')).toBeTruthy(),
    );
  });

  it('asks for a second press before charging anybody', async () => {
    shelf({}, [loan()]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());

    await fireEvent.press(screen.getByText('Aline Uwase'));

    await waitFor(() => expect(screen.getByText('Confirm lost')).toBeTruthy());
    expect(http.post).not.toHaveBeenCalled();
  });

  it('charges for it once confirmed', async () => {
    shelf({}, [loan()]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
    await fireEvent.press(screen.getByText('Aline Uwase'));
    await waitFor(() => expect(screen.getByText('Confirm lost')).toBeTruthy());

    await fireEvent.press(screen.getByText('Confirm lost'));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/library/lost', {
        loanId: 'loan-1',
      }),
    );
    expect(notify.success).toHaveBeenCalledWith('Marked lost and charged');
  });

  it('can be thought better of', async () => {
    shelf({}, [loan()]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
    await fireEvent.press(screen.getByText('Aline Uwase'));
    await waitFor(() => expect(screen.getByText('Confirm lost')).toBeTruthy());

    await fireEvent.press(screen.getByText('Aline Uwase'));

    await waitFor(() => expect(screen.getByText('Return')).toBeTruthy());
    expect(screen.queryByText('Confirm lost')).toBeNull();
  });
});
