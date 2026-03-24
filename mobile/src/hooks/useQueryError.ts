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
 * Get a user-friendly error message from a React Query error.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    if (!error.response) {
      return 'Unable to connect to the server. Please check your internet connection and try again.';
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
    // Try to extract a message from the response
    const data = error.response.data as any;
    if (data?.message) {
      return typeof data.message === 'string' ? data.message : data.message[0];
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}
