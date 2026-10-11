import { BadRequestException } from '@nestjs/common';
import { existsSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
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
    'unreadSummary',
    'getContacts',
    'previewAudience',
    'broadcast',
    'getParticipants',
    'addParticipants',
    'removeParticipant',
    'renameConversation',
  ]);
  const gateway = mockService(['broadcastNewMessage', 'markDeliveredIfOnline']);

  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service, gateway);
    service.sendMessage.mockResolvedValue({ id: 'msg-1' });
    gateway.markDeliveredIfOnline.mockResolvedValue(false);
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
      calls: 'unreadSummary',
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

    /**
     * The socket carries text only, so anything with an attachment comes
     * through here. This path never checked delivery at all, which left every
     * message with a file on one tick until the recipient next reconnected.
     */
    it('marks it delivered when a recipient is online', async () => {
      gateway.markDeliveredIfOnline.mockResolvedValue(true);
      const ctl: any = await buildController(MessagingController, [
        { token: MessagingService, name: 'service', mock: service },
        { token: MessagingGateway, name: 'gateway', mock: gateway },
      ]);

      const sent = await ctl.sendMessage(
        { conversationId: 'conv-1', content: 'Muraho' },
        teacher,
      );

      expect(gateway.markDeliveredIfOnline).toHaveBeenCalledWith(
        'conv-1',
        'msg-1',
        teacher.id,
      );
      expect(sent.status).toBe('DELIVERED');
    });

    it('leaves it on one tick when nobody else is connected', async () => {
      const ctl: any = await buildController(MessagingController, [
        { token: MessagingService, name: 'service', mock: service },
        { token: MessagingGateway, name: 'gateway', mock: gateway },
      ]);

      const sent = await ctl.sendMessage(
        { conversationId: 'conv-1', content: 'Muraho' },
        teacher,
      );
      expect(sent.status).toBeUndefined();
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

    /*
      Written to a real file, because the upload is checked against what its
      bytes actually are: the declared type decides the extension it is stored
      under, and /uploads is served by extension, so a file that lied about
      itself would come back from the API's own origin as whatever it really
      was.
    */
    const written: string[] = [];
    const writeUpload = (
      name: string,
      bytes: number[],
      type: string,
      size?: number,
    ) => {
      const path = join(tmpdir(), `markova-test-${Date.now()}-${name}`);
      writeFileSync(path, Buffer.from(bytes));
      written.push(path);
      return {
        filename: name,
        originalname: name,
        path,
        mimetype: type,
        size: size ?? bytes.length,
      };
    };

    const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]; // %PDF-1

    afterEach(() => {
      for (const path of written.splice(0)) {
        if (existsSync(path)) unlinkSync(path);
      }
    });

    it('answers with the stored url and the name it arrived under', async () => {
      const ctl: any = await build();
      const file = writeUpload('a1b2c3.pdf', PDF, 'application/pdf', 2048);
      file.originalname = 'Marking scheme.pdf';

      expect(ctl.uploadAttachment(file, 'school-1')).toEqual({
        /* In the school's own folder. */
        fileUrl: '/uploads/schools/school-1/attachments/a1b2c3.pdf',
        fileName: 'Marking scheme.pdf',
        size: 2048,
        kind: 'document',
        mimeType: 'application/pdf',
      });
    });

    it('refuses a request that carried no file', async () => {
      const ctl: any = await build();
      expect(() => ctl.uploadAttachment(undefined)).toThrow(
        BadRequestException,
      );
    });

    /*
      Multer takes one number, so it is given the largest of the four caps and
      the per-kind cap is applied here. A forty megabyte document is refused
      even though a fifty megabyte video would not be.
    */
    it('refuses a document over the document cap', async () => {
      const ctl: any = await build();
      const file = writeUpload(
        'big.pdf',
        PDF,
        'application/pdf',
        40 * 1024 * 1024,
      );

      expect(() => ctl.uploadAttachment(file, 'school-1')).toThrow(/25 MB/);
    });

    it('accepts a video larger than a document may be', async () => {
      const ctl: any = await build();
      const file = writeUpload(
        'clip.mp4',
        [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70],
        'video/mp4',
        40 * 1024 * 1024,
      );

      expect(ctl.uploadAttachment(file, 'school-1').kind).toBe('video');
    });

    // And the file goes back off disk, so nothing can point at it.
    it('removes a file it refused for its size', async () => {
      const ctl: any = await build();
      const file = writeUpload(
        'big.pdf',
        PDF,
        'application/pdf',
        40 * 1024 * 1024,
      );

      expect(() => ctl.uploadAttachment(file, 'school-1')).toThrow(
        BadRequestException,
      );
      expect(existsSync(file.path)).toBe(false);
    });

    it('refuses a file that is not what it said it was', async () => {
      const ctl: any = await build();
      const html = [...Buffer.from('<html><script>alert(1)</script>')];
      const file = writeUpload('a1.pdf', html, 'application/pdf');

      expect(() => ctl.uploadAttachment(file, 'school-1')).toThrow(
        /do not match/,
      );
      expect(existsSync(file.path)).toBe(false);
    });

    // A browser recording announces itself as `audio/webm;codecs=opus`.
    it('accepts a voice note recorded by a browser', async () => {
      const ctl: any = await build();
      const file = writeUpload(
        'voice.weba',
        [0x1a, 0x45, 0xdf, 0xa3, 0x01],
        'audio/webm;codecs=opus',
      );

      expect(ctl.uploadAttachment(file, 'school-1').kind).toBe('audio');
    });
  });
});
