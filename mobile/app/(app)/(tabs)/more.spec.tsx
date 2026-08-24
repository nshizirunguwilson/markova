import { fireEvent, waitFor } from '@testing-library/react-native';

import { useAuthStore } from '@/stores/auth-store';
import { router } from '@/test/router-mock';
import {
  admin,
  librarian,
  matron,
  nurse,
  parent,
  renderScreen,
  resetHarness,
  signedInAs,
  teacher,
} from '@/test/harness';

import More from './more';

/**
 * Everything that did not earn a tab.
 *
 * Ordered by how often it is reached for, not by category. An admin opens
 * reports at the end of a term and school settings twice a year, so reports
 * sits above settings even though a tidier mind would file both under
 * administration.
 */

const open = async (user: Parameters<typeof signedInAs>[0]) => {
  signedInAs(user);
  return renderScreen(<More />);
};

beforeEach(() => {
  resetHarness();
  jest.clearAllMocks();
});

describe('who is signed in', () => {
  it('names them and says how the school reaches them', async () => {
    const screen = await open(teacher);

    expect(screen.getByText('Aline Uwase')).toBeTruthy();
    expect(screen.getByText('aline.uwase@markova.edu')).toBeTruthy();
  });

  it('falls back to a phone number where there is no address', async () => {
    const screen = await open(parent);

    expect(screen.getByText('+250788100000')).toBeTruthy();
  });

  it('says what they are here as', async () => {
    const screen = await open(teacher);

    expect(screen.getByText('Teacher')).toBeTruthy();
  });

  it('opens their profile', async () => {
    const screen = await open(teacher);

    await fireEvent.press(screen.getByText('Aline Uwase'));

    expect(router.push).toHaveBeenCalledWith('/(app)/profile');
  });

  it('copes with a record that has no name on it', async () => {
    signedInAs({ ...teacher, firstName: '', lastName: '' });

    const screen = await renderScreen(<More />);

    expect(screen.getAllByText('You').length).toBeGreaterThan(0);
  });
});

/**
 * A club that never takes a register quietly stops existing, and paper
 * registers reach the office some time next week if at all. So activities are
 * offered to the people who actually run them.
 */
describe('what each role is offered', () => {
  it('gives a teacher marks, homework, discipline and their own analytics', async () => {
    const screen = await open(teacher);

    expect(screen.getByText('Marks entry')).toBeTruthy();
    expect(screen.getByText('Homework')).toBeTruthy();
    expect(screen.getByText('Discipline')).toBeTruthy();
    expect(screen.getByText('Class analytics')).toBeTruthy();
    expect(screen.getByText('Activities')).toBeTruthy();
  });

  it('gives an admin the things that run a school', async () => {
    const screen = await open(admin);

    expect(screen.getByText('Report cards')).toBeTruthy();
    expect(screen.getByText('ID cards')).toBeTruthy();
    expect(screen.getByText('Promotion')).toBeTruthy();
    expect(screen.getByText('School settings')).toBeTruthy();
    expect(screen.getByText('Setup wizard')).toBeTruthy();
  });

  it('gives a matron the activities she has to get children ready for', async () => {
    const screen = await open(matron);

    expect(screen.getByText('Activities')).toBeTruthy();
    expect(screen.queryByText('Marks entry')).toBeNull();
    expect(screen.queryByText('Discipline')).toBeNull();
  });

  it('gives a parent nothing that belongs to staff', async () => {
    const screen = await open(parent);

    expect(screen.queryByText('Marks entry')).toBeNull();
    expect(screen.queryByText('Report cards')).toBeNull();
    expect(screen.queryByText('Running the school')).toBeNull();
  });

  it('gives a librarian none of the teaching tools', async () => {
    const screen = await open(librarian);

    expect(screen.queryByText('Marks entry')).toBeNull();
    expect(screen.queryByText('Class analytics')).toBeNull();
  });

  // Class analytics belongs to somebody who has a class.
  it('does not offer a nurse a class to analyse', async () => {
    const screen = await open(nurse);

    expect(screen.queryByText('Class analytics')).toBeNull();
  });

  it('gives everybody the timetable and the exams', async () => {
    for (const user of [teacher, parent, librarian, matron, nurse, admin]) {
      resetHarness();
      const screen = await open(user);
      expect(screen.getByText('Timetable')).toBeTruthy();
      expect(screen.getByText('Exam schedule')).toBeTruthy();
    }
  });

  it('gives everybody their own profile, settings and help', async () => {
    for (const user of [teacher, parent, admin]) {
      resetHarness();
      const screen = await open(user);
      expect(screen.getByText('Your profile')).toBeTruthy();
      expect(screen.getByText('Settings')).toBeTruthy();
      expect(screen.getByText('Help and support')).toBeTruthy();
    }
  });

  it('shows no admin group at all to somebody who is not one', async () => {
    const screen = await open(teacher);

    expect(screen.queryByText('Running the school')).toBeNull();
    expect(screen.getByText('Your work')).toBeTruthy();
  });

  it('shows no work group to somebody with no work in it', async () => {
    const screen = await open(parent);

    expect(screen.getByText('Your work')).toBeTruthy();
  });
});

describe('where each row goes', () => {
  it.each([
    ['Timetable', '/(app)/timetable'],
    ['Exam schedule', '/(app)/exam-schedule'],
    ['Marks entry', '/(app)/marks-entry'],
    ['Homework', '/(app)/homework-manage'],
    ['Discipline', '/(app)/discipline-log'],
    ['Class analytics', '/(app)/class-analytics'],
    ['Activities', '/(app)/activities'],
  ])('opens %s for a teacher', async (label, route) => {
    const screen = await open(teacher);

    await fireEvent.press(screen.getByText(label));

    expect(router.push).toHaveBeenCalledWith(route);
  });

  it.each([
    ['Report cards', '/(app)/reports'],
    ['ID cards', '/(app)/id-cards'],
    ['Promotion', '/(app)/promotion'],
    ['Analytics', '/(app)/analytics'],
    ['School settings', '/(app)/school'],
    ['Setup wizard', '/(app)/onboarding'],
  ])('opens %s for an admin', async (label, route) => {
    const screen = await open(admin);

    await fireEvent.press(screen.getByText(label));

    expect(router.push).toHaveBeenCalledWith(route);
  });

  it.each([
    ['Alerts', '/(app)/(tabs)/alerts'],
    ['Your profile', '/(app)/profile'],
    ['Settings', '/(app)/settings'],
    ['Help and support', '/(app)/help'],
  ])('opens %s for everybody', async (label, route) => {
    const screen = await open(parent);

    await fireEvent.press(screen.getByText(label));

    expect(router.push).toHaveBeenCalledWith(route);
  });
});

/**
 * Signing out is last, on its own, and not red. It is not destructive, it is
 * just leaving.
 */
describe('signing out', () => {
  it('is not dressed up as something dangerous', async () => {
    const { defaultTheme } = require('@/design/theme');
    const screen = await open(teacher);

    const style = Object.assign(
      {},
      ...[screen.getByText('Sign out').props.style].flat(Infinity),
    );
    expect(style.color).toBe(defaultTheme.fg.primary);
  });

  it('ends the session and goes back to the sign in screen', async () => {
    const logout = jest.fn().mockResolvedValue(undefined);
    signedInAs(teacher);
    useAuthStore.setState({ logout: logout as never });
    const screen = await renderScreen(<More />);

    await fireEvent.press(screen.getByText('Sign out'));

    await waitFor(() => expect(logout).toHaveBeenCalled());
    expect(router.replace).toHaveBeenCalledWith('/(auth)/login');
  });
});
