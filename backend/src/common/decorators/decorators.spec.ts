import { Role } from '@prisma/client';
import { ROLES_KEY, Roles, ANY_ROLE } from './roles.decorator';
import { CurrentUser } from './current-user.decorator';

/**
 * The two decorators every controller in this codebase leans on.
 *
 * `@CurrentUser()` is how a route knows who is asking, and every ownership
 * check downstream is built on whatever it hands over. `@Roles()` writes the
 * metadata the guard reads.
 */

/** Pulls the factory out of a param decorator so it can be called directly. */
function factoryOf(
  decorator: unknown,
): (data: unknown, ctx: unknown) => unknown {
  // createParamDecorator returns a function; the factory it was built from is
  // what Nest calls per request, and it is reachable through the enhancer.
  const target = {} as any;
  (decorator as any)()(target, 'method', 0);
  const meta = Reflect.getMetadata(
    '__routeArguments__',
    target.constructor,
    'method',
  );
  return Object.values(meta)[0]
    ? (Object.values(meta)[0] as any).factory
    : () => undefined;
}

describe('@CurrentUser()', () => {
  const factory = factoryOf(CurrentUser);
  const ctx = (user: unknown) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as any;

  const user = { id: 'user-1', role: 'PARENT', teacherId: 'teacher-1' };

  it('hands over the whole signed-in user', () => {
    expect(factory(undefined, ctx(user))).toEqual(user);
  });

  // `@CurrentUser('id')` is used wherever a route needs only the id, and
  // getting the wrong field would attribute an action to the wrong person.
  it('hands over one named field when one is asked for', () => {
    expect(factory('id', ctx(user))).toBe('user-1');
    expect(factory('role', ctx(user))).toBe('PARENT');
  });

  it('hands over nothing rather than throwing when nobody is signed in', () => {
    expect(factory(undefined, ctx(undefined))).toBeUndefined();
    expect(factory('id', ctx(undefined))).toBeUndefined();
  });

  it('hands over nothing for a field the user does not carry', () => {
    expect(factory('studentId', ctx(user))).toBeUndefined();
  });
});

describe('@Roles()', () => {
  it('writes the roles under the key the guard reads', () => {
    class Target {
      @Roles('ADMIN', 'PATRON')
      method() {}
    }
    expect(Reflect.getMetadata(ROLES_KEY, Target.prototype.method)).toEqual([
      'ADMIN',
      'PATRON',
    ]);
  });

  it('writes an empty list when none are named, rather than nothing', () => {
    class Target {
      @Roles()
      method() {}
    }
    // Nothing at all would make the guard treat the route as open. An empty
    // list makes it closed to everybody, which is the safer reading of a typo.
    expect(Reflect.getMetadata(ROLES_KEY, Target.prototype.method)).toEqual([]);
  });

  it('uses the key the guard actually looks for', () => {
    expect(ROLES_KEY).toBe('roles');
  });
});

/**
 * Routes open to anyone signed in.
 *
 * These used to spell out the five roles that existed when they were written.
 * Adding the patron, matron and nurse left all three signed in to a
 * notification bell that answered 403 and a Messages link they could not
 * open, because nobody thought to revisit four unrelated controllers.
 */
describe('ANY_ROLE', () => {
  it('holds every role the schema defines', () => {
    expect([...ANY_ROLE].sort()).toEqual([...Object.values(Role)].sort());
  });

  it('includes the boarding staff and the nurse', () => {
    for (const role of [Role.PATRON, Role.MATRON, Role.NURSE]) {
      expect(ANY_ROLE).toContain(role);
    }
  });

  /**
   * The point of the constant. A hand-written list is a list that will be
   * out of date the next time somebody adds a role, and the failure is
   * silent until that person tries to sign in.
   */
  it('grows with the enum rather than being maintained by hand', () => {
    expect(ANY_ROLE).toHaveLength(Object.values(Role).length);
  });
});
