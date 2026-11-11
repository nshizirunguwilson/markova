import {
  attendanceRate,
  excuses,
  familyIsTold,
  settle,
  tally,
} from './attendance-count';

const marks = (...statuses: string[]) => statuses.map((status) => ({ status }));

describe('what excuses a day', () => {
  it.each(['SICK', 'FAMILY', 'PERMISSION'])('%s does', (reason) => {
    expect(excuses(reason)).toBe(true);
  });

  it.each(['UNEXCUSED', '', null, undefined, 'HOLIDAY'])(
    '%s does not',
    (reason) => {
      expect(excuses(reason as string)).toBe(false);
    },
  );
});

describe('what is stored for a mark', () => {
  it('keeps an excused day and its reason', () => {
    expect(settle('EXCUSED', 'SICK')).toEqual({
      status: 'EXCUSED',
      reasonCategory: 'SICK',
    });
  });

  // The mobile app has always sent "absent, sick". That is an excused day.
  it('reads an absence with a reason that excuses it as excused', () => {
    expect(settle('ABSENT', 'FAMILY')).toEqual({
      status: 'EXCUSED',
      reasonCategory: 'FAMILY',
    });
  });

  it('takes an excused day with no reason as leave the school gave', () => {
    expect(settle('EXCUSED')).toEqual({
      status: 'EXCUSED',
      reasonCategory: 'PERMISSION',
    });
  });

  it('does not let an excused day be unexcused', () => {
    expect(settle('EXCUSED', 'UNEXCUSED').reasonCategory).toBe('PERMISSION');
  });

  it('marks a plain absence as unexcused', () => {
    expect(settle('ABSENT')).toEqual({
      status: 'ABSENT',
      reasonCategory: 'UNEXCUSED',
    });
    expect(settle('ABSENT', 'UNEXCUSED').status).toBe('ABSENT');
  });

  it.each(['PRESENT', 'LATE'])('gives %s no reason to carry', (status) => {
    expect(settle(status, 'SICK')).toEqual({ status, reasonCategory: null });
  });
});

describe('who is told the same day', () => {
  it('tells the family about an absence and a late arrival', () => {
    expect(familyIsTold('ABSENT')).toBe(true);
    expect(familyIsTold('LATE')).toBe(true);
  });

  // They asked for the day, or already know why.
  it('does not tell them about a day that was excused, or a day in school', () => {
    expect(familyIsTold('EXCUSED')).toBe(false);
    expect(familyIsTold('PRESENT')).toBe(false);
  });
});

describe('counting a register', () => {
  it('counts each of the four apart', () => {
    expect(
      tally(
        marks('PRESENT', 'PRESENT', 'LATE', 'ABSENT', 'EXCUSED', 'EXCUSED'),
      ),
    ).toEqual({
      present: 2,
      late: 1,
      absent: 1,
      excused: 2,
      total: 6,
      counted: 4,
      rate: 75,
    });
  });

  // A week in hospital and a week of truancy used to read the same.
  it('does not lower the rate for an excused day', () => {
    const inHospital = tally(marks('PRESENT', 'PRESENT', 'PRESENT', 'EXCUSED'));
    const truant = tally(marks('PRESENT', 'PRESENT', 'PRESENT', 'ABSENT'));
    expect(inHospital.rate).toBe(100);
    expect(truant.rate).toBe(75);
  });

  it('counts a late arrival as a day in school', () => {
    expect(tally(marks('LATE', 'LATE')).rate).toBe(100);
  });

  it('has no rate for a register with nothing on it', () => {
    expect(tally([])).toMatchObject({ total: 0, counted: 0, rate: 0 });
  });

  it('does not hold it against a child excused on every day there is', () => {
    expect(tally(marks('EXCUSED', 'EXCUSED'))).toMatchObject({
      counted: 0,
      rate: 100,
    });
  });

  it('works out the rate from counts as well as from marks', () => {
    expect(attendanceRate(30, 2, 40)).toBe(80);
    expect(attendanceRate(0, 0, 0)).toBe(0);
    expect(attendanceRate(0, 0, 0, 3)).toBe(100);
  });
});
