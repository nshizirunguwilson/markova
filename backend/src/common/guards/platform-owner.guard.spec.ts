import { ForbiddenException } from '@nestjs/common';
import { PlatformOwnerGuard } from './platform-owner.guard';

/** Platform routes open to exactly one person: whoever runs Markova. */
describe('PlatformOwnerGuard', () => {
  const guard = new PlatformOwnerGuard();
  const asking = (user: unknown) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as never;

  it('lets the owner through', () => {
    expect(guard.canActivate(asking({ platformRole: 'OWNER' }))).toBe(true);
  });

  // A principal runs their school, not the platform.
  it.each([
    ['an admin with no platform role', { role: 'ADMIN' }],
    ['nobody at all', undefined],
  ])('refuses %s', (_name, user) => {
    expect(() => guard.canActivate(asking(user))).toThrow(ForbiddenException);
  });
});
