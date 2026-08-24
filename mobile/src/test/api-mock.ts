/**
 * A stand-in for the school's API.
 *
 * Screens reach the network through the hooks in useApi, and those hooks are
 * worth running for real: a screen that reads the wrong field off the right
 * endpoint is exactly the kind of bug a mocked hook hides. So this replaces
 * the axios instance rather than the hooks, and a test says what each URL
 * answers with.
 *
 * Use it from a spec with one line, which has to be a factory because
 * jest.mock is hoisted above the imports:
 *
 *   jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);
 */

type Reply = unknown | ((config: { params?: Record<string, unknown> }) => unknown);

const routes = new Map<string, Reply>();
const failures = new Map<string, unknown>();

// Every reply still in flight, so a test can wait for the API to go quiet
// rather than guessing how many microtasks a query takes to land.
const inFlight = new Set<Promise<unknown>>();

function track<T>(promise: Promise<T>): Promise<T> {
  inFlight.add(promise);
  const done = () => inFlight.delete(promise);
  promise.then(done, done);
  return promise;
}

/**
 * Resolves once nothing is waiting on the API, or once it is clear something
 * never will: a reply that is a pending promise is how a test holds a screen
 * in its loading state, and waiting on that forever would hang the run.
 */
export async function apiIsQuiet() {
  for (let round = 0; round < 10 && inFlight.size; round++) {
    await Promise.race([
      Promise.allSettled([...inFlight]),
      new Promise((resolve) => setImmediate(resolve)),
    ]);
  }
}

function match(url: string): string | undefined {
  if (routes.has(url) || failures.has(url)) return url;
  // Longest declared prefix wins, so '/academic/terms/current' can be
  // answered separately from '/academic/terms'.
  const keys = [...routes.keys(), ...failures.keys()].sort(
    (a, b) => b.length - a.length,
  );
  return keys.find((key) => url.startsWith(key));
}

function answer(method: string, url: string, config?: never) {
  const key = match(url);
  if (key === undefined) {
    return track(
      Promise.reject(
        Object.assign(
          new Error(`no route declared for ${method.toUpperCase()} ${url}`),
          { response: { status: 404 } },
        ),
      ),
    );
  }
  if (failures.has(key)) return track(Promise.reject(failures.get(key)));
  const reply = routes.get(key);
  const data =
    typeof reply === 'function'
      ? (reply as (c: unknown) => unknown)(config ?? {})
      : reply;
  // A reply may be a promise, which is how a test holds a screen in its
  // loading state. Wait for it here rather than handing the promise itself
  // back as the body.
  return track(
    Promise.resolve(data).then((body) => ({ data: body, status: 200 })),
  );
}

export const apiMock = {
  __esModule: true,
  default: {
    get: jest.fn((url: string, config?: never) => answer('get', url, config)),
    post: jest.fn((url: string, _body?: unknown, config?: never) =>
      answer('post', url, config),
    ),
    patch: jest.fn((url: string, _body?: unknown, config?: never) =>
      answer('patch', url, config),
    ),
    put: jest.fn((url: string, _body?: unknown, config?: never) =>
      answer('put', url, config),
    ),
    delete: jest.fn((url: string, config?: never) => answer('delete', url, config)),
    defaults: { baseURL: 'http://localhost:3000/api' },
  },
};

/** The mocked axios instance, for asserting on what a screen sent. */
export const http = apiMock.default;

/** Declares what each URL answers with. Replaces anything declared before. */
export function givenApi(replies: Record<string, Reply>) {
  for (const [url, reply] of Object.entries(replies)) {
    failures.delete(url);
    routes.set(url, reply);
  }
}

/** Declares a URL that fails, so a screen's error state can be reached. */
export function givenApiFails(
  url: string,
  error: unknown = Object.assign(new Error('Request failed'), {
    response: { status: 500 },
  }),
) {
  routes.delete(url);
  failures.set(url, error);
}

/** Forgets every declared route. Called between tests by the harness. */
export function resetApi() {
  routes.clear();
  failures.clear();
  inFlight.clear();
  for (const fn of Object.values(http)) {
    if (typeof fn === 'function') (fn as jest.Mock).mockClear();
  }
}
