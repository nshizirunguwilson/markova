import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  clearMocks,
  controllerHarness,
  mockService,
  type RouteCase,
} from '../../test/controller';

/**
 * Auth routes.
 *
 * Login and OTP carry the caller's address and device down to the service,
 * which is what makes a session record worth having and what an account
 * lockout counts against. A route that dropped them would leave every session
 * in the audit trail looking identical.
 */
describe('AuthController', () => {
  const service = mockService([
    'login',
    'verifyOtp',
    'resendOtp',
    'refreshToken',
    'changePassword',
    'requestPasswordReset',
    'resetPassword',
    'logout',
    'getSessions',
    'getProfile',
    'updateProfile',
  ]);

  const request = {
    ip: '41.74.160.1',
    socket: { remoteAddress: '10.0.0.1' },
    headers: { 'user-agent': 'Markova/1.0 iPhone' },
  };

  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service);
    run = await controllerHarness(AuthController, [
      { token: AuthService, name: 'service', mock: service },
    ]);
  });

  const cases: RouteCase[] = [
    {
      name: 'a sign in, with where it came from',
      call: (c) => c.login({ email: 'a@markova.edu', password: 'x' }, request),
      calls: 'login',
      withArgs: [
        { email: 'a@markova.edu', password: 'x' },
        '41.74.160.1',
        'Markova/1.0 iPhone',
      ],
    },
    {
      name: 'an OTP verified, with where it came from',
      call: (c) => c.verifyOtp({ sessionId: 's-1', otp: '123456' }, request),
      calls: 'verifyOtp',
      withArgs: [
        { sessionId: 's-1', otp: '123456' },
        '41.74.160.1',
        'Markova/1.0 iPhone',
      ],
    },
    {
      name: 'an OTP sent again',
      call: (c) => c.resendOtp({ sessionId: 's-1' }),
      calls: 'resendOtp',
      withArgs: [{ sessionId: 's-1' }],
    },
    {
      name: 'a token refreshed',
      call: (c) => c.refreshToken({ refreshToken: 'r-1' }),
      calls: 'refreshToken',
      withArgs: [{ refreshToken: 'r-1' }],
    },
    {
      name: 'a password changed by its owner',
      call: (c) =>
        c.changePassword('user-1', { currentPassword: 'a', newPassword: 'b' }),
      calls: 'changePassword',
      withArgs: ['user-1', { currentPassword: 'a', newPassword: 'b' }],
    },
    {
      name: 'a reset asked for',
      call: (c) => c.requestPasswordReset({ email: 'a@markova.edu' }),
      calls: 'requestPasswordReset',
      withArgs: [{ email: 'a@markova.edu' }],
    },
    {
      name: 'a reset completed',
      call: (c) => c.resetPassword({ token: 't-1', newPassword: 'b' }),
      calls: 'resetPassword',
      withArgs: [{ token: 't-1', newPassword: 'b' }],
    },
    {
      // The bearer prefix is stripped here, so the service is handed a token
      // rather than a header. Passing the header would end no session at all.
      name: 'a sign out, naming the refresh token this computer holds',
      call: (c) => c.logout('user-1', { refreshToken: 'the-refresh-token' }),
      calls: 'logout',
      withArgs: ['user-1', { refreshToken: 'the-refresh-token' }],
    },
    {
      name: 'the sessions a person has open',
      call: (c) => c.getSessions('user-1'),
      calls: 'getSessions',
      withArgs: ['user-1'],
    },
    {
      name: 'my own profile',
      call: (c) => c.getProfile('user-1'),
      calls: 'getProfile',
      withArgs: ['user-1'],
    },
    {
      name: 'my own profile changed',
      call: (c) => c.updateProfile('user-1', { firstName: 'Wilson' }),
      calls: 'updateProfile',
      withArgs: ['user-1', { firstName: 'Wilson' }],
    },
  ];

  it.each(cases)('$name', async (c) => {
    await run(c);
  });

  /**
   * Behind a proxy `req.ip` can be absent, and a session with no address is a
   * session nobody can trace back.
   */
  it('falls back to the socket address when the request has none', async () => {
    await run({
      name: 'fallback',
      call: (c) =>
        c.login(
          { email: 'a@markova.edu', password: 'x' },
          {
            ...request,
            ip: undefined,
          },
        ),
      calls: 'login',
      withArgs: [
        { email: 'a@markova.edu', password: 'x' },
        '10.0.0.1',
        'Markova/1.0 iPhone',
      ],
    });
  });

  it('signs out safely when no header arrived at all', async () => {
    await run({
      name: 'no header',
      call: (c) => c.logout('user-1', undefined),
      calls: 'logout',
      withArgs: ['user-1', undefined],
    });
  });
});

/** One login, many schools (part 3): the switcher and changing how you sign in. */
describe('AuthController, a login with many schools', () => {
  const service = mockService([
    'schools',
    'switchSchool',
    'requestLoginChange',
    'confirmLoginChange',
  ]);
  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    clearMocks(service);
    run = await controllerHarness(AuthController, [
      { token: AuthService, name: 'service', mock: service },
    ]);
  });

  it('lists the schools of the login, marking the one open', () =>
    run({
      name: 'schools',
      call: (c) => c.schools('acc-1', 'user-1'),
      calls: 'schools',
      withArgs: ['acc-1', 'user-1'],
    }));

  it('opens another school of the same login only', () =>
    run({
      name: 'switch',
      call: (c) =>
        c.switchSchool('acc-1', { userId: 'user-9', refreshToken: 'rt' }),
      calls: 'switchSchool',
      withArgs: ['acc-1', 'user-9', 'rt'],
    }));

  it('starts and finishes changing how you sign in, as yourself', async () => {
    await run({
      name: 'request',
      call: (c) => c.requestLoginChange('user-1', { email: 'new@markova.edu' }),
      calls: 'requestLoginChange',
      withArgs: ['user-1', { email: 'new@markova.edu' }],
    });
    await run({
      name: 'confirm',
      call: (c) => c.confirmLoginChange('user-1', { code: '123456' }),
      calls: 'confirmLoginChange',
      withArgs: ['user-1', { code: '123456' }],
    });
  });
});
