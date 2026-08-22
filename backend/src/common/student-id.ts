import { createHmac } from 'crypto';

/**
 * A student's permanent number: `STD-<year>-<ABC>-<DEF>`, e.g.
 * `STD-2025-231419-167`.
 *
 * `ABC` encodes three letters of the student's own name as their positions in
 * the alphabet, so the number says something about who holds it. `DEF` is
 * derived from a server secret, which is what makes the number both unique and
 * impossible to invent.
 *
 * Generated once, at enrolment, and stored. It is never recomputed: correcting
 * a spelling or adding a name later must not change a student's number.
 */

/** Alphabet position, A=1 … Z=26. Non-letters never reach here. */
function position(letter: string): number {
  return letter.toUpperCase().charCodeAt(0) - 64;
}

/** Name parts, split on whitespace and hyphens, letters only. */
function nameParts(fullName: string): string[] {
  return fullName
    .replace(/-/g, ' ')
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z]/g, ''))
    .filter(Boolean);
}

/**
 * The three numbers taken from a name, whatever its shape.
 *
 * Two names take the second letter of the family name for the third number,
 * because the middle of a two-part name is the family name itself. Three or
 * more take the true middle part, `parts[len / 2]`, so a student with three
 * names and one with five are handled by the same rule and the letter is
 * always genuinely theirs.
 */
export function nameCode(fullName: string): string {
  const parts = nameParts(fullName);
  if (parts.length === 0) {
    throw new Error('A student number needs a name with at least one letter');
  }

  const first = parts[0];
  const last = parts[parts.length - 1];

  const a = position(first[0]);
  const b = parts.length > 1 ? position(last[0]) : position(first[1] ?? first[0]);

  let c: number;
  if (parts.length >= 3) {
    c = position(parts[Math.floor(parts.length / 2)][0]);
  } else if (parts.length === 2) {
    c = position(last[1] ?? last[0]);
  } else {
    c = position(first[2] ?? first[1] ?? first[0]);
  }

  return [a, b, c].map((n) => String(n).padStart(2, '0')).join('');
}

/**
 * The three check digits.
 *
 * Only the holder of the secret can produce these, so a student cannot invent
 * a number that passes a gate scanner. They also carry the uniqueness: 35% of
 * the students in a real roll share a `year-ABC` prefix with somebody else, so
 * the prefix alone is not an identifier.
 *
 * `nonce` exists only for the caller's collision retry; it is 0 in the normal
 * case.
 */
export function checkCode(
  secret: string,
  year: number,
  abc: string,
  studentKey: string,
  nonce = 0,
): string {
  const digest = createHmac('sha256', secret)
    .update(`${year}|${abc}|${studentKey}|${nonce}`)
    .digest();
  return String(digest.readUInt32BE(0) % 1000).padStart(3, '0');
}

export interface StudentIdParts {
  fullName: string;
  year: number;
  /** Anything stable and unique to the student; their user id will do. */
  studentKey: string;
  nonce?: number;
}

/**
 * The secret student numbers are signed with.
 *
 * Falls back to the JWT secret outside production so a developer does not have
 * to configure two secrets to see the app run. Production requires its own
 * (see env.validation.ts), because reusing the JWT key here would leak it into
 * every printed card's check digits.
 */
export function studentIdSecret(env: NodeJS.ProcessEnv = process.env): string {
  if (env.STUDENT_ID_SECRET) return env.STUDENT_ID_SECRET;
  if (env.NODE_ENV === 'production') return '';
  return env.JWT_SECRET ?? '';
}

export function buildStudentId(
  secret: string,
  { fullName, year, studentKey, nonce = 0 }: StudentIdParts,
): string {
  if (!secret) {
    throw new Error('STUDENT_ID_SECRET is required to issue a student number');
  }
  const abc = nameCode(fullName);
  return `STD-${year}-${abc}-${checkCode(secret, year, abc, studentKey, nonce)}`;
}

const ID_PATTERN = /^STD-(\d{4})-(\d{6})-(\d{3})$/;

/** Whether a number is well formed, without checking it against a secret. */
export function isStudentIdShape(value: string): boolean {
  return ID_PATTERN.test(value);
}

/**
 * Whether a number was issued by the holder of this secret.
 *
 * The check is over the whole issued number, so it catches an altered year or
 * an altered name code as readily as an altered check.
 */
export function verifyStudentId(
  secret: string,
  studentId: string,
  studentKey: string,
  maxNonce = 8,
): boolean {
  const match = ID_PATTERN.exec(studentId);
  if (!match) return false;
  const [, year, abc, def] = match;
  for (let nonce = 0; nonce <= maxNonce; nonce += 1) {
    if (checkCode(secret, Number(year), abc, studentKey, nonce) === def) {
      return true;
    }
  }
  return false;
}
