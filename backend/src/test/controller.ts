import { Test } from '@nestjs/testing';
import type { Type } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Drivers for the controllers.
 *
 * Every controller here is the same shape: a route that pulls a DTO, a param
 * and sometimes the signed-in user off the request, and hands them to a
 * service. That layer is thin, but it is not free of bugs — the ones it does
 * have are the expensive kind. `getTeacherAssignments(user.id)` compared a
 * User id against a Teacher id and matched nothing, and the mobile pocket
 * money lookup sent the wrong field name and 400'd on every scan. Both were
 * one wrong argument in a one-line method.
 *
 * So these tests assert the delegation itself: this route calls that service
 * method, with exactly these arguments. Nothing about what the service then
 * does, which its own spec covers.
 */

export type ServiceMocks = Record<string, Record<string, jest.Mock>>;

/**
 * Clears the call record on every double built by `mockService`.
 *
 * The doubles are made once per spec file and shared, so a test that builds
 * the controller directly rather than going through the runner would
 * otherwise see the previous test's calls.
 */
export function clearMocks(...mocks: Record<string, jest.Mock>[]) {
  for (const mock of mocks) {
    for (const fn of Object.values(mock)) fn.mockClear();
  }
}

/** A service double whose every method is a spy resolving to `result`. */
export function mockService(
  methods: string[],
  result: unknown = { ok: true },
): Record<string, jest.Mock> {
  return Object.fromEntries(
    methods.map((m) => [m, jest.fn().mockResolvedValue(result)]),
  );
}

export interface RouteCase {
  /** What this route is for, in the words a person would use. */
  name: string;
  /** Calls the controller method under test. */
  call: (c: any) => unknown;
  /** The provider token whose method should have been reached. */
  on?: string;
  /** The service method the route must delegate to. */
  calls: string;
  /** The exact arguments it must be given, in order. */
  withArgs?: unknown[];
}

export interface Provided {
  token: any;
  name: string;
  mock: Record<string, jest.Mock>;
}

/**
 * The controller itself, wired to the doubles given.
 *
 * For the handful of routes that compute a reply rather than delegating, and
 * so have no service call to assert.
 */
export async function buildController<T>(
  Controller: Type<T>,
  providers: Provided[],
): Promise<T> {
  const module = await Test.createTestingModule({
    controllers: [Controller],
    providers: providers.map((p) => ({ provide: p.token, useValue: p.mock })),
  })
    .overrideGuard(AuthGuard('jwt'))
    .useValue({ canActivate: () => true })
    .compile();
  return module.get(Controller);
}

/**
 * Builds the controller with the doubles given, and returns a runner that
 * checks one route at a time.
 */
export async function controllerHarness<T>(
  Controller: Type<T>,
  providers: Provided[],
) {
  const module = await Test.createTestingModule({
    controllers: [Controller],
    providers: providers.map((p) => ({ provide: p.token, useValue: p.mock })),
  })
    // Guards are declared with @UseGuards and would otherwise need the whole
    // passport strategy. What they let through is checked by the browser RBAC
    // suite against a running server, which is where it belongs.
    .overrideGuard(AuthGuard('jwt'))
    .useValue({ canActivate: () => true })
    .compile();

  const controller = module.get(Controller);
  const byName = Object.fromEntries(providers.map((p) => [p.name, p.mock]));

  return async function run(c: RouteCase) {
    for (const mock of Object.values(byName)) {
      for (const fn of Object.values(mock)) fn.mockClear();
    }

    await c.call(controller);

    const service = byName[c.on ?? providers[0].name];
    const fn = service?.[c.calls];
    expect(fn).toBeDefined();
    expect(fn).toHaveBeenCalledTimes(1);
    if (c.withArgs) expect(fn).toHaveBeenCalledWith(...c.withArgs);
  };
}

/** The signed-in user a @CurrentUser() param would receive. */
export const admin = { id: 'user-1', role: 'ADMIN' };
export const teacher = {
  id: 'user-2',
  role: 'TEACHER',
  teacher: { id: 'teacher-1' },
};
export const parent = { id: 'user-3', role: 'PARENT' };
export const student = {
  id: 'user-4',
  role: 'STUDENT',
  studentId: 'student-1',
};
