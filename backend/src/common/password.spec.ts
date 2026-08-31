import {
  PASSWORD_COST,
  hashPassword,
  needsRehash,
  verifyPassword,
} from './password';

/**
 * How passwords are hashed.
 *
 * The cost was 10, set once and copied to five call sites. Ten is not broken,
 * it is dated: OWASP's current guidance is 12, which is four times the work
 * for somebody running a cracker against a stolen table and about 200ms once
 * per sign-in for us.
 */
describe('hashing a password', () => {
  it('uses the cost we have settled on', async () => {
    const hash = await hashPassword('Password123!');
    expect(hash).toMatch(new RegExp(`^\\$2[aby]?\\$${PASSWORD_COST}\\$`));
  });

  it('verifies what it hashed', async () => {
    const hash = await hashPassword('Password123!');
    expect(await verifyPassword('Password123!', hash)).toBe(true);
    expect(await verifyPassword('Password123', hash)).toBe(false);
  });

  it('is at least what OWASP currently asks for', () => {
    expect(PASSWORD_COST).toBeGreaterThanOrEqual(12);
  });

  it('salts, so the same password twice is two different hashes', async () => {
    const a = await hashPassword('Password123!');
    const b = await hashPassword('Password123!');
    expect(a).not.toBe(b);
  });
});

/**
 * The upgrade path.
 *
 * A password is only in memory for the instant somebody signs in, and that is
 * the one moment an old hash can be replaced. Without this, raising the cost
 * applies to new accounts only, and the accounts that have existed longest,
 * which are the ones most worth protecting, keep the weaker one for ever.
 */
describe('an old hash', () => {
  it('is spotted by the cost written inside it', () => {
    expect(needsRehash('$2b$10$abcdefghijklmnopqrstuv')).toBe(true);
  });

  it('leaves a hash already at the current cost alone', async () => {
    expect(needsRehash(await hashPassword('Password123!'))).toBe(false);
  });

  it('reads every bcrypt variant, not just the one we write', () => {
    expect(needsRehash('$2a$08$abcdefghijklmnopqrstuv')).toBe(true);
    expect(needsRehash('$2y$04$abcdefghijklmnopqrstuv')).toBe(true);
  });

  /* Something that is not a bcrypt hash at all is not "old", it is broken,
     and rehashing it would quietly overwrite whatever it really was. */
  it('does not claim something unreadable needs rehashing', () => {
    expect(needsRehash('not-a-hash')).toBe(false);
    expect(needsRehash('')).toBe(false);
  });

  it('does not downgrade a hash made with a stronger cost', () => {
    expect(needsRehash('$2b$14$abcdefghijklmnopqrstuv')).toBe(false);
  });
});
