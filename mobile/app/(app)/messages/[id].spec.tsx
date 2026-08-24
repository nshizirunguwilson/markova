import { fireEvent, waitFor } from '@testing-library/react-native';

import { defaultTheme } from '@/design/theme';
import { useChatStore, type Conversation, type Message } from '@/stores/chat-store';
import { routerState, screenTitle } from '@/test/router-mock';
import {
  renderScreen,
  resetHarness,
  signedInAs,
  styleOf,
  teacher,
} from '@/test/harness';

import Thread from './[id]';

/**
 * One conversation.
 *
 * Bubbles are the one place in this design where a filled shape is the right
 * answer, because the alternation between two speakers is the content. Mine
 * are the brand colour, theirs are a neutral fill, and neither carries a
 * shadow or a tail.
 *
 * Timestamps only appear when the gap since the last message is worth
 * mentioning. Stamping every line with a time turns a conversation into a
 * log.
 */

const initial = useChatStore.getState();

const message = (over: Partial<Message> = {}): Message =>
  ({
    id: 'm1',
    content: 'Bwakeye',
    conversationId: 'c1',
    senderId: 'user-3',
    status: 'SENT',
    createdAt: '2026-08-24T08:00:00.000Z',
    ...over,
  }) as Message;

const conversation = (): Conversation =>
  ({
    id: 'c1',
    participants: [
      {
        id: 'p1',
        userId: 'user-1',
        user: { id: 'user-1', firstName: 'Aline', lastName: 'Uwase', role: 'TEACHER' },
      },
      {
        id: 'p2',
        userId: 'user-3',
        user: { id: 'user-3', firstName: 'Jean', lastName: 'Habimana', role: 'PARENT' },
      },
    ],
    updatedAt: '2026-08-24T08:00:00.000Z',
  }) as Conversation;

const chat = (over: Record<string, unknown> = {}) =>
  useChatStore.setState(
    {
      ...initial,
      connected: true,
      conversations: [conversation()],
      messages: {},
      typingUsers: [],
      loadMessages: jest.fn().mockResolvedValue(undefined) as never,
      sendMessage: jest.fn() as never,
      markRead: jest.fn() as never,
      startTyping: jest.fn() as never,
      stopTyping: jest.fn() as never,
      ...over,
    },
    true,
  );

const open = async () => {
  signedInAs(teacher);
  routerState.params = { id: 'c1' };
  return renderScreen(<Thread />);
};

const bubbleOf = (
  screen: Awaited<ReturnType<typeof renderScreen>>,
  text: string,
) => styleOf(screen.getByText(text).parent!);

beforeEach(() => {
  resetHarness();
  jest.clearAllMocks();
  chat();
});

describe('opening a conversation', () => {
  it('names whoever is on the other end', async () => {
    await open();

    await waitFor(() => expect(screenTitle()).toBe('Jean Habimana'));
  });

  it('is called plain conversation when it does not know them', async () => {
    chat({ conversations: [] });

    await open();

    await waitFor(() => expect(screenTitle()).toBe('Conversation'));
  });

  it('reads the messages and marks them read', async () => {
    await open();

    await waitFor(() =>
      expect(useChatStore.getState().loadMessages).toHaveBeenCalledWith('c1'),
    );
    expect(useChatStore.getState().markRead).toHaveBeenCalledWith('c1');
  });

  it('shows a placeholder while they load', async () => {
    chat({ loadMessages: jest.fn(() => new Promise(() => {})) as never });

    const screen = await open();

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });
});

/**
 * The alternation between two speakers is the content, so the fill is the
 * thing that carries it.
 */
