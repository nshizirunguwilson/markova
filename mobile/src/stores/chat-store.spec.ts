import { io } from 'socket.io-client';

import api from '@/lib/api';
import { getAccessToken } from '@/lib/storage';

import { useChatStore, type Conversation, type Message } from './chat-store';

/**
 * Messaging, which is the one part of the app that is live.
 *
 * Everything else asks the API a question and gets an answer. This holds a
 * socket open and has to survive it dropping, the token behind it expiring,
 * and the same message arriving twice. It also has to answer one question
 * correctly on every single message: is this one mine?
 */

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock('@/lib/storage');

const http = api as jest.Mocked<typeof api>;
const token = getAccessToken as jest.Mock;
const connectSocket = io as jest.Mock;

const initial = useChatStore.getState();

// A socket that records what was listened for, so a test can deliver an event
// the way the server would.
function fakeSocket() {
  const handlers = new Map<string, (payload: never) => void>();
  return {
    connected: true,
    auth: { token: 'access-old' } as Record<string, unknown>,
    on: jest.fn((event: string, handler: never) => {
      handlers.set(event, handler);
    }),
    emit: jest.fn(),
    disconnect: jest.fn(),
    deliver: (event: string, payload?: unknown) => {
      const handler = handlers.get(event);
      if (!handler) throw new Error(`nothing is listening for "${event}"`);
      return (handler as (p: unknown) => void)(payload);
    },
    listensFor: (event: string) => handlers.has(event),
  };
}

const message = (over: Partial<Message> = {}): Message =>
  ({
    id: 'm1',
    content: 'Bwakeye',
    conversationId: 'c1',
    senderId: 'user-2',
    status: 'SENT',
    createdAt: '2026-08-24T08:00:00.000Z',
    ...over,
  }) as Message;

const conversation = (over: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'c1',
    participants: [],
    updatedAt: '2026-08-24T08:00:00.000Z',
    ...over,
  }) as Conversation;

let socket: ReturnType<typeof fakeSocket>;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  useChatStore.setState({ ...initial, onlineUsers: new Set() }, true);
  socket = fakeSocket();
  connectSocket.mockReturnValue(socket);
  token.mockResolvedValue('access-1');
});

afterEach(() => {
  jest.useRealTimers();
});

describe('opening the connection', () => {
  it('joins the chat namespace carrying the session', async () => {
    await useChatStore.getState().connect();

    expect(connectSocket).toHaveBeenCalledWith(
      'http://localhost:3000/chat',
      expect.objectContaining({ auth: { token: 'access-1' } }),
    );
    expect(useChatStore.getState().socket).toBe(socket);
  });

  it('keeps trying when the connection drops', async () => {
    await useChatStore.getState().connect();

    expect(connectSocket.mock.calls[0][1]).toMatchObject({
      reconnection: true,
      reconnectionAttempts: 10,
    });
  });

  it('does not open a second one on top of a live one', async () => {
    useChatStore.setState({ socket: socket as never });

    await useChatStore.getState().connect();

    expect(connectSocket).not.toHaveBeenCalled();
  });

  it('reopens one that had gone quiet', async () => {
    useChatStore.setState({ socket: { ...socket, connected: false } as never });

    await useChatStore.getState().connect();

    expect(connectSocket).toHaveBeenCalled();
  });

  it('does not try at all when nobody is signed in', async () => {
    token.mockResolvedValue(null);

    await useChatStore.getState().connect();

    expect(connectSocket).not.toHaveBeenCalled();
  });

  it('loads what is waiting the moment it connects', async () => {
    http.get.mockResolvedValue({ data: [] } as never);
    await useChatStore.getState().connect();

    socket.deliver('connect');

    expect(useChatStore.getState().connected).toBe(true);
    expect(http.get).toHaveBeenCalledWith('/messaging/conversations');
    expect(http.get).toHaveBeenCalledWith('/messaging/unread');
  });

  it('says so when the connection goes', async () => {
    await useChatStore.getState().connect();
    socket.deliver('connect');

    socket.deliver('disconnect');

    expect(useChatStore.getState().connected).toBe(false);
  });

  /**
   * A socket that has been open for hours is holding a token that expired
   * some time ago. Picking up the renewed one before the next attempt is what
   * lets it come back rather than failing forever.
   */
  it('picks up a renewed session before trying again', async () => {
    await useChatStore.getState().connect();
    token.mockResolvedValue('access-new');

    await socket.deliver('connect_error');

    expect(socket.auth.token).toBe('access-new');
  });

  it('leaves the old one alone when there is nothing to replace it with', async () => {
    await useChatStore.getState().connect();
    token.mockResolvedValue(null);

    await socket.deliver('connect_error');

    expect(socket.auth.token).toBe('access-old');
  });

  it('closes and forgets the socket when asked', async () => {
    await useChatStore.getState().connect();

    useChatStore.getState().disconnect();

    expect(socket.disconnect).toHaveBeenCalled();
    expect(useChatStore.getState().socket).toBeNull();
    expect(useChatStore.getState().connected).toBe(false);
  });

  it('does nothing when asked to close one that was never open', () => {
    expect(() => useChatStore.getState().disconnect()).not.toThrow();
  });
});

