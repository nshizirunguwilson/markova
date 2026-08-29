import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MessagingGateway } from './messaging.gateway';
import { MessagingService } from './messaging.service';
import { createMockPrisma } from '../../__test__/prisma-mock';

/**
 * The live socket behind messaging.
 *
 * A socket is authenticated once, at connection, and then trusted for as long
 * as it stays open. That makes the handshake the whole security boundary: a
 * connection that gets past it without a valid token can read every
 * conversation its claimed user belongs to.
 */
describe('MessagingGateway', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let messaging: Record<string, jest.Mock>;
  let jwt: { verify: jest.Mock };
  let gateway: MessagingGateway;
  let emit: jest.Mock;
  let to: jest.Mock;

  const socket = (over: Record<string, unknown> = {}) =>
    ({
      id: 'socket-1',
      handshake: { auth: { token: 'a-token' }, headers: {} },
      data: {},
      join: jest.fn(),
      emit: jest.fn(),
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      disconnect: jest.fn(),
      ...over,
    }) as any;

  beforeEach(() => {
    prisma = createMockPrisma();
    emit = jest.fn();
    to = jest.fn().mockReturnValue({ emit });
    messaging = {
      getConversationParticipantIds: jest.fn().mockResolvedValue([]),
      getUserConversationIds: jest.fn().mockResolvedValue([]),
      getConversationPartnerIds: jest.fn().mockResolvedValue([]),
      markDelivered: jest.fn().mockResolvedValue([]),
      sendMessage: jest.fn().mockResolvedValue({ id: 'msg-1' }),
      markAsRead: jest.fn().mockResolvedValue({ count: 0, readMessageIds: [] }),
      updateMessageStatus: jest.fn().mockResolvedValue({}),
    };
    jwt = { verify: jest.fn().mockReturnValue({ sub: 'user-1' }) };

    gateway = new MessagingGateway(
      jwt as unknown as JwtService,
      { get: () => 'secret' } as unknown as ConfigService,
      prisma,
      messaging as unknown as MessagingService,
    );
    gateway.server = { to } as never;
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', isActive: true });
    prisma.user.update.mockResolvedValue({});
  });

  /**
   * The handshake. Everything downstream trusts `client.data.user`, so this
   * is the only place a bad connection can be stopped.
   */
  describe('connecting', () => {
    it('disconnects a socket that presented no token', async () => {
      const client = socket({ handshake: { auth: {}, headers: {} } });
      await gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    });

    it('disconnects a socket whose token will not verify', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });
      const client = socket();
      await gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
    });

    // A token stays valid for fifteen minutes. An account deactivated inside
    // that window must not still be able to open a socket.
    it('disconnects a socket for an account since deactivated', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        isActive: false,
      });
      const client = socket();
      await gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('disconnects a socket for an account that no longer exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const client = socket();
      await gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('accepts a token in the authorization header too', async () => {
      const client = socket({
        handshake: {
          auth: {},
          headers: { authorization: 'Bearer a-token' },
        },
      });
      await gateway.handleConnection(client);
      expect(client.disconnect).not.toHaveBeenCalled();
      expect(jwt.verify).toHaveBeenCalledWith('a-token', expect.any(Object));
    });

    it('puts the socket in the user’s own room', async () => {
      const client = socket();
      await gateway.handleConnection(client);
      expect(client.join).toHaveBeenCalledWith('user:user-1');
    });

    it('puts the socket in every conversation the user is in', async () => {
      messaging.getUserConversationIds.mockResolvedValue(['conv-1', 'conv-2']);
      const client = socket();
      await gateway.handleConnection(client);
      expect(client.join).toHaveBeenCalledWith('conv:conv-1');
      expect(client.join).toHaveBeenCalledWith('conv:conv-2');
    });

    it('tells the new socket which of its partners is online', async () => {
      messaging.getConversationPartnerIds.mockResolvedValue(['user-2']);
      await gateway.handleConnection(socket({ id: 'socket-2' }));
      const client = socket();
      jwt.verify.mockReturnValue({ sub: 'user-2' });
      await gateway.handleConnection(client);
      expect(client.emit).toHaveBeenCalledWith('onlineUsers', ['user-2']);
    });

    /**
     * The list used to be every socket on the server, which told anyone who
     * signed in who else in the school was at their desk.
     */
    it('leaves out somebody online who shares no conversation', async () => {
      messaging.getConversationPartnerIds.mockResolvedValue([]);
      await gateway.handleConnection(socket({ id: 'socket-2' }));
      const client = socket();
      jwt.verify.mockReturnValue({ sub: 'user-2' });
      await gateway.handleConnection(client);
      expect(client.emit).toHaveBeenCalledWith('onlineUsers', []);
    });

    /**
     * Messages that arrived while somebody was offline are marked delivered
     * on reconnect, and their senders' ticks move. Without this the sender's
     * screen shows a single tick for ever.
     */
    it('tells senders their waiting messages were delivered', async () => {
      messaging.markDelivered.mockResolvedValue([
        { id: 'msg-1', senderUserId: 'user-9', conversationId: 'conv-1' },
      ]);
      await gateway.handleConnection(socket());
      expect(to).toHaveBeenCalledWith('user:user-9');
      expect(emit).toHaveBeenCalledWith('messageDelivered', {
        messageId: 'msg-1',
        conversationId: 'conv-1',
      });
    });
  });

  /**
   * Presence. One person can have three devices, so they are only offline
   * once the last of them has gone.
   */
  describe('going offline', () => {
    it('does nothing for a socket that was never signed in', async () => {
      await gateway.handleDisconnect(socket({ data: {} }));
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('keeps somebody online while another device is still connected', async () => {
      await gateway.handleConnection(socket({ id: 'socket-1' }));
      await gateway.handleConnection(socket({ id: 'socket-2' }));

      await gateway.handleDisconnect(
        socket({ id: 'socket-1', data: { user: { sub: 'user-1' } } }),
      );
      expect(gateway.isUserOnline('user-1')).toBe(true);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('marks them offline once the last device goes', async () => {
      await gateway.handleConnection(socket({ id: 'socket-1' }));
      await gateway.handleDisconnect(
        socket({ id: 'socket-1', data: { user: { sub: 'user-1' } } }),
      );
      expect(gateway.isUserOnline('user-1')).toBe(false);
    });

    // "Last seen" is what the other person's screen shows instead of a green
    // dot, so it has to be written at the moment the last socket closes.
    it('records when they were last seen', async () => {
      await gateway.handleConnection(socket({ id: 'socket-1' }));
      await gateway.handleDisconnect(
        socket({ id: 'socket-1', data: { user: { sub: 'user-1' } } }),
      );
      expect(
        prisma.user.update.mock.calls[0][0].data.lastSeenAt,
      ).toBeInstanceOf(Date);
    });

    /**
     * Addressed to the other participants' own rooms, not to `conv:<id>`.
     * A conversation started after somebody connected is not in their room
     * set, so presence - like read receipts and typing - went missing for
     * exactly the threads people had just opened.
     */
    it('tells the people they share conversations with', async () => {
      messaging.getUserConversationIds.mockResolvedValue(['conv-1']);
      messaging.getConversationParticipantIds.mockResolvedValue([
        'user-1',
        'user-2',
      ]);
      await gateway.handleConnection(socket({ id: 'socket-1' }));
      to.mockClear();
      await gateway.handleDisconnect(
        socket({ id: 'socket-1', data: { user: { sub: 'user-1' } } }),
      );
      expect(to).toHaveBeenCalledWith(['user:user-2']);
      expect(emit).toHaveBeenCalledWith(
        'presenceChange',
        expect.objectContaining({ userId: 'user-1', isOnline: false }),
      );
    });

    // Somebody sharing four threads with this user is told once, not four
    // times over.
    it('tells each person once however many threads they share', async () => {
      messaging.getUserConversationIds.mockResolvedValue([
        'conv-1',
        'conv-2',
        'conv-3',
      ]);
      messaging.getConversationParticipantIds.mockResolvedValue([
        'user-1',
        'user-2',
      ]);
      await gateway.handleConnection(socket({ id: 'socket-1' }));
      to.mockClear();
      await gateway.handleDisconnect(
        socket({ id: 'socket-1', data: { user: { sub: 'user-1' } } }),
      );
      expect(to).toHaveBeenCalledTimes(1);
      expect(to).toHaveBeenCalledWith(['user:user-2']);
    });

    it('says nothing when they share no conversation with anyone', async () => {
      messaging.getUserConversationIds.mockResolvedValue([]);
      await gateway.handleConnection(socket({ id: 'socket-1' }));
      to.mockClear();
      await gateway.handleDisconnect(
        socket({ id: 'socket-1', data: { user: { sub: 'user-1' } } }),
      );
      expect(to).not.toHaveBeenCalled();
    });

    it('lists who is online', async () => {
      await gateway.handleConnection(socket());
      expect(gateway.getOnlineUserIds()).toEqual(['user-1']);
    });
  });

  /**
   * Sending over the socket. Thirty a minute is enough for a fast typist and
   * far short of what a script would send.
   */
  describe('sending a message', () => {
    const client = () =>
      socket({
        data: { user: { sub: 'user-1', firstName: 'A', lastName: 'B' } },
      });

    it('stores it and pushes it to the thread', async () => {
      messaging.getConversationParticipantIds.mockResolvedValue([
        'user-1',
        'user-2',
      ]);
      const result = await gateway.handleSendMessage(client(), {
        conversationId: 'conv-1',
        content: 'Muraho',
      });
      expect(messaging.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-1',
          content: 'Muraho',
        }),
        'user-1',
      );
      expect(result).toEqual({ messageId: 'msg-1', status: 'SENT' });
    });

    it('refuses the thirty-first message in a minute', async () => {
      const c = client();
      for (let i = 0; i < 30; i++) {
        await gateway.handleSendMessage(c, {
          conversationId: 'conv-1',
          content: 'x',
        });
      }
      const result = await gateway.handleSendMessage(c, {
        conversationId: 'conv-1',
        content: 'one too many',
      });
      expect(result).toEqual({
        error: 'Rate limit exceeded. Max 30 messages per minute.',
      });
      expect(messaging.sendMessage).toHaveBeenCalledTimes(30);
    });

    it('lets the same person send again once the window has passed', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-20T10:00:00Z'));
      const c = client();
      for (let i = 0; i < 30; i++) {
        await gateway.handleSendMessage(c, {
          conversationId: 'c',
          content: 'x',
        });
      }
      jest.setSystemTime(new Date('2026-08-20T10:01:30Z'));
      const result = await gateway.handleSendMessage(c, {
        conversationId: 'c',
        content: 'later',
      });
      expect(result).toMatchObject({ status: 'SENT' });
      jest.useRealTimers();
    });

    // The limit is per person, not per server.
    it('does not count one person’s messages against another', async () => {
      const a = client();
      const b = socket({ data: { user: { sub: 'user-2' } } });
      for (let i = 0; i < 30; i++) {
        await gateway.handleSendMessage(a, {
          conversationId: 'c',
          content: 'x',
        });
      }
      const result = await gateway.handleSendMessage(b, {
        conversationId: 'c',
        content: 'mine',
      });
      expect(result).toMatchObject({ status: 'SENT' });
    });

    /**
     * A second tick means somebody's device has it. It is only true when a
     * recipient other than the sender is actually connected.
     */
    it('marks a message delivered when a recipient is online', async () => {
      await gateway.handleConnection(
        socket({ id: 's-2', handshake: { auth: { token: 't' }, headers: {} } }),
      );
      jwt.verify.mockReturnValue({ sub: 'user-2' });
      await gateway.handleConnection(
        socket({ id: 's-3', handshake: { auth: { token: 't' }, headers: {} } }),
      );
      messaging.getConversationParticipantIds.mockResolvedValue([
        'user-1',
        'user-2',
      ]);

      const c = client();
      const ack = await gateway.handleSendMessage(c, {
        conversationId: 'conv-1',
        content: 'Muraho',
      });
      expect(messaging.updateMessageStatus).toHaveBeenCalledWith(
        'msg-1',
        'DELIVERED',
      );
      // The sender's own room, not the single socket that sent it: with the
      // dashboard open in two tabs, only one of them grew a second tick.
      expect(to).toHaveBeenCalledWith('user:user-1');
      expect(emit).toHaveBeenCalledWith('messageDelivered', {
        messageId: 'msg-1',
        conversationId: 'conv-1',
      });
      expect(ack).toEqual({ messageId: 'msg-1', status: 'DELIVERED' });
    });

    it('does not mark it delivered when nobody else is connected', async () => {
      messaging.getConversationParticipantIds.mockResolvedValue([
        'user-1',
        'user-2',
      ]);
      await gateway.handleSendMessage(client(), {
        conversationId: 'conv-1',
        content: 'Muraho',
      });
      expect(messaging.updateMessageStatus).not.toHaveBeenCalled();
    });

    // A sender being online is not delivery to anybody else.
    it('does not count the sender as a recipient', async () => {
      await gateway.handleConnection(socket());
      messaging.getConversationParticipantIds.mockResolvedValue(['user-1']);
      await gateway.handleSendMessage(client(), {
        conversationId: 'conv-1',
        content: 'note to self',
      });
      expect(messaging.updateMessageStatus).not.toHaveBeenCalled();
    });
  });

  describe('read receipts', () => {
    /**
     * The sender has to be told, and they are only in `conv:<id>` if the
     * conversation already existed when they connected - so a read receipt on
     * a thread somebody had just started never arrived at all.
     */
    it('tells every participant which messages were read, and by whom', async () => {
      messaging.getConversationParticipantIds.mockResolvedValue([
        'user-1',
        'user-2',
      ]);
      messaging.markAsRead.mockResolvedValue({
        count: 2,
        readMessageIds: ['m-1', 'm-2'],
      });
      const result = await gateway.handleMarkRead(
        socket({ data: { user: { sub: 'user-1' } } }),
        { conversationId: 'conv-1' },
      );
      expect(to).toHaveBeenCalledWith(['user:user-1', 'user:user-2']);
      expect(emit).toHaveBeenCalledWith('messagesRead', {
        conversationId: 'conv-1',
        readBy: 'user-1',
        messageIds: ['m-1', 'm-2'],
      });
      expect(result).toEqual({ count: 2 });
    });

    // Opening a thread with nothing new in it should not make everybody
    // else's ticks flicker.
    it('says nothing when there was nothing unread', async () => {
      await gateway.handleMarkRead(
        socket({ data: { user: { sub: 'user-1' } } }),
        { conversationId: 'conv-1' },
      );
      expect(emit).not.toHaveBeenCalled();
    });
  });

  /**
   * Typing indicators.
   *
   * Both problems here were invisible from the server side. The name came off
   * the JWT, which carries `sub` and `role` and nothing else, so every
   * recipient saw a blank name; and the event went to `conv:<id>`, which a
   * socket only joins at connection time.
   */
  describe('typing', () => {
    const typist = () =>
      socket({ data: { user: { sub: 'user-1' }, displayName: 'Divine N' } });

    beforeEach(() => {
      messaging.getConversationParticipantIds.mockResolvedValue([
        'user-1',
        'user-2',
      ]);
    });

    it('tells the others in the thread, not the typist', async () => {
      await gateway.handleTyping(typist(), { conversationId: 'conv-1' });
      expect(to).toHaveBeenCalledWith(['user:user-2']);
      expect(emit).toHaveBeenCalledWith('userTyping', {
        conversationId: 'conv-1',
        userId: 'user-1',
        userName: 'Divine N',
      });
    });

    // The name is read at connection off the record already loaded to
    // authorise the socket, not out of the token.
    it('carries the typist’s real name', async () => {
      await gateway.handleConnection(socket({ id: 'socket-1' }));
      const client = socket({ id: 'socket-1' });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        isActive: true,
        firstName: 'Divine',
        lastName: 'Niyonkuru',
      });
      await gateway.handleConnection(client);
      expect(client.data.displayName).toBe('Divine Niyonkuru');
    });

    it('copes with an account that has no name on it', async () => {
      const client = socket({ data: { user: { sub: 'user-1' } } });
      await gateway.handleTyping(client, { conversationId: 'conv-1' });
      expect(emit.mock.calls[0][1].userName).toBe('');
    });

    it('tells them when the typing stops', async () => {
      await gateway.handleStopTyping(typist(), { conversationId: 'conv-1' });
      expect(to).toHaveBeenCalledWith(['user:user-2']);
      expect(emit).toHaveBeenCalledWith('userStopTyping', {
        conversationId: 'conv-1',
        userId: 'user-1',
      });
    });

    it('says nothing into a thread with nobody else in it', async () => {
      messaging.getConversationParticipantIds.mockResolvedValue(['user-1']);
      await gateway.handleTyping(typist(), { conversationId: 'conv-1' });
      expect(emit).not.toHaveBeenCalled();
    });
  });

  /**
   * A conversation created after a socket connected is not in that socket's
   * rooms yet, which is why joining is an explicit event.
   */
  it('joins a conversation created after the socket connected', () => {
    const client = socket();
    gateway.handleJoinConversation(client, { conversationId: 'conv-9' });
    expect(client.join).toHaveBeenCalledWith('conv:conv-9');
  });

  /**
   * A new message is pushed to each participant's own room rather than the
   * conversation room, because a socket that connected before the
   * conversation existed is not in the conversation room.
   */
  describe('pushing a message out', () => {
    it('pushes to every participant’s own room', async () => {
      messaging.getConversationParticipantIds.mockResolvedValue([
        'user-1',
        'user-2',
      ]);
      await gateway.broadcastNewMessage('conv-1', { id: 'msg-1' });
      expect(to).toHaveBeenCalledWith(['user:user-1', 'user:user-2']);
      expect(emit).toHaveBeenCalledWith('newMessage', { id: 'msg-1' });
    });

    it('pushes nowhere when a conversation has nobody in it', async () => {
      await gateway.broadcastNewMessage('conv-1', { id: 'msg-1' });
      expect(to).not.toHaveBeenCalled();
    });
  });
});

