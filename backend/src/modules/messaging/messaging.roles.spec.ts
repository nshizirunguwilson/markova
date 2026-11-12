import 'reflect-metadata';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { MessagingController } from './messaging.controller';

/**
 * The Director of Studies uses chat as any member of staff does.
 *
 * HEAD_TEACHER was left out of the lists written role by role, so the head
 * teacher could read a conversation and not load who was in it, which is the
 * first thing the chat screen asks for. Read off the decorators, so a new
 * route copied from an old list fails here rather than in a demo.
 */
describe('the head teacher reaches every chat route a teacher reaches', () => {
  const proto = MessagingController.prototype as unknown as Record<
    string,
    object
  >;
  const routes = Object.getOwnPropertyNames(proto)
    .filter((name) => name !== 'constructor')
    .map((name) => ({
      name,
      roles: (Reflect.getMetadata(ROLES_KEY, proto[name]) as string[]) ?? [],
    }))
    .filter((r) => r.roles.includes('TEACHER'));

  it('finds the routes to check', () => {
    expect(routes.length).toBeGreaterThan(5);
  });

  it.each(routes.map((r) => [r.name, r.roles]))('%s', (_name, roles) => {
    expect(roles).toContain('HEAD_TEACHER');
  });
});
