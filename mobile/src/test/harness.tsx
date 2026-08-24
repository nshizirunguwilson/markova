import { type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  act,
  render,
  renderHook as renderHookWith,
  type RenderResult,
} from '@testing-library/react-native';

import { useAuthStore, type User } from '@/stores/auth-store';
import { apiIsQuiet, resetApi } from './api-mock';
import { resetRouter } from './router-mock';

/**
 * What a screen needs around it before it will draw.
 *
 * Deliberately not the real root layout: that one loads fonts, hides a splash
 * screen and opens a socket, none of which a screen test is about. What is
 * here is only what a screen actually reads from context.
 *
 * The theme is not provided at all, on purpose. useTheme falls back to the
 * default navy when no school has been loaded, which is the same thing that
 * happens on a real phone before branding arrives.
 */

// Retries turn a deliberately failing endpoint into a three second test, and
// the cache would carry one test's data into the next.
const testQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      // A finished mutation is otherwise held for five minutes, and that
      // timer is what keeps the test runner alive after the suite passes.
      mutations: { retry: false, gcTime: 0 },
    },
  });

export const teacher: User = {
  id: 'user-1',
  email: 'aline.uwase@markova.edu',
  firstName: 'Aline',
  lastName: 'Uwase',
  role: 'TEACHER',
  isActive: true,
  teacherId: 'teacher-1',
};

export const admin: User = {
  ...teacher,
  id: 'user-2',
  email: 'wilsonshizirungu@gmail.com',
  firstName: 'Wilson',
  lastName: 'Nshizirungu',
  role: 'ADMIN',
  teacherId: undefined,
};

export const parent: User = {
  ...teacher,
  id: 'user-3',
  email: undefined as never,
  firstName: 'Jean',
  lastName: 'Habimana',
  role: 'PARENT',
  phone: '+250788100000',
  teacherId: undefined,
};

export const librarian: User = {
  ...teacher,
  id: 'user-4',
  email: 'librarian@markova.edu',
  firstName: 'Chantal',
  lastName: 'Mukamana',
  role: 'LIBRARIAN',
  teacherId: undefined,
};

export const matron: User = {
  ...teacher,
  id: 'user-5',
  email: 'm.uwimana@markova.edu',
  firstName: 'Marie',
  lastName: 'Uwimana',
  role: 'MATRON',
  teacherId: undefined,
};

export const nurse: User = {
  ...teacher,
  id: 'user-6',
  email: 'n.ingabire@markova.edu',
  firstName: 'Nadine',
  lastName: 'Ingabire',
  role: 'NURSE',
  teacherId: undefined,
};

const blankAuth = useAuthStore.getState();

/** Puts somebody in the app, the way a completed sign in would. */
export function signedInAs(user: User) {
  useAuthStore.setState({
    user,
    isAuthenticated: true,
    isLoading: false,
  });
  return user;
}

/** Empties the stores between tests so nothing leaks from one to the next. */
export function resetHarness() {
  useAuthStore.setState({ ...blankAuth, isLoading: false }, true);
  resetApi();
  resetRouter();
}

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/**
 * Data a screen reads but never draws — a lookup table, a list it only
 * searches — leaves a test nothing to wait for on screen. Seeding it makes
 * the screen's own behaviour the only thing under test.
 */
export type Seed = [queryKey: unknown[], data: unknown][];

export function renderScreen(
  ui: ReactElement,
  { seed }: { seed?: Seed } = {},
): Promise<RenderResult> {
  const client = testQueryClient();
  for (const [key, data] of seed ?? []) client.setQueryData(key, data);

  const wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );

  return render(ui, { wrapper });
}

/**
 * The library dropped its component-type queries, so these walk the rendered
 * host tree instead. A Pressable is a View that claims the responder, which
 * is exactly what "can this be touched" means on a phone.
 */
type Node = { props?: Record<string, unknown>; children?: unknown[] };

function hostNodes(node: unknown, found: Node[] = []): Node[] {
  if (!node || typeof node !== 'object') return found;
  const n = node as Node;
  if (n.props) found.push(n);
  for (const child of n.children ?? []) hostNodes(child, found);
  return found;
}

/** How many things on this screen a finger can actually press. */
export function pressableCount(screen: { container: unknown }): number {
  return hostNodes(screen.container).filter(
    (n) => n.props?.onStartShouldSetResponder,
  ).length;
}

/** Whether an icon was drawn. lucide draws through react-native-svg. */
export function hasIcon(screen: { toJSON: () => unknown }): boolean {
  return JSON.stringify(screen.toJSON()).includes('RNSVGSvgView');
}

/** Flattens a style prop, which React Native allows to be an array of arrays. */
export function styleOf(element: { props: { style?: unknown } }) {
  return Object.assign(
    {},
    ...[element.props.style].flat(Infinity).filter(Boolean),
  ) as Record<string, never>;
}

/** The screen's own outermost element, with the providers stepped past. */
export function rendered(screen: { toJSON: () => unknown }) {
  const tree = screen.toJSON() as { children?: { props: { style?: unknown } }[] };
  return tree?.children?.[0];
}

/** The flattened style on that outermost element. */
export function rootStyle(screen: { toJSON: () => unknown }) {
  return styleOf(rendered(screen) ?? { props: {} });
}

/**
 * Runs one of the useApi hooks against the mocked API, with a query client
 * that neither retries nor caches between tests.
 */
export function renderApiHook<T>(hook: () => T) {
  const client = testQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper, run: () => renderHookWith(hook, { wrapper }) };
}

/** The first child of a rendered node, typed loosely enough to read a style. */
export function firstChild(node: unknown) {
  return (node as { children: { props: { style?: unknown } }[] }).children[0];
}

/** The filled part of a Meter, which is the only child of its track. */
export function meterFill(screen: { getByRole: (role: string) => unknown }) {
  return styleOf(firstChild(screen.getByRole('progressbar')));
}

/**
 * Lets every settled promise land.
 *
 * A screen that reads something it never shows — a lookup table, a list it
 * only searches — gives a test nothing to wait for on screen. This waits for
 * the queries themselves instead.
 */
export async function settle() {
  await act(async () => {
    // Wait for the API itself to go quiet, then for the renders its answers
    // set off. A macrotask lets every microtask already queued run first.
    await apiIsQuiet();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  });
}
