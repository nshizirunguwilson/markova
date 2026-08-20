import { AxiosError } from "axios";

/**
 * A message worth showing a person.
 *
 * `fallback` is what to say when the request genuinely failed on its merits —
 * a rejected password, a wrong OTP, an expired link. It is deliberately NOT
 * used for transport failures: telling someone to "check your credentials"
 * when the API is simply unreachable sends them hunting for a problem that is
 * not theirs.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof AxiosError || (error as AxiosError)?.isAxiosError) {
    const err = error as AxiosError<{ message?: string | string[] }>;

    if (!err.response) {
      return err.code === "ECONNABORTED"
        ? "The server took too long to respond. Please try again."
        : "Cannot reach the server. Check your connection and that the API is running.";
    }
    if (err.response.status >= 500) {
      return "The server encountered an error. Please try again later.";
    }

    // The API's own message is the most specific thing we have.
    const message = err.response.data?.message;
    if (message) {
      return typeof message === "string" ? message : message[0];
    }
  }
  return fallback;
}