describe('whose message is whose', () => {
  it('paints mine in the school colour', async () => {
    chat({
      messages: { c1: [message({ id: 'mine', senderId: 'user-1' })] },
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Bwakeye')).toBeTruthy());
    expect(bubbleOf(screen, 'Bwakeye').backgroundColor).toBe(
      defaultTheme.brand.solid,
    );
    expect(styleOf(screen.getByText('Bwakeye')).color).toBe(
      defaultTheme.brand.onSolid,
    );
  });

  it('paints theirs in a neutral fill', async () => {
    chat({ messages: { c1: [message()] } });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Bwakeye')).toBeTruthy());
    expect(bubbleOf(screen, 'Bwakeye').backgroundColor).toBe(
      defaultTheme.bg.fill,
    );
    expect(styleOf(screen.getByText('Bwakeye')).color).toBe(
      defaultTheme.fg.primary,
    );
  });

  it('puts mine on the right and theirs on the left', async () => {
    chat({
      messages: {
        c1: [
          message({ id: 'theirs', content: 'Bwakeye' }),
          message({ id: 'mine', content: 'Muraho', senderId: 'user-1' }),
        ],
      },
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Muraho')).toBeTruthy());
    expect(bubbleOf(screen, 'Muraho').alignSelf).toBe('flex-end');
    expect(bubbleOf(screen, 'Bwakeye').alignSelf).toBe('flex-start');
  });

  it('lets a message be copied, since it may need quoting', async () => {
    chat({ messages: { c1: [message()] } });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Bwakeye').props.selectable).toBe(true),
    );
  });
});

/**
 * Stamping every line with a time turns a conversation into a log.
 */
describe('when a time is worth showing', () => {
  // Built the same way the screen builds it, so the test does not depend on
  // the locale the runner happens to be in.
  const stamp = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });

  it('stamps the first message of the conversation', async () => {
    chat({ messages: { c1: [message()] } });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText(stamp('2026-08-24T08:00:00.000Z'))).toBeTruthy(),
    );
  });

  it('says nothing between two messages a minute apart', async () => {
    chat({
      messages: {
        c1: [
          message({ id: 'm1', content: 'One' }),
          message({
            id: 'm2',
            content: 'Two',
            createdAt: '2026-08-24T08:01:00.000Z',
          }),
        ],
      },
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Two')).toBeTruthy());
    // Only the first message in the thread carries a stamp.
    expect(screen.getByText(stamp('2026-08-24T08:00:00.000Z'))).toBeTruthy();
    expect(
      screen.queryByText(stamp('2026-08-24T08:01:00.000Z')),
    ).toBeNull();
  });

  it('stamps one that arrives after a real gap', async () => {
    chat({
      messages: {
        c1: [
          message({ id: 'm1', content: 'One' }),
          message({
            id: 'm2',
            content: 'Two',
            createdAt: '2026-08-24T10:00:00.000Z',
          }),
        ],
      },
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Two')).toBeTruthy());
    expect(screen.getByText(stamp('2026-08-24T08:00:00.000Z'))).toBeTruthy();
    expect(screen.getByText(stamp('2026-08-24T10:00:00.000Z'))).toBeTruthy();
  });
});

describe('writing back', () => {
  it('sends what was typed', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Write a message')).toBeTruthy(),
    );

    await fireEvent.changeText(
      screen.getByPlaceholderText('Write a message'),
      'Murakoze cyane',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

    expect(useChatStore.getState().sendMessage).toHaveBeenCalledWith(
      'c1',
      'Murakoze cyane',
    );
  });

  it('clears the box so the next line can be typed', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Write a message')).toBeTruthy(),
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText('Write a message'),
      'Murakoze',
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

    expect(
      screen.getByPlaceholderText('Write a message').props.value,
    ).toBe('');
  });

  it('trims what was typed rather than sending the spaces', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Write a message')).toBeTruthy(),
    );

    await fireEvent.changeText(
      screen.getByPlaceholderText('Write a message'),
      '  Murakoze  ',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

    expect(useChatStore.getState().sendMessage).toHaveBeenCalledWith(
      'c1',
      'Murakoze',
    );
  });

  it('sends nothing when there is nothing to send', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Write a message')).toBeTruthy(),
    );

    await fireEvent.changeText(
      screen.getByPlaceholderText('Write a message'),
      '   ',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

    expect(useChatStore.getState().sendMessage).not.toHaveBeenCalled();
  });

  // The send button lights up only when there is something to send, which is
  // the only affordance it has.
  it('lights the send button once there is something to send', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy(),
    );

    expect(
      styleOf(screen.getByRole('button', { name: 'Send' })).backgroundColor,
    ).toBe(defaultTheme.bg.fill);

    await fireEvent.changeText(
      screen.getByPlaceholderText('Write a message'),
      'Murakoze',
    );

    expect(
      styleOf(screen.getByRole('button', { name: 'Send' })).backgroundColor,
    ).toBe(defaultTheme.brand.solid);
  });
});

/**
 * The other end sees you typing only while you are, and stops seeing it the
 * moment the box is empty again.
 */
describe('telling the other end you are writing', () => {
  it('says so while there is something in the box', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Write a message')).toBeTruthy(),
    );

    await fireEvent.changeText(
      screen.getByPlaceholderText('Write a message'),
      'M',
    );

    expect(useChatStore.getState().startTyping).toHaveBeenCalledWith('c1');
  });

  it('stops saying so once the box is emptied', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Write a message')).toBeTruthy(),
    );

    await fireEvent.changeText(
      screen.getByPlaceholderText('Write a message'),
      '',
    );

    expect(useChatStore.getState().stopTyping).toHaveBeenCalledWith('c1');
  });

  it('stops saying so the moment the message goes', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Write a message')).toBeTruthy(),
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText('Write a message'),
      'Murakoze',
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

    expect(useChatStore.getState().stopTyping).toHaveBeenCalledWith('c1');
  });

  it('shows the other person typing, by name', async () => {
    chat({
      typingUsers: [
        { userId: 'user-3', userName: 'Jean', conversationId: 'c1' },
      ],
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Jean is typing')).toBeTruthy());
  });

  it('does not show your own typing back at you', async () => {
    chat({
      typingUsers: [
        { userId: 'user-1', userName: 'Aline', conversationId: 'c1' },
      ],
    });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByPlaceholderText('Write a message')).toBeTruthy(),
    );
    expect(screen.queryByText(/is typing/)).toBeNull();
  });

  it('does not show typing from another conversation', async () => {
    chat({
      typingUsers: [
        { userId: 'user-3', userName: 'Jean', conversationId: 'c2' },
      ],
    });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByPlaceholderText('Write a message')).toBeTruthy(),
    );
    expect(screen.queryByText(/is typing/)).toBeNull();
  });
});
