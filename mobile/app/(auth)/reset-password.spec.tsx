import { fireEvent, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import { router, routerState } from '@/test/router-mock';
import { onAndroid, renderScreen, resetHarness } from '@/test/harness';

import ResetPassword from './reset-password';

/**
 * Setting a new password.
 *
 * This route did not exist on mobile, so a reset email opened on a phone dead
 * ended: the link pointed at a page the app could not show and the app had no
 * way to take the token. It now accepts one as a parameter, and the field
 * stays editable for anybody typing the code in by hand.
 *
 * The rules are a live checklist rather than a sentence under the field. The
 * API rejects with one long message listing every rule at once, which tells
 * somebody what they got wrong only after they have already got it wrong.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;

const fill = async (
  screen: Awaited<ReturnType<typeof renderScreen>>,
  {
    token = 'reset-token-1',
    password = 'Password123!',
    confirm = password,
  }: { token?: string; password?: string; confirm?: string } = {},
) => {
  await fireEvent.changeText(screen.getByLabelText('Reset code'), token);
  await fireEvent.changeText(screen.getByLabelText('New password'), password);
  await fireEvent.changeText(screen.getByLabelText('Type it again'), confirm);
};

const submit = (screen: Awaited<ReturnType<typeof renderScreen>>) =>
  fireEvent.press(
    screen.getByRole('button', { name: 'Change my password' }),
  );

beforeEach(() => {
  resetHarness();
  jest.clearAllMocks();
  givenApi({ '/auth/reset-password': {} });
});

/**
 * A reset link opened on the phone lands here with the token already in it.
 */
describe('arriving from the email', () => {
  it('carries the code in from the link', async () => {
    routerState.params = { token: 'from-the-link' };

    const screen = await renderScreen(<ResetPassword />);

    expect(screen.getByLabelText('Reset code').props.value).toBe(
      'from-the-link',
    );
  });

  it('leaves the field empty for somebody typing it by hand', async () => {
    const screen = await renderScreen(<ResetPassword />);

    expect(screen.getByLabelText('Reset code').props.value).toBe('');
  });

  it('sets the code in mono, since it is read character by character', async () => {
    const screen = await renderScreen(<ResetPassword />);
    const style = Object.assign(
      {},
      ...[screen.getByLabelText('Reset code').props.style].flat(Infinity),
    );

    expect(style.fontFamily).toContain('JetBrains');
  });
});

/**
 * The checklist ticks as somebody types, rather than telling them what was
 * wrong after they have submitted it.
 */
describe('the rules, shown as they are met', () => {
  const rules = [
    'At least 8 characters',
    'One capital letter',
    'One small letter',
    'One number',
    'One symbol',
  ];

  it('lists every rule from the start', async () => {
    const screen = await renderScreen(<ResetPassword />);

    for (const rule of rules) expect(screen.getByText(rule)).toBeTruthy();
  });

  it.each([
    ['At least 8 characters', 'abcdefgh'],
    ['One capital letter', 'A'],
    ['One small letter', 'a'],
    ['One number', '1'],
    ['One symbol', '!'],
  ])('ticks "%s" as soon as it is', async (rule, typed) => {
    const screen = await renderScreen(<ResetPassword />);

    await fireEvent.changeText(screen.getByLabelText('New password'), typed);

    const style = Object.assign(
      {},
      ...[screen.getByText(rule).props.style].flat(Infinity),
    );
    expect(style.color).toBe(
      require('@/design/theme').defaultTheme.status.positive.text,
    );
  });

  it('leaves the ones that are not met alone', async () => {
    const screen = await renderScreen(<ResetPassword />);

    await fireEvent.changeText(screen.getByLabelText('New password'), 'a');

    const style = Object.assign(
      {},
      ...[screen.getByText('One number').props.style].flat(Infinity),
    );
    expect(style.color).toBe(
      require('@/design/theme').defaultTheme.fg.tertiary,
    );
  });
});

describe('what the screen refuses to send', () => {
  it('asks for the code when there is none', async () => {
    const screen = await renderScreen(<ResetPassword />);
    await fill(screen, { token: '   ' });

    await submit(screen);

    expect(screen.getByText('Paste the code from your email')).toBeTruthy();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('refuses a password that does not meet the rules', async () => {
    const screen = await renderScreen(<ResetPassword />);
    await fill(screen, { password: 'short' });

    await submit(screen);

    expect(
      screen.getByText('That password does not meet the rules yet'),
    ).toBeTruthy();
    expect(http.post).not.toHaveBeenCalled();
  });

  // A typo in a hidden field is invisible, which is the whole reason the
  // second box exists.
  it('refuses two that do not match', async () => {
    const screen = await renderScreen(<ResetPassword />);
    await fill(screen, { password: 'Password123!', confirm: 'Password124!' });

    await submit(screen);

    expect(screen.getByText('These two do not match')).toBeTruthy();
    expect(http.post).not.toHaveBeenCalled();
  });
});

describe('changing it', () => {
  it('sends the code and the new password, trimmed', async () => {
    const screen = await renderScreen(<ResetPassword />);
    await fill(screen, { token: '  reset-token-1  ' });

    await submit(screen);

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/auth/reset-password', {
        token: 'reset-token-1',
        newPassword: 'Password123!',
      }),
    );
  });

  it('says so and sends them back to sign in with it', async () => {
    const screen = await renderScreen(<ResetPassword />);
    await fill(screen);

    await submit(screen);

    await waitFor(() =>
      expect(notify.success).toHaveBeenCalledWith(
        'Password changed. Sign in with the new one.',
      ),
    );
    expect(router.replace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('submits from the keyboard as well as the button', async () => {
    const screen = await renderScreen(<ResetPassword />);
    await fill(screen);

    await fireEvent(screen.getByLabelText('Type it again'), 'submitEditing');

    await waitFor(() => expect(http.post).toHaveBeenCalled());
  });
});

/**
 * A reset code that has expired is a problem with the code, not the password,
 * so the message belongs on that field rather than in a toast that disappears.
 */
describe('when the code will not work', () => {
  it.each([400, 401])('says so on the code field for a %s', async (status) => {
    resetApi();
    givenApiFails('/auth/reset-password', { response: { status } });
    const screen = await renderScreen(<ResetPassword />);
    await fill(screen);

    await submit(screen);

    await waitFor(() =>
      expect(
        screen.getByText('That code has expired or has already been used'),
      ).toBeTruthy(),
    );
  });

  it('says what the school said about anything else', async () => {
    resetApi();
    givenApiFails('/auth/reset-password', {
      response: { status: 500, data: { message: 'The database is down' } },
    });
    const screen = await renderScreen(<ResetPassword />);
    await fill(screen);

    await submit(screen);

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('The database is down'),
    );
  });

  it('has something to say when the school said nothing', async () => {
    resetApi();
    givenApiFails('/auth/reset-password', new Error('offline'));
    const screen = await renderScreen(<ResetPassword />);
    await fill(screen);

    await submit(screen);

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not change it just now'),
    );
  });
});


/**
 * The keyboard is handled by the system on Android, so the screen leaves it
 * alone rather than pushing content up twice.
 */
describe('on Android', () => {
  it('leaves the keyboard to the system', async () => {
    const back = onAndroid();

    const screen = await renderScreen(<ResetPassword />);

    expect(screen.toJSON()).toBeTruthy();
    back();
  });
});

describe('thinking better of it', () => {
  it('goes back to sign in', async () => {
    const screen = await renderScreen(<ResetPassword />);

    await fireEvent.press(
      screen.getByRole('button', { name: 'Back to sign in' }),
    );

    expect(router.replace).toHaveBeenCalledWith('/(auth)/login');
  });
});
