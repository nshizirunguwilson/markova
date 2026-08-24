import { fireEvent, waitFor } from '@testing-library/react-native';

import { defaultTheme } from '@/design/theme';
import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import {
  firstChild,
  parent,
  renderScreen,
  resetHarness,
  signedInAs,
  styleOf,
} from '@/test/harness';

import Alerts from './alerts';

/**
 * Alerts, grouped by when rather than by kind.
 *
 * A parent does not think "show me my discipline notifications", they think
 * "what happened while I was not looking", so the sections are Today, This
 * week and Earlier.
 *
 * Unread is a dot on the left rather than a tinted row. A tinted row in a
 * list of tinted rows stops meaning anything, and a dot survives being colour
 * blind because it is a shape appearing rather than a hue changing.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString();

const alert = (over: Record<string, unknown> = {}) => ({
  id: 'notification-1',
  title: 'Marks published',
  message: 'Term 2 results are ready to read',
  isRead: false,
  createdAt: new Date().toISOString(),
  ...over,
});

const waiting = (items: unknown[]) => givenApi({ '/notifications': items });

const open = async () => {
  signedInAs(parent);
  return renderScreen(<Alerts />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  waiting([]);
  givenApi({ '/notifications/read-all': {} });
});

describe('what arrived', () => {
  it('shows the alert and what it says', async () => {
    waiting([alert()]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Marks published')).toBeTruthy(),
    );
    expect(screen.getByText('Term 2 results are ready to read')).toBeTruthy();
  });

  it('groups by when, not by kind', async () => {
    waiting([
      alert({ id: 'n1', title: 'Today thing' }),
      alert({ id: 'n2', title: 'Week thing', createdAt: daysAgo(3) }),
      alert({ id: 'n3', title: 'Old thing', createdAt: daysAgo(30) }),
    ]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Today')).toBeTruthy());
    expect(screen.getByText('This week')).toBeTruthy();
    expect(screen.getByText('Earlier')).toBeTruthy();
  });

  it('leaves out a heading with nothing under it', async () => {
    waiting([alert()]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Today')).toBeTruthy());
    expect(screen.queryByText('This week')).toBeNull();
    expect(screen.queryByText('Earlier')).toBeNull();
  });

  // Six days back is still "this week"; seven is not.
  it('puts something from six days ago in this week', async () => {
    waiting([alert({ createdAt: daysAgo(5) })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('This week')).toBeTruthy());
  });

  it('puts something from last month in Earlier', async () => {
    waiting([alert({ createdAt: daysAgo(20) })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Earlier')).toBeTruthy());
  });

  it('says when each one arrived', async () => {
    const at = new Date();
    at.setHours(9, 30, 0, 0);
    waiting([alert({ createdAt: at.toISOString() })]);

    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          at.toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
          }),
        ),
      ).toBeTruthy(),
    );
  });
});

/**
 * A dot rather than a tinted row: a shape appearing survives being colour
 * blind, and a list of tinted rows stops meaning anything.
 */
describe('marking what has been read', () => {
  const dotOf = (screen: Awaited<ReturnType<typeof renderScreen>>) =>
    firstChild(screen.getByText('Marks published').parent!.parent!);

  it('marks an unread alert with the school colour', async () => {
    waiting([alert()]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Marks published')).toBeTruthy(),
    );
    expect(styleOf(dotOf(screen)).backgroundColor).toBe(
      defaultTheme.brand.solid,
    );
  });

  it('leaves the dot invisible on one that has been read', async () => {
    waiting([alert({ isRead: true })]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Marks published')).toBeTruthy(),
    );
    expect(styleOf(dotOf(screen)).backgroundColor).toBe('transparent');
  });

  it('counts what is still unread', async () => {
    waiting([alert(), alert({ id: 'n2' }), alert({ id: 'n3', isRead: true })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('2 unread')).toBeTruthy());
  });

  it('says nothing about a count when everything has been read', async () => {
    waiting([alert({ isRead: true })]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Marks published')).toBeTruthy(),
    );
    expect(screen.queryByText('0 unread')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Mark all read' }),
    ).toBeNull();
  });

  it('marks one read when it is pressed', async () => {
    waiting([alert()]);
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByText('Marks published')).toBeTruthy(),
    );

    await fireEvent.press(screen.getByText('Marks published'));

    await waitFor(() =>
      expect(http.put).toHaveBeenCalledWith('/notifications/notification-1/read'),
    );
  });

  // Pressing one that is already read would fire a pointless write on every
  // scroll-and-tap.
  it('does nothing when one already read is pressed', async () => {
    waiting([alert({ isRead: true })]);
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByText('Marks published')).toBeTruthy(),
    );

    await fireEvent.press(screen.getByText('Marks published'));

    expect(http.put).not.toHaveBeenCalled();
  });

  it('clears the lot at once', async () => {
    waiting([alert(), alert({ id: 'n2' })]);
    const screen = await open();
    await waitFor(() => expect(screen.getByText('2 unread')).toBeTruthy());

    await fireEvent.press(
      screen.getByRole('button', { name: 'Mark all read' }),
    );

    await waitFor(() =>
      expect(http.put).toHaveBeenCalledWith('/notifications/read-all'),
    );
  });
});

describe('when there is nothing to show', () => {
  /**
   * Nothing waiting is not a problem, so the empty state teaches what would
   * fill the space rather than offering a button.
   */
  it('says what arrives here, rather than shrugging', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('Nothing yet')).toBeTruthy());
    expect(
      screen.getByText(
        'Marks being published, attendance concerns and discipline notes all arrive here.',
      ),
    ).toBeTruthy();
  });

  it('shows a placeholder while it loads', async () => {
    givenApi({ '/notifications': () => new Promise(() => {}) });

    const screen = await open();

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  it('says so, and offers another go, when the read fails', async () => {
    givenApiFails('/notifications');

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('That did not load')).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
