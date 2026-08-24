import { type ReactNode } from 'react';
import { Pressable, Text } from 'react-native';

/**
 * A stand-in for expo-router.
 *
 * Navigation is a side effect, so a screen test asserts on where it tried to
 * go rather than on what drew next. Three things are recorded: pushes and
 * replaces on the router, redirects a screen returned instead of rendering,
 * and the options each screen declares for its own native header, which is
 * where screen titles live.
 */

export const router = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  dismiss: jest.fn(),
  dismissAll: jest.fn(),
  setParams: jest.fn(),
  canGoBack: jest.fn(() => true),
  navigate: jest.fn(),
};

/** What the router would tell a screen about where it is. */
export const routerState = {
  params: {} as Record<string, string | string[]>,
  pathname: '/',
  segments: [] as string[],
};

/** Every redirect a render produced, oldest first. */
export const redirects: string[] = [];

/** Every `<Stack.Screen options={...} />` a render declared. */
export const screenOptions: Record<string, unknown>[] = [];

/** The defaults a navigator set for every screen under it. */
export const navigatorOptions: Record<string, unknown>[] = [];

export function resetRouter() {
  for (const fn of Object.values(router)) (fn as jest.Mock).mockClear();
  router.canGoBack.mockReturnValue(true);
  routerState.params = {};
  routerState.pathname = '/';
  routerState.segments = [];
  redirects.length = 0;
  screenOptions.length = 0;
  navigatorOptions.length = 0;
}

/** Where the screen sent the person instead of drawing itself. */
export const redirectedTo = () => redirects[redirects.length - 1];

/** The title the screen gave its own native header. */
export const screenTitle = () =>
  screenOptions.map((o) => (o as { title?: string }).title).filter(Boolean).pop();

function Redirect({ href }: { href: unknown }) {
  const to = String(href);
  if (redirects[redirects.length - 1] !== to) redirects.push(to);
  return null;
}

function Screen({ options }: { options?: Record<string, unknown> }) {
  if (options) screenOptions.push(options);
  return null;
}

function Link({
  href,
  children,
  asChild: _asChild,
  ...rest
}: {
  href: unknown;
  children: ReactNode;
  asChild?: boolean;
}) {
  return (
    <Pressable {...rest} onPress={() => router.push(href as never)}>
      {typeof children === 'string' ? <Text>{children}</Text> : children}
    </Pressable>
  );
}

const Navigator = ({
  children,
  screenOptions: options,
}: {
  children?: ReactNode;
  screenOptions?: Record<string, unknown>;
}) => {
  if (options) navigatorOptions.push(options);
  return <>{children}</>;
};

/** What every screen under the navigator inherits. */
export const inheritedOptions = () =>
  navigatorOptions[navigatorOptions.length - 1] ?? {};

export const expoRouterMock = {
  __esModule: true,
  useRouter: () => router,
  router,
  useLocalSearchParams: () => routerState.params,
  useGlobalSearchParams: () => routerState.params,
  usePathname: () => routerState.pathname,
  useSegments: () => routerState.segments,
  useNavigation: () => ({ setOptions: jest.fn(), navigate: router.navigate }),
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(effect, []);
  },
  Redirect,
  Link,
  Stack: Object.assign(Navigator, { Screen }),
  Tabs: Object.assign(Navigator, { Screen }),
  Slot: Navigator,
  SplashScreen: { preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() },
};
