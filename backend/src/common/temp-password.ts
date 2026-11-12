import { randomInt } from 'crypto';

/**
 * A temporary password for an account the school creates.
 *
 * Ten characters with an upper, a lower, a digit and a symbol guaranteed,
 * from pools with the lookalikes (l, 1, I, O, 0) taken out: these get read
 * over a desk and typed from paper. The person must change it the first
 * time they sign in (`forcePasswordChange`).
 */
export function generateTempPassword(): string {
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '!@#$%&*';
  const all = lower + upper + digits + symbols;
  const pick = (pool: string) => pool[randomInt(pool.length)];
  const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  while (chars.length < 10) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
