import { waitFor } from '@testing-library/react-native';

import { defaultTheme } from '@/design/theme';
import { givenApi, resetApi } from '@/test/api-mock';
import { routerState, screenTitle } from '@/test/router-mock';
import {
  meterFill,
  parent,
  renderScreen,
  resetHarness,
  signedInAs,
  styleOf,
} from '@/test/harness';

import ChildAttendance from './attendance';

/**
 * How often a child is actually in school.
 *
 * The rate leads, because that is the number a parent is judged on at a
 * meeting, but the reasons matter more than the percentage. A child at 84 per
 * cent who was signed off sick is a different conversation from one at 84 per
 * cent marked unexcused, so absences are listed with their reason rather than
 * collapsed into a single figure.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const summary = (over: Record<string, unknown> = {}) =>
  givenApi({
    '/academic/years': [{ id: 'year-1', isCurrent: true }],
    '/academic/terms': [{ id: 'term-1', name: 'Term 2', isCurrent: true }],
    '/attendance/student-summary': {
      attendanceRate: 96,
      presentDays: 48,
      absentDays: 2,
      records: [],
      ...over,
    },
  });

const open = async () => {
  signedInAs(parent);
  routerState.params = { studentId: 'student-1', name: 'Aline Uwase' };
  return renderScreen(<ChildAttendance />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  summary();
});

describe('the figure a parent is judged on', () => {
  it('names the child in the header', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('Present')).toBeTruthy());
    expect(screenTitle()).toBe('Aline Uwase, attendance');
  });

  it('is called plain attendance when it does not know whose', async () => {
    signedInAs(parent);
    routerState.params = { studentId: 'student-1' };

    const screen = await renderScreen(<ChildAttendance />);

    await waitFor(() => expect(screen.getByText('Present')).toBeTruthy());
    expect(screenTitle()).toBe('Attendance');
  });

  it('counts the days in and the days out, not only the rate', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('48')).toBeTruthy());
    expect(screen.getByText('Days in')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Days out')).toBeTruthy();
  });

  it('reads the counts under either name the API uses', async () => {
    summary({ presentDays: undefined, present: 44, absentDays: undefined, absent: 6 });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('44')).toBeTruthy());
    expect(screen.getByText('6')).toBeTruthy();
  });

  it.each([
    [96, defaultTheme.status.positive.solid],
    [80, defaultTheme.status.caution.solid],
    [60, defaultTheme.status.critical.solid],
  ])('reads a rate of %s the way the school would', async (rate, colour) => {
    summary({ attendanceRate: rate });

    const screen = await open();

    await waitFor(() => expect(screen.getByLabelText('This term')).toBeTruthy());
    expect(meterFill(screen).backgroundColor).toBe(colour);
  });

  /**
   * Below the follow-up threshold, the screen says what will happen next and
   * who to talk to, rather than leaving a parent to work it out from a red
   * number.
   */
  it('says what happens next once it falls below the threshold', async () => {
    summary({ attendanceRate: 62 });

    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          'Below the level the school follows up on. Expect to hear from them, and talk to the class teacher if something is going on.',
        ),
      ).toBeTruthy(),
    );
  });

  it('says nothing of the sort while it is healthy', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('Present')).toBeTruthy());
    expect(screen.queryByText(/Below the level/)).toBeNull();
  });

  it('names the term the figure belongs to', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('Term 2')).toBeTruthy());
  });

  it('shows a placeholder while it reads', async () => {
    givenApi({ '/attendance/student-summary': () => new Promise(() => {}) });

    const screen = await open();

    await waitFor(() => expect(screen.getByLabelText('Loading')).toBeTruthy());
  });
});

/**
 * Twelve absences is a fact a parent can act on. A sparkline is not.
 */
describe('every day missed', () => {
  const day = (over: Record<string, unknown> = {}) => ({
    id: 'record-1',
    date: '2026-08-18',
    status: 'ABSENT',
    reasonCategory: 'SICK',
    ...over,
  });

  it('lists each one with the day it fell on', async () => {
    summary({ records: [day()] });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Every day missed')).toBeTruthy(),
    );
    expect(
      screen.getByText(
        new Date('2026-08-18').toLocaleDateString(undefined, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }),
      ),
    ).toBeTruthy();
  });

  /**
   * Signed off sick is a different conversation from unexcused, so the reason
   * is on the row rather than folded into the percentage.
   */
  it('says why, in words rather than a code', async () => {
    summary({ records: [day({ reasonCategory: 'FAMILY_EMERGENCY' })] });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Family emergency')).toBeTruthy(),
    );
  });

  it('says so plainly when nobody recorded a reason', async () => {
    summary({ records: [day({ reasonCategory: undefined })] });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('No reason recorded')).toBeTruthy(),
    );
  });

  it('separates a late arrival from an absence', async () => {
    summary({
      records: [day(), day({ id: 'record-2', status: 'LATE' })],
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Absent')).toBeTruthy());
    expect(screen.getByText('Late')).toBeTruthy();
  });

  it('leaves out the days they were there', async () => {
    summary({
      records: [day(), day({ id: 'record-2', status: 'PRESENT' })],
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Absent')).toBeTruthy());
    expect(screen.queryByText('Present', { exact: true })).toBeTruthy();
    expect(screen.getAllByText('Absent')).toHaveLength(1);
  });

  // A full record is worth saying out loud rather than showing as an empty
  // list.
  it('says so when not a single day was missed', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('A full attendance record')).toBeTruthy(),
    );
    expect(screen.getByText('Not a single day missed this term.')).toBeTruthy();
    expect(screen.getByText('Nothing missed')).toBeTruthy();
  });
});
