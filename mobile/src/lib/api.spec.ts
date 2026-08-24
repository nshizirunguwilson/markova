import * as storage from './storage';

/**
 * The one place the phone talks to the school.
 *
 * Two behaviours here are the difference between an app somebody trusts and
 * one they give up on. Every request has to carry the session, and an expired
 * session has to renew itself quietly instead of throwing a teacher back to
 * the sign-in screen in the middle of taking a register.
 */

jest.mock('./storage');

// A stand-in for axios that hands back the interceptors the client installs,
// so each one can be driven directly with the error it is meant to handle.
jest.mock('axios', () => {
  const captured: { request?: any; fulfilled?: any; rejected?: any } = {};
  const instance: any = jest.fn(() => Promise.resolve({ data: 'repeated' }));
  instance.interceptors = {
    request: {
      use: (fulfilled: any) => {
        captured.request = fulfilled;
      },
    },
    response: {
      use: (fulfilled: any, rejected: any) => {
        captured.fulfilled = fulfilled;
        captured.rejected = rejected;
      },
    },
  };
  instance.defaults = {};
  const axios: any = {
    create: jest.fn(() => instance),
    post: jest.fn(),
    __captured: captured,
    __instance: instance,
  };
  return { __esModule: true, default: axios, ...axios };
});

const tokens = storage as jest.Mocked<typeof storage>;

function loadApi() {
  let mod: any;
  let axios: any;
  jest.isolateModules(() => {
    axios = require('axios').default;
    mod = require('./api').default;
  });
  return {
    api: mod,
    axios,
    onRequest: axios.__captured.request,
    onFulfilled: axios.__captured.fulfilled,
    onRejected: axios.__captured.rejected,
    instance: axios.__instance,
  };
}

const unauthorised = (url = '/marks') => ({
  response: { status: 401 },
  config: { url, headers: {} as Record<string, string> },
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('every request', () => {
  it('carries the signed-in session', async () => {
    tokens.getAccessToken.mockResolvedValue('access-abc');
    const { onRequest } = loadApi();

    const config = await onRequest({ headers: {} });

    expect(config.headers.Authorization).toBe('Bearer access-abc');
  });

  it('goes out bare when nobody is signed in', async () => {
    tokens.getAccessToken.mockResolvedValue(null);
    const { onRequest } = loadApi();

    const config = await onRequest({ headers: {} });

    expect(config.headers.Authorization).toBeUndefined();
  });

  it('hands a good reply back untouched', () => {
    const { onFulfilled } = loadApi();
    const reply = { data: { marks: [] }, status: 200 };

    expect(onFulfilled(reply)).toBe(reply);
  });

  it('points at the school the build was configured for', () => {
    const { axios } = loadApi();

    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'http://localhost:3000/api',
        timeout: 15000,
      }),
    );
  });
});

describe('an expired session', () => {
  it('renews itself and repeats the request', async () => {
    tokens.getRefreshToken.mockResolvedValue('refresh-old');
    const { onRejected, axios, instance } = loadApi();
    axios.post.mockResolvedValue({
      data: { accessToken: 'access-new', refreshToken: 'refresh-new' },
    });

    const failed = unauthorised();
    await expect(onRejected(failed)).resolves.toEqual({ data: 'repeated' });

    expect(axios.post).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/refresh',
      { refreshToken: 'refresh-old' },
    );
    expect(tokens.setTokens).toHaveBeenCalledWith('access-new', 'refresh-new');
    expect(failed.config.headers.Authorization).toBe('Bearer access-new');
    expect(instance).toHaveBeenCalledWith(failed.config);
  });

  /**
   * A screen fires several requests at once. All of them come back 401
   * together, and only the first may renew: the rest wait and then go out
   * again with the new session. Renewing in parallel would burn the refresh
   * token more than once and sign the user out.
   */
  it('renews once for a screenful of requests', async () => {
    tokens.getRefreshToken.mockResolvedValue('refresh-old');
    const { onRejected, axios, instance } = loadApi();

    let releaseRefresh!: (value: unknown) => void;
    axios.post.mockReturnValue(
      new Promise((resolve) => {
        releaseRefresh = resolve;
      }),
    );

    const first = onRejected(unauthorised('/marks'));
    const queued = unauthorised('/attendance');
    const second = onRejected(queued);

    releaseRefresh({
      data: { accessToken: 'access-new', refreshToken: 'refresh-new' },
    });
    await Promise.all([first, second]);

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(queued.config.headers.Authorization).toBe('Bearer access-new');
    expect(instance).toHaveBeenCalledTimes(2);
  });

  it('fails the waiting requests too when the renewal is refused', async () => {
    tokens.getRefreshToken.mockResolvedValue('refresh-old');
    const { onRejected, axios } = loadApi();

    let rejectRefresh!: (reason: unknown) => void;
    axios.post.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectRefresh = reject;
      }),
    );

    const first = onRejected(unauthorised('/marks'));
    const second = onRejected(unauthorised('/attendance'));

    rejectRefresh(new Error('refresh rejected'));

    await expect(first).rejects.toThrow('refresh rejected');
    await expect(second).rejects.toThrow('refresh rejected');
  });

  it('signs the user out when the renewal itself is refused', async () => {
    tokens.getRefreshToken.mockResolvedValue('refresh-old');
    const { onRejected, axios } = loadApi();
    axios.post.mockRejectedValue(new Error('refresh rejected'));

    await expect(onRejected(unauthorised())).rejects.toThrow(
      'refresh rejected',
    );
    expect(tokens.clearTokens).toHaveBeenCalled();
  });

  it('signs the user out when there is nothing left to renew with', async () => {
    tokens.getRefreshToken.mockResolvedValue(null);
    const { onRejected } = loadApi();

    await expect(onRejected(unauthorised())).rejects.toThrow(
      'No refresh token',
    );
    expect(tokens.clearTokens).toHaveBeenCalled();
  });

  // A 401 on the refresh route means the refresh token itself is dead.
  // Renewing it with itself would loop forever.
  it('does not try to renew a renewal', async () => {
    const { onRejected, axios } = loadApi();
    const error = unauthorised('/auth/refresh');

    await expect(onRejected(error)).rejects.toBe(error);

    expect(axios.post).not.toHaveBeenCalled();
    expect(tokens.clearTokens).toHaveBeenCalled();
  });

  it('gives up on a request that has already been repeated once', async () => {
    const { onRejected } = loadApi();
    const error = {
      response: { status: 401 },
      config: { url: '/marks', _retry: true },
    };

    await expect(onRejected(error)).rejects.toBe(error);
    expect(tokens.getRefreshToken).not.toHaveBeenCalled();
  });
});

describe('everything that is not an expired session', () => {
  it.each([400, 403, 404, 409, 500])(
    'passes a %s straight through to the screen',
    async (status) => {
      const { onRejected } = loadApi();
      const error = { response: { status }, config: { url: '/marks' } };

      await expect(onRejected(error)).rejects.toBe(error);
      expect(tokens.getRefreshToken).not.toHaveBeenCalled();
    },
  );

  it('passes a lost connection through untouched', async () => {
    const { onRejected } = loadApi();
    const error = { config: { url: '/marks' }, message: 'Network Error' };

    await expect(onRejected(error)).rejects.toBe(error);
    expect(tokens.clearTokens).not.toHaveBeenCalled();
  });
});
