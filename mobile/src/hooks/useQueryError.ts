import { AxiosError } from 'axios';

/**
 * Determine the error type for ErrorScreen from a React Query error.
 */
export function getErrorType(error: unknown): 'network' | 'server' | 'generic' {
  if (error instanceof AxiosError) {
    if (!error.response) return 'network'; // no response = network issue
    if (error.response.status >= 500) return 'server';
  }
  if (error instanceof TypeError && error.message === 'Network request failed') {
    return 'network';
  }
  return 'generic';
}

/**
 * A message worth showing a person.
 *
 * `fallback` is what to say when the request genuinely failed on its merits —
 * a rejected password, a wrong OTP. It is deliberately NOT used for transport
 * failures: telling someone to "check your credentials" when the server is
 * simply unreachable sends them hunting for a problem that is not theirs.
 */
export function getErrorMessage(error: unknown, fallback?: string): string {
  if (error instanceof AxiosError) {
    if (!error.response) {
      return error.code === 'ECONNABORTED'
        ? 'The server took too long to respond. Please try again.'
        : 'Cannot reach the server. Check your connection and that the API is running.';
    }
    if (error.response.status >= 500) {
      return 'The server encountered an error. Please try again later.';
    }
    if (error.response.status === 403) {
      return 'You do not have permission to access this resource.';
    }
    if (error.response.status === 404) {
      return 'The requested data was not found.';
    }
    // The API's own message is the most specific thing we have.
    const data = error.response.data as { message?: string | string[] } | undefined;
    if (data?.message) {
      return typeof data.message === 'string' ? data.message : data.message[0];
    }
  }
  if (error instanceof TypeError && error.message === 'Network request failed') {
    return 'Cannot reach the server. Check your connection and that the API is running.';
  }
  if (fallback) return fallback;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}
