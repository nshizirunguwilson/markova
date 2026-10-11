/**
 * "Kept private", read out of a refused request (A8 in
 * docs/STUDENT-LIFE-DESIGN.md). From 18 a student decides what their parents
 * see; the API names the refusal, and the screen says so calmly rather than
 * looking empty. Kept the same as web/src/lib/kept-private.ts.
 */
export function keptPrivate(error: unknown): string | null {
  const body = (error as { response?: { data?: Record<string, unknown> } } | null)?.response?.data;
  if (!body || body.reason !== 'KEPT_PRIVATE') return null;
  return typeof body.message === 'string' && body.message
    ? body.message
    : 'Your child has chosen to keep this private.';
}
