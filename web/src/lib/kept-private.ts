/** What the API calls a refusal made because an adult child keeps it private. */
export const KEPT_PRIVATE_REASON = "KEPT_PRIVATE";

/**
 * Read "kept private" out of a failed request.
 *
 * From 18 a student decides what their parents see (A8 in
 * docs/STUDENT-LIFE-DESIGN.md). A parent asking for something their child
 * keeps private gets a 403 that names the reason, so the page can say so
 * calmly instead of looking broken or empty. Switches on the reason rather
 * than on the wording, like `withheldFrom` does for fees.
 *
 * Returns the sentence to show, or null for every other error.
 */
export function keptPrivate(error: unknown): string | null {
  const body = (
    error as { response?: { data?: Record<string, unknown> } } | null
  )?.response?.data;
  if (!body || body.reason !== KEPT_PRIVATE_REASON) return null;
  return typeof body.message === "string" && body.message
    ? body.message
    : "Your child has chosen to keep this private.";
}
