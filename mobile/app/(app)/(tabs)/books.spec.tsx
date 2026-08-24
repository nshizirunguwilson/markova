import { act, fireEvent, waitFor } from '@testing-library/react-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { router } from '@/test/router-mock';
import {
  librarian,
  parent,
  renderScreen,
  resetHarness,
  signedInAs,
} from '@/test/harness';

import Books from './books';

/**
 * The catalogue.
 *
 * Two very different people open this. A librarian is looking for a title to
 * lend or shelve. A borrower is looking to see whether the school even has
 * something, and to check what they have out.
 *
 * Rather than build two screens, the borrower view leads with their own
 * loans, and the catalogue sits underneath. Availability is a count rather
 * than a green tick, because "2 of 5 on the shelf" answers the actual
 * question and a tick does not.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const book = (over: Record<string, unknown> = {}) => ({
  id: 'book-1',
  title: 'Things Fall Apart',
  author: 'Chinua Achebe',
  quantity: 5,
  availableCount: 2,
  shelfLocation: 'Shelf B',
  isActive: true,
  ...over,
});

const shelves = (books: unknown[], loans: unknown[] = []) =>
  givenApi({ '/library/books': books, '/library/loans/my': loans });

const open = async (user = librarian) => {
  signedInAs(user);
  return renderScreen(<Books />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  shelves([]);
});

describe('what is on the shelves', () => {
  it('shows the title, the author and where it sits', async () => {
    shelves([book()]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Things Fall Apart')).toBeTruthy(),
    );
    expect(screen.getByText('Chinua Achebe   ·   Shelf B')).toBeTruthy();
  });

  /**
   * "2 of 5 on the shelf" answers the question somebody actually has. A green
   * tick does not.
   */
  it('says how many copies are actually there', async () => {
    shelves([book()]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText(/2 of 5/)).toBeTruthy());
  });

  it('says so plainly when every copy is out', async () => {
    shelves([book({ availableCount: 0 })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('All out')).toBeTruthy());
  });

  it('counts the titles it found', async () => {
    shelves([book(), book({ id: 'book-2', title: 'Purple Hibiscus' })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('2 titles')).toBeTruthy());
  });

  it('says one title properly', async () => {
    shelves([book()]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('1 title')).toBeTruthy());
  });

  it('copes with a book that has no shelf recorded', async () => {
    shelves([book({ shelfLocation: null })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Chinua Achebe')).toBeTruthy());
  });
});

describe('searching', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('waits for the typing to stop before asking', async () => {
    const screen = await open();
    const before = http.get.mock.calls.length;

    await fireEvent.changeText(
      screen.getByLabelText('Search the shelves'),
      'Achebe',
    );
    expect(http.get.mock.calls.length).toBe(before);

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith(
        '/library/books',
        expect.objectContaining({
          params: expect.objectContaining({ search: 'Achebe' }),
        }),
      ),
    );
  });

  it('says what would help when nothing matched', async () => {
    const screen = await open();

    await fireEvent.changeText(
      screen.getByLabelText('Search the shelves'),
      'Zzz',
    );
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    await waitFor(() =>
      expect(screen.getByText('No match on the shelves')).toBeTruthy(),
    );
    expect(screen.getByText('Try the author, or part of the title.')).toBeTruthy();
  });
});

describe('a librarian at the catalogue', () => {
  it('can open a title to edit it', async () => {
    shelves([book()]);
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByText('Things Fall Apart')).toBeTruthy(),
    );

    await fireEvent.press(screen.getByText('Things Fall Apart'));

    expect(router.push).toHaveBeenCalledWith('/(app)/books/book-1');
  });

  it('can add one', async () => {
    shelves([book()]);
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByText('Things Fall Apart')).toBeTruthy(),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Add a book' }));

    expect(router.push).toHaveBeenCalledWith('/(app)/books/new');
  });

  it('is told what to do with an empty catalogue', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('The catalogue is empty')).toBeTruthy(),
    );
    expect(
      screen.getByText('Add the first title and it will show up here.'),
    ).toBeTruthy();
  });

  it('does not see their own loans, since they lend rather than borrow', async () => {
    shelves([book()], [{ id: 'loan-1', book: { title: 'Purple Hibiscus' } }]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Things Fall Apart')).toBeTruthy(),
    );
    expect(screen.queryByText('You have out')).toBeNull();
  });
});

/**
 * A borrower came to check what they have out, so that leads. They cannot
 * edit the catalogue, so nothing offers to.
 */
describe('a borrower at the catalogue', () => {
  const loan = (over: Record<string, unknown> = {}) => ({
    id: 'loan-1',
    book: { title: 'Purple Hibiscus' },
    dueDate: '2026-09-01T00:00:00.000Z',
    status: 'ACTIVE',
    ...over,
  });

  it('sees what they have out, above the shelves', async () => {
    shelves([book()], [loan()]);

    const screen = await open(parent);

    await waitFor(() => expect(screen.getByText('You have out')).toBeTruthy());
    expect(screen.getByText('Purple Hibiscus')).toBeTruthy();
    expect(
      screen.getByText(`Due ${new Date('2026-09-01T00:00:00.000Z').toLocaleDateString()}`),
    ).toBeTruthy();
  });

  it('is told when one of theirs is late', async () => {
    shelves([book()], [loan({ status: 'OVERDUE' })]);

    const screen = await open(parent);

    await waitFor(() => expect(screen.getByText('Overdue')).toBeTruthy());
  });

  // A loan in a state the shared vocabulary has never seen still draws.
  it('shows a loan in a state nobody has named', async () => {
    shelves([book()], [loan({ status: 'RENEWED' })]);

    const screen = await open(parent);

    await waitFor(() => expect(screen.getByText('Renewed')).toBeTruthy());
  });

  it('copes with a loan whose book record has gone', async () => {
    shelves([book()], [loan({ book: undefined })]);

    const screen = await open(parent);

    await waitFor(() => expect(screen.getByText('Untitled')).toBeTruthy());
  });

  it('cannot open a title to edit it', async () => {
    shelves([book()]);
    const screen = await open(parent);
    await waitFor(() =>
      expect(screen.getByText('Things Fall Apart')).toBeTruthy(),
    );

    await fireEvent.press(screen.getByText('Things Fall Apart'));

    expect(router.push).not.toHaveBeenCalled();
  });

  it('is not offered the way to add one', async () => {
    shelves([book()]);

    const screen = await open(parent);

    await waitFor(() =>
      expect(screen.getByText('Things Fall Apart')).toBeTruthy(),
    );
    expect(screen.queryByRole('button', { name: 'Add a book' })).toBeNull();
  });

  it('is told plainly that nothing has been catalogued', async () => {
    const screen = await open(parent);

    await waitFor(() =>
      expect(screen.getByText('Nothing has been catalogued yet.')).toBeTruthy(),
    );
  });

  it('says nothing about loans when they have none', async () => {
    shelves([book()]);

    const screen = await open(parent);

    await waitFor(() =>
      expect(screen.getByText('Things Fall Apart')).toBeTruthy(),
    );
    expect(screen.queryByText('You have out')).toBeNull();
  });
});

describe('when the shelves will not load', () => {
  it('shows a placeholder while they do', async () => {
    givenApi({ '/library/books': () => new Promise(() => {}) });

    const screen = await open();

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  it('says so, and offers another go', async () => {
    givenApiFails('/library/books');

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('That did not load')).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
