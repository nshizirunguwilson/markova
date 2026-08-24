import { fireEvent, waitFor } from '@testing-library/react-native';

import { defaultTheme } from '@/design/theme';
import { givenApi, http, resetApi } from '@/test/api-mock';
import { screenTitle } from '@/test/router-mock';
import {
  admin,
  meterFill,
  parent,
  renderScreen,
  resetHarness,
  signedInAs,
} from '@/test/harness';

import Analytics from './analytics';

/**
 * Analytics, read rather than configured.
 *
 * The web has eight admin views with filters and charts. A phone is a bad
 * place to interrogate data and a good place to be told a number, so this is
 * the reading version: the figures that would make somebody act, and no chart
 * that needs pinching.
 *
 * Parents get their own child's trend instead, which is the only analytics
 * question a parent actually has.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const school = (over: Record<string, unknown> = {}) =>
  givenApi({
    '/academic/years': [{ id: 'year-1', name: '2026', isCurrent: true }],
    '/academic/terms': [{ id: 'term-1', name: 'Term 2', isCurrent: true }],
    '/analytics/admin/dashboard': {},
    ...over,
  });

const open = async (user = admin) => {
  signedInAs(user);
  return renderScreen(<Analytics />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  school();
});

describe('the school’s figures', () => {
  it('opens on the overview and reads it for the current term', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith('/analytics/admin/dashboard', {
        params: { termId: 'term-1' },
      }),
    );
    expect(screenTitle()).toBe('Analytics');
  });

  it('offers the views the web has, without their filters', async () => {
    const screen = await open();

    for (const view of [
      'Overview',
      'Attendance',
      'Grades',
      'Discipline',
      'Enrolment',
      'Library',
    ]) {
      expect(screen.getByText(view)).toBeTruthy();
    }
  });

  it('switches to another view', async () => {
    school({ '/analytics/admin/attendance': {} });
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Attendance')).toBeTruthy());

    await fireEvent.press(screen.getByText('Attendance'));

    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith('/analytics/admin/attendance', {
        params: { termId: 'term-1' },
      }),
    );
  });

  /**
   * The API decides what a view contains, so the screen reads whatever
   * figures it sent rather than hard-coding a set that goes stale.
   */
  it('shows whatever figures the view came back with', async () => {
    school({
      '/analytics/admin/dashboard': {
        totalStudents: 412,
        attendanceRate: 94.6,
      },
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('412')).toBeTruthy());
    expect(screen.getByText('Total Students')).toBeTruthy();
    expect(screen.getByText('95')).toBeTruthy();
    expect(screen.getByText('Attendance Rate')).toBeTruthy();
  });

  it('lists whatever tables it came back with', async () => {
    school({
      '/analytics/admin/dashboard': {
        topClasses: [
          { name: 'Senior 3 A', average: 74.6 },
          { name: 'Senior 4 B', average: 68 },
        ],
      },
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Top Classes')).toBeTruthy());
    expect(screen.getByText('Senior 3 A')).toBeTruthy();
    expect(screen.getByText('75')).toBeTruthy();
  });

  it('reads a row labelled under any of the names the API uses', async () => {
    school({
      '/analytics/admin/dashboard': {
        rows: [
          { label: 'By label', count: 1 },
          { className: 'By class name', total: 2 },
          { grade: 'By grade', rate: 3 },
        ],
      },
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('By label')).toBeTruthy());
    expect(screen.getByText('By class name')).toBeTruthy();
    expect(screen.getByText('By grade')).toBeTruthy();
  });

  it('says so plainly for a row it cannot name', async () => {
    school({ '/analytics/admin/dashboard': { rows: [{ somethingElse: 1 }] } });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('-')).toBeTruthy());
  });

  // A phone is not the place to scroll four hundred rows.
  it('stops a long table where it stops being readable', async () => {
    school({
      '/analytics/admin/dashboard': {
        rows: Array.from({ length: 40 }, (_, i) => ({
          name: `Row ${i}`,
          count: i,
        })),
      },
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Row 0')).toBeTruthy());
    expect(screen.getByText('Row 24')).toBeTruthy();
    expect(screen.queryByText('Row 25')).toBeNull();
  });

  it('says so when a view has nothing behind it yet', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Nothing to show yet')).toBeTruthy(),
    );
    expect(
      screen.getByText('This view needs data that has not been recorded yet.'),
    ).toBeTruthy();
  });

  it('shows a placeholder while it reads', async () => {
    school({ '/analytics/admin/dashboard': () => new Promise(() => {}) });

    const screen = await open();

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });
});

/**
 * The only analytics question a parent actually has is how their own child is
 * going, term by term.
 */
describe('a parent’s version', () => {
  const child = (over: Record<string, unknown> = {}) => ({
    id: 'student-1',
    user: { firstName: 'Aline', lastName: 'Uwase' },
    ...over,
  });

  const trends = (over: Record<string, unknown> = {}, children = [child()]) =>
    givenApi({
      '/auth/profile': { children },
      '/academic/years': [{ id: 'year-1', name: '2026', isCurrent: true }],
      '/analytics/parent/child/student-1/trends': {
        terms: [
          { termId: 'term-1', termName: 'Term 1', average: 72 },
          { termId: 'term-2', termName: 'Term 2', average: 78 },
        ],
        ...over,
      },
    });

  it('is about their child rather than the school', async () => {
    trends();

    const screen = await open(parent);

    await waitFor(() => expect(screen.getByLabelText('Term 1')).toBeTruthy());
    expect(screen.getByLabelText('Term 2')).toBeTruthy();
    expect(screenTitle()).toBe('How they are doing');
  });

  it.each([
    [78, defaultTheme.status.positive.solid],
    [60, defaultTheme.status.caution.solid],
    [40, defaultTheme.status.critical.solid],
  ])('reads an average of %s the way a parent would', async (average, colour) => {
    trends({ terms: [{ termId: 'term-1', termName: 'Term 1', average }] });

    const screen = await open(parent);

    await waitFor(() => expect(screen.getByLabelText('Term 1')).toBeTruthy());
    expect(meterFill(screen).backgroundColor).toBe(colour);
  });

  it('picks between children only when there is more than one', async () => {
    trends({}, [child()]);

    const screen = await open(parent);

    await waitFor(() => expect(screen.getByLabelText('Term 1')).toBeTruthy());
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('offers the choice by name once there is', async () => {
    trends({}, [
      child(),
      child({ id: 'student-2', user: { firstName: 'Eric', lastName: 'Uwase' } }),
    ]);

    const screen = await open(parent);

    await waitFor(() => expect(screen.getByText('Aline')).toBeTruthy());
    expect(screen.getByText('Eric')).toBeTruthy();
  });

  it('reads the trend under either name the API uses', async () => {
    trends({
      terms: undefined,
      trend: [{ term: 'Term 1', average: 72 }],
    });

    const screen = await open(parent);

    await waitFor(() => expect(screen.getByLabelText('Term 1')).toBeTruthy());
  });

  /**
   * Only published terms count, so a parent is not comparing against a
   * running average the school has not signed off.
   */
  it('says only published terms are counted', async () => {
    trends();

    const screen = await open(parent);

    await waitFor(() =>
      expect(screen.getByText('Only published terms are counted here.')).toBeTruthy(),
    );
  });

  it('says so before there is anything to compare', async () => {
    trends({ terms: [] });

    const screen = await open(parent);

    await waitFor(() =>
      expect(screen.getByText('Not enough history yet')).toBeTruthy(),
    );
    expect(
      screen.getByText(
        'Once a term has been published, the change from one term to the next shows up here.',
      ),
    ).toBeTruthy();
  });
});
