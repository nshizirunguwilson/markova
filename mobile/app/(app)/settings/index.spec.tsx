import { fireEvent, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { useAuthStore } from '@/stores/auth-store';
import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { router, screenTitle } from '@/test/router-mock';
import { renderScreen, resetHarness, signedInAs, teacher } from '@/test/harness';

import Settings from './index';

/**
 * Settings.
 *
 * Only three things belong here, so only three things are here: your
 * password, the devices you are signed in on, and the way out. The previous
 * version also carried notification toggles that were never wired to anything
 * and a theme switch for a theme that did not exist.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;

const account = (sessions: unknown[] = []) =>
  givenApi({
    '/auth/sessions': sessions,
    '/auth/change-password': { changed: true },
  });

const open = async () => {
  signedInAs(teacher);
  return renderScreen(<Settings />);
};

const openPasswordForm = async (
  screen: Awaited<ReturnType<typeof renderScreen>>,
) => {
  await fireEvent.press(screen.getByText('Change your password'));
  await waitFor(() =>
    expect(screen.getByLabelText('Current password')).toBeTruthy(),
  );
};

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  account();
});

describe('what belongs on this screen', () => {
  it('is a password, the devices, and the way out', async () => {
    const screen = await open();

    expect(screenTitle()).toBe('Settings');
    expect(screen.getByText('Password')).toBeTruthy();
    expect(screen.getByText('Where you are signed in')).toBeTruthy();
    expect(screen.getByText('Leaving')).toBeTruthy();
  });

  // The previous version carried toggles wired to nothing.
  it('carries no switch that does nothing', async () => {
    const screen = await open();

    expect(screen.queryByText(/Notifications/)).toBeNull();
    expect(screen.queryByText(/Theme/)).toBeNull();
    expect(screen.queryByText(/Dark mode/)).toBeNull();
  });
});

describe('changing a password', () => {
  it('stays out of the way until it is asked for', async () => {
    const screen = await open();

    expect(screen.queryByLabelText('Current password')).toBeNull();

    await openPasswordForm(screen);
  });

  /**
   * The rules tick as somebody types rather than being listed after a
   * refusal.
   */
  it.each([
    ['At least 8 characters', 'abcdefgh'],
    ['One capital letter', 'A'],
    ['One small letter', 'a'],
    ['One number', '1'],
    ['One symbol', '!'],
  ])('ticks "%s" as soon as it is met', async (rule, typed) => {
    const { defaultTheme } = require('@/design/theme');
    const screen = await open();
    await openPasswordForm(screen);

    await fireEvent.changeText(screen.getByLabelText('New password'), typed);

    const style = Object.assign(
      {},
      ...[screen.getByText(rule).props.style].flat(Infinity),
    );
    expect(style.color).toBe(defaultTheme.status.positive.text);
  });

  it('will not send until the current one is given too', async () => {
    const screen = await open();
    await openPasswordForm(screen);

    await fireEvent.changeText(
      screen.getByLabelText('New password'),
      'Password123!',
    );

    expect(
      screen.getByRole('button', { name: 'Change it' }).props.accessibilityState
        .disabled,
    ).toBe(true);
  });

  it('will not send a new one that does not meet the rules', async () => {
    const screen = await open();
    await openPasswordForm(screen);

    await fireEvent.changeText(screen.getByLabelText('Current password'), 'old');
    await fireEvent.changeText(screen.getByLabelText('New password'), 'short');

    expect(
      screen.getByRole('button', { name: 'Change it' }).props.accessibilityState
        .disabled,
    ).toBe(true);
  });

  it('sends both, and says so', async () => {
    const screen = await open();
    await openPasswordForm(screen);
    await fireEvent.changeText(
      screen.getByLabelText('Current password'),
      'Password123!',
    );
    await fireEvent.changeText(
      screen.getByLabelText('New password'),
      'NewPassword456!',
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Change it' }));

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/auth/change-password', {
        currentPassword: 'Password123!',
        newPassword: 'NewPassword456!',
      }),
    );
    expect(notify.success).toHaveBeenCalledWith('Password changed');
  });

  it('closes the form and empties it once it has gone', async () => {
    const screen = await open();
    await openPasswordForm(screen);
    await fireEvent.changeText(
      screen.getByLabelText('Current password'),
      'Password123!',
    );
    await fireEvent.changeText(
      screen.getByLabelText('New password'),
      'NewPassword456!',
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Change it' }));

    await waitFor(() =>
      expect(screen.queryByLabelText('Current password')).toBeNull(),
    );
  });

  it('can be thought better of', async () => {
    const screen = await open();
    await openPasswordForm(screen);

    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByLabelText('Current password')).toBeNull(),
    );
    expect(http.post).not.toHaveBeenCalled();
  });

  // Saying which password was wrong is the difference between trying again
  // and giving up.
  it('says the current password is the likely problem', async () => {
    givenApiFails('/auth/change-password', new Error('401'));
    const screen = await open();
    await openPasswordForm(screen);
    await fireEvent.changeText(
      screen.getByLabelText('Current password'),
      'wrong',
    );
    await fireEvent.changeText(
      screen.getByLabelText('New password'),
      'NewPassword456!',
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Change it' }));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        'That did not work. Check the current password.',
      ),
    );
  });

  it('says what the school said when it said something', async () => {
    givenApiFails('/auth/change-password', {
      response: { data: { message: 'You used that password before' } },
    });
    const screen = await open();
    await openPasswordForm(screen);
    await fireEvent.changeText(
      screen.getByLabelText('Current password'),
      'Password123!',
    );
    await fireEvent.changeText(
      screen.getByLabelText('New password'),
      'NewPassword456!',
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Change it' }));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        'You used that password before',
      ),
    );
  });
});