/**
 * The UI asks "senderId === my id" to decide which side of the screen a
 * bubble goes on. The API calls the author senderUserId on the scalar and
 * sender.id on the relation, and never senderId, so without normalising it
 * every message the user sent appears as somebody else's.
 */
describe('working out whose message it is', () => {
  it.each([
    ['the scalar the API sends', { senderUserId: 'user-2' }],
    ['the relation the API sends', { sender: { id: 'user-2' } }],
    ['a field already in the right shape', { senderId: 'user-2' }],
  ])('reads the author from %s', async (_label, shape) => {
    await useChatStore.getState().connect();

    socket.deliver('newMessage', { ...message({ senderId: undefined }), ...shape });

    expect(useChatStore.getState().messages.c1[0].senderId).toBe('user-2');
  });

  it('leaves a message that is not there alone', async () => {
    await useChatStore.getState().connect();

    expect(() => socket.deliver('newMessage', null)).not.toThrow();
  });

  it('normalises the last message on a conversation list too', async () => {
    http.get.mockResolvedValue({
      data: [
        conversation({
          lastMessage: { ...message({ senderId: undefined }), senderUserId: 'user-2' },
        }),
      ],
    } as never);

    await useChatStore.getState().loadConversations();

    expect(
      useChatStore.getState().conversations[0].lastMessage?.senderId,
    ).toBe('user-2');
  });

  it('leaves a conversation with no messages yet alone', async () => {
    http.get.mockResolvedValue({ data: [conversation()] } as never);

    await useChatStore.getState().loadConversations();

    expect(useChatStore.getState().conversations[0].lastMessage).toBeUndefined();
  });
});

describe('a message arriving', () => {
  beforeEach(async () => {
    await useChatStore.getState().connect();
  });

  it('lands in its conversation', () => {
    socket.deliver('newMessage', message());

    expect(useChatStore.getState().messages.c1).toHaveLength(1);
    expect(useChatStore.getState().unreadCount).toBe(1);
  });

  // A socket that reconnects can replay. The same message twice would show as
  // two bubbles and count twice against the badge.
  it('is ignored the second time the same one arrives', () => {
    socket.deliver('newMessage', message());
    socket.deliver('newMessage', message());

    expect(useChatStore.getState().messages.c1).toHaveLength(1);
    expect(useChatStore.getState().unreadCount).toBe(1);
  });

  it('moves its conversation to the top of the list', () => {
    useChatStore.setState({
      conversations: [
        conversation({ id: 'c2', updatedAt: '2026-08-24T09:00:00.000Z' }),
        conversation({ id: 'c1', updatedAt: '2026-08-24T07:00:00.000Z' }),
      ],
    });

    socket.deliver(
      'newMessage',
      message({ createdAt: '2026-08-24T10:00:00.000Z' }),
    );

    expect(useChatStore.getState().conversations.map((c) => c.id)).toEqual([
      'c1',
      'c2',
    ]);
    expect(useChatStore.getState().conversations[0].lastMessage?.id).toBe('m1');
  });

  it('keeps conversations apart', () => {
    socket.deliver('newMessage', message({ id: 'm1', conversationId: 'c1' }));
    socket.deliver('newMessage', message({ id: 'm2', conversationId: 'c2' }));

    expect(useChatStore.getState().messages.c1).toHaveLength(1);
    expect(useChatStore.getState().messages.c2).toHaveLength(1);
  });
});

