// Helpers for the Add User form: NIDA national ID handling, password
// generation and school-email suggestion.

// NIDA 16-digit layout: status | birth year | gender | birth order |
// issuance count | security code — spaced as printed on the physical card.
export const NID_GROUPS = [1, 4, 1, 7, 1, 2];

export function nidDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 16);
}

export function formatNid(value: string): string {
  const digits = nidDigits(value);
  const parts: string[] = [];
  let at = 0;
  for (const len of NID_GROUPS) {
    if (at >= digits.length) break;
    parts.push(digits.slice(at, at + len));
    at += len;
  }
  return parts.join(" ");
}

/**
 * Full NIDA validation. Returns a human error or null when valid.
 * Cross-checks the gender digit (8 male / 7 female) and the birth year
 * against the profile when those are known.
 */
export function validateNid(
  digits: string,
  gender?: "MALE" | "FEMALE" | "",
  dateOfBirth?: string,
): string | null {
  if (!digits) return null;
  if (digits.length !== 16) return "National ID must have 16 digits";
  if (!/^[123]/.test(digits)) {
    return "First digit must be 1 (citizen), 2 (refugee) or 3 (foreigner)";
  }
  const year = parseInt(digits.slice(1, 5));
  const now = new Date().getFullYear();
  if (year < 1900 || year > now) {
    return `Birth year ${year} in the ID is not possible`;
  }
  const genderDigit = digits[5];
  if (genderDigit !== "7" && genderDigit !== "8") {
    return "Digit 6 must be 8 (male) or 7 (female)";
  }
  if (gender === "MALE" && genderDigit !== "8") {
    return "This ID carries the female digit (7) but gender is set to male";
  }
  if (gender === "FEMALE" && genderDigit !== "7") {
    return "This ID carries the male digit (8) but gender is set to female";
  }
  if (dateOfBirth) {
    const dobYear = new Date(dateOfBirth).getFullYear();
    if (!Number.isNaN(dobYear) && dobYear !== year) {
      return `ID says born ${year} but the date of birth says ${dobYear}`;
    }
  }
  return null;
}

/** A strong random password that satisfies the backend policy. */
export function generatePassword(): string {
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%&*";
  const all = lower + upper + digits + symbols;
  const pick = (pool: string) => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return pool[buf[0] % pool.length];
  };
  const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  while (chars.length < 12) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/**
 * The school convention: initial.kinyarwandaname@markova.edu
 *
 * The wizard checks this against the API and appends a number if it is taken,
 * so this only has to produce the unnumbered form.
 */
export function suggestEmail(firstName: string, lastName: string): string {
  const first = firstName.trim().split(/\s+/)[0] || "";
  const last = lastName.trim().split(/\s+/)[0] || "";
  if (!first || !last) return "";
  return `${first[0].toLowerCase()}.${last.toLowerCase()}@markova.edu`;
}
