/**
 * What must never be written down.
 *
 * One list, used by the audit log and by anything that logs a request body,
 * because a redaction rule applied in two places is a rule that will
 * eventually be applied differently in two places.
 *
 * Two groups, for two different reasons.
 *
 * Credentials are obvious: a password in a log is a password, and logs are
 * shipped, backed up and read by more people than the database is.
 *
 * The second group is the one that gets forgotten. This system holds clinic
 * visits, diagnoses, allergies and discipline records for children. A log line
 * carrying a diagnosis has copied a medical record out of the table it was
 * protected in and into a text file with none of that protection.
 */

/** Anything that would let somebody sign in as another person. */
const CREDENTIALS = [
  'password',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'otp',
  'secret',
  'apiKey',
  'authorization',
];

/**
 * Anything about a child that is nobody's business outside the record it lives
 * in. These are the field names the clinic, discipline and admissions modules
 * actually use.
 */
const SENSITIVE = [
  'diagnosis',
  'treatment',
  'symptoms',
  'chronicConditions',
  'allergyNotes',
  'emergencyPlan',
  'medication',
  'medicalNotes',
  'notes',
  'reason',
  'description',
];

export const REDACTED = '[REDACTED]';

/** Every key that is replaced rather than written, lowercased for matching. */
export const REDACTED_KEYS = new Set(
  [...CREDENTIALS, ...SENSITIVE].map((k) => k.toLowerCase()),
);

/**
 * A copy of `value` with the sensitive fields replaced.
 *
 * Walks nested objects and arrays, because a body is rarely flat: a clinic
 * visit arrives as `{ visit: { diagnosis } }` and a rule that only looked at
 * the top level would write it out in full.
 *
 * `depth` stops a cycle or a pathological payload from spinning. Anything
 * deeper than this is replaced wholesale rather than walked, which is the safe
 * direction to fail in.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACTED_KEYS.has(key.toLowerCase())
      ? REDACTED
      : redact(v, depth + 1);
  }
  return out;
}
