import { fireEvent, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { router, screenTitle } from '@/test/router-mock';
import { admin, renderScreen, resetHarness, signedInAs } from '@/test/harness';

import Promotion from './promotion';

/**
 * End of year, reviewed rather than configured.
 *
 * On the web an admin sets the thresholds, reads a table of every student and
 * commits. That table is unreadable on a phone and the thresholds are a
 * settings problem, so this screen does the half that suits a phone: it shows
 * the recommendation the server worked out, lets a human disagree with any
 * individual by tapping them, and commits.
 *
 * Overriding is the point. The server recommends on a pass mark and a conduct
 * mark, and a head teacher knows things the two numbers do not.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;

const row = (over: Record<string, unknown> = {}) => ({
  studentId: 'student-1',
  studentName: 'Aline Uwase',
  average: 72.4,
  disciplinePoints: 95,
  passedAcademic: true,
  passedDiscipline: true,
  recommendation: 'PROMOTE',
  ...over,
});

const preview = (rows: unknown[] | Record<string, unknown>) =>
  givenApi({
    '/academic/sections': [{ id: 'section-1', name: 'Senior 3 A' }],
    '/academic/years': [{ id: 'year-1', name: '2026', isCurrent: true }],
    '/academic/promote/preview': rows,
    '/academic/promote/commit': { promoted: 28 },
  });

const open = async () => {
  signedInAs(admin);
  return renderScreen(<Promotion />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  preview([]);
});

describe('what the server recommends', () => {
  it('counts who moves up and who repeats', async () => {
    preview([row(), row({ studentId: 'student-2', recommendation: 'REPEAT' })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Moving up')).toBeTruthy());
    expect(screen.getByText('Repeating')).toBeTruthy();
    expect(screenTitle()).toBe('Promotion');
  });

  /**
   * Saying where the recommendation comes from is what makes disagreeing with
   * it a judgement rather than a guess.
   */
  it('says what the recommendation is based on, and where to change it', async () => {
    preview([row()]);

    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          'The recommendation comes from a pass mark of 50 and a conduct mark of 50. Tap anybody to disagree with it. Changing those thresholds stays on the web.',
        ),
      ).toBeTruthy(),
    );
  });

  it('shows each student with the two numbers behind the call', async () => {
    preview([row()]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
    expect(screen.getByText('72%   ·   95 conduct')).toBeTruthy();
    expect(screen.getByText('Up')).toBeTruthy();
  });

  it('says so where a student has no average at all', async () => {
    preview([row({ average: null, disciplinePoints: undefined })]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('No average   ·   100 conduct')).toBeTruthy(),
    );
  });

  it('reads a preview sent as a paged answer as readily as a list', async () => {
    preview({ rows: [row()] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
  });

  it('names an unnamed row something rather than nothing', async () => {
    preview([row({ studentName: undefined })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Student')).toBeTruthy());
  });

  it('shows a placeholder while it reads', async () => {
    givenApi({ '/academic/promote/preview': () => new Promise(() => {}) });

    const screen = await open();

    await waitFor(() => expect(screen.getByLabelText('Loading')).toBeTruthy());
  });

  it('sends whoever has nothing to decide to work the results out', async () => {
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Nothing to decide')).toBeTruthy());

    await fireEvent.press(
      screen.getByRole('button', { name: 'Go and work them out' }),
    );

    expect(router.push).toHaveBeenCalledWith('/(app)/reports');
  });
});

/**
 * A changed decision is visibly a human decision rather than blending back
 * into the server's recommendation.
 */
describe('disagreeing with it', () => {
  it('flips a student and marks it as somebody’s call', async () => {
    preview([row()]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());

    await fireEvent.press(screen.getByText('Aline Uwase'));

    await waitFor(() => expect(screen.getByText('Repeat')).toBeTruthy());
    expect(screen.getByText('Your call')).toBeTruthy();
  });

  it('counts the changes separately from the recommendation', async () => {
    preview([row()]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());

    await fireEvent.press(screen.getByText('Aline Uwase'));

    await waitFor(() => expect(screen.getByText('You changed')).toBeTruthy());
  });

  it('goes back to the recommendation on a second tap', async () => {
    preview([row()]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
    await fireEvent.press(screen.getByText('Aline Uwase'));
    await waitFor(() => expect(screen.getByText('Your call')).toBeTruthy());

    await fireEvent.press(screen.getByText('Aline Uwase'));

    await waitFor(() => expect(screen.queryByText('Your call')).toBeNull());
    expect(screen.getByText('Up')).toBeTruthy();
  });

  it('counts nothing changed when nothing has been', async () => {
    preview([row()]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
    expect(screen.queryByText('You changed')).toBeNull();
  });

  it('moves the counts as decisions change', async () => {
    preview([row(), row({ studentId: 'student-2', studentName: 'Eric Habimana' })]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Eric Habimana')).toBeTruthy());

    await fireEvent.press(screen.getByText('Eric Habimana'));

    await waitFor(() => expect(screen.getByText('Repeat')).toBeTruthy());
    expect(screen.getByText('Up')).toBeTruthy();
  });
});

/**
 * A class changes immediately and this is not something to undo casually, so
 * it asks and says what it is about to do.
 */
describe('committing', () => {
  it('asks first, and says how many either way', async () => {
    preview([row(), row({ studentId: 'student-2', recommendation: 'REPEAT' })]);
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Commit these decisions' }),
      ).toBeTruthy(),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Commit these decisions' }),
    );

    expect(screen.getByText('Commit these decisions?')).toBeTruthy();
    expect(
      screen.getByText(
        '1 students move up and 1 repeat the year. Their class changes immediately, and this is not something to undo casually.',
      ),
    ).toBeTruthy();
    // The preview is itself a post, so nothing has been committed yet.
    expect(http.post).not.toHaveBeenCalledWith(
      '/academic/promote/commit',
      expect.anything(),
    );
  });

  it('sends a decision for every student, overrides included', async () => {
    preview([row(), row({ studentId: 'student-2', studentName: 'Eric' })]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Eric')).toBeTruthy());
    await fireEvent.press(screen.getByText('Eric'));
    await fireEvent.press(
      screen.getByRole('button', { name: 'Commit these decisions' }),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Commit' }));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/academic/promote/commit', {
        academicYearId: 'year-1',
        decisions: [
          { studentId: 'student-1', promote: true },
          { studentId: 'student-2', promote: false },
        ],
      }),
    );
    expect(notify.success).toHaveBeenCalledWith('1 promoted, 1 repeating');
  });

  it('clears the overrides once they have been committed', async () => {
    preview([row()]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
    await fireEvent.press(screen.getByText('Aline Uwase'));
    await fireEvent.press(
      screen.getByRole('button', { name: 'Commit these decisions' }),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Commit' }));

    await waitFor(() => expect(screen.queryByText('Your call')).toBeNull());
  });

  it('can be thought better of', async () => {
    preview([row()]);
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Commit these decisions' }),
      ).toBeTruthy(),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Commit these decisions' }),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Not yet' }));

    await waitFor(() =>
      expect(screen.queryByText('Commit these decisions?')).toBeNull(),
    );
    expect(http.post).not.toHaveBeenCalledWith(
      '/academic/promote/commit',
      expect.anything(),
    );
  });

  it('has something to say when the school refused silently', async () => {
    preview([row()]);
    givenApiFails('/academic/promote/commit', new Error('offline'));
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Commit these decisions' }),
      ).toBeTruthy(),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Commit these decisions' }),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Commit' }));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not commit that'),
    );
  });

  it('says what the school said when it refused', async () => {
    preview([row()]);
    givenApiFails('/academic/promote/commit', {
      response: { data: { message: 'Next year has no classes yet' } },
    });
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Commit these decisions' }),
      ).toBeTruthy(),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Commit these decisions' }),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Commit' }));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Next year has no classes yet'),
    );
  });
});
