import { fireEvent, waitFor } from '@testing-library/react-native';

import { givenApi, resetApi } from '@/test/api-mock';
import { router } from '@/test/router-mock';
import {
  admin,
  meterFill,
  librarian,
  matron,
  nurse,
  parent,
  renderScreen,
  resetHarness,
  signedInAs,
  teacher,
} from '@/test/harness';

import Home from './index';

/**
 * Home.
 *
 * The previous dashboard opened with a coloured welcome card and a grid of
 * tiles that were mostly navigation, which already exists at the bottom of
 * the screen. This one answers a question instead: each role gets the thing
 * they opened the app to find out, stated in words at the top, then the two
 * or three figures that qualify it.
 *
 * There is no greeting card. A person knows their own name.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const emptySchool = () =>
  givenApi({
    '/auth/profile': { children: [] },
    '/notifications': [],
    '/academic/years': [{ id: 'year-1', isCurrent: true }],
    '/academic/terms': [{ id: 'term-1', name: 'Term 2', isCurrent: true }],
    '/academic/timetable/teacher/teacher-1': [],
    '/attendance/class': [],
    '/attendance/chronic': [],
    '/analytics/admin/dashboard': {},
    '/library/analytics': {},
    '/library/loans/overdue': [],
    '/clinic/summary': { inSickBay: 0, visits: 0, referred: 0, repeatVisitors: [] },
    '/activities/upcoming': [],
  });

const open = async (user: Parameters<typeof signedInAs>[0]) => {
  signedInAs(user);
  return renderScreen(<Home />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  emptySchool();
});

/**
 * A parent opens this to find out whether anything needs them. Say that
 * first, in words, before any number.
 */
