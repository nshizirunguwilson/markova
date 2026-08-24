import { fireEvent, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { router, routerState, screenTitle } from '@/test/router-mock';
import {
  admin,
  renderScreen,
  resetHarness,
  signedInAs,
  styleOf,
} from '@/test/harness';

import Person from './[id]';

/**
 * One person's record.
 *
 * Deliberately read mostly. Editing a person properly means the full
 * enrollment form with the five level address, guardians, medical notes and a
 * NIDA number, and that is a desk job on the web. What a phone is good for is
 * looking somebody up in a corridor and finding their class, their ID or
 * their parent's phone number.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;

const person = (over: Record<string, unknown> = {}) =>
  givenApi({
    '/users/user-9': {
      id: 'user-9',
      firstName: 'Aline',
      lastName: 'Uwase',
      role: 'TEACHER',
      isActive: true,
      email: 'aline.uwase@markova.edu',
      phone: '+250788000123',
      code: 'TCH-2025-014',
      ...over,
    },
  });

const open = async () => {
  signedInAs(admin);
  routerState.params = { id: 'user-9' };
  return renderScreen(<Person />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  person();
});

describe('looking somebody up in a corridor', () => {
  it('names them and says what they are', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
    expect(screen.getByText('Teacher')).toBeTruthy();
    expect(screenTitle()).toBe('Aline Uwase');
  });

  it('gives the phone number and the address', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('+250788000123')).toBeTruthy());
    expect(screen.getByText('aline.uwase@markova.edu')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('says so plainly when there is no way to reach them', async () => {
    person({ email: null, phone: null });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Nothing on file')).toBeTruthy());
  });

  it('shows a student number and a class where there is one', async () => {
    person({
      role: 'STUDENT',
      student: {
        id: 'student-1',
        studentIdNumber: 'STD-2025-0417',
        classSection: { name: 'Senior 3 A' },
      },
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('STD-2025-0417')).toBeTruthy());
    expect(screen.getByText('Senior 3 A')).toBeTruthy();
  });

  it('says a class is not set rather than leaving a blank', async () => {
    person({
      role: 'STUDENT',
      student: { id: 'student-1', studentIdNumber: 'STD-2025-0417' },
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Not set')).toBeTruthy());
  });

  it('leaves out the student section for somebody who is not one', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
    expect(screen.queryByText('As a student')).toBeNull();
  });

  // Codes are read out character by character, so they get the mono face.
  it('sets the codes in mono', async () => {
    person({ nationalId: '1200456789012345' });

    const screen = await open();

    await waitFor(() =>
      expect(styleOf(screen.getByText('TCH-2025-014')).fontFamily).toContain(
        'JetBrains',
      ),
    );
    expect(
      styleOf(screen.getByText('1200456789012345')).fontFamily,
    ).toContain('JetBrains');
  });

  /**
   * The full enrollment record is a desk job. Saying where it lives beats
   * pretending a phone can do it.
   */
  it('says where the rest of the record lives', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('On the web dashboard')).toBeTruthy(),
    );
  });

  it('offers the way to message them', async () => {
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Send a message')).toBeTruthy());

    await fireEvent.press(screen.getByText('Send a message'));

    expect(router.push).toHaveBeenCalledWith('/(app)/messages/new');
  });

  it('shows a placeholder while it reads', async () => {
    givenApi({ '/users/user-9': () => new Promise(() => {}) });

    const screen = await open();

    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screenTitle()).toBe('Person');
  });

  it('says so, and offers another go, when the read fails', async () => {
    givenApiFails('/users/user-9');

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('That did not load')).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

/**
 * The one write action here, because it is the thing that genuinely cannot
 * wait for somebody to get back to a computer.
 */
describe('turning an account off', () => {
  it('asks before it does anything', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Turn off this account' }),
      ).toBeTruthy(),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Turn off this account' }),
    );

    expect(screen.getByText("Turn off Aline Uwase's account?")).toBeTruthy();
    expect(http.delete).not.toHaveBeenCalled();
  });

  /**
   * Saying "on their next request, not whenever their token happens to
   * expire" is the difference between somebody trusting this button in an
   * emergency and not.
   */
  it('says exactly when they lose access, and what survives', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Turn off this account' }),
      ).toBeTruthy(),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Turn off this account' }),
    );

    expect(
      screen.getByText(
        'They will be signed out on their next request, not whenever their token happens to expire. Their record stays; only the way in closes.',
      ),
    ).toBeTruthy();
  });

  it('does it once it has been confirmed', async () => {
    givenApi({ '/users/user-9': { ok: true } });
    person();
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Turn off this account' }),
      ).toBeTruthy(),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Turn off this account' }),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Turn it off' }),
    );

    await waitFor(() =>
      expect(http.delete.mock.calls[0][0]).toBe('/users/user-9'),
    );
    expect(notify.success).toHaveBeenCalledWith('Account turned off');
  });

  it('can be thought better of', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Turn off this account' }),
      ).toBeTruthy(),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Turn off this account' }),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Leave it' }));

    await waitFor(() =>
      expect(
        screen.queryByText("Turn off Aline Uwase's account?"),
      ).toBeNull(),
    );
    expect(http.delete).not.toHaveBeenCalled();
  });

  it('says so when it will not go through', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Turn off this account' }),
      ).toBeTruthy(),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Turn off this account' }),
    );
    givenApiFails('/users/user-9', new Error('offline'));

    await fireEvent.press(screen.getByRole('button', { name: 'Turn it off' }));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not do that'),
    );
  });

  it('is not offered for an account already off', async () => {
    person({ isActive: false });

    const screen = await open();

    // The badge beside their name and the account line both say it.
    await waitFor(() => expect(screen.getAllByText('Turned off')).toHaveLength(2));
    expect(
      screen.queryByRole('button', { name: 'Turn off this account' }),
    ).toBeNull();
  });
});
