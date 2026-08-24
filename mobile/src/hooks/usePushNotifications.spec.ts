import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { renderHook, waitFor } from '@testing-library/react-native';

import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

import { usePushNotifications } from './usePushNotifications';

/**
 * Getting a phone onto the school's notification list.
 *
 * Two rules matter. Nothing is asked for before somebody signs in, because a
 * permission prompt on the login screen is a prompt with no explanation
 * behind it. And nothing here is allowed to take the app down: a phone that
 * refuses notifications still has to open.
 */

jest.mock('@/lib/api', () => ({ __esModule: true, default: { post: jest.fn() } }));

const notifications = Notifications as jest.Mocked<typeof Notifications>;
const http = api as jest.Mocked<typeof api>;

const signIn = () => useAuthStore.setState({ isAuthenticated: true });

// Registered once when the module loads, so it is captured before any test
// clears the mocks.
const [[foregroundHandler]] = notifications.setNotificationHandler.mock.calls;

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ isAuthenticated: false });
  (Device as { isDevice: boolean }).isDevice = true;
  notifications.getPermissionsAsync.mockResolvedValue({
    status: 'granted',
  } as never);
  notifications.requestPermissionsAsync.mockResolvedValue({
    status: 'granted',
  } as never);
  notifications.getExpoPushTokenAsync.mockResolvedValue({
    data: 'ExpoToken[abc]',
  } as never);
  notifications.addNotificationReceivedListener.mockReturnValue({
    remove: jest.fn(),
  } as never);
  notifications.addNotificationResponseReceivedListener.mockReturnValue({
    remove: jest.fn(),
  } as never);
  http.post.mockResolvedValue({ data: {} } as never);
});

