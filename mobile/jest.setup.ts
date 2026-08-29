/**
 * What the phone provides that a test runner does not.
 *
 * Everything stubbed here is a native module: it exists on a device and has no
 * JavaScript implementation to fall back on. The stubs are deliberately thin -
 * enough for a screen to render and for a test to assert what was asked of the
 * device, and no more.
 */
// The matchers ship at the package root in this version, not under a
// subpath export.
import '@testing-library/react-native/matchers';

// The gesture handler installs itself through a native module that does not
// exist in a test process. Its root view is a plain View once that is gone.
jest.mock('react-native-gesture-handler', () => {
  const { View, ScrollView, FlatList, Pressable } = require('react-native');
  const passthrough = (Component: unknown) => Component;
  return {
    GestureHandlerRootView: View,
    gestureHandlerRootHOC: passthrough,
    Gesture: {
      Pan: () => ({ onUpdate: () => ({ onEnd: () => ({}) }) }),
      Tap: () => ({ onEnd: () => ({}) }),
    },
    GestureDetector: View,
    ScrollView,
    FlatList,
    TouchableOpacity: Pressable,
    RectButton: Pressable,
    Swipeable: View,
    Directions: {},
    State: {},
  };
});

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
  // These resolve rather than returning undefined: callers chain .catch() on
  // them, because a phone with no haptic engine must not take a button down.
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
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

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(() => Promise.resolve({ canceled: true })),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(() => Promise.resolve(true)),
  getStringAsync: jest.fn(() => Promise.resolve('')),
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(() => Promise.resolve({ type: 'opened' })),
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(() =>
    Promise.resolve({ granted: true }),
  ),
  MediaTypeOptions: { Images: 'Images' },
}));

// The camera is hardware. What a test cares about is the permission state and
// the code a scan produced, so the view is a plain View that hands its
// callback back through a label.
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CameraView: (props: Record<string, unknown>) =>
      React.createElement(View, {
        ...props,
        accessibilityLabel: 'Camera',
      }),
    useCameraPermissions: jest.fn(() => [
      { granted: true, canAskAgain: true, status: 'granted' },
      jest.fn(() => Promise.resolve({ granted: true })),
    ]),
  };
});

jest.mock('sonner-native', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
  },
  Toaster: () => null,
}));

// The router is a navigation side effect, and every test that cares asserts
// on where a screen tried to go rather than on what drew next.
jest.mock('expo-router', () => require('./src/test/router-mock').expoRouterMock);

/**
 * Reanimated runs its animations on a native worklet runtime that does not
 * exist in a test process, and it ships no mock of its own for version 4.
 *
 * This stands in for the small part of it this app uses. Animations resolve to
 * their final value immediately, which is what a test wants to assert on, and
 * a shared value re-renders when it is written so a change made in an effect
 * is observable.
 */
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, Text, ScrollView, Image, FlatList } = require('react-native');

  const useSharedValue = (initial: unknown) => {
    const [, force] = React.useState(0);
    const box = React.useRef(null) as { current: { value: unknown } | null };
    if (box.current === null) {
      let current = initial;
      box.current = {
        get value() {
          return current;
        },
        set value(next: unknown) {
          if (next === current) return;
          current = next;
          force((n: number) => n + 1);
        },
      };
    }
    return box.current;
  };

  // withTiming and friends are asked for their destination, not their path.
  const withTiming = (toValue: unknown) => toValue;
  const withSpring = (toValue: unknown) => toValue;
  const withDelay = (_ms: number, animation: unknown) => animation;
  const withSequence = (...animations: unknown[]) =>
    animations[animations.length - 1];
  const withRepeat = (animation: unknown) => animation;

  // Entering and exiting animations are builders. Every call returns the
  // builder so a chain of them resolves to something Animated.View can ignore.
  const builder = (): Record<string, unknown> => {
    const self: Record<string, unknown> = {};
    for (const method of [
      'duration',
      'delay',
      'springify',
      'damping',
      'stiffness',
      'easing',
      'withInitialValues',
      'randomDelay',
      'build',
    ]) {
      self[method] = () => self;
    }
    return self;
  };

  // Entering, exiting and layout props mean nothing without the native
  // runtime, so they are dropped rather than passed to a plain View.
  const passthrough = (Component: unknown) =>
    React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const rest = { ...props };
      for (const key of [
        'entering',
        'exiting',
        'layout',
        'sharedTransitionTag',
      ]) {
        delete rest[key];
      }
      return React.createElement(Component as never, { ...rest, ref });
    });

  const Animated = {
    View: passthrough(View),
    Text: passthrough(Text),
    ScrollView: passthrough(ScrollView),
    Image: passthrough(Image),
    FlatList: passthrough(FlatList),
    createAnimatedComponent: passthrough,
  };

  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    useSharedValue,
    useAnimatedStyle: (fn: () => unknown) => fn(),
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    useAnimatedRef: () => ({ current: null }),
    interpolate: (value: number) => value,
    runOnJS: (fn: unknown) => fn,
    runOnUI: (fn: unknown) => fn,
    withTiming,
    withSpring,
    withDelay,
    withSequence,
    withRepeat,
    cancelAnimation: () => {},
    Easing: { linear: () => 0, ease: () => 0, bezier: () => () => 0 },
    FadeIn: builder(),
    FadeOut: builder(),
    FadeInDown: builder(),
    FadeInUp: builder(),
    FadeOutDown: builder(),
    SlideInRight: builder(),
    SlideOutLeft: builder(),
    Layout: builder(),
    LinearTransition: builder(),
  };
});

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
  useFonts: jest.fn(() => [true, null]),
  loadAsync: jest.fn(() => Promise.resolve()),
  isLoaded: () => true,
}));

// The font files themselves are binary assets the bundler resolves. A name is
// all the provider passes on to useFonts.
jest.mock('@expo-google-fonts/poppins', () => ({
  Poppins_400Regular: 'Poppins_400Regular',
  Poppins_500Medium: 'Poppins_500Medium',
  Poppins_600SemiBold: 'Poppins_600SemiBold',
}));
jest.mock('@expo-google-fonts/jetbrains-mono', () => ({
  JetBrainsMono_400Regular: 'JetBrainsMono_400Regular',
  JetBrainsMono_500Medium: 'JetBrainsMono_500Medium',
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));