describe('the ticks beside a message', () => {
  beforeEach(async () => {
    await useChatStore.getState().connect();
    useChatStore.setState({ messages: { c1: [message()] } });
  });

  it('turns to delivered when the server says so', () => {
    socket.deliver('messageDelivered', {
      messageId: 'm1',
      conversationId: 'c1',
    });

    expect(useChatStore.getState().messages.c1[0].status).toBe('DELIVERED');
  });

  it('turns to read when the other person opens it', () => {
    socket.deliver('messagesRead', {
      conversationId: 'c1',
      readBy: 'user-2',
      messageIds: ['m1'],
    });

    expect(useChatStore.getState().messages.c1[0].status).toBe('READ');
  });

  it('leaves the other messages in the thread alone', () => {
    useChatStore.setState({
      messages: { c1: [message(), message({ id: 'm2' })] },
    });

    socket.deliver('messageDelivered', {
      messageId: 'm1',
      conversationId: 'c1',
    });

    const [first, second] = useChatStore.getState().messages.c1;
    expect(first.status).toBe('DELIVERED');
    expect(second.status).toBe('SENT');
  });

  it('only marks the ones named', () => {
    useChatStore.setState({
      messages: { c1: [message(), message({ id: 'm2' })] },
    });

    socket.deliver('messagesRead', {
      conversationId: 'c1',
      readBy: 'user-2',
      messageIds: ['m1'],
    });

    const [first, second] = useChatStore.getState().messages.c1;
    expect(first.status).toBe('READ');
    expect(second.status).toBe('SENT');
  });

  it.each(['messageDelivered', 'messagesRead'])(
    'shrugs at a %s for a conversation nobody has open',
    (event) => {
      const before = useChatStore.getState().messages;

      socket.deliver(event, {
        messageId: 'm1',
        conversationId: 'never-opened',
        messageIds: ['m1'],
      });

      expect(useChatStore.getState().messages).toBe(before);
    },
  );
});

describe('the line that says somebody is writing', () => {
  beforeEach(async () => {
    await useChatStore.getState().connect();
  });

  const typing = {
    conversationId: 'c1',
    userId: 'user-2',
    userName: 'Aline',
  };

  it('appears while they are', () => {
    socket.deliver('userTyping', typing);

    expect(useChatStore.getState().typingUsers).toEqual([typing]);
  });

  it('does not appear twice for one person', () => {
    socket.deliver('userTyping', typing);
    socket.deliver('userTyping', typing);

    expect(useChatStore.getState().typingUsers).toHaveLength(1);
  });

  it('shows two people writing at once', () => {
    socket.deliver('userTyping', typing);
    socket.deliver('userTyping', { ...typing, userId: 'user-3' });

    expect(useChatStore.getState().typingUsers).toHaveLength(2);
  });

  it('goes when they stop', () => {
    socket.deliver('userTyping', typing);

    socket.deliver('userStopTyping', typing);

    expect(useChatStore.getState().typingUsers).toEqual([]);
  });

  /**
   * The "stopped typing" event is the one most likely to be lost when a phone
   * goes through a tunnel. Without the timer the indicator stays on screen
   * forever and the app looks stuck.
   */
  it('goes on its own when the event that clears it never arrives', () => {
    socket.deliver('userTyping', typing);

    jest.advanceTimersByTime(5000);

    expect(useChatStore.getState().typingUsers).toEqual([]);
  });

  it('leaves the other person alone when one of them stops', () => {
    socket.deliver('userTyping', typing);
    socket.deliver('userTyping', { ...typing, userId: 'user-3' });

    socket.deliver('userStopTyping', typing);

    expect(useChatStore.getState().typingUsers.map((t) => t.userId)).toEqual([
      'user-3',
    ]);
  });
});

