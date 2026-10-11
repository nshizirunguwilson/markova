/**
 * Time out of school, in words. Kept the same as web/src/lib/standing.ts;
 * the rules live in the API (backend/src/common/student-standing.ts).
 */
export function pauseWords(pause: { kind: 'SUSPENDED' | 'AWAY'; endsOn?: string | null }): string {
  const what = pause.kind === 'SUSPENDED' ? 'Suspended' : 'Away';
  if (!pause.endsOn) return what;
  const day = new Date(pause.endsOn).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  return `${what} until ${day}`;
}
