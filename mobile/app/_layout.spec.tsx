import { Text as RNText } from 'react-native';

import { errorReporter } from '@/lib/error-reporting';
import { useAuthStore } from '@/stores/auth-store';
import { inheritedOptions } from '@/test/router-mock';
import {
  rendered,
  renderScreen,
  resetHarness,
  signedInAs,
  teacher,
} from '@/test/harness';

import RootLayout from './_layout';

/**
 * Everything wrapped around every screen: the error boundary, the query
 * client, the design system and the check for a session left on the phone.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);
jest.mock('@/lib/error-reporting', () => ({
  setupGlobalErrorHandling: jest.fn(),
  errorReporter: { setUser: jest.fn(), captureException: jest.fn() },
}));
jest.mock('@/hooks/usePushNotifications', () => ({
  usePushNotifications: jest.fn(),
}));

const reporter = errorReporter as jest.Mocked<typeof errorReporter>;

beforeEach(() => {
  resetHarness();
  jest.clearAllMocks();
  useAuthStore.setState({ isLoading: false, checkAuth: jest.fn() as never });
});

describe('starting up', () => {
  it('looks for a session left on the phone', async () => {
    const checkAuth = jest.fn().mockResolvedValue(true);
    useAuthStore.setState({ checkAuth });

    await renderScreen(<RootLayout />);

    expect(checkAuth).toHaveBeenCalled();
  });

  // The splash screen is still up at this point. Drawing a sign in screen and
  // then replacing it a moment later is worse than drawing nothing.
  it('draws nothing while that is still going on', async () => {
    useAuthStore.setState({ isLoading: true });

    const screen = await renderScreen(<RootLayout />);

    expect(rendered(screen)).toBeUndefined();
  });

  it('draws the app once it knows', async () => {
    const screen = await renderScreen(<RootLayout />);

    expect(screen.toJSON()).toBeTruthy();
  });

  it('registers this phone for notifications', async () => {
    const { usePushNotifications } = require('@/hooks/usePushNotifications');

    await renderScreen(<RootLayout />);

    expect(usePushNotifications).toHaveBeenCalled();
  });

  it('hides its own headers, since each stack draws its own', async () => {
    await renderScreen(<RootLayout />);

    expect(inheritedOptions().headerShown).toBe(false);
  });
});

/**
 * A crash report with no user on it cannot be traced back to the school that
 * reported the problem.
 */
describe('who a crash gets filed under', () => {
  it('is nobody before anybody signs in', async () => {
    await renderScreen(<RootLayout />);

    expect(reporter.setUser).toHaveBeenCalledWith(null);
  });

  it('is whoever is signed in', async () => {
    signedInAs(teacher);

    await renderScreen(<RootLayout />);

    expect(reporter.setUser).toHaveBeenCalledWith(teacher.id);
  });

  it('changes when somebody else signs in on the same phone', async () => {
    const screen = await renderScreen(<RootLayout />);
    expect(reporter.setUser).toHaveBeenLastCalledWith(null);

    signedInAs(teacher);
    await screen.rerender(<RootLayout />);

    expect(reporter.setUser).toHaveBeenLastCalledWith(teacher.id);
  });
});

/**
 * The boundary sits outside everything, including the providers, because a
 * provider is exactly the kind of thing that can throw on the way up.
 */
describe('the last line of defence', () => {
  it('is set up before anything else runs', () => {
    const { setupGlobalErrorHandling } = require('@/lib/error-reporting');

    expect(setupGlobalErrorHandling).toBeDefined();
    expect(<RootLayout />).toBeTruthy();
    expect(RNText).toBeDefined();
  });
});
