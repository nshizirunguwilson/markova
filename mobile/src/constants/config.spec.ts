/**
 * Which school this build talks to, and who is allowed in.
 */

const load = (extra: Record<string, unknown> | undefined) => {
  let mod!: typeof import('./config');
  jest.isolateModules(() => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: extra === undefined ? null : { extra } },
    }));
    mod = require('./config');
  });
  return mod;
};

describe('where the app points', () => {
  it('uses the addresses the build was configured with', () => {
    const config = load({
      apiUrl: 'https://api.school.rw/api',
      wsUrl: 'https://api.school.rw',
    });

    expect(config.API_URL).toBe('https://api.school.rw/api');
    expect(config.WS_URL).toBe('https://api.school.rw');
  });

  // A developer who has not written a .env yet should still get a running app
  // against the API on their own machine.
  it('falls back to a local API when nothing was configured', () => {
    const config = load(undefined);

    expect(config.API_URL).toBe('http://localhost:3000/api');
    expect(config.WS_URL).toBe('http://localhost:3000');
  });

  it('falls back per address, not all or nothing', () => {
    const config = load({ apiUrl: 'https://api.school.rw/api' });

    expect(config.API_URL).toBe('https://api.school.rw/api');
    expect(config.WS_URL).toBe('http://localhost:3000');
  });
});

/**
 * Boarding staff are the reason this app exists on a phone at all: a matron
 * handing out pocket money in a dormitory or walking a child to the sick bay
 * is never sitting at a desk.
 */
describe('who may sign in on a phone', () => {
  it.each(['ADMIN', 'TEACHER', 'PARENT', 'LIBRARIAN', 'PATRON', 'MATRON', 'NURSE'])(
    'lets a %s in',
    (role) => {
      expect(load({}).ROLES).toContain(role);
    },
  );

  // Students have a full dashboard on the web and are turned away at sign-in.
  it('does not list students', () => {
    expect(load({}).ROLES).not.toContain('STUDENT');
  });

  it('names the two keys a session is stored under', () => {
    expect(load({}).TOKEN_KEYS).toEqual({
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
    });
  });
});