describe('the green dot beside a name', () => {
  beforeEach(async () => {
    await useChatStore.getState().connect();
  });

  it('starts from the list the server sends on connect', () => {
    socket.deliver('onlineUsers', ['user-2', 'user-3']);

    expect([...useChatStore.getState().onlineUsers]).toEqual([
      'user-2',
      'user-3',
    ]);
  });

  it('lights up when somebody comes online', () => {
    socket.deliver('presenceChange', { userId: 'user-2', isOnline: true });

    expect(useChatStore.getState().onlineUsers.has('user-2')).toBe(true);
  });

  it('goes out when they leave', () => {
    socket.deliver('presenceChange', { userId: 'user-2', isOnline: true });

    socket.deliver('presenceChange', { userId: 'user-2', isOnline: false });

    expect(useChatStore.getState().onlineUsers.has('user-2')).toBe(false);
  });
});

describe('reading a conversation', () => {
  beforeEach(async () => {
    await useChatStore.getState().connect();
  });

  it('asks for the newest page and turns it the right way up', async () => {
    http.get.mockResolvedValue({
      data: { data: [message({ id: 'm2' }), message({ id: 'm1' })] },
    } as never);

    await useChatStore.getState().loadMessages('c1');

    expect(http.get).toHaveBeenCalledWith(
      '/messaging/conversations/c1/messages',
      { params: { page: 1, limit: 50 } },
    );
    expect(useChatStore.getState().messages.c1.map((m) => m.id)).toEqual([
      'm1',
      'm2',
    ]);
  });

  it('puts an older page above what is already on screen', async () => {
    useChatStore.setState({ messages: { c1: [message({ id: 'm3' })] } });
    http.get.mockResolvedValue({
      data: { data: [message({ id: 'm2' }), message({ id: 'm1' })] },
    } as never);

    await useChatStore.getState().loadMessages('c1', 2);

    expect(useChatStore.getState().messages.c1.map((m) => m.id)).toEqual([
      'm1',
      'm2',
      'm3',
    ]);
  });

  it('starts a thread from an older page when nothing was open', async () => {
    http.get.mockResolvedValue({
      data: { data: [message({ id: 'm2' }), message({ id: 'm1' })] },
    } as never);

    await useChatStore.getState().loadMessages('c1', 2);

    expect(useChatStore.getState().messages.c1.map((m) => m.id)).toEqual([
      'm1',
      'm2',
    ]);
  });

  it('copes with the API answering as a bare list', async () => {
    http.get.mockResolvedValue({ data: [message()] } as never);

    await useChatStore.getState().loadMessages('c1');

    expect(useChatStore.getState().messages.c1).toHaveLength(1);
  });

  // Joining the room is what makes the next message arrive live rather than
  // on the next manual refresh.
  it('joins the room so the next message arrives on its own', async () => {
    http.get.mockResolvedValue({ data: [] } as never);

    await useChatStore.getState().loadMessages('c1');

    expect(socket.emit).toHaveBeenCalledWith('joinConversation', {
      conversationId: 'c1',
    });
  });

  it('leaves the screen as it was when the read fails', async () => {
    http.get.mockRejectedValue(new Error('offline'));

    await expect(useChatStore.getState().loadMessages('c1')).resolves
      .toBeUndefined();
    expect(useChatStore.getState().messages.c1).toBeUndefined();
  });
});

