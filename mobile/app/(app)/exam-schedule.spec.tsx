import { fireEvent, waitFor } from '@testing-library/react-native';

import { defaultTheme } from '@/design/theme';
import { givenApi, http, resetApi } from '@/test/api-mock';
import { screenTitle } from '@/test/router-mock';
import {
  admin,
  parent,
  renderScreen,
  resetHarness,
  signedInAs,
  styleOf,
} from '@/test/harness';

import ExamSchedule from './exam-schedule';

/**
 * When the exams are.
 *
 * Grouped by date and ordered forward, with anything already sat pushed to
 * the bottom. The countdown is the point: a parent or a student opens this to
 * find out how many days are left, not to browse a calendar, so the next exam
 * says "in 3 days" rather than making somebody work it out from a date.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const inDays = (n: number) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.toISOString();
};

const exam = (over: Record<string, unknown> = {}) => ({
  id: 'exam-1',
  examDate: inDays(7),
  startTime: '08:00',
  endTime: '10:00',
  room: 'Hall',
  subject: { name: 'Mathematics' },
  ...over,
});

const calendar = (exams: unknown[], over: Record<string, unknown> = {}) =>
  givenApi({
    '/academic/sections': [{ id: 'section-1', name: 'Senior 3 A' }],
    '/academic/years': [{ id: 'year-1', isCurrent: true }],
    '/academic/terms': [{ id: 'term-1', name: 'Term 2', isCurrent: true }],
    '/auth/profile': { children: [] },
    '/academic/exams': exams,
    ...over,
  });

const open = async (user = admin) => {
  signedInAs(user);
  return renderScreen(<ExamSchedule />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  calendar([]);
});

/**
 * "In 3 days" rather than a date, because the countdown is the point.
 */
