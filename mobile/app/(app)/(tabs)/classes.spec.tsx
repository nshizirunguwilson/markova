import { fireEvent, waitFor } from '@testing-library/react-native';

import { givenApi, givenApiFails, resetApi } from '@/test/api-mock';
import { router } from '@/test/router-mock';
import { renderScreen, resetHarness, signedInAs, teacher } from '@/test/harness';

import Classes from './classes';

/**
 * What a teacher teaches.
 *
 * The API returns one row per teacher, subject, class and year, so somebody
 * with three subjects across four classes gets twelve rows back. Listing all
 * twelve would be faithful to the data and useless to the person: a teacher
 * thinks in classes, because they walk into S3 A and teach whatever they
 * teach there.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const assignment = (section: string, subject: string, id = section) => ({
  id: `${section}-${subject}`,
  classSection: { id, name: section },
  subject: { id: subject, name: subject },
});

const assigned = (rows: unknown[]) =>
  givenApi({ '/academic/assignments': rows });

const open = async () => {
  signedInAs(teacher);
  return renderScreen(<Classes />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  assigned([]);
  givenApi({
    '/academic/years': [{ id: 'year-1', isCurrent: true }],
    '/academic/terms': [{ id: 'term-1', name: 'Term 2', isCurrent: true }],
  });
});

describe('the classes a teacher walks into', () => {
  it('lists one row per class, not one per subject', async () => {
    assigned([
      assignment('Senior 3 A', 'Mathematics'),
      assignment('Senior 3 A', 'Physics'),
      assignment('Senior 4 B', 'Mathematics'),
    ]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Senior 3 A')).toBeTruthy());
    expect(screen.getByText('Mathematics, Physics')).toBeTruthy();
    expect(screen.getByText('Senior 4 B')).toBeTruthy();
  });

  it('counts the subjects it teaches in each', async () => {
    assigned([
      assignment('Senior 3 A', 'Mathematics'),
      assignment('Senior 3 A', 'Physics'),
    ]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('2')).toBeTruthy());
  });

  // The same subject twice in one class, for two different years, is still
  // one subject to the person standing in the room.
  it('does not list the same subject twice', async () => {
    assigned([
      assignment('Senior 3 A', 'Mathematics'),
      { ...assignment('Senior 3 A', 'Mathematics'), id: 'another-year' },
    ]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Mathematics')).toBeTruthy(),
    );
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('puts the classes in an order somebody can scan', async () => {
    assigned([
      assignment('Senior 4 B', 'Mathematics'),
      assignment('Senior 1 A', 'Mathematics'),
      assignment('Senior 3 A', 'Mathematics'),
    ]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Senior 1 A')).toBeTruthy());

    expect(
      screen.getAllByText(/^Senior \d [A-Z]$/).map((el) => el.props.children),
    ).toEqual(['Senior 1 A', 'Senior 3 A', 'Senior 4 B']);
  });

  it('skips a row the API sent with no class on it', async () => {
    assigned([{ id: 'orphan', subject: { id: 's1', name: 'Mathematics' } }]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('No classes assigned')).toBeTruthy(),
    );
  });

  it('copes with a class that has no subject attached yet', async () => {
    assigned([{ id: 'a1', classSection: { id: 'c1', name: 'Senior 3 A' } }]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Senior 3 A')).toBeTruthy());
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('names the term and counts the classes above the list', async () => {
    assigned([assignment('Senior 3 A', 'Mathematics')]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Term 2   ·   1 classes')).toBeTruthy(),
    );
  });

  it('still counts them when there is no current term', async () => {
    givenApi({ '/academic/years': [] });
    assigned([assignment('Senior 3 A', 'Mathematics')]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('1 classes')).toBeTruthy());
  });

  it('goes to marks entry with the class already picked', async () => {
    assigned([assignment('Senior 3 A', 'Mathematics', 'section-1')]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Senior 3 A')).toBeTruthy());

    await fireEvent.press(screen.getByText('Senior 3 A'));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(app)/marks-entry',
      params: { classSectionId: 'section-1', className: 'Senior 3 A' },
    });
  });
});

describe('what else a teacher does to a class', () => {
  it.each([
    ['Take the register', '/(app)/(tabs)/attendance'],
    ['Set or grade homework', '/(app)/homework-manage'],
    ['How the class is doing', '/(app)/class-analytics'],
  ])('opens %s', async (label, route) => {
    assigned([assignment('Senior 3 A', 'Mathematics')]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText(label)).toBeTruthy());

    await fireEvent.press(screen.getByText(label));

    expect(router.push).toHaveBeenCalledWith(route);
  });
});

describe('when there is nothing to show', () => {
  it('says who assigns a class, since a teacher cannot', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('No classes assigned')).toBeTruthy(),
    );
    expect(screen.getByText(/Once the office gives you a subject/)).toBeTruthy();
  });

  it('shows a placeholder while it loads', async () => {
    givenApi({ '/academic/assignments': () => new Promise(() => {}) });

    const screen = await open();

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  it('says so, and offers another go, when the read fails', async () => {
    givenApiFails('/academic/assignments');

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('That did not load')).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
