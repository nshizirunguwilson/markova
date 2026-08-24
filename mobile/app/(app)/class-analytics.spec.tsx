import { fireEvent, waitFor } from '@testing-library/react-native';

import { defaultTheme } from '@/design/theme';
import { givenApi, http, resetApi } from '@/test/api-mock';
import { screenTitle } from '@/test/router-mock';
import {
  meterFill,
  renderScreen,
  resetHarness,
  signedInAs,
  styleOf,
  teacher,
} from '@/test/harness';

import ClassAnalytics from './class-analytics';

/**
 * How a class is doing.
 *
 * The distribution matters more than the average, because an average of 62
 * hides both a class where everybody sits at 62 and a class split between 85
 * and 40. Those need completely different responses, so the spread leads and
 * the average follows it.
 *
 * The students who need attention are named. A statistic a teacher cannot act
 * on is a statistic that wastes their morning.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const figures = (over: Record<string, unknown> = {}) =>
  givenApi({
    '/academic/assignments': [
      { id: 'a1', classSection: { id: 'section-1', name: 'Senior 3 A' } },
    ],
    '/analytics/teacher/class/section-1': {
      studentCount: 30,
      classAverage: 64.4,
      attendanceRate: 92.1,
      gradeDistribution: [],
      strugglingStudents: [],
      ...over,
    },
  });

const open = async () => {
  signedInAs(teacher);
  return renderScreen(<ClassAnalytics />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  figures();
});

describe('the class as a whole', () => {
  it('says what the screen is', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('30')).toBeTruthy());
    expect(screenTitle()).toBe('How the class is doing');
  });

  it('counts the class and rounds the two figures', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('30')).toBeTruthy());
    expect(screen.getByText('64%')).toBeTruthy();
    expect(screen.getByText('92%')).toBeTruthy();
  });

  it('reads the counts under either name the API uses', async () => {
    figures({ studentCount: undefined, students: 28 });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('28')).toBeTruthy());
  });

  it('says nothing rather than nought when there is no average yet', async () => {
    figures({ classAverage: null, attendanceRate: null });

    const screen = await open();

    await waitFor(() => expect(screen.getAllByText('-')).toHaveLength(2));
  });

  it('reads an average at or above sixty as healthy', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('64%')).toBeTruthy());
    expect(styleOf(screen.getByText('64%')).color).toBe(
      defaultTheme.status.positive.text,
    );
  });

  it('reads one below sixty as worth a look', async () => {
    figures({ classAverage: 48 });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('48%')).toBeTruthy());
    expect(styleOf(screen.getByText('48%')).color).toBe(
      defaultTheme.status.caution.text,
    );
  });

  it('switches to another class', async () => {
    givenApi({
      '/academic/assignments': [
        { id: 'a1', classSection: { id: 'section-1', name: 'Senior 3 A' } },
        { id: 'a2', classSection: { id: 'section-2', name: 'Senior 4 B' } },
      ],
      '/analytics/teacher/class/section-2': { studentCount: 25 },
    });
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Senior 4 B')).toBeTruthy());

    await fireEvent.press(screen.getByText('Senior 4 B'));

    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith('/analytics/teacher/class/section-2'),
    );
  });

  it('skips an assignment the API sent with no class on it', async () => {
    givenApi({ '/academic/assignments': [{ id: 'orphan' }] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('No classes')).toBeTruthy());
  });

  it('says who assigns a class, since a teacher cannot', async () => {
    givenApi({ '/academic/assignments': [] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('No classes')).toBeTruthy());
    expect(screenTitle()).toBe('Class');
  });

  it('shows a placeholder while the figures load', async () => {
    givenApi({
      '/analytics/teacher/class/section-1': () => new Promise(() => {}),
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByLabelText('Loading')).toBeTruthy());
  });
});

/**
 * The spread is the point: it separates a class that is uniformly average
 * from one that is split.
 */