describe('the countdown', () => {
  it.each([
    [0, 'Today'],
    [1, 'Tomorrow'],
    [5, 'In 5 days'],
  ])('says an exam in %s days is "%s"', async (days, label) => {
    calendar([exam({ examDate: inDays(days) })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText(label)).toBeTruthy());
  });

  it('reads one today as the most urgent thing on the screen', async () => {
    calendar([exam({ examDate: inDays(0) })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Today')).toBeTruthy());
    expect(styleOf(screen.getByText('Today')).color).toBe(
      defaultTheme.status.critical.text,
    );
  });

  it('reads one within three days as worth preparing for', async () => {
    calendar([exam({ examDate: inDays(2) })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('In 2 days')).toBeTruthy());
    expect(styleOf(screen.getByText('In 2 days')).color).toBe(
      defaultTheme.status.caution.text,
    );
  });

  it('reads one weeks away as ordinary', async () => {
    calendar([exam({ examDate: inDays(20) })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('In 20 days')).toBeTruthy());
    expect(styleOf(screen.getByText('In 20 days')).color).toBe(
      defaultTheme.fg.secondary,
    );
  });
});

describe('what is still to come', () => {
  it('says the subject, the day, the time and the room', async () => {
    const when = inDays(7);
    calendar([exam({ examDate: when })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Mathematics')).toBeTruthy());
    expect(
      screen.getByText(
        `${new Date(when).toLocaleDateString(undefined, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}   ·   08:00 to 10:00   ·   Hall`,
      ),
    ).toBeTruthy();
    expect(screenTitle()).toBe('Exams');
  });

  it('leaves out a time nobody set', async () => {
    calendar([exam({ startTime: null, room: null })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Mathematics')).toBeTruthy());
    expect(screen.queryByText(/08:00/)).toBeNull();
  });

  it('names an exam whose subject record has gone', async () => {
    calendar([exam({ subject: undefined })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Subject')).toBeTruthy());
  });

  it('puts the soonest one first', async () => {
    calendar([
      exam({ id: 'exam-2', examDate: inDays(10), subject: { name: 'Physics' } }),
      exam({ id: 'exam-1', examDate: inDays(2), subject: { name: 'Maths' } }),
    ]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Maths')).toBeTruthy());
    expect(
      screen.getAllByText(/^(Maths|Physics)$/).map((el) => el.props.children),
    ).toEqual(['Maths', 'Physics']);
  });
});

/**
 * Anything already sat is history, so it goes to the bottom and loses its
 * countdown.
 */
describe('what has already been sat', () => {
  it('goes below what is still to come', async () => {
    calendar([
      exam({ id: 'past', examDate: inDays(-3), subject: { name: 'History' } }),
      exam({ id: 'future', examDate: inDays(3), subject: { name: 'Maths' } }),
    ]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Still to come')).toBeTruthy());
    expect(screen.getByText('Already sat')).toBeTruthy();
  });

  it('carries no countdown, since there is nothing to count to', async () => {
    calendar([exam({ examDate: inDays(-3) })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Already sat')).toBeTruthy());
    expect(screen.queryByText(/days ago/)).toBeNull();
  });

  it('shows the most recent one first', async () => {
    calendar([
      exam({ id: 'older', examDate: inDays(-10), subject: { name: 'History' } }),
      exam({ id: 'recent', examDate: inDays(-2), subject: { name: 'Maths' } }),
    ]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Already sat')).toBeTruthy());
    expect(
      screen.getAllByText(/^(Maths|History)$/).map((el) => el.props.children),
    ).toEqual(['Maths', 'History']);
  });

  it('shows only that heading when everything is behind them', async () => {
    calendar([exam({ examDate: inDays(-3) })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Already sat')).toBeTruthy());
    expect(screen.queryByText('Still to come')).toBeNull();
  });
});

describe('whose exams they are', () => {
  it('picks between classes for a member of staff', async () => {
    calendar([exam()], {
      '/academic/sections': [
        { id: 'section-1', name: 'Senior 3 A' },
        { id: 'section-2', name: 'Senior 4 B' },
      ],
    });
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Senior 4 B')).toBeTruthy());

    await fireEvent.press(screen.getByText('Senior 4 B'));

    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith('/academic/exams', {
        params: { classSectionId: 'section-2', termId: 'term-1' },
      }),
    );
  });

  // "Senior 3 A" means less to a parent than "Aline".
  it('picks between children by name for a parent', async () => {
    calendar([exam()], {
      '/auth/profile': {
        children: [
          {
            id: 'student-1',
            user: { firstName: 'Aline' },
            classSection: { id: 'section-1', name: 'Senior 3 A' },
          },
        ],
      },
    });

    const screen = await open(parent);

    await waitFor(() => expect(screen.getByText('Aline')).toBeTruthy());
  });

  it('falls back to the class name where a child has none', async () => {
    calendar([exam()], {
      '/auth/profile': {
        children: [
          { id: 'student-1', classSection: { id: 'section-1', name: 'Senior 3 A' } },
        ],
      },
    });

    const screen = await open(parent);

    await waitFor(() => expect(screen.getByText('Senior 3 A')).toBeTruthy());
  });

  it('leaves out a child not in a class yet', async () => {
    calendar([], {
      '/auth/profile': { children: [{ id: 'student-1' }] },
    });

    const screen = await open(parent);

    await waitFor(() => expect(screen.queryAllByRole('tab')).toHaveLength(0));
  });
});

describe('when there is nothing on the calendar', () => {
  it('names the term nothing has been scheduled for', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText('Nothing has been put on the calendar for Term 2 yet.'),
      ).toBeTruthy(),
    );
  });

  it('still says something where there is no current term', async () => {
    calendar([], { '/academic/years': [] });

    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          'Nothing has been put on the calendar for this term yet.',
        ),
      ).toBeTruthy(),
    );
  });

  it('shows a placeholder while it reads', async () => {
    calendar([], { '/academic/exams': () => new Promise(() => {}) });

    const screen = await open();

    await waitFor(() => expect(screen.getByLabelText('Loading')).toBeTruthy());
  });
});
