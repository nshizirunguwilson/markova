/**
 * What an error boundary is allowed to put on screen.
 *
 * A caught render error carries whatever the throwing code said, which is
 * routinely an internal detail: a file path, a query, a connection string. That
 * is useful in development and is nobody's business in a classroom, so outside
 * development the person gets a plain sentence and the digest they can quote
 * when they report it.
 */
export function displayableError(
  error: Error & { digest?: string },
): { message: string; reference?: string } {
  const isDevelopment = process.env.NODE_ENV === "development";

  return {
    message: isDevelopment
      ? error.message || "An unexpected error occurred."
      : "An unexpected error occurred. The team has been notified.",
    reference: error.digest,
  };
}
