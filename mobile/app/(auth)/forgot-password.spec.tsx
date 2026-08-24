import { fireEvent, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { router } from '@/test/router-mock';
import { renderScreen, resetHarness } from '@/test/harness';

import ForgotPassword from './forgot-password';

/**
 * Asking for a reset.
 *
 * The confirmation deliberately does not say whether the account exists. An
 * endpoint that answers "no such user" to an unauthenticated caller is an
 * account enumeration oracle, and the API is careful about that, so the
 * screen must not undo it by phrasing the answer differently.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;

const ask = async (
  screen: Awaited<ReturnType<typeof renderScreen>>,
  identifier: string,
) => {
  await fireEvent.changeText(
    screen.getByLabelText('Email or phone'),
    identifier,
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Send the code' }),
  );
};

beforeEach(() => {
  resetHarness();
  jest.clearAllMocks();
  givenApi({ '/auth/request-reset': {} });
});

describe('asking for a code', () => {
  it('sends an email as an email', async () => {
    const screen = await renderScreen(<ForgotPassword />);

    await ask(screen, 'Aline.Uwase@Markova.edu');

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/auth/request-reset', {
        email: 'aline.uwase@markova.edu',
      }),
    );
  });

  // Most parents on this system have a phone number on file and no email at
  // all, which is the same reason the sign in screen takes both.
  it('sends a phone number as a phone number', async () => {
    const screen = await renderScreen(<ForgotPassword />);

    await ask(screen, '+250 788 100 000');

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/auth/request-reset', {
        phone: '+250788100000',
      }),
    );
  });

  it('asks for something rather than sending an empty form', async () => {
    const screen = await renderScreen(<ForgotPassword />);

    await fireEvent.press(
      screen.getByRole('button', { name: 'Send the code' }),
    );

    expect(screen.getByText('Enter your email or phone number')).toBeTruthy();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('submits from the keyboard as well as the button', async () => {
    const screen = await renderScreen(<ForgotPassword />);
    await fireEvent.changeText(
      screen.getByLabelText('Email or phone'),
      'aline.uwase@markova.edu',
    );

    await fireEvent(screen.getByLabelText('Email or phone'), 'submitEditing');

    await waitFor(() => expect(http.post).toHaveBeenCalled());
  });
});

describe('what it says afterwards', () => {
  /**
   * "If it belongs to an account" rather than "we have sent it": anything
   * more definite tells a stranger whether an address is registered here.
   */
  it('does not say whether the account exists', async () => {
    const screen = await renderScreen(<ForgotPassword />);

    await ask(screen, 'someone@example.com');

    await waitFor(() =>
      expect(screen.getByText('Check your messages')).toBeTruthy(),
    );
    expect(
      screen.getByText(/If someone@example.com belongs to an account here/),
    ).toBeTruthy();
  });

  it('says where to look before asking for another', async () => {
    const screen = await renderScreen(<ForgotPassword />);

    await ask(screen, 'aline.uwase@markova.edu');

    await waitFor(() => expect(screen.getByText(/spam folder/)).toBeTruthy());
  });

  it('offers the next step to somebody who has the code', async () => {
    const screen = await renderScreen(<ForgotPassword />);
    await ask(screen, 'aline.uwase@markova.edu');
    await waitFor(() =>
      expect(screen.getByText('Check your messages')).toBeTruthy(),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'I have a code' }));

    expect(router.replace).toHaveBeenCalledWith('/(auth)/reset-password');
  });

  it('offers the way back for somebody who has thought better of it', async () => {
    const screen = await renderScreen(<ForgotPassword />);
    await ask(screen, 'aline.uwase@markova.edu');
    await waitFor(() =>
      expect(screen.getByText('Check your messages')).toBeTruthy(),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Back to sign in' }),
    );

    expect(router.replace).toHaveBeenCalledWith('/(auth)/login');
  });
});

describe('when the school cannot be reached', () => {
  it('says so and leaves the form as it was', async () => {
    resetApi();
    givenApiFails('/auth/request-reset', {
      response: { status: 500, data: { message: 'The mailer is down' } },
    });
    const screen = await renderScreen(<ForgotPassword />);

    await ask(screen, 'aline.uwase@markova.edu');

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('The mailer is down'),
    );
    expect(screen.queryByText('Check your messages')).toBeNull();
  });

  it('has something to say when the school said nothing', async () => {
    resetApi();
    givenApiFails('/auth/request-reset', new Error('offline'));
    const screen = await renderScreen(<ForgotPassword />);

    await ask(screen, 'aline.uwase@markova.edu');

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not send that just now'),
    );
  });
});

describe('going back from the form', () => {
  it('returns to wherever they came from', async () => {
    const screen = await renderScreen(<ForgotPassword />);

    await fireEvent.press(
      screen.getByRole('button', { name: 'Back to sign in' }),
    );

    expect(router.back).toHaveBeenCalled();
  });
});
