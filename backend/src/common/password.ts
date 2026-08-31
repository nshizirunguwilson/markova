/**
 * How passwords are hashed, in one place.
 *
 * The cost factor was 10 everywhere, set once and copied to five call sites.
 * Ten is not broken, it is dated: OWASP's current guidance for bcrypt is 12,
 * and the difference is four times the work for somebody running a cracker
 * against a stolen table, against about 200ms once per sign-in for us.
 *
 * A constant rather than five literals, so the next revision is one edit and
 * not a search. `needsRehash` is what makes changing it possible at all
 * without asking 2,478 people to reset their password.
 */
import * as bcrypt from 'bcryptjs';

/** OWASP's current recommendation for bcrypt. */
export const PASSWORD_COST = 12;

export const hashPassword = (plain: string): Promise<string> =>
  bcrypt.hash(plain, PASSWORD_COST);

export const verifyPassword = (
  plain: string,
  hash: string,
): Promise<boolean> => bcrypt.compare(plain, hash);

/**
 * Whether a stored hash was made with a weaker cost than we now use.
 *
 * bcrypt writes its cost into the hash itself, as the number between the
 * second and third dollar signs of `$2b$10$...`, so this is a read rather than
 * a guess.
 *
 * The point is the upgrade path. A password is only in memory for the instant
 * somebody signs in, and that is the one moment it can be rehashed at the new
 * cost. Without this, raising the cost applies to new accounts only and the
 * accounts that have existed longest, which are the ones most worth
 * protecting, keep the old one for ever.
 */
export function needsRehash(hash: string): boolean {
  const cost = Number(/^\$2[aby]?\$(\d{2})\$/.exec(hash)?.[1]);
  return Number.isFinite(cost) && cost < PASSWORD_COST;
}
