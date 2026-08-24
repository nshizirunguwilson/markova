import { fireEvent, waitFor } from '@testing-library/react-native';

import { defaultTheme } from '@/design/theme';
import { givenApi, resetApi } from '@/test/api-mock';
import { router } from '@/test/router-mock';
import { admin, renderScreen, resetHarness, signedInAs, styleOf } from '@/test/harness';

import Academics from './academics';

/**
 * The structure of the school year, and the way into everything that shapes
 * it.
 *
 * On the web this is six sidebar links. Here it is one place, because on a
 * phone the useful thing is not six destinations, it is knowing at a glance
 * which year and term are live and whether the term is still open for marks.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const school = (over: Record<string, unknown> = {}) =>
  givenApi({
    '/academic/years': [{ id: 'year-1', name: '2026', isCurrent: true }],
    '/academic/terms': [
      { id: 'term-1', name: 'Term 2', isCurrent: true, isClosed: false },
    ],
    '/academic/class-levels': [],
    '/academic/subjects': [],
    ...over,
  });

const open = async () => {
  signedInAs(admin);
  return renderScreen(<Academics />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  school();
});

/**
 * The state at the top answers the question an admin usually opened the app
 * to ask; the list below is where they go if the answer was wrong.
 */
describe('where the school currently is', () => {
  it('names the year and the term', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('2026')).toBeTruthy());
    expect(screen.getByText('Term 2')).toBeTruthy();
  });

  it('says the term is open for marks', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Open for marks')).toBeTruthy(),
    );
    expect(styleOf(screen.getByText('Open for marks')).color).toBe(
      defaultTheme.status.positive.text,
    );
  });

  // A closed term is not a problem, it is the normal end of one, so it reads
  // as a plain state rather than as a warning.
  it('says a closed term is closed, without alarm', async () => {
    school({
      '/academic/terms': [
        { id: 'term-1', name: 'Term 2', isCurrent: true, isClosed: true },
      ],
    });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Closed for marks')).toBeTruthy(),
    );
    expect(styleOf(screen.getByText('Closed for marks')).color).toBe(
      defaultTheme.fg.secondary,
    );
  });

  it('says so plainly when a school has set no year', async () => {
    school({ '/academic/years': [] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('No year set')).toBeTruthy());
    expect(screen.getByText('No current term')).toBeTruthy();
  });

  it('counts what the school is made of', async () => {
    school({
      '/academic/class-levels': [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }],
      '/academic/subjects': [{ id: 's1' }, { id: 's2' }],
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('3')).toBeTruthy());
    expect(screen.getByText('Class levels')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Years on record')).toBeTruthy();
  });

  it('counts nothing as nothing rather than showing a blank', async () => {
    school({ '/academic/years': [] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Class levels')).toBeTruthy());
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });
});

describe('the way into everything that shapes the year', () => {
  it.each([
    ['Years and terms', '/(app)/academics/years'],
    ['Classes', '/(app)/academics/classes'],
    ['Subjects', '/(app)/academics/subjects'],
    ['Assessment types', '/(app)/academics/assessments'],
    ['Who teaches what', '/(app)/academics/loads'],
    ['Timetable', '/(app)/timetable'],
    ['Exam schedule', '/(app)/exam-schedule'],
    ['Marks completion', '/(app)/marks'],
  ])('opens %s', async (label, route) => {
    const screen = await open();
    // "Subjects" is also the label under a figure at the top of the screen,
    // so the row is the last one carrying that text.
    await waitFor(() => expect(screen.getAllByText(label).length).toBeTruthy());
    const rows = screen.getAllByText(label);

    await fireEvent.press(rows[rows.length - 1]);

    expect(router.push).toHaveBeenCalledWith(route);
  });

  it('says what each one is for, rather than only naming it', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText('Open or close a term for marks entry'),
      ).toBeTruthy(),
    );
    expect(screen.getByText('Levels, sections and trades')).toBeTruthy();
    expect(
      screen.getByText('CAT 1, CAT 2, Practical, End of Term'),
    ).toBeTruthy();
  });
});