describe('where the class sits', () => {
  it('draws a bar for each grade band, with the count in words', async () => {
    figures({
      gradeDistribution: [
        { grade: 'A', count: 6 },
        { grade: 'C', count: 20 },
        { grade: 'F', count: 1 },
      ],
    });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByLabelText('A   ·   6 students')).toBeTruthy(),
    );
    expect(screen.getByLabelText('C   ·   20 students')).toBeTruthy();
    expect(screen.getByLabelText('F   ·   1 student')).toBeTruthy();
  });

  it('reads the top bands as healthy and the bottom as serious', async () => {
    figures({
      gradeDistribution: [
        { grade: 'A', count: 6 },
        { grade: 'C', count: 20 },
        { grade: 'F', count: 1 },
      ],
    });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getAllByRole('progressbar')).toHaveLength(3),
    );
    const fills = screen
      .getAllByRole('progressbar')
      .map((bar) => styleOf((bar as never as { children: never[] }).children[0]));

    expect(fills[0].backgroundColor).toBe(defaultTheme.status.positive.solid);
    expect(fills[1].backgroundColor).toBe(defaultTheme.brand.solid);
    expect(fills[2].backgroundColor).toBe(defaultTheme.status.critical.solid);
  });

  it('reads the distribution under either name the API uses', async () => {
    figures({
      gradeDistribution: undefined,
      distribution: [{ letter: 'B', count: 4 }],
    });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByLabelText('B   ·   4 students')).toBeTruthy(),
    );
  });

  it('reads a band labelled under any of the names the API uses', async () => {
    figures({ gradeDistribution: [{ label: 'Top third', count: 5 }] });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByLabelText('Top third   ·   5 students')).toBeTruthy(),
    );
  });

  it('copes with a band the API sent with no count', async () => {
    figures({ gradeDistribution: [{ grade: 'A' }, { grade: 'B' }] });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByLabelText('A   ·   0 students')).toBeTruthy(),
    );
  });

  it('reads the bottom band as serious under either letter', async () => {
    const { defaultTheme } = require('@/design/theme');
    figures({ gradeDistribution: [{ letter: 'S', count: 2 }] });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByLabelText('S   ·   2 students')).toBeTruthy(),
    );
    expect(meterFill(screen).backgroundColor).toBe(
      defaultTheme.status.critical.solid,
    );
  });

  it('draws nothing where nothing has been graded', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('30')).toBeTruthy());
    expect(screen.queryByText('Where the class sits')).toBeNull();
  });
});

/**
 * A statistic a teacher cannot act on wastes their morning, so the students
 * behind it are named.
 */
describe('who is worth a word', () => {
  it('names them and says why', async () => {
    figures({
      strugglingStudents: [
        {
          studentId: 'student-1',
          studentName: 'Aline Uwase',
          reason: 'Missed both CATs',
          average: 38.6,
        },
      ],
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Worth a word')).toBeTruthy());
    expect(screen.getByText('Aline Uwase')).toBeTruthy();
    expect(screen.getByText('Missed both CATs')).toBeTruthy();
    expect(screen.getByText('39%')).toBeTruthy();
  });

  it('says something sensible where the API gave no reason', async () => {
    figures({
      strugglingStudents: [{ studentId: 'student-1', studentName: 'Aline Uwase' }],
    });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Below the class average')).toBeTruthy(),
    );
  });

  it('draws a row the API sent with no id at all', async () => {
    figures({ strugglingStudents: [{ studentName: 'Aline Uwase' }] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
  });

  it('names an unnamed student something rather than nothing', async () => {
    figures({ strugglingStudents: [{ studentId: 'student-1' }] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Student')).toBeTruthy());
  });

  it('reads the list under either name the API uses', async () => {
    figures({
      strugglingStudents: undefined,
      needsAttention: [{ id: 'student-1', name: 'Eric Habimana' }],
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Eric Habimana')).toBeTruthy());
  });

  // Nobody behind is a healthy state, not an empty one.
  it('says so plainly when nobody is far enough behind', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText('Nobody is far enough behind to flag right now.'),
      ).toBeTruthy(),
    );
  });
});