describe('sending', () => {
  it('goes over the socket when it is open', async () => {
    await useChatStore.getState().connect();

    useChatStore.getState().sendMessage('c1', 'Bwakeye');

    expect(socket.emit).toHaveBeenCalledWith(
      'sendMessage',
      { conversationId: 'c1', content: 'Bwakeye' },
      expect.any(Function),
    );
  });

  it('is dropped rather than queued when the socket is shut', () => {
    useChatStore.getState().sendMessage('c1', 'Bwakeye');

    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('says something when the server refuses it', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await useChatStore.getState().connect();
    useChatStore.getState().sendMessage('c1', 'Bwakeye');

    const ack = socket.emit.mock.calls[0][2] as (a: unknown) => void;
    ack({ error: 'You are not in this conversation' });

    expect(warn).toHaveBeenCalledWith(
      'Send failed:',
      'You are not in this conversation',
    );
    warn.mockRestore();
  });

  it('says nothing when the server accepts it', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await useChatStore.getState().connect();
    useChatStore.getState().sendMessage('c1', 'Bwakeye');

    (socket.emit.mock.calls[0][2] as (a: unknown) => void)({ id: 'm1' });

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('the unread badge', () => {
  beforeEach(async () => {
    await useChatStore.getState().connect();
    useChatStore.setState({
      unreadCount: 5,
      conversations: [
        conversation({ id: 'c1', unreadCount: 3 }),
        conversation({ id: 'c2', unreadCount: 2 }),
      ],
    });
  });

  it('drops by what the opened conversation was holding', () => {
    useChatStore.getState().markRead('c1');

    expect(useChatStore.getState().unreadCount).toBe(2);
    expect(useChatStore.getState().conversations[0].unreadCount).toBe(0);
    expect(socket.emit).toHaveBeenCalledWith('markRead', {
      conversationId: 'c1',
    });
  });

  // A badge showing a negative number is worse than a stale one.
  it('never goes below nothing', () => {
    useChatStore.setState({ unreadCount: 1 });

    useChatStore.getState().markRead('c1');

    expect(useChatStore.getState().unreadCount).toBe(0);
  });

  it('is left alone for a conversation it has never seen', () => {
    useChatStore.getState().markRead('never-seen');

    expect(useChatStore.getState().unreadCount).toBe(5);
  });

  it('is left alone for a conversation that had nothing waiting', () => {
    useChatStore.getState().markRead('c2');

    expect(useChatStore.getState().unreadCount).toBe(3);
  });

  it('is not touched when the socket is shut', () => {
    useChatStore.setState({ socket: null });

    useChatStore.getState().markRead('c1');

    expect(useChatStore.getState().unreadCount).toBe(5);
  });

  it('is read from the API on demand', async () => {
    http.get.mockResolvedValue({ data: { count: 7 } } as never);

    await useChatStore.getState().loadUnreadCount();

    expect(useChatStore.getState().unreadCount).toBe(7);
  });

  it('reads as nothing when the API sends no number', async () => {
    http.get.mockResolvedValue({ data: {} } as never);

    await useChatStore.getState().loadUnreadCount();

    expect(useChatStore.getState().unreadCount).toBe(0);
  });

  it('is left as it was when the read fails', async () => {
    http.get.mockRejectedValue(new Error('offline'));

    await useChatStore.getState().loadUnreadCount();

    expect(useChatStore.getState().unreadCount).toBe(5);
  });
});

describe('typing indicators sent the other way', () => {
  it('tells the other person when you start and stop', async () => {
    await useChatStore.getState().connect();

    useChatStore.getState().startTyping('c1');
    useChatStore.getState().stopTyping('c1');

    expect(socket.emit).toHaveBeenCalledWith('typing', { conversationId: 'c1' });
    expect(socket.emit).toHaveBeenCalledWith('stopTyping', {
      conversationId: 'c1',
    });
  });

  it('says nothing at all when there is no socket', () => {
    expect(() => {
      useChatStore.getState().startTyping('c1');
      useChatStore.getState().stopTyping('c1');
    }).not.toThrow();
  });
});

describe('starting a new conversation', () => {
  it('creates it and returns where to go', async () => {
    http.post.mockResolvedValue({ data: { id: 'c9' } } as never);
    http.get.mockResolvedValue({ data: [] } as never);

    await expect(
      useChatStore.getState().createConversation(['user-2']),
    ).resolves.toBe('c9');

    expect(http.post).toHaveBeenCalledWith('/messaging/conversations', {
      participantIds: ['user-2'],
    });
    expect(http.get).toHaveBeenCalledWith('/messaging/conversations');
  });

  it('lets a refusal reach the screen', async () => {
    http.post.mockRejectedValue(new Error('You cannot message that person'));

    await expect(
      useChatStore.getState().createConversation(['user-2']),
    ).rejects.toThrow('You cannot message that person');
  });
});

describe('reading the conversation list', () => {
  it('leaves the list as it was when the read fails', async () => {
    useChatStore.setState({ conversations: [conversation()] });
    http.get.mockRejectedValue(new Error('offline'));

    await useChatStore.getState().loadConversations();

    expect(useChatStore.getState().conversations).toHaveLength(1);
  });
});
