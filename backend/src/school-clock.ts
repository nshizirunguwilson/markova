/**
 * The school's clock, set before anything reads the time.
 *
 * "Today" was whatever zone the server happened to be in. Only one helper
 * named Kigali; everything else (the register's day, a payment's date, the
 * midnight jobs) used the process's zone, and a container left on UTC filed
 * anything done between midnight and 02:00 in Rwanda under the day before.
 * The zone was documented in .env.example and nowhere enforced, so a server
 * started without it was silently two hours out.
 *
 * So the process takes the school's zone unless it was told another. Imported
 * first in main.ts: Node reads TZ when a date is next formatted, so setting it
 * here covers every module loaded after.
 */
export const SCHOOL_ZONE = 'Africa/Kigali';

export function useSchoolClock(env: NodeJS.ProcessEnv = process.env): string {
  if (!env.TZ || !env.TZ.trim()) env.TZ = SCHOOL_ZONE;
  return env.TZ;
}

useSchoolClock();
