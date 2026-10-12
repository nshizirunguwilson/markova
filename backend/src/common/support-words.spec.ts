import { arrangementWords, extraMinutes } from './support-words';

describe('a support plan in words', () => {
  it('says how much extra time, then the rest in order, then anything else', () => {
    expect(
      arrangementWords({
        arrangements: ['EXTRA_TIME', 'LARGE_PRINT', 'NEAR_THE_FRONT'],
        extraTimePercent: 25,
        otherArrangement: '  Coloured overlay  ',
      }),
    ).toEqual([
      '25% extra time',
      'Large print',
      'Sits near the front',
      'Coloured overlay',
    ]);
  });

  it('says extra time plainly when no share is given', () => {
    expect(
      arrangementWords({
        arrangements: ['EXTRA_TIME'],
        extraTimePercent: null,
        otherArrangement: null,
      }),
    ).toEqual(['Extra time']);
  });
});

describe('the extra minutes an exam gives', () => {
  it('is the share of the exam, rounded up', () => {
    expect(extraMinutes('08:00', '10:00', 25)).toBe(30);
    expect(extraMinutes('08:00', '09:30', 25)).toBe(23);
  });

  it('is nothing without a share or a sensible time', () => {
    expect(extraMinutes('08:00', '10:00', null)).toBeNull();
    expect(extraMinutes('10:00', '08:00', 25)).toBeNull();
  });
});
