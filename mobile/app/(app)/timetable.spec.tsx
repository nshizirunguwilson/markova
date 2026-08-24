import { fireEvent, waitFor } from '@testing-library/react-native';

import { givenApi, http, resetApi } from '@/test/api-mock';
import { screenTitle } from '@/test/router-mock';
import {
  admin,
  parent,
  renderScreen,
  resetHarness,
  signedInAs,
  teacher,
} from '@/test/harness';

import Timetable from './timetable';

/**
 * The week.
 *
 * A grid is the wrong shape for a phone: seven columns of forty minute slots
 * on a 390 point screen gives cells too small to read and too small to tap.
 * So it is a day at a time, opening on today, with the gaps left out rather
 * than drawn as empty rows.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

// The API counts Monday as 1; JavaScript counts Sunday as 0.
const jsDay = new Date().getDay();
const todayValue = String(jsDay === 0 ? 1 : jsDay);
const DAY_LABELS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const lesson = (over: Record<string, unknown> = {}) => ({
  id: 'slot-1',
  dayOfWeek: todayValue,
  startTime: '08:00',
  endTime: '08:40',
  room: 'Room 4',
  subject: { name: 'Mathematics' },
  classSection: { name: 'Senior 3 A' },
  teacher: { user: { firstName: 'Aline', lastName: 'Uwase' } },
  ...over,
});

const week = (over: Record<string, unknown> = {}) =>
  givenApi({
    '/academic/sections': [{ id: 'section-1', name: 'Senior 3 A' }],
    '/auth/profile': { children: [] },
    '/academic/timetable': [],
    '/academic/timetable/teacher/teacher-1': [],
    ...over,
  });

const open = async (user: Parameters<typeof signedInAs>[0]) => {
  signedInAs(user);
  return renderScreen(<Timetable />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  week();
});

describe('a teacher’s week', () => {
  it('is called their week rather than a timetable', async () => {
    await open(teacher);

    expect(screenTitle()).toBe('Your week');
  });

  it('reads their own timetable, not a class one', async () => {
    await open(teacher);

    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith(
        '/academic/timetable/teacher/teacher-1',
      ),
    );
    expect(http.get).not.toHaveBeenCalledWith(
      '/academic/timetable',
      expect.anything(),
    );
  });

  it('offers no class picker, since they have no choice to make', async () => {
    const screen = await open(teacher);

    await waitFor(() =>
      expect(screen.getAllByRole('tab')).toHaveLength(6),
    );
  });

  it('says which class each lesson is with', async () => {
    week({ '/academic/timetable/teacher/teacher-1': [lesson()] });

    const screen = await open(teacher);

    await waitFor(() =>
      expect(screen.getByText('Senior 3 A   ·   Room 4')).toBeTruthy(),
    );
  });
});

describe('a class timetable', () => {
  it('is called a timetable', async () => {
    await open(admin);

    expect(screenTitle()).toBe('Timetable');
  });

  it('opens on the first class in the school', async () => {
    week({ '/academic/timetable': [lesson()] });

    const screen = await open(admin);

    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith('/academic/timetable', {
        params: { classSectionId: 'section-1' },
      }),
    );
    expect(screen.getByText('Senior 3 A')).toBeTruthy();
  });

  it('names the teacher rather than the class', async () => {
    week({ '/academic/timetable': [lesson()] });

    const screen = await open(admin);

    await waitFor(() =>
      expect(screen.getByText('Aline Uwase   ·   Room 4')).toBeTruthy(),
    );
  });

  it('switches to another class', async () => {
    week({
      '/academic/sections': [
        { id: 'section-1', name: 'Senior 3 A' },
        { id: 'section-2', name: 'Senior 4 B' },
      ],
    });
    const screen = await open(admin);
    await waitFor(() => expect(screen.getByText('Senior 4 B')).toBeTruthy());

    await fireEvent.press(screen.getByText('Senior 4 B'));

    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith('/academic/timetable', {
        params: { classSectionId: 'section-2' },
      }),
    );
  });

  it('copes with a lesson the API sent with no teacher on it', async () => {
    week({ '/academic/timetable': [lesson({ teacher: undefined })] });

    const screen = await open(admin);

    await waitFor(() => expect(screen.getByText('Room 4')).toBeTruthy());
  });

  it('copes with a lesson that has no subject named', async () => {
    week({ '/academic/timetable': [lesson({ subject: undefined })] });

    const screen = await open(admin);

    await waitFor(() => expect(screen.getByText('Subject')).toBeTruthy());
  });
});

/**
 * A parent picks between their children rather than between class sections,
 * because "Senior 3 A" means less to them than "Aline".
 */
