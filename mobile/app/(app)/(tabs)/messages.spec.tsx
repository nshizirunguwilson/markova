import { act, fireEvent, waitFor } from '@testing-library/react-native';

import { useChatStore, type Conversation } from '@/stores/chat-store';
import { router } from '@/test/router-mock';
import { renderScreen, resetHarness, signedInAs, teacher } from '@/test/harness';

import Messages from './messages';

/**
 * Conversations.
 *
 * Replaces parent-teacher-chat, which was a parent-only version of a screen
 * every role needs: a teacher messaging a parent and a parent messaging a
 * teacher are the same screen viewed from two ends.
 *
 * The connection state is shown only when it is bad. A green "connected" dot
 * is noise, because connected is the expected case and telling somebody their
 * software is working as intended is not information.
 */

const initial = useChatStore.getState();

const conversation = (over: Partial<Conversation> = {}): Conversation =>
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
    updatedAt: new Date().toISOString(),
    ...over,
  }) as Conversation;

const chat = (over: Record<string, unknown> = {}) =>
  useChatStore.setState({
    ...initial,
    connected: true,
    conversations: [],
    loadConversations: jest.fn().mockResolvedValue(undefined) as never,
    ...over,
  });

const open = async () => {
  signedInAs(teacher);
  return renderScreen(<Messages />);
};

beforeEach(() => {
  resetHarness();
  jest.clearAllMocks();
  chat();
});

