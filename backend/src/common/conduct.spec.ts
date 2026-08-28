import {
  TERM_CONDUCT_MARK,
  TERMS_IN_YEAR,
  YEAR_CONDUCT_MARK,
  conductLabel,
  conductPercentage,
  conductRemark,
  termConduct,
  yearConduct,
} from './conduct';

/**
 * Forty a term, a hundred and twenty a year. A single running total across a
 * whole year buries the thing a report card exists to say: a student who lost
 * points in September carries them into July no matter how they behaved in
 * between.
 */
describe('what conduct is marked out of', () => {
  it('is forty a term and a hundred and twenty a year', () => {
    expect(TERM_CONDUCT_MARK).toBe(40);
    expect(TERMS_IN_YEAR).toBe(3);
    expect(YEAR_CONDUCT_MARK).toBe(120);
  });
});

describe("a term's conduct mark", () => {
  it('is the full mark for a term with nothing against it', () => {
    expect(termConduct(0)).toBe(40);
  });

  it('comes down by what the incidents took off', () => {
    expect(termConduct(8)).toBe(32);
  });

  it('goes back up by what the merits restored', () => {
    expect(termConduct(8, 4)).toBe(36);
  });

  // A merit cannot lift a student above a clean sheet. The recognition still
  // stands on the record either way, which is what the merit is really for.
  it('does not go above a clean sheet', () => {
    expect(termConduct(2, 10)).toBe(40);
    expect(termConduct(0, 10)).toBe(40);
  });

  // A term cannot end below nothing, however bad it was.
  it('does not go below nothing', () => {
    expect(termConduct(90)).toBe(0);
  });

  // A school that sets its own ceiling gets its own ceiling.
  it('takes a ceiling the school set instead', () => {
    expect(termConduct(10, 0, 100)).toBe(90);
    expect(termConduct(0, 0, 50)).toBe(50);
  });
});

describe("the year's conduct mark", () => {
  it('adds the three terms up out of a hundred and twenty', () => {
    expect(yearConduct([40, 36, 32])).toEqual({ points: 108, outOf: 120 });
  });

  /*
    A year read in Term 1 should not show a student two thirds of the way to
    nothing for terms that have not happened, so the denominator says how much
    of the year is actually being reported on.
  */
  it('counts only the terms that have been marked', () => {
    expect(yearConduct([36])).toEqual({ points: 36, outOf: 40 });
    expect(yearConduct([36, 32])).toEqual({ points: 68, outOf: 80 });
  });

  it('has nothing to report for a year with no terms', () => {
    expect(yearConduct([])).toEqual({ points: 0, outOf: 0 });
  });

  // A fourth term is not a Rwandan school year.
  it('never counts more than three terms', () => {
    expect(yearConduct([40, 40, 40, 40]).outOf).toBe(120);
  });
});

/** The form the rest of the report card takes. */
describe('conduct as a percentage', () => {
  it('reads a term out of forty as a percentage', () => {
    expect(conductPercentage(32, 40)).toBe(80);
    expect(conductPercentage(40, 40)).toBe(100);
  });

  it('reads a year out of a hundred and twenty the same way', () => {
    expect(conductPercentage(108, 120)).toBe(90);
  });

  // Printing 0% would read as a student who behaved appallingly, when in fact
  // nobody has marked anything at all.
  it('has no percentage when there is nothing to divide by', () => {
    expect(conductPercentage(0, 0)).toBeNull();
  });

  it('writes the mark and the percentage together', () => {
    expect(conductLabel(32, 40)).toBe('32 / 40 (80%)');
    expect(conductLabel(0, 0)).toBe('–');
  });
});

/**
 * Read off the percentage, so the bands mean the same thing whether they are
 * applied to a term out of forty or a year out of a hundred and twenty. They
 * used to be applied to raw points against a hundred-point scale, which
 * quietly became wrong the moment the scale was not a hundred.
 */
describe('the word for a conduct mark', () => {
  it.each([
    [100, 'Excellent'],
    [95, 'Excellent'],
    [90, 'Very good'],
    [85, 'Very good'],
    [78, 'Good'],
    [70, 'Good'],
    [60, 'Fair'],
    [50, 'Fair'],
    [30, 'Poor'],
    [0, 'Poor'],
  ])('calls %i%% %s', (pct, word) => {
    expect(conductRemark(pct)).toBe(word);
  });

  it('says nothing when there is no percentage', () => {
    expect(conductRemark(null)).toBe('–');
  });

  // The same term mark and year mark must read the same, which is the whole
  // reason the bands are on the percentage rather than on the points.
  it('reads a term and a year at the same standing identically', () => {
    expect(conductRemark(conductPercentage(36, 40))).toBe(
      conductRemark(conductPercentage(108, 120)),
    );
  });
});