describe('a parent’s view', () => {
  it('picks between children by name', async () => {
    week({
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
    week({
      '/auth/profile': {
        children: [
          { id: 'student-1', classSection: { id: 'section-1', name: 'Senior 3 A' } },
        ],
      },
    });

    const screen = await open(parent);

    await waitFor(() => expect(screen.getByText('Senior 3 A')).toBeTruthy());
  });

  it('leaves out a child who is not in a class yet', async () => {
    week({ '/auth/profile': { children: [{ id: 'student-1' }] } });

    const screen = await open(parent);

    await waitFor(() =>
      expect(screen.getAllByRole('tab')).toHaveLength(6),
    );
  });
});

describe('the day', () => {
  /**
   * A school does not run on Sunday, and JavaScript calls it day zero, so
   * opening the app then has to land somewhere a person can read.
   */
  it('opens on Monday when today is a Sunday', async () => {
    const realDay = Date.prototype.getDay;
    Date.prototype.getDay = () => 0;
    week({ '/academic/timetable/teacher/teacher-1': [lesson({ dayOfWeek: '1' })] });

    const screen = await open(teacher);

    await waitFor(() => expect(screen.getByText('1 lesson, today')).toBeTruthy());
    Date.prototype.getDay = realDay;
  });

  it('opens on today', async () => {
    week({ '/academic/timetable/teacher/teacher-1': [lesson()] });

    const screen = await open(teacher);

    await waitFor(() => expect(screen.getByText('1 lesson, today')).toBeTruthy());
  });

  it('offers the six days a school runs', async () => {
    const screen = await open(teacher);

    for (const label of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('shows another day when one is picked', async () => {
    const otherDay = todayValue === '1' ? '2' : '1';
    week({
      '/academic/timetable/teacher/teacher-1': [
        lesson({ id: 'slot-2', dayOfWeek: otherDay, subject: { name: 'Physics' } }),
      ],
    });
    const screen = await open(teacher);
    await waitFor(() =>
      expect(screen.getByText('Nothing scheduled')).toBeTruthy(),
    );

    await fireEvent.press(screen.getByText(DAY_LABELS[Number(otherDay)]));

    await waitFor(() => expect(screen.getByText('Physics')).toBeTruthy());
    expect(screen.getByText('1 lesson')).toBeTruthy();
  });

  it('counts more than one lesson properly', async () => {
    week({
      '/academic/timetable/teacher/teacher-1': [
        lesson(),
        lesson({ id: 'slot-2', startTime: '09:00' }),
      ],
    });

    const screen = await open(teacher);

    await waitFor(() =>
      expect(screen.getByText('2 lessons, today')).toBeTruthy(),
    );
  });

  /**
   * A free period is not information a teacher needs a box for. What they
   * need is the next thing and where it is.
   */
  it('puts the lessons in the order they happen, with no gaps drawn', async () => {
    week({
      '/academic/timetable/teacher/teacher-1': [
        lesson({ id: 'slot-2', startTime: '11:00', subject: { name: 'Physics' } }),
        lesson({ id: 'slot-1', startTime: '08:00', subject: { name: 'Mathematics' } }),
      ],
    });

    const screen = await open(teacher);

    await waitFor(() => expect(screen.getByText('Mathematics')).toBeTruthy());
    expect(
      screen.getAllByText(/^(Mathematics|Physics)$/).map((el) => el.props.children),
    ).toEqual(['Mathematics', 'Physics']);
  });

  it('says so when today has nothing on it', async () => {
    const screen = await open(teacher);

    await waitFor(() =>
      expect(
        screen.getByText('No lessons on the timetable for today.'),
      ).toBeTruthy(),
    );
  });

  it('says it differently for a day that is not today', async () => {
    const otherDay = todayValue === '1' ? '2' : '1';
    const screen = await open(teacher);
    await waitFor(() =>
      expect(screen.getByText('Nothing scheduled')).toBeTruthy(),
    );

    await fireEvent.press(screen.getByText(DAY_LABELS[Number(otherDay)]));

    await waitFor(() =>
      expect(
        screen.getByText('No lessons on the timetable for that day.'),
      ).toBeTruthy(),
    );
  });

  it('shows a placeholder while the week loads', async () => {
    week({
      '/academic/timetable/teacher/teacher-1': () => new Promise(() => {}),
    });

    const screen = await open(teacher);

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });
});