describe('before anybody has signed in', () => {
  it('asks the phone for nothing at all', async () => {
    const { result } = await renderHook(() => usePushNotifications());

    expect(notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(result.current.expoPushToken).toBeNull();
  });
});

describe('once somebody is signed in', () => {
  beforeEach(signIn);

  it('registers the phone and tells the school where to reach it', async () => {
    const { result } = await renderHook(() => usePushNotifications());

    await waitFor(() =>
      expect(result.current.expoPushToken).toBe('ExpoToken[abc]'),
    );
    expect(http.post).toHaveBeenCalledWith('/notifications/push-token', {
      token: 'ExpoToken[abc]',
      platform: Platform.OS,
    });
  });

  it('does not ask again when permission was already given', async () => {
    await renderHook(() => usePushNotifications());

    await waitFor(() => expect(notifications.getExpoPushTokenAsync).toHaveBeenCalled());
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('asks once when it has not been asked before', async () => {
    notifications.getPermissionsAsync.mockResolvedValue({
      status: 'undetermined',
    } as never);

    await renderHook(() => usePushNotifications());

    await waitFor(() =>
      expect(notifications.requestPermissionsAsync).toHaveBeenCalled(),
    );
  });

  // Somebody who says no has said no. The app carries on without notifications
  // rather than nagging or failing.
  it('carries on quietly when the phone says no', async () => {
    notifications.getPermissionsAsync.mockResolvedValue({
      status: 'denied',
    } as never);
    notifications.requestPermissionsAsync.mockResolvedValue({
      status: 'denied',
    } as never);
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    const { result } = await renderHook(() => usePushNotifications());

    await waitFor(() =>
      expect(notifications.requestPermissionsAsync).toHaveBeenCalled(),
    );
    expect(result.current.expoPushToken).toBeNull();
    expect(http.post).not.toHaveBeenCalled();
    log.mockRestore();
  });

  // A simulator has no push service, and a developer opening the app should
  // not see a crash because of it.
  it('says so and stops when it is not running on a real phone', async () => {
    (Device as { isDevice: boolean }).isDevice = false;
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    const { result } = await renderHook(() => usePushNotifications());

    await waitFor(() => expect(log).toHaveBeenCalled());
    expect(result.current.expoPushToken).toBeNull();
    expect(notifications.getPermissionsAsync).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('names the project the token belongs to when the build declares one', async () => {
    (Constants as { expoConfig: unknown }).expoConfig = {
      extra: { eas: { projectId: 'project-1' } },
    };

    await renderHook(() => usePushNotifications());

    await waitFor(() =>
      expect(notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
        projectId: 'project-1',
      }),
    );
  });

  it('survives the notification service failing outright', async () => {
    notifications.getExpoPushTokenAsync.mockRejectedValue(
      new Error('no push service'),
    );
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = await renderHook(() => usePushNotifications());

    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(result.current.expoPushToken).toBeNull();
    error.mockRestore();
  });

  // If the school cannot record the token the phone still works; it just will
  // not get notifications, and that is not worth a crash on launch.
  it('survives the school refusing the token', async () => {
    http.post.mockRejectedValue(new Error('500'));
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    const { result } = await renderHook(() => usePushNotifications());

    await waitFor(() =>
      expect(result.current.expoPushToken).toBe('ExpoToken[abc]'),
    );
    log.mockRestore();
  });
});

describe('notifications arriving', () => {
  beforeEach(signIn);

  it('holds on to one that lands while the app is open', async () => {
    let deliver!: (n: unknown) => void;
    notifications.addNotificationReceivedListener.mockImplementation(((
      handler: never,
    ) => {
      deliver = handler;
      return { remove: jest.fn() };
    }) as never);

    const { result } = await renderHook(() => usePushNotifications());
    await waitFor(() => expect(deliver).toBeDefined());

    const arriving = { request: { content: { title: 'New mark' } } };
    await waitFor(() => {
      deliver(arriving);
      expect(result.current.notification).toEqual(arriving);
    });
  });

  it('reads what a tapped notification was pointing at', async () => {
    let tap!: (r: unknown) => void;
    notifications.addNotificationResponseReceivedListener.mockImplementation(((
      handler: never,
    ) => {
      tap = handler;
      return { remove: jest.fn() };
    }) as never);
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    await renderHook(() => usePushNotifications());
    await waitFor(() => expect(tap).toBeDefined());

    tap({
      notification: { request: { content: { data: { screen: 'marks' } } } },
    });

    expect(log).toHaveBeenCalledWith('Notification tapped:', {
      screen: 'marks',
    });
    log.mockRestore();
  });

  it('shrugs at a tap on a notification carrying nothing', async () => {
    let tap!: (r: unknown) => void;
    notifications.addNotificationResponseReceivedListener.mockImplementation(((
      handler: never,
    ) => {
      tap = handler;
      return { remove: jest.fn() };
    }) as never);
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    await renderHook(() => usePushNotifications());
    await waitFor(() => expect(tap).toBeDefined());

    expect(() =>
      tap({ notification: { request: { content: { data: null } } } }),
    ).not.toThrow();
    log.mockRestore();
  });

  it('stops listening when the app closes', async () => {
    const remove = jest.fn();
    notifications.addNotificationReceivedListener.mockReturnValue({
      remove,
    } as never);
    notifications.addNotificationResponseReceivedListener.mockReturnValue({
      remove,
    } as never);

    const { unmount } = await renderHook(() => usePushNotifications());
    await waitFor(() =>
      expect(notifications.addNotificationReceivedListener).toHaveBeenCalled(),
    );
    await unmount();

    expect(remove).toHaveBeenCalledTimes(2);
  });
});

/**
 * A notification that arrives while somebody is looking at the app still has
 * to appear. Without this the phone drops it silently, which is how a teacher
 * misses a message they were sitting in the app waiting for.
 */
describe('how a notification behaves while the app is open', () => {
  it('is shown rather than swallowed', async () => {
    await expect(
      foregroundHandler!.handleNotification({} as never),
    ).resolves.toMatchObject({
      shouldShowBanner: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    });
  });
});
