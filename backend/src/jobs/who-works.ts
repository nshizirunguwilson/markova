/**
 * Whether this process takes background work off the queue.
 *
 * Emails, text messages and PDF renders all wait on the queue for a process
 * that takes them. When nothing took them, a password reset, a parent's OTP
 * and every report card PDF sat there unseen, and the setups the README
 * describes (one `npm run start:dev`, or the `full` compose profile) started
 * no such process.
 *
 * So a process does its own background work unless told otherwise:
 *
 *   WORKER unset   this process does both (development, the `full` stack)
 *   WORKER=0       answers requests only (the scaled stack's API instances)
 *   WORKER=1       a worker (the scaled stack's worker containers)
 *
 * Tests are the one default that stays off: a unit or e2e suite that opened
 * queue workers would leave Redis handles open and try to send real mail.
 */
export function takesJobs(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.WORKER === '1') return true;
  if (env.WORKER === '0') return false;
  return env.NODE_ENV !== 'test';
}
