import api from '@/lib/api';
import { clearTokens, getAccessToken, setTokens } from '@/lib/storage';

import { useAuthStore } from './auth-store';

/**
 * Who gets in, and who does not.
 *
 * This store is the phone's door. Two of its rules are the reason it exists
 * rather than the screens calling the API directly: a parent signs in with a
 * phone number and a teacher with an email, and a student who signs in
 * correctly still has to be turned away, because this app has no screens for
 * them and the web dashboard does.
 */

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock('@/lib/storage');

const http = api as jest.Mocked<typeof api>;
const tokens = { setTokens, clearTokens, getAccessToken } as unknown as {
  setTokens: jest.Mock;
  clearTokens: jest.Mock;
  getAccessToken: jest.Mock;
};

const initial = useAuthStore.getState();

const teacher = {
  id: 'user-1',
  email: 'aline.uwase@markova.edu',
  firstName: 'Aline',
  lastName: 'Uwase',
  role: 'TEACHER',
  isActive: true,
};

const student = { ...teacher, id: 'user-9', firstName: 'Divine', role: 'STUDENT' };

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState(initial, true);
});

describe('signing in', () => {
  it('sends an email as an email', async () => {
    http.post.mockResolvedValue({ data: { requiresOtp: true, sessionId: 's1' } } as never);

    await useAuthStore.getState().login('aline.uwase@markova.edu', 'Password123!');

    expect(http.post).toHaveBeenCalledWith('/auth/login', {
      email: 'aline.uwase@markova.edu',
      password: 'Password123!',
    });
  });

  /**
   * Parents are the largest group on this app and most of them have no email
   * address at all. The API takes email and phone as separate fields behind a
   * whitelisting pipe, so sending one combined value is a 400.
   */
  it('sends a phone number as a phone number', async () => {
    http.post.mockResolvedValue({ data: { requiresOtp: true, sessionId: 's1' } } as never);

    await useAuthStore.getState().login('+250788100000', 'Password123!');

    expect(http.post).toHaveBeenCalledWith('/auth/login', {
      phone: '+250788100000',
      password: 'Password123!',
    });
  });

  it('holds the session open when the school asks for a code', async () => {
    http.post.mockResolvedValue({ data: { requiresOtp: true, sessionId: 's1' } } as never);

    const result = await useAuthStore.getState().login('a@markova.edu', 'x');

    expect(result).toEqual({ needsOtp: true });
    expect(useAuthStore.getState().needsOtp).toBe(true);
    expect(useAuthStore.getState().pendingSessionId).toBe('s1');
    expect(tokens.setTokens).not.toHaveBeenCalled();
  });

  // Outside production the API sends the code back, since it is no longer
  // written to the log. Production never sends it, so nothing is kept.
  it('keeps the code the API hands back during development', async () => {
    http.post.mockResolvedValue({
      data: { requiresOtp: true, sessionId: 's1', devOtp: '482913' },
    } as never);

    await useAuthStore.getState().login('a@markova.edu', 'x');

    expect(useAuthStore.getState().devOtp).toBe('482913');
  });

  it('keeps no code when the API sends none', async () => {
    http.post.mockResolvedValue({ data: { requiresOtp: true, sessionId: 's1' } } as never);

    await useAuthStore.getState().login('a@markova.edu', 'x');

    expect(useAuthStore.getState().devOtp).toBeNull();
  });

  it('keeps the session and loads the person when no code is needed', async () => {
    http.post.mockResolvedValue({
      data: { accessToken: 'access-1', refreshToken: 'refresh-1' },
    } as never);
    http.get.mockResolvedValue({ data: teacher } as never);

    const result = await useAuthStore.getState().login('a@markova.edu', 'x');

    expect(tokens.setTokens).toHaveBeenCalledWith('access-1', 'refresh-1');
    expect(result).toEqual({ needsOtp: false });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user).toEqual(teacher);
  });

  // The API has answered in both shapes over its life. Reading only one of
  // them signs a user in and then immediately signs them out again.
  it('accepts the tokens under either name the API uses', async () => {
    http.post.mockResolvedValue({
      data: { access_token: 'access-1', refresh_token: 'refresh-1' },
    } as never);
    http.get.mockResolvedValue({ data: teacher } as never);

    await useAuthStore.getState().login('a@markova.edu', 'x');

    expect(tokens.setTokens).toHaveBeenCalledWith('access-1', 'refresh-1');
  });

  it('lets a refused password reach the screen', async () => {
    http.post.mockRejectedValue(new Error('Invalid credentials'));

    await expect(
      useAuthStore.getState().login('a@markova.edu', 'wrong'),
    ).rejects.toThrow('Invalid credentials');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

describe('the code sent to a phone', () => {
  beforeEach(() => {
    useAuthStore.setState({ pendingSessionId: 's1', needsOtp: true });
  });

  it('verifies against the session the sign in opened', async () => {
    http.post.mockResolvedValue({
      data: { accessToken: 'access-1', refreshToken: 'refresh-1' },
    } as never);
    http.get.mockResolvedValue({ data: teacher } as never);

    await useAuthStore.getState().verifyOtp('123456');

    expect(http.post).toHaveBeenCalledWith('/auth/verify-otp', {
      sessionId: 's1',
      otp: '123456',
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().pendingSessionId).toBeNull();
  });

  it('asks for another one against the same session', async () => {
    http.post.mockResolvedValue({ data: {} } as never);

    await useAuthStore.getState().resendOtp();

    expect(http.post).toHaveBeenCalledWith('/auth/resend-otp', {
      sessionId: 's1',
    });
    expect(useAuthStore.getState().pendingSessionId).toBe('s1');
  });

  it('follows the session along if the school moves it', async () => {
    http.post.mockResolvedValue({ data: { sessionId: 's2' } } as never);

    await useAuthStore.getState().resendOtp();

    expect(useAuthStore.getState().pendingSessionId).toBe('s2');
  });

  it('lets a wrong code reach the screen', async () => {
    http.post.mockRejectedValue(new Error('Invalid or expired code'));

    await expect(useAuthStore.getState().verifyOtp('000000')).rejects.toThrow(
      'Invalid or expired code',
    );
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

/**
 * A student who signs in has done nothing wrong. The credentials were
 * correct. So this is not an error with a red toast: the store remembers who
 * it was, throws the session away, and lets the router show them a screen
 * that explains where their dashboard actually is.
 */
describe('a student, who this app has no screens for', () => {
  it('is turned away even though the password was right', async () => {
    http.post.mockResolvedValue({
      data: { accessToken: 'access-1', refreshToken: 'refresh-1' },
    } as never);
    http.get.mockResolvedValue({ data: student } as never);

    const result = await useAuthStore.getState().login('student1@markova.edu', 'x');

    expect(result).toEqual({ needsOtp: false, blocked: true });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('is turned away after a code as well as before one', async () => {
    useAuthStore.setState({ pendingSessionId: 's1' });
    http.post.mockResolvedValue({
      data: { accessToken: 'access-1', refreshToken: 'refresh-1' },
    } as never);
    http.get.mockResolvedValue({ data: student } as never);

    await expect(useAuthStore.getState().verifyOtp('123456')).resolves.toEqual({
      blocked: true,
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('has the session thrown away rather than left on the phone', async () => {
    http.post.mockResolvedValue({
      data: { accessToken: 'access-1', refreshToken: 'refresh-1' },
    } as never);
    http.get.mockResolvedValue({ data: student } as never);

    await useAuthStore.getState().login('student1@markova.edu', 'x');

    expect(tokens.clearTokens).toHaveBeenCalled();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('is remembered by name so the next screen can be civil about it', async () => {
    http.post.mockResolvedValue({
      data: { accessToken: 'access-1', refreshToken: 'refresh-1' },
    } as never);
    http.get.mockResolvedValue({ data: student } as never);

    await useAuthStore.getState().login('student1@markova.edu', 'x');

    expect(useAuthStore.getState().blockedRole).toBe('STUDENT');
    expect(useAuthStore.getState().blockedName).toBe('Divine');
  });

  it('is forgotten once that screen has been read', async () => {
    useAuthStore.setState({ blockedRole: 'STUDENT', blockedName: 'Divine' });

    await useAuthStore.getState().clearBlock();

    expect(useAuthStore.getState().blockedRole).toBeNull();
    expect(useAuthStore.getState().blockedName).toBeNull();
  });

  it('is remembered even when the API sent no first name', async () => {
    http.post.mockResolvedValue({
      data: { accessToken: 'a', refreshToken: 'r' },
    } as never);
    http.get.mockResolvedValue({
      data: { ...student, firstName: undefined },
    } as never);

    await useAuthStore.getState().login('student1@markova.edu', 'x');

    expect(useAuthStore.getState().blockedRole).toBe('STUDENT');
    expect(useAuthStore.getState().blockedName).toBeNull();
  });
});

describe.each(['ADMIN', 'TEACHER', 'PARENT', 'LIBRARIAN', 'PATRON', 'MATRON', 'NURSE'])(
  'a %s',
  (role) => {
    it('is let in', async () => {
      http.post.mockResolvedValue({
        data: { accessToken: 'a', refreshToken: 'r' },
      } as never);
      http.get.mockResolvedValue({ data: { ...teacher, role } } as never);

      await expect(
        useAuthStore.getState().login('someone@markova.edu', 'x'),
      ).resolves.toEqual({ needsOtp: false });
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });
  },
);

describe('coming back to an app that was left open', () => {
  it('goes straight in when the phone still holds a session', async () => {
    tokens.getAccessToken.mockResolvedValue('access-1');
    http.get.mockResolvedValue({ data: teacher } as never);

    await expect(useAuthStore.getState().checkAuth()).resolves.toBe(true);
    expect(useAuthStore.getState().user).toEqual(teacher);
  });

  it('stops waiting and shows the sign in screen when there is no session', async () => {
    tokens.getAccessToken.mockResolvedValue(null);

    await expect(useAuthStore.getState().checkAuth()).resolves.toBe(false);
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(http.get).not.toHaveBeenCalled();
  });

  // A token that the API no longer accepts is the same as no token at all.
  it('gives up on a session the school has since revoked', async () => {
    tokens.getAccessToken.mockResolvedValue('access-stale');
    http.get.mockRejectedValue(new Error('401'));

    await expect(useAuthStore.getState().checkAuth()).resolves.toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('turns a student away on the way back in too', async () => {
    tokens.getAccessToken.mockResolvedValue('access-1');
    http.get.mockResolvedValue({ data: student } as never);

    await expect(useAuthStore.getState().checkAuth()).resolves.toBe(false);
    expect(useAuthStore.getState().blockedRole).toBe('STUDENT');
  });

  // The splash screen waits on isLoading. Leaving it true on a failed read
  // hangs the app on a blank screen with no way forward.
  it('stops the app waiting even when the profile read fails', async () => {
    http.get.mockRejectedValue(new Error('offline'));

    await useAuthStore.getState().loadProfile();

    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });
});

describe('signing out', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: teacher as never,
      isAuthenticated: true,
      needsOtp: true,
      pendingEmail: 'a@markova.edu',
      pendingSessionId: 's1',
    });
  });

  it('tells the school, then forgets everything', async () => {
    http.post.mockResolvedValue({ data: {} } as never);

    await useAuthStore.getState().logout();

    expect(http.post).toHaveBeenCalledWith('/auth/logout');
    expect(tokens.clearTokens).toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      needsOtp: false,
      pendingEmail: null,
      pendingSessionId: null,
    });
  });

  /**
   * Signing out on a phone with no signal still has to sign you out. A person
   * handing their phone to somebody else cannot be told to find a network
   * first.
   */
  it('forgets everything even when the school cannot be reached', async () => {
    http.post.mockRejectedValue(new Error('Network Error'));

    await useAuthStore.getState().logout();

    expect(tokens.clearTokens).toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
