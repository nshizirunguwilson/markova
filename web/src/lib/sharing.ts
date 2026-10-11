/**
 * Eighteen or over, on the school's day (Kigali). Matches
 * backend/src/common/parent-sharing.ts: no date of birth means under 18.
 */
export function isAdult(dateOfBirth: string | null | undefined, now: Date = new Date()): boolean {
  if (!dateOfBirth) return false;
  const born = new Date(dateOfBirth);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kigali",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const eighteenth = new Date(
    Date.UTC(born.getUTCFullYear() + 18, born.getUTCMonth(), born.getUTCDate()),
  );
  return eighteenth.getTime() <= new Date(`${today}T00:00:00.000Z`).getTime();
}
