import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { useChatStore } from '@/stores/chat-store';
import { givenApi, resetApi } from '@/test/api-mock';
import { router, screenTitle } from '@/test/router-mock';
import { parent, renderScreen, resetHarness, signedInAs } from '@/test/harness';

import NewConversation from './new';

/**
 * Who you are allowed to write to.
 *
 * The list comes from the API rather than from the directory, because the
 * rules about who may message whom belong on the server: a parent sees their
 * children's teachers and the office, not every parent in the school.
 *
 * Picking somebody starts the conversation and goes straight into it. There
 * is no compose screen and no subject line, because this is a chat.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;
const initial = useChatStore.getState();

const contact = (over: Record<string, unknown> = {}) => ({
  id: 'user-1',
  firstName: 'Aline',
  lastName: 'Uwase',
  role: 'TEACHER',
  photoUrl: null,
  ...over,
});

const reachable = (people: unknown[]) =>
  givenApi({ '/messaging/contacts': people });

const open = async () => {
  signedInAs(parent);
  return renderScreen(<NewConversation />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  useChatStore.setState(
    {
      ...initial,
      createConversation: jest.fn().mockResolvedValue('c9') as never,
    },
    true,
  );
  reachable([]);
});

/**
 * The rules about who may message whom belong on the server, so this is the
 * API's list rather than the directory.
 */
describe('who a parent is allowed to reach', () => {
  it('asks the school rather than the directory', async () => {
    reachable([contact()]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
    expect(screenTitle()).toBe('New conversation');
  });

  it('says what each person is', async () => {
    reachable([contact(), contact({ id: 'user-2', role: 'ADMIN' })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Teacher')).toBeTruthy());
    expect(screen.getByText('Admin')).toBeTruthy();
  });

  it('says who can fix an empty list, since the person cannot', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Nobody to message yet')).toBeTruthy(),
    );
    expect(
      screen.getByText(
        'The school decides who each role can reach. If somebody is missing, the office can link you.',
      ),
    ).toBeTruthy();
  });

  it('shows a placeholder while it reads', async () => {
    givenApi({ '/messaging/contacts': () => new Promise(() => {}) });

    const screen = await open();

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });
});

// No compose screen and no subject line, because this is a chat.
describe('picking somebody', () => {
  it('starts the conversation and goes straight into it', async () => {
    reachable([contact()]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());

    await fireEvent.press(screen.getByText('Aline Uwase'));

    await waitFor(() =>
      expect(useChatStore.getState().createConversation).toHaveBeenCalledWith([
        'user-1',
      ]),
    );
    expect(router.replace).toHaveBeenCalledWith('/(app)/messages/c9');
  });

  it('says so when the school refuses that pairing', async () => {
    useChatStore.setState({
      createConversation: jest.fn().mockRejectedValue(new Error('403')) as never,
    });
    reachable([contact()]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());

    await fireEvent.press(screen.getByText('Aline Uwase'));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        'Could not start that conversation',
      ),
    );
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('searching a long list', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('narrows it to a name', async () => {
    reachable([
      contact(),
      contact({ id: 'user-2', firstName: 'Jean', lastName: 'Habimana' }),
    ]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());

    await fireEvent.changeText(screen.getByLabelText('Search'), 'Habimana');
    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    await waitFor(() => expect(screen.queryByText('Aline Uwase')).toBeNull());
    expect(screen.getByText('Jean Habimana')).toBeTruthy();
  });

  it('does not mind how the name was capitalised', async () => {
    reachable([contact()]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());

    await fireEvent.changeText(screen.getByLabelText('Search'), 'UWASE');
    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    expect(screen.getByText('Aline Uwase')).toBeTruthy();
  });

  it('says so when nobody matches', async () => {
    reachable([contact()]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());

    await fireEvent.changeText(screen.getByLabelText('Search'), 'Zzz');
    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    await waitFor(() =>
      expect(screen.getByText('Nobody by that name')).toBeTruthy(),
    );
  });
});
