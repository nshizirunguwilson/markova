import { REDACTED, redact } from './redaction';

/**
 * What must never be written down.
 *
 * Credentials are the obvious half. The half that gets forgotten is that this
 * system holds clinic visits, diagnoses and discipline records for children: a
 * log line carrying a diagnosis has copied a medical record out of the table
 * that protected it and into a text file that does not.
 */

describe('redacting a request body', () => {
  it('replaces a password rather than shortening it', () => {
    expect(redact({ email: 'a@b.com', password: 'Password123!' })).toEqual({
      email: 'a@b.com',
      password: REDACTED,
    });
  });

  it('replaces every shape of credential the app accepts', () => {
    const out = redact({
      currentPassword: 'x',
      newPassword: 'y',
      refreshToken: 'z',
      otp: '123456',
      apiKey: 'k',
    }) as Record<string, string>;
    for (const v of Object.values(out)) expect(v).toBe(REDACTED);
  });

  it('matches the key whatever case it arrives in', () => {
    expect(redact({ Password: 'x', REFRESHTOKEN: 'y' })).toEqual({
      Password: REDACTED,
      REFRESHTOKEN: REDACTED,
    });
  });

  /* A body is rarely flat. A clinic visit arrives as { visit: { diagnosis } },
     and a rule that only looked at the top level would write it out in full. */
  it('reaches into nested objects', () => {
    expect(redact({ visit: { studentId: 's-1', diagnosis: 'Asthma' } })).toEqual({
      visit: { studentId: 's-1', diagnosis: REDACTED },
    });
  });

  it('reaches into arrays', () => {
    expect(redact({ visits: [{ diagnosis: 'Asthma' }] })).toEqual({
      visits: [{ diagnosis: REDACTED }],
    });
  });

  it('keeps a child medical detail out of the log', () => {
    const out = redact({
      studentId: 's-1',
      chronicConditions: 'Severe peanut allergy',
      emergencyPlan: 'Adrenaline pen is in the sick bay fridge',
    }) as Record<string, string>;
    expect(out.studentId).toBe('s-1');
    expect(out.chronicConditions).toBe(REDACTED);
    expect(out.emergencyPlan).toBe(REDACTED);
  });

  it('leaves the fields that make a log worth reading', () => {
    expect(redact({ classSectionId: 'c-1', termId: 't-1', isPublished: true })).toEqual(
      { classSectionId: 'c-1', termId: 't-1', isPublished: true },
    );
  });

  /* Failing safe: something too deep to walk is replaced wholesale rather
     than written out on the assumption it holds nothing. */
  it('gives up safely rather than spinning on a deep payload', () => {
    let deep: Record<string, unknown> = { diagnosis: 'Asthma' };
    for (let i = 0; i < 20; i++) deep = { nested: deep };
    expect(JSON.stringify(redact(deep))).not.toContain('Asthma');
  });

  it('copes with a body that is not an object at all', () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
    expect(redact('a string')).toBe('a string');
  });
});
