import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import {
  clearMocks,
  admin,
  controllerHarness,
  mockService,
  parent,
  type RouteCase,
} from '../../test/controller';

/**
 * Notification routes.
 *
 * Everything a person reads here is scoped to them by an argument rather than
 * by a guard, so the argument is what these tests hold: a route that forgot to
 * pass `user.id` would show one parent another parent's alerts.
 */
describe('NotificationsController', () => {
  const service = mockService([
    'send',
    'sendBulk',
    'getUserNotifications',
    'getUnreadCount',
    'markAsRead',
    'markAllAsRead',
    'registerPushToken',
  ]);

  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service);
    run = await controllerHarness(NotificationsController, [
      { token: NotificationsService, name: 'service', mock: service },
    ]);
  });

  const cases: RouteCase[] = [
    {
      name: 'one notification sent',
      call: (c) => c.send({ userId: 'u-1', title: 'Hello', message: 'Hi' }),
      calls: 'send',
      withArgs: [{ userId: 'u-1', title: 'Hello', message: 'Hi' }],
    },
    {
      name: 'a batch sent',
      call: (c) => c.sendBulk({ userIds: ['u-1', 'u-2'], title: 'Hello' }),
      calls: 'sendBulk',
      withArgs: [{ userIds: ['u-1', 'u-2'], title: 'Hello' }],
    },
    {
      name: 'my own alerts, nobody else’s',
      call: (c) => c.getNotifications(parent),
      calls: 'getUserNotifications',
      withArgs: [parent.id, 50],
    },
    {
      name: 'a shorter list when one is asked for',
      call: (c) => c.getNotifications(parent, '10'),
      calls: 'getUserNotifications',
      withArgs: [parent.id, 10],
    },
    {
      name: 'my unread count',
      call: (c) => c.getUnreadCount(parent),
      calls: 'getUnreadCount',
      withArgs: [parent.id],
    },
    {
      // Both arguments matter: without the user id, anybody could mark
      // anybody's alert read.
      name: 'one marked read, by the person reading it',
      call: (c) => c.markAsRead('n-1', parent),
      calls: 'markAsRead',
      withArgs: ['n-1', parent.id],
    },
    {
      name: 'all of mine marked read',
      call: (c) => c.markAllAsRead(parent),
      calls: 'markAllAsRead',
      withArgs: [parent.id],
    },
    {
      name: 'a phone registered for push',
      call: (c) =>
        c.registerPushToken(
          { token: 'ExpoToken[abc]', platform: 'ios' },
          { ...admin, accountId: 'acc-1' },
        ),
      calls: 'registerPushToken',
      /* To the login, so the phone hears from every school. */
      withArgs: ['acc-1', 'ExpoToken[abc]', 'ios'],
    },
  ];

  it.each(cases)('$name', async (c) => {
    await run(c);
  });
});
