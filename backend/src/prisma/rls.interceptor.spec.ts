import { of } from 'rxjs';

import { currentRequest } from './request-context';
import { RlsInterceptor } from './rls.interceptor';

/**
 * Telling the database who is asking.
 *
 * Row level security decides what a query may see from two session settings,
 * and Postgres only ever sees a connection. This is the step that puts the
 * signed-in user somewhere the Prisma client can read it, without threading a
 * user id through every service signature in the codebase.
 */
describe('the row level security context', () => {
  const interceptor = new RlsInterceptor();

  const run = (user: unknown) => {
    let seen = null as ReturnType<typeof currentRequest>;
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as never;
    const next = {
      handle: () => {
        seen = currentRequest();
        return of('ok');
      },
    };
    interceptor.intercept(context, next);
    return seen;
  };

  it('carries the signed-in user down to the query', () => {
    expect(run({ id: 'u-1', role: 'PARENT' })).toEqual({
      userId: 'u-1',
      role: 'PARENT',
    });
  });

  it('carries the role, which is what the policies branch on', () => {
    expect(run({ id: 'u-2', role: 'STUDENT' })?.role).toBe('STUDENT');
  });

  /*
    The login route, the public admissions form and the health checks have no
    user. They reach no student data, and the policies read a missing setting
    as unrestricted, so there is nothing to set and nothing to refuse.
  */
  it('sets nothing for a request with no user', () => {
    expect(run(undefined)).toBeNull();
  });

  it('sets nothing for a half-populated user rather than a wrong identity', () => {
    expect(run({ id: 'u-1' })).toBeNull();
    expect(run({ role: 'PARENT' })).toBeNull();
  });

  it('leaves no identity behind once the request is over', () => {
    run({ id: 'u-1', role: 'PARENT' });
    expect(currentRequest()).toBeNull();
  });
});
