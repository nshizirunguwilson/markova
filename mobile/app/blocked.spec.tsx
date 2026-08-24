import { fireEvent, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { toast } from 'sonner-native';

import { useAuthStore } from '@/stores/auth-store';
import { givenApi, givenApiFails } from '@/test/api-mock';
import { router } from '@/test/router-mock';
import { pressableCount, renderScreen, resetHarness } from '@/test/harness';

import Blocked from './blocked';

/**
 * What a student sees after signing in correctly on a phone.
 *
 * The instruction this was built to: do not treat it as an error. Nothing
 * went wrong. Their password was right, their account is fine, and they are
 * being turned away by a product decision rather than by a mistake they made.
 * A red toast saying "access denied" would be both unkind and untrue.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(() => Promise.resolve(true)),
}));
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(() => Promise.resolve({ type: 'opened' })),
}));

const notify = toast as jest.Mocked<typeof toast>;

beforeEach(() => {
  resetHarness();
  jest.clearAllMocks();
  useAuthStore.setState({ blockedName: 'Divine' });
  givenApi({
    '/school-config/public': {
      schoolName: 'Groupe Scolaire Kigali',
      webUrl: 'https://school.rw/',
    },
  });
});

describe('how it greets somebody it is turning away', () => {
  it('uses their name', async () => {
    const screen = await renderScreen(<Blocked />);

    expect(screen.getByText('Hello Divine,')).toBeTruthy();
  });

  it('still greets somebody whose name it never learned', async () => {
    useAuthStore.setState({ blockedName: null });

    const screen = await renderScreen(<Blocked />);

    expect(screen.getByText('Hello,')).toBeTruthy();
  });

  // The password was right. Saying otherwise would send them to reset it.
  it('says the sign in worked before saying anything else', async () => {
    const screen = await renderScreen(<Blocked />);

    expect(
      screen.getByText(
        'Your sign in worked. Student accounts just do not run in this app.',
      ),
    ).toBeTruthy();
  });

  it('says nothing red, and offers no error to report', async () => {
    await renderScreen(<Blocked />);

    expect(notify.error).not.toHaveBeenCalled();
  });

  it('names the school the dashboard belongs to', async () => {
    const screen = await renderScreen(<Blocked />);

    await waitFor(() =>
      expect(
        screen.getByText(/lives on the Groupe Scolaire Kigali dashboard/),
      ).toBeTruthy(),
    );
  });

  it('says "your school" until it knows which one', async () => {
    givenApiFails('/school-config/public');

    const screen = await renderScreen(<Blocked />);

    expect(screen.getByText(/lives on the your school dashboard/)).toBeTruthy();
  });
});

/**
 * The phone they are holding is often not the device they will use, so the
 * address has to be both openable and copyable.
 */
describe('the address it hands them', () => {
  it('shows it without the scheme, which nobody types', async () => {
    const screen = await renderScreen(<Blocked />);

    await waitFor(() => expect(screen.getByText('school.rw')).toBeTruthy());
  });

  it('copies the whole address, scheme and all', async () => {
    const screen = await renderScreen(<Blocked />);
    await waitFor(() => expect(screen.getByText('school.rw')).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('Copy school.rw'));

    await waitFor(() =>
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
        'https://school.rw',
      ),
    );
    expect(notify.success).toHaveBeenCalledWith('Address copied');
  });

  it('opens it in a browser on this phone', async () => {
    const screen = await renderScreen(<Blocked />);
    await waitFor(() => expect(screen.getByText('school.rw')).toBeTruthy());

    await fireEvent.press(
      screen.getByRole('button', { name: 'Open the dashboard' }),
    );

    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      'https://school.rw',
    );
  });

  /**
   * A school that has not configured a web address gets a sentence somebody
   * can act on rather than a button pointing nowhere.
   */
  it('tells them who to ask when the school has published no address', async () => {
    givenApi({ '/school-config/public': { schoolName: 'A school' } });

    const screen = await renderScreen(<Blocked />);

    await waitFor(() =>
      expect(
        screen.getByText('Ask your class teacher for the dashboard address.'),
      ).toBeTruthy(),
    );
    expect(
      screen.queryByRole('button', { name: 'Open the dashboard' }),
    ).toBeNull();
  });

  it('offers only the way out when there is no address', async () => {
    givenApi({ '/school-config/public': { schoolName: 'A school' } });

    const screen = await renderScreen(<Blocked />);

    await waitFor(() =>
      expect(screen.getByText(/Ask your class teacher/)).toBeTruthy(),
    );
    expect(pressableCount(screen)).toBe(1);
  });
});

describe('leaving', () => {
  it('forgets the block and goes back to sign in', async () => {
    const screen = await renderScreen(<Blocked />);

    await fireEvent.press(
      screen.getByRole('button', { name: 'Use a different account' }),
    );

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/(auth)/login'),
    );
    expect(useAuthStore.getState().blockedRole).toBeNull();
    expect(useAuthStore.getState().blockedName).toBeNull();
  });
});
