import { AxiosError, AxiosHeaders } from 'axios';

import { getErrorMessage, getErrorType } from './useQueryError';

/**
 * What to tell somebody when a request fails.
 *
 * The distinction that matters most here is between a request that failed on
 * its merits and one that never arrived. Telling a teacher to check their
 * credentials when the server is simply unreachable sends them hunting for a
 * problem that is not theirs.
 */

const axiosError = (status?: number, data?: unknown, code?: string) => {
  const error = new AxiosError('Request failed', code);
  if (status !== undefined) {
    error.response = {
      status,
      data,
      statusText: '',
      headers: {},
      config: { headers: new AxiosHeaders() },
    };
  }
  return error;
};

describe('which kind of failure it was', () => {
  it('calls a request that never arrived a network problem', () => {
    expect(getErrorType(axiosError())).toBe('network');
  });

  it.each([500, 502, 503])('calls a %s the server’s problem', (status) => {
    expect(getErrorType(axiosError(status))).toBe('server');
  });

  it.each([400, 401, 403, 404, 409, 422])(
    'calls a %s neither, since the screen has to say more',
    (status) => {
      expect(getErrorType(axiosError(status))).toBe('generic');
    },
  );

  // React Native's fetch throws this shape rather than an axios error.
  it('recognises the phone saying the request could not go out', () => {
    expect(getErrorType(new TypeError('Network request failed'))).toBe(
      'network',
    );
  });

  it('calls a plain bug neither', () => {
    expect(getErrorType(new TypeError('x is not a function'))).toBe('generic');
    expect(getErrorType(new Error('boom'))).toBe('generic');
    expect(getErrorType('a string')).toBe('generic');
  });
});

describe('what to put on the screen', () => {
  it('says the connection may be the problem when nothing came back', () => {
    expect(getErrorMessage(axiosError())).toBe(
      'Cannot reach the server. Check your connection and that the API is running.',
    );
  });

  // A timeout is different from an unreachable server: the school's network is
  // working, it is just slow, and trying again is the right advice.
  it('says so plainly when the server was simply too slow', () => {
    expect(getErrorMessage(axiosError(undefined, undefined, 'ECONNABORTED'))).toBe(
      'The server took too long to respond. Please try again.',
    );
  });

  it('does not blame the person when the server broke', () => {
    expect(getErrorMessage(axiosError(500))).toBe(
      'The server encountered an error. Please try again later.',
    );
  });

  it('says plainly when somebody is not allowed', () => {
    expect(getErrorMessage(axiosError(403))).toBe(
      'You do not have permission to access this resource.',
    );
  });

  it('says plainly when the thing is not there', () => {
    expect(getErrorMessage(axiosError(404))).toBe(
      'The requested data was not found.',
    );
  });

  /**
   * The API's own message is the most specific thing available, and it is
   * written for the person reading it: "Marks are closed for this term" beats
   * anything this file could invent.
   */
  it('prefers what the API said about a refusal', () => {
    expect(
      getErrorMessage(axiosError(400, { message: 'Marks are closed for this term' })),
    ).toBe('Marks are closed for this term');
  });

  // The validation pipe answers with an array of every field that failed.
  // The first one is the one to lead with.
  it('leads with the first complaint when the API listed several', () => {
    expect(
      getErrorMessage(
        axiosError(400, { message: ['score must not be negative', 'studentId must be a UUID'] }),
      ),
    ).toBe('score must not be negative');
  });

  it('falls back to what the screen wanted to say', () => {
    expect(getErrorMessage(axiosError(401, {}), 'Check your password')).toBe(
      'Check your password',
    );
  });

  /**
   * The fallback is deliberately not used for transport failures. "Check your
   * password" on an unreachable server is actively misleading.
   */
  it('does not use that fallback when the request never arrived', () => {
    expect(getErrorMessage(axiosError(), 'Check your password')).toBe(
      'Cannot reach the server. Check your connection and that the API is running.',
    );
  });

  it('recognises the phone saying the request could not go out', () => {
    expect(getErrorMessage(new TypeError('Network request failed'))).toBe(
      'Cannot reach the server. Check your connection and that the API is running.',
    );
  });

  it('reads a plain error’s own message when there is no fallback', () => {
    expect(getErrorMessage(new Error('Something specific'))).toBe(
      'Something specific',
    );
  });

  it('has something to say about a thing that is not an error at all', () => {
    expect(getErrorMessage({ weird: true })).toBe(
      'Something went wrong. Please try again.',
    );
  });
});
