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
    return Promise.reject(
      Object.assign(
        new Error(`no route declared for ${method.toUpperCase()} ${url}`),
        { response: { status: 404 } },
      ),
    );
  }
  if (failures.has(key)) return Promise.reject(failures.get(key));
  const reply = routes.get(key);
  const data = typeof reply === 'function' ? (reply as never)(config ?? {}) : reply;
  return Promise.resolve({ data, status: 200 });
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
  for (const fn of Object.values(http)) {
    if (typeof fn === 'function') (fn as jest.Mock).mockClear();
  }
}