/**
 * Somebody who signed in on a shared computer in a staff room should be able
 * to see that, which is why this list is worth having at all.
 */
describe('where you are signed in', () => {
  it('names each device and where it signed in from', async () => {
    account([
      {
        id: 'session-1',
        deviceInfo: 'iPhone 13',
        ipAddress: '41.74.160.10',
        createdAt: '2026-08-20T09:00:00.000Z',
        expiresAt: '2026-09-20T09:00:00.000Z',
      },
    ]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('iPhone 13')).toBeTruthy());
    expect(
      screen.getByText(
        `41.74.160.10   ·   since ${new Date(
          '2026-08-20T09:00:00.000Z',
        ).toLocaleDateString()}`,
      ),
    ).toBeTruthy();
  });

  it('says so plainly for a session with nothing recorded about it', async () => {
    account([
      {
        id: 'session-1',
        createdAt: '2026-08-20T09:00:00.000Z',
        expiresAt: '2026-09-20T09:00:00.000Z',
      },
    ]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Unknown device')).toBeTruthy());
    expect(screen.getByText(/Unknown address/)).toBeTruthy();
  });

  it('says so when this is the only device', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('Only this device')).toBeTruthy());
  });

  it('shows a placeholder while it reads', async () => {
    givenApi({ '/auth/sessions': () => new Promise(() => {}) });

    const screen = await open();

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  // Signing out here does not sign the shared computer out, and saying so
  // stops somebody thinking it did.
  it('says signing out only ends this one', async () => {
    const screen = await open();

    expect(
      screen.getByText('Signing out ends the session on this device only.'),
    ).toBeTruthy();
  });
});

describe('the way out', () => {
  it('ends the session and goes back to sign in', async () => {
    const logout = jest.fn().mockResolvedValue(undefined);
    signedInAs(teacher);
    useAuthStore.setState({ logout: logout as never });
    const screen = await renderScreen(<Settings />);

    await fireEvent.press(screen.getByText('Sign out'));

    await waitFor(() => expect(logout).toHaveBeenCalled());
    expect(router.replace).toHaveBeenCalledWith('/(auth)/login');
  });
});