describe('the list of conversations', () => {
  /**
   * The other person is whoever is not you, which is what makes one screen
   * work from both ends.
   */
  it('names whoever is on the other end', async () => {
    chat({ conversations: [conversation()] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Jean Habimana')).toBeTruthy());
    expect(screen.queryByText('Aline Uwase')).toBeNull();
  });

  it('shows the last thing that was said', async () => {
    chat({
      conversations: [
        conversation({
          lastMessage: {
            content: 'Thank you for the update',
            contentType: 'TEXT',
            createdAt: new Date().toISOString(),
          } as never,
        }),
      ],
    });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Thank you for the update')).toBeTruthy(),
    );
  });

  it('says so when the last thing was a file rather than words', async () => {
    chat({
      conversations: [
        conversation({
          lastMessage: {
            content: 'report.pdf',
            contentType: 'FILE',
            createdAt: new Date().toISOString(),
          } as never,
        }),
      ],
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Attachment')).toBeTruthy());
  });

  it('says so when nothing has been said yet', async () => {
    chat({ conversations: [conversation()] });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('No messages yet')).toBeTruthy(),
    );
  });

  it('opens a conversation when its row is pressed', async () => {
    chat({ conversations: [conversation()] });
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Jean Habimana')).toBeTruthy());

    await fireEvent.press(screen.getByText('Jean Habimana'));

    expect(router.push).toHaveBeenCalledWith('/(app)/messages/c1');
  });

  it('reads the conversations as soon as it opens', async () => {
    await open();

    await waitFor(() =>
      expect(useChatStore.getState().loadConversations).toHaveBeenCalled(),
    );
  });

  it('copes with a conversation that has nobody in it', async () => {
    chat({ conversations: [conversation({ participants: [] })] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Unknown')).toBeTruthy());
  });

  it('falls back to the only participant when that is you', async () => {
    chat({
      conversations: [
        conversation({
          participants: [
            {
              id: 'p1',
              userId: 'user-1',
              user: { id: 'user-1', firstName: 'Aline', lastName: 'Uwase', role: 'TEACHER' },
            },
          ],
        }),
      ],
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
  });
});

/**
 * "3m" beats a timestamp on a list that is scanned rather than read.
 */
describe('when each conversation last moved', () => {
  const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

  it.each([
    ['just now', 30 * 1000, 'now'],
    ['minutes ago', 5 * 60 * 1000, '5m'],
    ['hours ago', 3 * 60 * 60 * 1000, '3h'],
    ['days ago', 2 * 86_400_000, '2d'],
  ])('reads %s as "%s"', async (_label, ago, expected) => {
    chat({ conversations: [conversation({ updatedAt: at(ago) })] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText(expected)).toBeTruthy());
  });

  // Past a week "9d" stops helping and a date starts.
  it('falls back to a date past a week', async () => {
    const when = at(10 * 86_400_000);
    chat({ conversations: [conversation({ updatedAt: when })] });

    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          new Date(when).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
          }),
        ),
      ).toBeTruthy(),
    );
  });

  it('prefers when the last message arrived over when the row changed', async () => {
    chat({
      conversations: [
        conversation({
          updatedAt: at(10 * 86_400_000),
          lastMessage: {
            content: 'Hello',
            contentType: 'TEXT',
            createdAt: at(60 * 1000),
          } as never,
        }),
      ],
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('1m')).toBeTruthy());
  });

  it('says nothing at all when there is no date to show', async () => {
    chat({
      conversations: [conversation({ updatedAt: undefined as never })],
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Jean Habimana')).toBeTruthy());
  });
});

describe('what is waiting to be read', () => {
  it('counts the unread messages in a conversation', async () => {
    chat({ conversations: [conversation({ unreadCount: 3 })] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('3')).toBeTruthy());
  });

  it('stops counting past ninety-nine', async () => {
    chat({ conversations: [conversation({ unreadCount: 214 })] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('99+')).toBeTruthy());
  });

  it('says nothing where there is nothing waiting', async () => {
    chat({ conversations: [conversation({ unreadCount: 0 })] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Jean Habimana')).toBeTruthy());
    expect(screen.queryByText('0')).toBeNull();
  });
});

/**
 * A green "connected" dot is noise. A grey bar saying messages will send when
 * the signal returns is worth the space.
 */
describe('the connection', () => {
  it('says nothing at all while it is working', async () => {
    chat({ conversations: [conversation()] });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Jean Habimana')).toBeTruthy());
    expect(screen.queryByText(/Offline/)).toBeNull();
  });

  it('says what happens to a message sent with no signal', async () => {
    chat({ connected: false, conversations: [conversation()] });

    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          'Offline. Anything you send will go out when the signal is back.',
        ),
      ).toBeTruthy(),
    );
  });
});

/**
 * A search box above six conversations is a control nobody needs. It appears
 * once the list is long enough to be worth searching.
 */
describe('searching a long list', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      conversation({
        id: `c${i}`,
        participants: [
          {
            id: `p${i}`,
            userId: `user-${i + 10}`,
            user: {
              id: `user-${i + 10}`,
              firstName: `Person${i}`,
              lastName: 'Uwase',
              role: 'PARENT',
            },
          },
        ],
      }),
    );

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('offers no search box on a short list', async () => {
    chat({ conversations: many(3) });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Person0 Uwase')).toBeTruthy());
    expect(screen.queryByLabelText('Search')).toBeNull();
  });

  it('offers one once the list is long enough to need it', async () => {
    chat({ conversations: many(8) });

    const screen = await open();

    await waitFor(() => expect(screen.getByLabelText('Search')).toBeTruthy());
  });

  it('narrows the list to a name', async () => {
    chat({ conversations: many(8) });
    const screen = await open();
    await waitFor(() => expect(screen.getByLabelText('Search')).toBeTruthy());

    await fireEvent.changeText(screen.getByLabelText('Search'), 'Person3');
    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    await waitFor(() => expect(screen.getByText('Person3 Uwase')).toBeTruthy());
    expect(screen.queryByText('Person4 Uwase')).toBeNull();
  });

  it('does not mind how the name was capitalised', async () => {
    chat({ conversations: many(8) });
    const screen = await open();
    await waitFor(() => expect(screen.getByLabelText('Search')).toBeTruthy());

    await fireEvent.changeText(screen.getByLabelText('Search'), 'PERSON3');
    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    await waitFor(() => expect(screen.getByText('Person3 Uwase')).toBeTruthy());
  });

  it('says so when nobody matches', async () => {
    chat({ conversations: many(8) });
    const screen = await open();
    await waitFor(() => expect(screen.getByLabelText('Search')).toBeTruthy());

    await fireEvent.changeText(screen.getByLabelText('Search'), 'Zzz');
    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    await waitFor(() =>
      expect(screen.getByText('Nobody by that name')).toBeTruthy(),
    );
  });
});

describe('when there are no conversations', () => {
  it('shows a placeholder while it looks', async () => {
    chat({ loadConversations: jest.fn(() => new Promise(() => {})) as never });

    const screen = await open();

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  it('says what a conversation is for, and offers to start one', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('No conversations yet')).toBeTruthy(),
    );
    expect(
      screen.getByText(
        'Start one with a teacher, a parent or the office, and it will live here.',
      ),
    ).toBeTruthy();
  });

  it('opens the new conversation screen from the footer', async () => {
    const screen = await open();

    await fireEvent.press(
      screen.getByRole('button', { name: 'New conversation' }),
    );

    expect(router.push).toHaveBeenCalledWith('/(app)/messages/new');
  });

  it('opens it from the empty state too', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByText('No conversations yet')).toBeTruthy(),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Start a conversation' }),
    );

    expect(router.push).toHaveBeenCalledWith('/(app)/messages/new');
  });
});
