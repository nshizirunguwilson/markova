import { act, fireEvent, waitFor } from '@testing-library/react-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { router } from '@/test/router-mock';
import { admin, renderScreen, resetHarness, signedInAs } from '@/test/harness';

import People from './people';

/**
 * Everyone, in one list.
 *
 * The web splits this into three pages - users, students, teachers - because
 * a sidebar has room for three links. On a phone that would be three nearly
 * identical screens and three different places to search, so it is one list
 * with a role filter.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const person = (over: Record<string, unknown> = {}) => ({
  id: 'user-9',
  firstName: 'Aline',
  lastName: 'Uwase',
  role: 'TEACHER',
  isActive: true,
  email: 'aline.uwase@markova.edu',
  ...over,
});

const directory = (people: unknown[], total = people.length) =>
  givenApi({ '/users': { data: people, total } });

const open = async () => {
  signedInAs(admin);
  return renderScreen(<People />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  directory([]);
});

describe('the list', () => {
  it('shows everyone with something that identifies them', async () => {
    directory([person()]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
    expect(screen.getByText('aline.uwase@markova.edu')).toBeTruthy();
  });

  // A student is found by their ID number far more often than by an address,
  // and most of them do not have one.
  it('identifies a student by their ID number first', async () => {
    directory([
      person({
        role: 'STUDENT',
        email: 'student1@markova.edu',
        student: { studentIdNumber: 'STD-2025-0417' },
      }),
    ]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('STD-2025-0417')).toBeTruthy(),
    );
    expect(screen.queryByText('student1@markova.edu')).toBeNull();
  });

  // Most parents on this system have a phone number and no email at all.
  it('falls back to a phone number where there is no address', async () => {
    directory([
      person({ role: 'PARENT', email: null, phone: '+250788100000' }),
    ]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('+250788100000')).toBeTruthy());
  });

  it('says how many were found', async () => {
    directory([person()], 412);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('412 found')).toBeTruthy());
  });

  it('counts what it has when the API sent no total', async () => {
    givenApi({ '/users': [person(), person({ id: 'user-8' })] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('2 found')).toBeTruthy());
  });

  it('marks somebody turned off even while the list is filtered', async () => {
    directory([person({ isActive: false })]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Off')).toBeTruthy());

    await fireEvent.press(screen.getByText('Teachers'));

    await waitFor(() => expect(screen.getByText('Off')).toBeTruthy());
  });

  it('opens somebody when their row is pressed', async () => {
    directory([person()]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());

    await fireEvent.press(screen.getByText('Aline Uwase'));

    expect(router.push).toHaveBeenCalledWith('/(app)/people/user-9');
  });

  it('shows a placeholder shaped like the list while it loads', async () => {
    givenApi({ '/users': () => new Promise(() => {}) });

    const screen = await open();

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  it('says so, and offers another go, when the read fails', async () => {
    givenApiFails('/users');

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('That did not load')).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('reads again when asked to', async () => {
    givenApiFails('/users');
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy(),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() =>
      expect(http.get.mock.calls.length).toBeGreaterThan(1),
    );
  });
});

describe('what each row says about somebody', () => {
  it('names their role while the list is unfiltered', async () => {
    directory([person({ role: 'LIBRARIAN' })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Librarian')).toBeTruthy());
  });

  // Once the list is already filtered to teachers, a "Teacher" pill on every
  // row is noise.
  it('drops the role once the list is already filtered to it', async () => {
    directory([person()]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Teacher')).toBeTruthy());

    await fireEvent.press(screen.getByText('Teachers'));

    await waitFor(() => expect(screen.queryByText('Teacher')).toBeNull());
  });

  /**
   * Somebody who has left the school is still in the directory, because their
   * records are, so the row has to say they are no longer active.
   */
  it('marks somebody who has been turned off', async () => {
    directory([person({ isActive: false })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Off')).toBeTruthy());
  });

  it('says that rather than their role, since it matters more', async () => {
    directory([person({ isActive: false, role: 'LIBRARIAN' })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Off')).toBeTruthy());
    expect(screen.queryByText('Librarian')).toBeNull();
  });
});

describe('narrowing the list', () => {
  it.each([
    ['Students', 'STUDENT'],
    ['Teachers', 'TEACHER'],
    ['Parents', 'PARENT'],
    ['Admins', 'ADMIN'],
    ['Librarians', 'LIBRARIAN'],
  ])('filters to %s', async (label, role) => {
    const screen = await open();
    await waitFor(() => expect(screen.getByText(label)).toBeTruthy());

    await fireEvent.press(screen.getByText(label));

    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith(
        '/users',
        expect.objectContaining({ params: expect.objectContaining({ role }) }),
      ),
    );
  });

  it('goes back to everybody', async () => {
    const screen = await open();
    await fireEvent.press(screen.getByText('Students'));
    await waitFor(() => expect(http.get.mock.calls.length).toBeGreaterThan(1));

    await fireEvent.press(screen.getByText('Everyone'));

    await waitFor(() =>
      expect(
        http.get.mock.calls[http.get.mock.calls.length - 1][1],
      ).toMatchObject({ params: { role: undefined } }),
    );
  });
});

/**
 * Typing "Uwase" five characters at a time would fire five requests and the
 * list would flicker through five answers, which on a slow connection means
 * watching your own typing arrive out of order.
 */
describe('searching', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('waits for the typing to stop before asking', async () => {
    const screen = await open();
    const before = http.get.mock.calls.length;

    await fireEvent.changeText(screen.getByLabelText('Search'), 'Uw');
    await fireEvent.changeText(screen.getByLabelText('Search'), 'Uwase');

    expect(http.get.mock.calls.length).toBe(before);

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith(
        '/users',
        expect.objectContaining({
          params: expect.objectContaining({ search: 'Uwase' }),
        }),
      ),
    );
  });

  it('says what would help when nothing matched', async () => {
    const screen = await open();

    await fireEvent.changeText(screen.getByLabelText('Search'), 'Zzz');
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    await waitFor(() =>
      expect(screen.getByText('Nobody matches that')).toBeTruthy(),
    );
    expect(screen.getByText('Try part of a name, or an ID number.')).toBeTruthy();
  });
});

/**
 * Nielsen Norman's three jobs for an empty state: say what is happening,
 * teach what would fill the space, and offer the task that fills it.
 */
describe('an empty directory', () => {
  it('says so and offers the way to fill it', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('Nobody here yet')).toBeTruthy());
    expect(
      screen.getByText('Add people one at a time, or import a spreadsheet.'),
    ).toBeTruthy();
  });

  it('offers the form from the empty state as well as the footer', async () => {
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Nobody here yet')).toBeTruthy());

    const buttons = screen.getAllByRole('button', { name: 'Add someone' });
    expect(buttons).toHaveLength(2);
    await fireEvent.press(buttons[0]);

    expect(router.push).toHaveBeenCalledWith('/(app)/people/new');
  });
});

describe('adding people', () => {
  it('opens the form for one person', async () => {
    const screen = await open();

    await fireEvent.press(
      screen.getAllByRole('button', { name: 'Add someone' })[0],
    );

    expect(router.push).toHaveBeenCalledWith('/(app)/people/new');
  });

  // A school starting a year has four hundred people to add, and typing them
  // one at a time is not a thing anybody will do.
  it('opens the importer for a whole spreadsheet', async () => {
    const screen = await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Import' }));

    expect(router.push).toHaveBeenCalledWith('/(app)/people/import');
  });
});
