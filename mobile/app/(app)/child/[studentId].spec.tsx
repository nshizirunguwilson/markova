import { fireEvent, waitFor } from '@testing-library/react-native';

import { defaultTheme } from '@/design/theme';
import { givenApi, resetApi } from '@/test/api-mock';
import { router, routerState, screenTitle } from '@/test/router-mock';
import {
  parent,
  pressableCount,
  renderScreen,
  resetHarness,
  signedInAs,
  styleOf,
} from '@/test/harness';

import ChildOverview from './[studentId]';

/**
 * One child at a glance, then a door into each part of their record.
 *
 * The three figures at the top are the three questions a parent actually
 * opens this app to answer: are they turning up, are they behaving, and how
 * are they doing.
 *
 * The grade is absent until the term is published. Showing a running average
 * a parent could act on before the school has signed it off would quietly
 * undermine the publish step, and that step exists for a reason.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const record = (over: Record<string, unknown> = {}) =>
  givenApi({
    '/auth/profile': {
      children: [
        {
          id: 'student-1',
          user: { firstName: 'Aline', lastName: 'Uwase' },
          classSection: { name: 'Senior 3 A' },
          studentIdNumber: 'STD-2025-0417',
          disciplinePoints: 100,
        },
      ],
    },
    '/academic/years': [{ id: 'year-1', isCurrent: true }],
    '/academic/terms': [{ id: 'term-1', name: 'Term 2', isCurrent: true }],
    '/attendance/student-summary': { attendanceRate: 96 },
    '/discipline/student/student-1': { incidents: [], totalPoints: 100 },
    '/marks/term-results/student/student-1': { result: null },
    ...over,
  });

const open = async () => {
  signedInAs(parent);
  routerState.params = { studentId: 'student-1' };
  return renderScreen(<ChildOverview />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  record();
});

describe('who the screen is about', () => {
  it('names the child in the header and on the page', async () => {
    const screen = await open();

    await waitFor(() => expect(screenTitle()).toBe('Aline Uwase'));
    expect(screen.getByText('Senior 3 A')).toBeTruthy();
    expect(screen.getByText('STD-2025-0417')).toBeTruthy();
  });

  it('lets the ID number be copied, since a school will ask for it', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('STD-2025-0417').props.selectable).toBe(true),
    );
  });

  it('copes with a child whose class is not set yet', async () => {
    record({
      '/auth/profile': { children: [{ id: 'student-1', user: {} }] },
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Class not set')).toBeTruthy());
  });

  it('still draws for a child the profile does not carry', async () => {
    record({ '/auth/profile': { children: [] } });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Your child')).toBeTruthy());
  });
});

/**
 * Are they turning up, are they behaving, and how are they doing.
 */
describe('the three questions a parent came to answer', () => {
  it('shows the attendance rate against the term', async () => {
    const screen = await open();

    // The rate is both a figure and the label on the bar under it.
    await waitFor(() => expect(screen.getAllByText('96%')).toHaveLength(2));
    expect(screen.getByText('Term 2')).toBeTruthy();
  });

  it.each([
    [96, defaultTheme.status.positive.text],
    [80, defaultTheme.status.caution.text],
    [60, defaultTheme.status.critical.text],
  ])('reads an attendance of %s the way a school would', async (rate, colour) => {
    record({ '/attendance/student-summary': { attendanceRate: rate } });

    const screen = await open();

    await waitFor(() =>
      expect(styleOf(screen.getAllByText(`${rate}%`)[0]).color).toBe(colour),
    );
  });

  it('says nothing is on record when nothing is', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getAllByText('Nothing on record').length).toBeGreaterThan(0),
    );
  });

  it('counts the incidents when there are any', async () => {
    record({
      '/discipline/student/student-1': {
        incidents: [{ id: 'incident-1' }, { id: 'incident-2' }],
        totalPoints: 88,
      },
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('2 incidents')).toBeTruthy());
  });

  it('says one incident properly', async () => {
    record({
      '/discipline/student/student-1': {
        incidents: [{ id: 'incident-1' }],
        totalPoints: 95,
      },
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('1 incident')).toBeTruthy());
  });

  /**
   * The publish step exists so a school signs results off before parents act
   * on them. Leaking a running average would take that decision away.
   */
  it('shows no grade at all until the school publishes', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getAllByText('96%').length).toBe(2));
    expect(screen.queryByText('Term grade')).toBeNull();
    expect(screen.getByText('Not published yet')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
  });

  it('shows the grade and the position once it does', async () => {
    record({
      '/marks/term-results/student/student-1': {
        result: { isPublished: true, letterGrade: 'B', rank: 4 },
      },
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Term grade')).toBeTruthy());
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByText('Rank 4 in class')).toBeTruthy();
  });

  it('says only that it is published where there is no rank', async () => {
    record({
      '/marks/term-results/student/student-1': {
        result: { isPublished: true, letterGrade: 'B' },
      },
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Published')).toBeTruthy());
  });
});

describe('the doors into the record', () => {
  it.each([
    ['Marks', '/(app)/child/marks'],
    ['Attendance', '/(app)/child/attendance'],
    ['Discipline', '/(app)/child/discipline'],
    ['Homework', '/(app)/child/homework'],
    ['Activities', '/(app)/child/activities'],
    ['Health', '/(app)/child/health'],
    ['Pocket money', '/(app)/child/money'],
  ])('opens %s, carrying who it is about', async (label, pathname) => {
    const screen = await open();
    // The rows draw before the profile lands, so wait for the name they will
    // carry rather than for the row itself. Several of these words are also
    // stat labels at the top, so the row is the last one carrying them.
    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
    const rows = screen.getAllByText(label);

    await fireEvent.press(rows[rows.length - 1]);

    expect(router.push).toHaveBeenCalledWith({
      pathname,
      params: { studentId: 'student-1', name: 'Aline Uwase' },
    });
  });

  /**
   * A report card that does not exist yet is a door to nowhere, so it says
   * when it will and refuses to open until then.
   */
  it('will not open a report card the school has not published', async () => {
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());

    expect(
      screen.getByText('Available once the school publishes'),
    ).toBeTruthy();
    // Eight rows, one of which cannot be touched at all.
    expect(pressableCount(screen)).toBe(7);
  });

  it('opens it once there is one to read', async () => {
    record({
      '/marks/term-results/student/student-1': {
        result: { isPublished: true, letterGrade: 'B' },
      },
    });
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Ready to read')).toBeTruthy());
    expect(pressableCount(screen)).toBe(8);

    await fireEvent.press(screen.getByText('Report card'));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(app)/child/reports',
      params: { studentId: 'student-1', name: 'Aline Uwase' },
    });
  });

  /**
   * Activities leads school life because it is the only one of the three that
   * asks the parent for something: a permission slip nobody answered is why a
   * child gets left at the gate.
   */
  it('says what school life covers, beyond school work', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('School life')).toBeTruthy());
    expect(
      screen.getByText('Clubs, trips, and anything needing your permission'),
    ).toBeTruthy();
    expect(
      screen.getByText('Every time the school has looked after them'),
    ).toBeTruthy();
    expect(
      screen.getByText('What the school is holding, and where it has gone'),
    ).toBeTruthy();
  });
});
