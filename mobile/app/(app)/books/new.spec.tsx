import { fireEvent, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { router, screenTitle } from '@/test/router-mock';
import { librarian, renderScreen, resetHarness, signedInAs } from '@/test/harness';

import NewBook from './new';

/**
 * Adding a title.
 *
 * Quantity is the field people get wrong, so it says what it means: how many
 * physical copies are being added, not how many are on the shelf right now.
 * The available count is derived and never typed, because a librarian
 * entering both is a librarian who will eventually enter two numbers that
 * disagree.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;

const open = async () => {
  signedInAs(librarian);
  return renderScreen(<NewBook />);
};

const fill = async (screen: Awaited<ReturnType<typeof renderScreen>>) => {
  await fireEvent.changeText(
    screen.getByLabelText('Title'),
    'Things Fall Apart',
  );
  await fireEvent.changeText(screen.getByLabelText('Author'), 'Chinua Achebe');
};

const submit = (screen: Awaited<ReturnType<typeof renderScreen>>) =>
  fireEvent.press(screen.getByRole('button', { name: 'Add it' }));

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  givenApi({ '/library/books': { id: 'book-1' } });
});

describe('the form', () => {
  it('says what it is', async () => {
    await open();

    expect(screenTitle()).toBe('Add a book');
  });

  /**
   * The available count is derived, never typed, so the field says what it
   * actually means.
   */
  it('says what the copy count means, since it is the field people get wrong', async () => {
    const screen = await open();

    expect(
      screen.getByText(
        'Physical copies being added. What is on the shelf is worked out from loans.',
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Available')).toBeNull();
  });

  it('starts at one copy, since that is the usual case', async () => {
    const screen = await open();

    expect(screen.getByLabelText('How many copies').props.value).toBe('1');
  });

  it('says what the replacement cost is for', async () => {
    const screen = await open();

    expect(screen.getByText('Charged if a copy is reported lost')).toBeTruthy();
  });

  it('marks the fields a school can leave alone', async () => {
    const screen = await open();

    expect(screen.getAllByText('optional').length).toBeGreaterThanOrEqual(3);
  });
});

describe('what it refuses to send', () => {
  it('asks for a title and an author', async () => {
    const screen = await open();

    await submit(screen);

    expect(screen.getAllByText('Needed')).toHaveLength(2);
    expect(http.post).not.toHaveBeenCalled();
  });

  // A book with no copies is a catalogue entry for nothing.
  it.each(['0', '', 'lots'])('refuses a copy count of "%s"', async (value) => {
    const screen = await open();
    await fill(screen);

    await fireEvent.changeText(screen.getByLabelText('How many copies'), value);
    await submit(screen);

    expect(screen.getByText('At least one copy')).toBeTruthy();
    expect(http.post).not.toHaveBeenCalled();
  });
});

describe('adding it', () => {
  it('sends what was filled in, tidied up', async () => {
    const screen = await open();
    await fill(screen);
    await fireEvent.changeText(screen.getByLabelText('How many copies'), '5');
    await fireEvent.changeText(screen.getByLabelText('Category'), ' Fiction ');
    await fireEvent.changeText(screen.getByLabelText('Shelf'), 'B3, upper');
    await fireEvent.changeText(
      screen.getByLabelText('Replacement cost'),
      '12000',
    );
    await fireEvent.changeText(screen.getByLabelText('ISBN'), '0385474547');

    await submit(screen);

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/library/books', {
        title: 'Things Fall Apart',
        author: 'Chinua Achebe',
        isbn: '0385474547',
        category: 'Fiction',
        quantity: 5,
        shelfLocation: 'B3, upper',
        replacementCost: 12000,
      }),
    );
  });

  it('sends nothing at all for the fields left blank', async () => {
    const screen = await open();
    await fill(screen);

    await submit(screen);

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/library/books', {
        title: 'Things Fall Apart',
        author: 'Chinua Achebe',
        isbn: undefined,
        category: undefined,
        quantity: 1,
        shelfLocation: undefined,
        replacementCost: undefined,
      }),
    );
  });

  it('names the book it added, and goes back to the catalogue', async () => {
    const screen = await open();
    await fill(screen);

    await submit(screen);

    await waitFor(() =>
      expect(notify.success).toHaveBeenCalledWith('Things Fall Apart added'),
    );
    expect(router.back).toHaveBeenCalled();
  });

  it('says what the school said when it refused', async () => {
    givenApiFails('/library/books', {
      response: { data: { message: 'That ISBN is already catalogued' } },
    });
    const screen = await open();
    await fill(screen);

    await submit(screen);

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        'That ISBN is already catalogued',
      ),
    );
    expect(router.back).not.toHaveBeenCalled();
  });

  it('has something to say when the school said nothing', async () => {
    givenApiFails('/library/books', new Error('offline'));
    const screen = await open();
    await fill(screen);

    await submit(screen);

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not add that'),
    );
  });
});
