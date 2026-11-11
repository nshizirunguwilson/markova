import { SCHOOL_ZONE, useSchoolClock } from './school-clock';

describe("the school's clock", () => {
  it('takes Kigali when the server was told no zone', () => {
    const env: NodeJS.ProcessEnv = {};
    expect(useSchoolClock(env)).toBe('Africa/Kigali');
    expect(env.TZ).toBe(SCHOOL_ZONE);
  });

  it('treats a blank zone as none', () => {
    const env: NodeJS.ProcessEnv = { TZ: '  ' };
    expect(useSchoolClock(env)).toBe(SCHOOL_ZONE);
  });

  it('keeps a zone the school set, for one that is not in Rwanda', () => {
    const env: NodeJS.ProcessEnv = { TZ: 'Africa/Nairobi' };
    expect(useSchoolClock(env)).toBe('Africa/Nairobi');
  });

  /* The case that went wrong: 00:30 on the 12th in Kigali is 22:30 on the
     11th in UTC, and a UTC server called it the 11th. */
  it('puts half past midnight in Kigali on the right day', () => {
    const at = new Date('2026-11-11T22:30:00.000Z');
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: useSchoolClock({}),
    }).format(at);
    expect(day).toBe('2026-11-12');
  });
});