/**
 * Two people in one conversation, connecting one after the other.
 *
 * The reported fault was one-sided: whoever connected second saw the first
 * as online, but the first never saw the second appear. The second party
 * learns the room's state from the `onlineUsers` list handed to them at
 * connect; the first has only the `presenceChange` broadcast to go on.
 */
describe('MessagingGateway presence between two people', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let gateway: MessagingGateway;
  let jwt: { verify: jest.Mock };
  let messaging: Record<string, jest.Mock>;
  let to: jest.Mock;
  let emit: jest.Mock;

  const socketFor = (userId: string) =>
    ({
      id: `socket-${userId}`,
      handshake: { auth: { token: userId }, headers: {} },
      data: {},
      join: jest.fn(),
      emit: jest.fn(),
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      disconnect: jest.fn(),
    }) as any;

  beforeEach(() => {
    prisma = createMockPrisma();
    emit = jest.fn();
    to = jest.fn().mockReturnValue({ emit });
    messaging = {
      getConversationParticipantIds: jest
        .fn()
        .mockResolvedValue(['admin-1', 'student-1']),
      getUserConversationIds: jest.fn().mockResolvedValue(['conv-1']),
      getConversationPartnerIds: jest
        .fn()
        .mockImplementation((id: string) =>
          Promise.resolve(['admin-1', 'student-1'].filter((p) => p !== id)),
        ),
      markDelivered: jest.fn().mockResolvedValue([]),
    };
    // The token is the user id in this harness.
    jwt = { verify: jest.fn((token: string) => ({ sub: token })) };
    gateway = new MessagingGateway(
      jwt as unknown as JwtService,
      { get: () => 'secret' } as unknown as ConfigService,
      prisma,
      messaging as unknown as MessagingService,
    );
    gateway.server = { to } as never;
    prisma.user.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve({ id: where.id, isActive: true, firstName: 'A' }),
    );
    prisma.user.update.mockResolvedValue({});
  });

  it('tells the admin, already connected, that the student came online', async () => {
    await gateway.handleConnection(socketFor('admin-1'));
    to.mockClear();
    emit.mockClear();

    await gateway.handleConnection(socketFor('student-1'));

    expect(to).toHaveBeenCalledWith(['user:admin-1']);
    expect(emit).toHaveBeenCalledWith(
      'presenceChange',
      expect.objectContaining({ userId: 'student-1', isOnline: true }),
    );
  });

  it('hands the student, connecting second, everyone already online', async () => {
    await gateway.handleConnection(socketFor('admin-1'));
    const student = socketFor('student-1');

    await gateway.handleConnection(student);

    expect(student.emit).toHaveBeenCalledWith(
      'onlineUsers',
      expect.arrayContaining(['admin-1']),
    );
  });
});
