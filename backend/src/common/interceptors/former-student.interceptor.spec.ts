import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { FormerStudentInterceptor } from './former-student.interceptor';

/**
 * A student who has left the school sees their own past and nothing else:
 * every route is closed to them unless it says it is open.
 */
describe('FormerStudentInterceptor', () => {
  const run = (
    user: Record<string, unknown> | undefined,
    open: boolean | undefined,
  ) => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(open),
    } as unknown as Reflector;
    const handle = jest.fn().mockReturnValue(of('done'));
    const context = {
      getType: () => 'http',
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as never;
    const result = () =>
      new FormerStudentInterceptor(reflector).intercept(context, { handle });
    return { result, handle };
  };

  it.each(['WITHDRAWN', 'EXPELLED', 'TRANSFERRED', 'GRADUATED'])(
    'turns away a %s student from an ordinary route',
    (status) => {
      const { result, handle } = run(
        { role: 'STUDENT', studentStatus: status },
        undefined,
      );
      expect(result).toThrow(ForbiddenException);
      expect(result).toThrow(/still open your report cards/);
      expect(handle).not.toHaveBeenCalled();
    },
  );

  it('lets them reach a route open to former students', () => {
    const { result, handle } = run(
      { role: 'STUDENT', studentStatus: 'GRADUATED' },
      true,
    );
    result();
    expect(handle).toHaveBeenCalled();
  });

  it('lets a student on the roll go anywhere, suspended or not', () => {
    const { result, handle } = run(
      { role: 'STUDENT', studentStatus: 'ACTIVE' },
      undefined,
    );
    result();
    expect(handle).toHaveBeenCalled();
  });

  it('has nothing to say about anybody else, or nobody', () => {
    for (const user of [{ role: 'TEACHER' }, { role: 'PARENT' }, undefined]) {
      const { result, handle } = run(user, undefined);
      result();
      expect(handle).toHaveBeenCalled();
    }
  });
});
