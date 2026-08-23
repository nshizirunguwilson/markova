import { RolesGuard } from './roles.guard';

/**
 * The role guard.
 *
 * Twenty lines that stand between every account and every endpoint. The rule
 * that matters most is the one about a route with no `@Roles()`: it lets the
 * request through, which is right for the handful of routes that are open to
 * every signed-in person, and would be catastrophic if it were the other way
 * round on a route somebody forgot to annotate.
 */
describe('RolesGuard', () => {
  const contextFor = (user: unknown, roles?: string[]) => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(roles),
    } as any;
    const context = {
      getHandler: () => 'handler',
      getClass: () => 'class',
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as any;
    return { guard: new RolesGuard(reflector), context, reflector };
  };

  it('lets a matching role through', () => {
    const { guard, context } = contextFor({ role: 'ADMIN' }, ['ADMIN']);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('lets any one of several named roles through', () => {
    const { guard, context } = contextFor({ role: 'MATRON' }, [
      'ADMIN',
      'PATRON',
      'MATRON',
    ]);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('turns away a role that was not named', () => {
    const { guard, context } = contextFor({ role: 'STUDENT' }, ['ADMIN']);
    expect(guard.canActivate(context)).toBe(false);
  });

  // The roles are exact strings. A role that merely starts the same is a
  // different role.
  it('does not accept a role that only looks similar', () => {
    const { guard, context } = contextFor({ role: 'ADMINISTRATOR' }, ['ADMIN']);
    expect(guard.canActivate(context)).toBe(false);
  });

  /**
   * A route with no `@Roles()` is open to anybody the JWT guard already let
   * in. That is deliberate, and it is why every route in this codebase that
   * should be narrower carries the decorator.
   */
  it('lets a route with no roles declared through', () => {
    const { guard, context } = contextFor({ role: 'STUDENT' }, undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('turns away a request carrying no user at all', () => {
    const { guard, context } = contextFor(undefined, ['ADMIN']);
    expect(guard.canActivate(context)).toBe(false);
  });

  it('turns away a user with no role on them', () => {
    const { guard, context } = contextFor({ id: 'u-1' }, ['ADMIN']);
    expect(guard.canActivate(context)).toBe(false);
  });

  // An empty list is not "everybody"; it is "nobody named", and letting it
  // through would turn a typo into an open door.
  it('turns everybody away when the list is empty', () => {
    const { guard, context } = contextFor({ role: 'ADMIN' }, []);
    expect(guard.canActivate(context)).toBe(false);
  });

  it('reads the roles off the handler first and the class second', () => {
    const { guard, context, reflector } = contextFor({ role: 'ADMIN' }, ['ADMIN']);
    guard.canActivate(context);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith('roles', [
      'handler',
      'class',
    ]);
  });
});