describe('a parent’s home', () => {
  const child = (over: Record<string, unknown> = {}) => ({
    id: 'student-1',
    user: { firstName: 'Aline', lastName: 'Uwase' },
    classSection: { name: 'Senior 3 A' },
    ...over,
  });

  it('says nothing needs them when nothing does', async () => {
    givenApi({ '/auth/profile': { children: [child()] } });

    const screen = await open(parent);

    await waitFor(() =>
      expect(screen.getByText('Nothing needs you today')).toBeTruthy(),
    );
  });

  it('greets them by name under the headline, not in a card above it', async () => {
    givenApi({ '/auth/profile': { children: [child()] } });

    const screen = await open(parent);

    await waitFor(() =>
      expect(screen.getByText('Good to see you, Jean.')).toBeTruthy(),
    );
  });

  it('lists their children with the class each is in', async () => {
    givenApi({ '/auth/profile': { children: [child()] } });

    const screen = await open(parent);

    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
    expect(screen.getByText('Senior 3 A')).toBeTruthy();
    expect(screen.getByText('Your child')).toBeTruthy();
  });

  it('says "children" once there is more than one', async () => {
    givenApi({
      '/auth/profile': {
        children: [
          child(),
          child({ id: 'student-2', user: { firstName: 'Eric', lastName: 'Uwase' } }),
        ],
      },
    });

    const screen = await open(parent);

    await waitFor(() => expect(screen.getByText('Your children')).toBeTruthy());
  });

  it('opens a child when their row is pressed', async () => {
    givenApi({ '/auth/profile': { children: [child()] } });
    const screen = await open(parent);
    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());

    await fireEvent.press(screen.getByText('Aline Uwase'));

    expect(router.push).toHaveBeenCalledWith('/(app)/child/student-1');
  });

  /**
   * Conduct points below the threshold are the one thing on this screen that
   * asks a parent to do something, so they are counted into the headline.
   */
  it('counts a child in trouble into the headline', async () => {
    givenApi({
      '/auth/profile': { children: [child({ disciplinePoints: 72 })] },
    });

    const screen = await open(parent);

    await waitFor(() =>
      expect(screen.getByText('One thing needs a look')).toBeTruthy(),
    );
    expect(screen.getByText('72 pts')).toBeTruthy();
  });

  it('counts two of them as two', async () => {
    givenApi({
      '/auth/profile': {
        children: [
          child({ disciplinePoints: 72 }),
          child({ id: 'student-2', disciplinePoints: 55 }),
        ],
      },
    });

    const screen = await open(parent);

    await waitFor(() =>
      expect(screen.getByText('2 things need a look')).toBeTruthy(),
    );
  });

  it('says nothing about a child whose conduct is fine', async () => {
    givenApi({
      '/auth/profile': { children: [child({ disciplinePoints: 96 })] },
    });

    const screen = await open(parent);

    await waitFor(() =>
      expect(screen.getByText('Nothing needs you today')).toBeTruthy(),
    );
    expect(screen.queryByText('96 pts')).toBeNull();
  });

  it('shows unread alerts when there are any', async () => {
    givenApi({
      '/auth/profile': { children: [child()] },
      '/notifications': [{ isRead: false }, { isRead: true }],
    });

    const screen = await open(parent);

    await waitFor(() => expect(screen.getByText('1 unread alert')).toBeTruthy());
  });

  it('counts more than one properly', async () => {
    givenApi({
      '/auth/profile': { children: [child()] },
      '/notifications': [{ isRead: false }, { isRead: false }],
    });

    const screen = await open(parent);

    await waitFor(() =>
      expect(screen.getByText('2 unread alerts')).toBeTruthy(),
    );
  });

  it('opens the alerts tab from there', async () => {
    givenApi({
      '/auth/profile': { children: [child()] },
      '/notifications': [{ isRead: false }],
    });
    const screen = await open(parent);
    await waitFor(() => expect(screen.getByText('1 unread alert')).toBeTruthy());

    await fireEvent.press(screen.getByText('1 unread alert'));

    expect(router.push).toHaveBeenCalledWith('/(app)/(tabs)/alerts');
  });

  it('says nothing at all about alerts when there are none', async () => {
    givenApi({ '/auth/profile': { children: [child()] } });

    const screen = await open(parent);

    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
    expect(screen.queryByText('Waiting for you')).toBeNull();
  });

  it('shows a placeholder shaped like the list while it loads', async () => {
    givenApi({ '/auth/profile': () => new Promise(() => {}) });

    const screen = await open(parent);

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  // Anybody whose role has no home of its own gets this one, which is the
  // least privileged of the five.
  it('is what an unrecognised role gets', async () => {
    const screen = await open({ ...parent, role: 'GOVERNOR' as never });

    await waitFor(() =>
      expect(screen.getByText('Nothing needs you today')).toBeTruthy(),
    );
  });
});

describe('a teacher’s home', () => {
  const lessonToday = {
    dayOfWeek: new Date()
      .toLocaleDateString('en-US', { weekday: 'long' })
      .toUpperCase(),
    classSectionId: 'section-1',
  };

  /**
   * The API has no per-teacher "marks still owed" figure yet, so that stat
   * comes back as '--'. An unknown is not a problem: a headline warning about
   * missing marks on every load would be one nobody could ever clear, so the
   * screen falls back to the day instead.
   */
  it('leads with the day when the marks figure is not known', async () => {
    givenApi({
      '/academic/timetable/teacher/teacher-1': [lessonToday, lessonToday],
    });

    const screen = await open(teacher);

    await waitFor(() => expect(screen.getByText('2 lessons today')).toBeTruthy());
  });

  it('says one lesson properly', async () => {
    givenApi({ '/academic/timetable/teacher/teacher-1': [lessonToday] });

    const screen = await open(teacher);

    await waitFor(() => expect(screen.getByText('1 lesson today')).toBeTruthy());
  });

  it('says so plainly on a day with nothing on it', async () => {
    const screen = await open(teacher);

    await waitFor(() => expect(screen.getByText('No lessons today')).toBeTruthy());
  });

  it('does not colour an unknown figure as a warning', async () => {
    const { defaultTheme } = require('@/design/theme');
    givenApi({ '/academic/timetable/teacher/teacher-1': [lessonToday] });
    const screen = await open(teacher);

    await waitFor(() => expect(screen.getByText('--')).toBeTruthy());
    const style = Object.assign(
      {},
      ...[screen.getByText('--').props.style].flat(Infinity),
    );
    expect(style.color).toBe(defaultTheme.fg.primary);
  });

  it('names the term under the headline', async () => {
    const screen = await open(teacher);

    await waitFor(() => expect(screen.getByText('Term 2')).toBeTruthy());
  });

  it('shows the three figures a teacher opens the app for', async () => {
    givenApi({
      '/academic/timetable/teacher/teacher-1': [
        {
          dayOfWeek: new Date()
            .toLocaleDateString('en-US', { weekday: 'long' })
            .toUpperCase(),
          classSectionId: 'section-1',
        },
      ],
      '/attendance/class': [{ status: 'PRESENT' }, { status: 'ABSENT' }],
    });

    const screen = await open(teacher);

    await waitFor(() => expect(screen.getByText('Lessons today')).toBeTruthy());
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
  });

  it.each([
    ['Take the register', '/(app)/(tabs)/attendance'],
    ['Enter marks', '/(app)/marks-entry'],
    ['Set or grade homework', '/(app)/homework-manage'],
    ['Record an incident', '/(app)/discipline-log'],
    ['Your timetable', '/(app)/timetable'],
    ['Exam schedule', '/(app)/exam-schedule'],
  ])('opens %s', async (label, route) => {
    const screen = await open(teacher);
    await waitFor(() => expect(screen.getByText(label)).toBeTruthy());

    await fireEvent.press(screen.getByText(label));

    expect(router.push).toHaveBeenCalledWith(route);
  });

  /**
   * Marks entry is the most used screen a teacher has and it is deliberately
   * not a tab, because it is something you do to a class you picked rather
   * than somewhere you go. So it has to be one tap from here.
   */
  it('puts marks entry one tap away, since it is not a tab', async () => {
    const screen = await open(teacher);

    await waitFor(() => expect(screen.getByText('Enter marks')).toBeTruthy());
    expect(
      screen.getByText('Pick a class and an assessment'),
    ).toBeTruthy();
  });

  it('shows a placeholder while the figures load', async () => {
    givenApi({
      '/academic/timetable/teacher/teacher-1': () => new Promise(() => {}),
    });

    const screen = await open(teacher);

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });
});

/**
 * An admin opens this to find out what is going wrong. If nothing is, say so
 * plainly rather than filling the screen with healthy numbers.
 */
describe('an admin’s home', () => {
  it('says the school is fine when it is', async () => {
    const screen = await open(admin);

    await waitFor(() =>
      expect(screen.getByText('The school is running normally')).toBeTruthy(),
    );
  });

  it('leads with the children missing too much school', async () => {
    givenApi({
      '/attendance/chronic': [{ studentId: 'student-1' }, { studentId: 'student-2' }],
    });

    const screen = await open(admin);

    await waitFor(() =>
      expect(
        screen.getByText('2 students missing too much school'),
      ).toBeTruthy(),
    );
  });

  it('says one student properly', async () => {
    givenApi({ '/attendance/chronic': [{ studentId: 'student-1' }] });

    const screen = await open(admin);

    await waitFor(() =>
      expect(
        screen.getByText('1 student missing too much school'),
      ).toBeTruthy(),
    );
  });

  it('offers the decision that needs making', async () => {
    givenApi({ '/attendance/chronic': [{ studentId: 'student-1' }] });
    const screen = await open(admin);
    await waitFor(() =>
      expect(screen.getByText('Chronic absence')).toBeTruthy(),
    );

    await fireEvent.press(screen.getByText('Chronic absence'));

    expect(router.push).toHaveBeenCalledWith('/(app)/(tabs)/attendance');
  });

  it('offers nothing to decide when there is nothing', async () => {
    const screen = await open(admin);

    await waitFor(() =>
      expect(screen.getByText('The school is running normally')).toBeTruthy(),
    );
    expect(screen.queryByText('Needs a decision')).toBeNull();
  });

  it('counts the school', async () => {
    givenApi({
      '/analytics/admin/dashboard': {
        totalStudents: 412,
        totalTeachers: 28,
        totalClasses: 14,
      },
    });

    const screen = await open(admin);

    await waitFor(() => expect(screen.getByText('412')).toBeTruthy());
    expect(screen.getByText('28')).toBeTruthy();
    expect(screen.getByText('14')).toBeTruthy();
  });

  // The endpoint has answered under both names over its life.
  it('reads the counts under either name the API uses', async () => {
    givenApi({
      '/analytics/admin/dashboard': { students: 412, teachers: 28, classes: 14 },
    });

    const screen = await open(admin);

    await waitFor(() => expect(screen.getByText('412')).toBeTruthy());
  });

  it.each([
    [96, 'positive'],
    [80, 'caution'],
    [40, 'critical'],
  ])('colours a school-wide attendance of %s as %s', async (rate, tone) => {
    givenApi({ '/analytics/admin/dashboard': { attendanceRate: rate } });
    const { defaultTheme } = require('@/design/theme');

    const screen = await open(admin);

    await waitFor(() =>
      expect(
        screen.getByLabelText('Attendance across the school today'),
      ).toBeTruthy(),
    );
    expect(meterFill(screen).backgroundColor).toBe(
      tone === 'positive'
        ? defaultTheme.status.positive.solid
        : tone === 'caution'
          ? defaultTheme.status.caution.solid
          : defaultTheme.status.critical.solid,
    );
  });

  it('draws no bar when the school reported no rate', async () => {
    const screen = await open(admin);

    await waitFor(() =>
      expect(screen.getByText('The school is running normally')).toBeTruthy(),
    );
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('says when the term is closed for marks', async () => {
    givenApi({
      '/academic/terms': [
        { id: 'term-1', name: 'Term 2', isCurrent: true, isClosed: true },
      ],
    });

    const screen = await open(admin);

    await waitFor(() =>
      expect(screen.getByText('Term 2, closed for marks')).toBeTruthy(),
    );
  });

  it.each([
    ['Report cards', '/(app)/reports'],
    ['Marks completion', '/(app)/marks'],
    ['Discipline and appeals', '/(app)/discipline-log'],
    ['Analytics', '/(app)/analytics'],
  ])('opens %s', async (label, route) => {
    const screen = await open(admin);
    await waitFor(() => expect(screen.getByText(label)).toBeTruthy());

    await fireEvent.press(screen.getByText(label));

    expect(router.push).toHaveBeenCalledWith(route);
  });

  it('shows a placeholder while the school loads', async () => {
    givenApi({ '/analytics/admin/dashboard': () => new Promise(() => {}) });

    const screen = await open(admin);

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });
});

describe('a librarian’s home', () => {
  it('says nothing is overdue when nothing is', async () => {
    const screen = await open(librarian);

    await waitFor(() =>
      expect(screen.getByText('Nothing is overdue')).toBeTruthy(),
    );
  });

  it('leads with what is late', async () => {
    givenApi({ '/library/loans/overdue': [{ id: 'loan-1' }, { id: 'loan-2' }] });

    const screen = await open(librarian);

    await waitFor(() => expect(screen.getByText('2 books overdue')).toBeTruthy());
  });

  it('says one book properly', async () => {
    givenApi({ '/library/loans/overdue': [{ id: 'loan-1' }] });

    const screen = await open(librarian);

    await waitFor(() => expect(screen.getByText('1 book overdue')).toBeTruthy());
  });

  it('counts the shelves', async () => {
    givenApi({ '/library/analytics': { totalBooks: 1204, activeLoans: 87 } });

    const screen = await open(librarian);

    await waitFor(() => expect(screen.getByText('1204')).toBeTruthy());
    expect(screen.getByText('87')).toBeTruthy();
  });

  it('reads the count of titles under either name the API uses', async () => {
    givenApi({ '/library/analytics': { books: 1204 } });

    const screen = await open(librarian);

    await waitFor(() => expect(screen.getByText('1204')).toBeTruthy());
  });

  it.each([
    ['Check out or return', '/(app)/(tabs)/circulate'],
    ['The catalogue', '/(app)/(tabs)/books'],
  ])('opens %s', async (label, route) => {
    const screen = await open(librarian);
    await waitFor(() => expect(screen.getByText(label)).toBeTruthy());

    await fireEvent.press(screen.getByText(label));

    expect(router.push).toHaveBeenCalledWith(route);
  });

  it('shows a placeholder while the shelves load', async () => {
    givenApi({ '/library/analytics': () => new Promise(() => {}) });

    const screen = await open(librarian);

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });
});

/**
 * The question a matron opens the app to answer at seven in the morning is
 * not a statistic. It is whether anybody is still lying in the sick bay, and
 * whether anything is happening today she has to get children ready for.
 */
describe('a matron’s home', () => {
  const sickBay = (over: Record<string, unknown> = {}) =>
    givenApi({
      '/clinic/summary': {
        inSickBay: 0,
        visits: 0,
        referred: 0,
        repeatVisitors: [],
        ...over,
      },
    });

  it('says the sick bay is empty when it is', async () => {
    const screen = await open(matron);

    await waitFor(() =>
      expect(screen.getByText('Nobody is in the sick bay')).toBeTruthy(),
    );
  });

  it('says who is still lying in it', async () => {
    sickBay({ inSickBay: 2 });

    const screen = await open(matron);

    await waitFor(() =>
      expect(screen.getByText('2 students in the sick bay')).toBeTruthy(),
    );
  });

  it('says one student properly', async () => {
    sickBay({ inSickBay: 1 });

    const screen = await open(matron);

    await waitFor(() =>
      expect(screen.getByText('1 student in the sick bay')).toBeTruthy(),
    );
  });

  it('shows the month in the sick bay', async () => {
    sickBay({ visits: 41, referred: 3 });

    const screen = await open(matron);

    await waitFor(() => expect(screen.getByText('41')).toBeTruthy());
    expect(screen.getByText('Visits, 30 days')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  /**
   * A student in the sick bay three times in a month is telling the school
   * something no single visit does.
   */
  it('names anybody who keeps coming back', async () => {
    sickBay({
      repeatVisitors: [
        {
          id: 'student-1',
          user: { firstName: 'Aline', lastName: 'Uwase' },
          visits: 4,
        },
      ],
    });

    const screen = await open(matron);

    await waitFor(() =>
      expect(screen.getByText('Keeps coming back')).toBeTruthy(),
    );
    expect(screen.getByText('Aline Uwase')).toBeTruthy();
    expect(screen.getByText('4 visits in the last month')).toBeTruthy();
  });

  it('says nothing about that when nobody has', async () => {
    const screen = await open(matron);

    await waitFor(() =>
      expect(screen.getByText('Nobody is in the sick bay')).toBeTruthy(),
    );
    expect(screen.queryByText('Keeps coming back')).toBeNull();
  });

  it('shows what is on today, so children can be got ready', async () => {
    const inAnHour = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    givenApi({
      '/activities/upcoming': [
        {
          id: 'activity-1',
          title: 'Nyungwe forest trip',
          startsAt: inAnHour,
          location: 'Main gate',
          requiresConsent: true,
        },
      ],
    });

    const screen = await open(matron);

    await waitFor(() =>
      expect(screen.getByText('Nyungwe forest trip')).toBeTruthy(),
    );
    expect(
      screen.getByText('1 thing on the calendar today'),
    ).toBeTruthy();
    expect(screen.getByText('Slips needed')).toBeTruthy();
  });

  it('counts two things on the calendar as two', async () => {
    const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    givenApi({
      '/activities/upcoming': [
        { id: 'a1', title: 'Assembly', startsAt: soon },
        { id: 'a2', title: 'Football', startsAt: soon },
      ],
    });

    const screen = await open(matron);

    await waitFor(() =>
      expect(screen.getByText('2 things on the calendar today')).toBeTruthy(),
    );
  });

  it('leaves out what is not today', async () => {
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString();
    givenApi({
      '/activities/upcoming': [
        { id: 'a1', title: 'Nyungwe forest trip', startsAt: nextWeek },
      ],
    });

    const screen = await open(matron);

    await waitFor(() =>
      expect(screen.getByText('Nobody is in the sick bay')).toBeTruthy(),
    );
    expect(screen.queryByText('Nyungwe forest trip')).toBeNull();
  });

  it.each([
    ['The sick bay', '/(app)/(tabs)/clinic'],
    ['The money counter', '/(app)/(tabs)/money'],
    ['Messages', '/(app)/(tabs)/messages'],
  ])('opens %s', async (label, route) => {
    const screen = await open(matron);
    await waitFor(() => expect(screen.getByText(label)).toBeTruthy());

    await fireEvent.press(screen.getByText(label));

    expect(router.push).toHaveBeenCalledWith(route);
  });

  it('shows a placeholder while the sick bay loads', async () => {
    givenApi({ '/clinic/summary': () => new Promise(() => {}) });

    const screen = await open(matron);

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });
});

// A nurse holds no money, so the counter is not offered to her at all.
describe('a nurse’s home', () => {
  it('is the same screen without the money counter', async () => {
    const screen = await open(nurse);

    await waitFor(() => expect(screen.getByText('The sick bay')).toBeTruthy());
    expect(screen.queryByText('The money counter')).toBeNull();
  });
});
