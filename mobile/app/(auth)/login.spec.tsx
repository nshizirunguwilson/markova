import { fireEvent, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { useAuthStore } from '@/stores/auth-store';
import { givenApi } from '@/test/api-mock';
import { router } from '@/test/router-mock';
import { onAndroid, renderScreen, resetHarness } from '@/test/harness';

import Login from './login';

/**
 * The first thing anyone sees, and the only screen that has to work before
 * the app knows anything about who is looking at it.
 *
 * Two things here have cost real users access before. Parents overwhelmingly
 * sign in with a phone number rather than an email, and the previous version
 * demanded an email, which locked out the largest group on the app. And "login
 * failed" for both a wrong password and a disabled account tells nobody
 * anything.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;

const signIn = jest.fn();

const type = async (
  screen: Awaited<ReturnType<typeof renderScreen>>,
  identifier: string,
  password = 'Password123!',
) => {
  await fireEvent.changeText(screen.getByLabelText('Email or phone'), identifier);
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
};

const submit = (screen: Awaited<ReturnType<typeof renderScreen>>) =>
  fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

beforeEach(() => {
  resetHarness();
  jest.clearAllMocks();
  signIn.mockResolvedValue({ needsOtp: false });
  useAuthStore.setState({ login: signIn as never });
  givenApi({
    '/school-config/public': {
      schoolName: 'Groupe Scolaire Kigali',
      schoolMotto: 'Learn and lead',
      logoUrl: 'https://school.rw/logo.png',
    },
  });
});

/**
 * A parent in Kigali should open this and see their child's school, not a
 * generic product.
 */
describe('the school on the sign in screen', () => {
  it('wears the school’s own name and motto', async () => {
    const screen = await renderScreen(<Login />);

    await waitFor(() =>
      expect(screen.getByText('Groupe Scolaire Kigali')).toBeTruthy(),
    );
    expect(screen.getByText('Learn and lead')).toBeTruthy();
  });

  it('shows the school’s logo, named for a screen reader', async () => {
    const screen = await renderScreen(<Login />);

    await waitFor(() =>
      expect(screen.getByLabelText('Groupe Scolaire Kigali')).toBeTruthy(),
    );
  });

  it('says the product name until the school’s own arrives', async () => {
    const screen = await renderScreen(<Login />);

    expect(screen.getByText('Markova')).toBeTruthy();
  });

  it('draws no logo for a school that has not uploaded one', async () => {
    givenApi({ '/school-config/public': { schoolName: 'A school' } });

    const screen = await renderScreen(<Login />);

    await waitFor(() => expect(screen.getByText('A school')).toBeTruthy());
    expect(screen.queryByLabelText('A school')).toBeNull();
  });

  // Students have a full dashboard on the web. Saying so here saves them
  // guessing at a password that would have worked anywhere else.
  it('points students at the website rather than letting them guess', async () => {
    const screen = await renderScreen(<Login />);

    await waitFor(() =>
      expect(
        screen.getByText(
          'Students sign in on the Groupe Scolaire Kigali website.',
        ),
      ).toBeTruthy(),
    );
  });
});

describe('what the screen refuses to send', () => {
  it('asks for something rather than sending an empty form', async () => {
    const screen = await renderScreen(<Login />);

    await submit(screen);

    expect(screen.getByText('Enter your email or phone number')).toBeTruthy();
    expect(screen.getByText('Enter your password')).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('says so when only the password is missing', async () => {
    const screen = await renderScreen(<Login />);
    await type(screen, 'aline.uwase@markova.edu', '');

    await submit(screen);

    expect(screen.getByText('Enter your password')).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('refuses something that is neither an email nor a number', async () => {
    const screen = await renderScreen(<Login />);
    await type(screen, 'aline');

    await submit(screen);

    expect(
      screen.getByText('That does not look like an email or a phone number'),
    ).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
  });
});

describe('signing in', () => {
  it('takes an email', async () => {
    const screen = await renderScreen(<Login />);
    await type(screen, 'aline.uwase@markova.edu');

    await submit(screen);

    expect(signIn).toHaveBeenCalledWith(
      'aline.uwase@markova.edu',
      'Password123!',
    );
  });

  /**
   * Most parents on this app have no email address at all. A phone number is
   * how they get in.
   */
  it('takes a phone number', async () => {
    const screen = await renderScreen(<Login />);
    await type(screen, '+250788100000');

    await submit(screen);

    expect(signIn).toHaveBeenCalledWith('+250788100000', 'Password123!');
  });

  it('takes one written with spaces in it', async () => {
    const screen = await renderScreen(<Login />);
    await type(screen, '+250 788 100 000');

    await submit(screen);

    expect(signIn).toHaveBeenCalledWith('+250788100000', 'Password123!');
  });

  // Somebody typing on a phone gets a capital first letter whether they meant
  // it or not, and an address is not case sensitive.
  it('does not mind how an email was capitalised', async () => {
    const screen = await renderScreen(<Login />);
    await type(screen, '  Aline.Uwase@Markova.edu  ');

    await submit(screen);

    expect(signIn).toHaveBeenCalledWith(
      'aline.uwase@markova.edu',
      'Password123!',
    );
  });

  it('goes into the app when the school asks for no code', async () => {
    const screen = await renderScreen(<Login />);
    await type(screen, 'aline.uwase@markova.edu');

    await submit(screen);

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/(app)/(tabs)'),
    );
  });

  it('carries the identifier to the code screen when one is needed', async () => {
    signIn.mockResolvedValue({ needsOtp: true });
    const screen = await renderScreen(<Login />);
    await type(screen, '+250788100000');

    await submit(screen);

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/(auth)/verify-otp',
        params: { identifier: '+250788100000' },
      }),
    );
  });

  it('sends a student to the screen that explains itself', async () => {
    signIn.mockResolvedValue({ needsOtp: false, blocked: true });
    const screen = await renderScreen(<Login />);
    await type(screen, 'student1@markova.edu');

    await submit(screen);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/blocked'));
  });

  it('says it is working, so nobody presses twice', async () => {
    let finish!: (value: unknown) => void;
    signIn.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const screen = await renderScreen(<Login />);
    await type(screen, 'aline.uwase@markova.edu');

    await submit(screen);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Sign in' }).props.accessibilityState
          .busy,
      ).toBe(true),
    );
    finish({ needsOtp: false });
  });
});

