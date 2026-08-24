import { BadRequestException } from '@nestjs/common';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';
import { MessagingGateway } from './messaging.gateway';
import {
  clearMocks,
  admin,
  buildController,
  controllerHarness,
  mockService,
  parent,
  teacher,
  type RouteCase,
} from '../../test/controller';

/**
 * Messaging routes.
 *
 * Two routes do something beyond delegating: sending and broadcasting also
 * push down the socket, and if that push were skipped the message would still
 * be stored but nobody's screen would move until they reloaded. So both are
 * checked for the push as well as the write.
 */
describe('MessagingController', () => {
  const service = mockService([
    'createConversation',
    'getConversations',
    'getMessages',
    'sendMessage',
    'markAsRead',
    'getUnreadCount',
    'getContacts',
    'previewAudience',
    'broadcast',
    'getParticipants',
    'addParticipants',
    'removeParticipant',
    'renameConversation',
  ]);
  const gateway = mockService(['broadcastNewMessage']);

  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service, gateway);
    service.sendMessage.mockResolvedValue({ id: 'msg-1' });
    service.broadcast.mockResolvedValue({
      conversation: { id: 'conv-9', messages: [{ id: 'msg-9' }] },
      recipients: 143,
    });
    run = await controllerHarness(MessagingController, [
      { token: MessagingService, name: 'service', mock: service },
      { token: MessagingGateway, name: 'gateway', mock: gateway },
    ]);
  });

  const cases: RouteCase[] = [
    {
      name: 'a conversation started, by whoever started it',
      call: (c) =>
        c.createConversation({ type: 'GROUP', participantUserIds: [] }, admin),
      calls: 'createConversation',
      withArgs: [{ type: 'GROUP', participantUserIds: [] }, admin.id],
    },
    {
      name: 'my own conversations',
      call: (c) => c.getConversations(parent),
      calls: 'getConversations',
      withArgs: [parent.id],
    },
    {
      // The user id travels so the service can refuse an outsider. Without it
      // anybody with a conversation id could read the thread.
      name: 'a thread, with who is asking for it',
      call: (c) => c.getMessages('conv-1', parent, '20', 'msg-5'),
      calls: 'getMessages',
      withArgs: ['conv-1', parent.id, 20, 'msg-5'],
    },
    {
      name: 'a page of fifty by default',
      call: (c) => c.getMessages('conv-1', parent),
      calls: 'getMessages',
      withArgs: ['conv-1', parent.id, 50, undefined],
    },
    {
      name: 'a thread marked read by the person reading it',
      call: (c) => c.markAsRead({ conversationId: 'conv-1' }, parent),
      calls: 'markAsRead',
      withArgs: ['conv-1', parent.id],
    },
    {
      name: 'my unread count',
      call: (c) => c.getUnreadCount(parent),
      calls: 'getUnreadCount',
      withArgs: [parent.id],
    },
    {
      name: 'who this person may write to',
      call: (c) => c.getContacts(parent, 'Aline'),
      calls: 'getContacts',
      withArgs: [parent.id, 'Aline'],
    },
    {
      name: 'how many an announcement would reach',
      call: (c) => c.previewAudience({ audience: 'ALL_PARENTS' }),
      calls: 'previewAudience',
      withArgs: [{ audience: 'ALL_PARENTS' }],
    },
    {
      name: 'who is in a conversation',
      call: (c) => c.getParticipants('conv-1', parent),
      calls: 'getParticipants',
      withArgs: ['conv-1', parent.id],
    },
    {
      name: 'people added by a group admin',
      call: (c) => c.addParticipants('conv-1', { userIds: ['u-2'] }, admin),
      calls: 'addParticipants',
      withArgs: ['conv-1', ['u-2'], admin.id],
    },
    {
      // Who is being removed and who is doing the removing are different
      // arguments, and swapping them would let anybody remove anybody.
      name: 'somebody removed, by somebody',
      call: (c) => c.removeParticipant('conv-1', 'u-2', admin),
      calls: 'removeParticipant',
      withArgs: ['conv-1', 'u-2', admin.id],
    },
    {
      name: 'a group renamed by a group admin',
      call: (c) => c.rename('conv-1', { name: 'Senior 1 teachers' }, admin),
      calls: 'renameConversation',
      withArgs: ['conv-1', 'Senior 1 teachers', admin.id],
    },
  ];

  it.each(cases)('$name', async (c) => {
    await run(c);
  });

  /**
   * A message that is stored but never pushed sits unseen until somebody
   * reloads, which is indistinguishable from the feature being broken.
   */
  describe('what is written is also pushed', () => {
    it('sends the message, then pushes it to the thread', async () => {
      await run({
        name: 'sent',
        call: (c) =>
          c.sendMessage(
            { conversationId: 'conv-1', content: 'Muraho' },
            teacher,
          ),
        calls: 'sendMessage',
        withArgs: [{ conversationId: 'conv-1', content: 'Muraho' }, teacher.id],
      });
      expect(gateway.broadcastNewMessage).toHaveBeenCalledWith('conv-1', {
        id: 'msg-1',
      });
    });

    it('pushes the announcement into the conversation it just created', async () => {
      await run({
        name: 'announced',
        call: (c) =>
          c.broadcast(
            { audience: 'ALL_PARENTS', title: 'X', message: 'Y' },
            admin,
          ),
        calls: 'broadcast',
        withArgs: [
          { audience: 'ALL_PARENTS', title: 'X', message: 'Y' },
          admin.id,
        ],
      });
      expect(gateway.broadcastNewMessage).toHaveBeenCalledWith('conv-9', {
        id: 'msg-9',
      });
    });
  });

  /**
   * The stored name is a uuid and the sender's name travels beside it, so a
   * recipient is offered something they recognise.
   */
  describe('an attachment', () => {
    const build = () =>
      buildController(MessagingController, [
        { token: MessagingService, name: 'service', mock: service },
        { token: MessagingGateway, name: 'gateway', mock: gateway },
      ]);

    it('answers with the stored url and the name it arrived under', async () => {
      const ctl: any = await build();
      expect(
        ctl.uploadAttachment({
          filename: 'a1b2c3.pdf',
          originalname: 'Marking scheme.pdf',
          size: 2048,
        }),
      ).toEqual({
        fileUrl: '/uploads/attachments/a1b2c3.pdf',
        fileName: 'Marking scheme.pdf',
        size: 2048,
      });
    });

    it('refuses a request that carried no file', async () => {
      const ctl: any = await build();
      expect(() => ctl.uploadAttachment(undefined)).toThrow(
        BadRequestException,
      );
    });
  });
});
