import { act, fireEvent, waitFor } from '@testing-library/react-native';

import { givenApi, http, resetApi } from '@/test/api-mock';
import { screenTitle } from '@/test/router-mock';
import { admin, renderScreen, resetHarness, signedInAs } from '@/test/harness';

import Loads from './loads';

/**
 * Who teaches what.
 *
 * The same data read two ways, because an admin needs both. Looking for gaps
 * you group by class: "does S3 A have a maths teacher". Checking workload you
 * group by teacher: "how much is Aline carrying this year". So the grouping
 * is a switch rather than a decision made for them.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const load = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  teacherId: 'teacher-1',
  classSection: { id: 'section-1', name: 'Senior 3 A' },
  subject: { id: 'subject-1', name: 'Mathematics' },
  teacher: { user: { firstName: 'Aline', lastName: 'Uwase' } },
  ...over,
});

const assigned = (rows: unknown[]) =>
  givenApi({ '/academic/assignments': rows });

const open = async () => {
  signedInAs(admin);
  return renderScreen(<Loads />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  assigned([]);
});

/**
 * Reading the loads at all: the scoped hook waits for a teacher id and there
 * is none here, so this screen has to ask for the lot.
 */
describe('reading the whole school’s loads', () => {
  it('asks for every load rather than one teacher’s', async () => {
    assigned([load()]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Senior 3 A')).toBeTruthy());
    expect(http.get).toHaveBeenCalledWith('/academic/assignments');
    expect(screenTitle()).toBe('Who teaches what');
  });

  it('shows a placeholder while it reads', async () => {
    givenApi({ '/academic/assignments': () => new Promise(() => {}) });

    const screen = await open();

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });
});

// "Does S3 A have a maths teacher" is the gap-finding question.
describe('grouped by class', () => {
  it('opens there, with the subjects under each class', async () => {
    assigned([
      load(),
      load({ id: 'a2', subject: { id: 'subject-2', name: 'Physics' } }),
    ]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Senior 3 A')).toBeTruthy());
    expect(screen.getByText('Mathematics')).toBeTruthy();
    expect(screen.getByText('Physics')).toBeTruthy();
  });

  it('names the teacher under each subject', async () => {
    assigned([load()]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
  });

  /**
   * An empty row is the thing this screen exists to find, so it is called out
   * rather than silently absent.
   */
  it('calls out a subject with nobody teaching it', async () => {
    assigned([load({ teacher: undefined, teacherId: undefined })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('No teacher')).toBeTruthy());
    expect(screen.getByText('Unassigned')).toBeTruthy();
  });

  it('puts the classes in an order somebody can scan', async () => {
    assigned([
      load({ id: 'a1', classSection: { id: 's2', name: 'Senior 4 B' } }),
      load({ id: 'a2', classSection: { id: 's1', name: 'Senior 1 A' } }),
    ]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Senior 1 A')).toBeTruthy());
    expect(
      screen.getAllByText(/^Senior \d [AB]$/).map((el) => el.props.children),
    ).toEqual(['Senior 1 A', 'Senior 4 B']);
  });

  it('skips a row with only half a pairing on it', async () => {
    assigned([{ id: 'orphan', subject: { id: 's1', name: 'Mathematics' } }]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('No teaching loads set')).toBeTruthy(),
    );
  });
});

// "How much is Aline carrying this year" is the workload question.
describe('grouped by teacher', () => {
  it('switches, and lists what each one carries', async () => {
    assigned([
      load(),
      load({
        id: 'a2',
        classSection: { id: 'section-2', name: 'Senior 4 B' },
      }),
    ]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Senior 3 A')).toBeTruthy());

    await fireEvent.press(screen.getByText('By teacher'));

    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
    expect(screen.getAllByText('Mathematics')).toHaveLength(2);
    expect(screen.getByText('Senior 4 B')).toBeTruthy();
  });

  /**
   * Carried on the row rather than inferred from its text, so a teacher who
   * happens to be called Unassigned is not flagged as a gap.
   */
  it('groups everything nobody is teaching together, and still flags it', async () => {
    assigned([
      load({ teacher: undefined, teacherId: undefined }),
      load({
        id: 'a2',
        teacher: undefined,
        teacherId: undefined,
        classSection: { id: 'section-2', name: 'Senior 4 B' },
      }),
    ]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Senior 3 A')).toBeTruthy());

    await fireEvent.press(screen.getByText('By teacher'));

    await waitFor(() =>
      expect(screen.getAllByText('No teacher')).toHaveLength(2),
    );
  });
});

describe('searching', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('narrows to a class', async () => {
    assigned([
      load(),
      load({
        id: 'a2',
        classSection: { id: 'section-2', name: 'Senior 4 B' },
      }),
    ]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Senior 4 B')).toBeTruthy());

    await fireEvent.changeText(screen.getByLabelText('Search'), 'Senior 3');
    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    await waitFor(() => expect(screen.queryByText('Senior 4 B')).toBeNull());
    expect(screen.getByText('Senior 3 A')).toBeTruthy();
  });

  it('narrows to a subject inside a class', async () => {
    assigned([
      load(),
      load({
        id: 'a2',
        classSection: { id: 'section-2', name: 'Senior 4 B' },
        subject: { id: 'subject-2', name: 'Physics' },
      }),
    ]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Senior 3 A')).toBeTruthy());

    await fireEvent.changeText(screen.getByLabelText('Search'), 'physics');
    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    await waitFor(() => expect(screen.queryByText('Senior 3 A')).toBeNull());
    expect(screen.getByText('Physics')).toBeTruthy();
  });

  it('says so when nothing matches', async () => {
    assigned([load()]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Senior 3 A')).toBeTruthy());

    await fireEvent.changeText(screen.getByLabelText('Search'), 'Zzz');
    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    await waitFor(() => expect(screen.getByText('Nothing matches')).toBeTruthy());
  });

  it('asks for the right thing depending on the grouping', async () => {
    const screen = await open();

    expect(screen.getByPlaceholderText('A class or a subject')).toBeTruthy();

    await fireEvent.press(screen.getByText('By teacher'));

    await waitFor(() =>
      expect(screen.getByPlaceholderText('A teacher or a subject')).toBeTruthy(),
    );
  });
});

describe('when nothing has been assigned', () => {
  it('says so, and why it matters', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('No teaching loads set')).toBeTruthy(),
    );
    expect(
      screen.getByText(
        'Nobody has been assigned to a subject and class for this year yet.',
      ),
    ).toBeTruthy();
  });

  it('says where a whole year is set up at once', async () => {
    const screen = await open();

    expect(
      screen.getByText(
        'Assigning and removing loads stays on the web dashboard, where a whole year can be set up at once.',
      ),
    ).toBeTruthy();
  });
});