/**
 * The API distinguishes a wrong password from a disabled account, and so does
 * the screen. One is worth trying again; the other means ringing the office.
 */
describe('when it does not work', () => {
  const failWith = (status?: number, data?: unknown) =>
    signIn.mockRejectedValue({ response: status ? { status, data } : undefined });

  it('says the password is wrong when it is', async () => {
    failWith(401);
    const screen = await renderScreen(<Login />);
    await type(screen, 'aline.uwase@markova.edu');

    await submit(screen);

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        'That email or password is not right.',
      ),
    );
  });

  it('says who to ask when the account has been turned off', async () => {
    failWith(403);
    const screen = await renderScreen(<Login />);
    await type(screen, 'aline.uwase@markova.edu');

    await submit(screen);

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        'This account has been turned off. Ask your school administrator.',
      ),
    );
  });

  it('passes on what the school said when it said something', async () => {
    failWith(429, { message: 'Too many attempts. Wait five minutes.' });
    const screen = await renderScreen(<Login />);
    await type(screen, 'aline.uwase@markova.edu');

    await submit(screen);

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        'Too many attempts. Wait five minutes.',
      ),
    );
  });

  // Not "login failed": the credentials were never checked, and telling
  // somebody to check their password sends them hunting for the wrong problem.
  it('blames the connection when the school could not be reached', async () => {
    failWith();
    const screen = await renderScreen(<Login />);
    await type(screen, 'aline.uwase@markova.edu');

    await submit(screen);

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        'Could not reach the school right now. Check your connection.',
      ),
    );
  });

  it('lets them try again rather than staying stuck on working', async () => {
    failWith(401);
    const screen = await renderScreen(<Login />);
    await type(screen, 'aline.uwase@markova.edu');

    await submit(screen);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Sign in' }).props.accessibilityState
          .busy,
      ).toBe(false),
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

    const screen = await renderScreen(<Login />);

    expect(screen.toJSON()).toBeTruthy();
    back();
  });
});

describe('somebody who cannot remember their password', () => {
  it('is offered the way to reset it', async () => {
    const screen = await renderScreen(<Login />);

    await fireEvent.press(
      screen.getByRole('button', { name: 'I forgot my password' }),
    );

    expect(router.push).toHaveBeenCalledWith('/(auth)/forgot-password');
  });
});

describe('signing in from the keyboard', () => {
  it('submits on the go key rather than making somebody find the button', async () => {
    const screen = await renderScreen(<Login />);
    await type(screen, 'aline.uwase@markova.edu');

    await fireEvent(screen.getByLabelText('Password'), 'submitEditing');

    await waitFor(() => expect(signIn).toHaveBeenCalled());
  });
});
