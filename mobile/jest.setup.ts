/**
 * What the phone provides that a test runner does not.
 *
 * Everything stubbed here is a native module: it exists on a device and has no
 * JavaScript implementation to fall back on. The stubs are deliberately thin —
 * enough for a screen to render and for a test to assert what was asked of the
 * device, and no more.
 */
// The matchers ship at the package root in this version, not under a
// subpath export.
import '@testing-library/react-native/matchers';

// Secure storage is the keychain. There is no keychain in a test process, so
// this is an in-memory one that behaves the same way.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    setItemAsync: jest.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((k: string) => {
      store.delete(k);
      return Promise.resolve();
    }),
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        apiUrl: 'http://localhost:3000/api',
        wsUrl: 'http://localhost:3000',
      },
    },
  },
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: 'ExpoToken[test]' })),
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { MAX: 5 },
}));

jest.mock('expo-device', () => ({ isDevice: true }));

jest.mock('sonner-native', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
  },
  Toaster: () => null,
}));

// The router is a navigation side effect, and every test that cares asserts on
// these rather than on a rendered screen changing.
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      dismiss: jest.fn(),
    }),
    useLocalSearchParams: () => ({}),
    usePathname: () => '/',
    useSegments: () => [],
    Link: ({ children }: { children: React.ReactNode }) => children,
    Redirect: () => null,
    Stack: Object.assign(() => null, { Screen: () => null }),
    Tabs: Object.assign(() => null, { Screen: () => null }),
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  };
});

// Reanimated's own mock, which turns every animation into an immediate value.
jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock'),
);

jest.mock('react-native-mmkv', () => ({
  MMKV: class {
    private store = new Map<string, string>();
    getString(k: string) {
      return this.store.get(k);
    }
    set(k: string, v: string) {
      this.store.set(k, v);
    }
    delete(k: string) {
      this.store.delete(k);
    }
  },
}));

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    connected: false,
  })),
}));

// Fonts load asynchronously on a device and never resolve in a test process.
jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  loadAsync: jest.fn(() => Promise.resolve()),
  isLoaded: () => true,
}));

jest.mock('@expo-google-fonts/poppins', () => ({ useFonts: () => [true, null] }));
jest.mock('@expo-google-fonts/jetbrains-mono', () => ({
  useFonts: () => [true, null],
}));
