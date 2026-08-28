/**
 * The conduct mark: forty a term, a hundred and twenty a year.
 *
 * A single running total across a whole year buries the thing a report card
 * exists to say. A student who lost twenty points in September carries that
 * into July no matter how they behaved in between, and a parent reading the
 * Term 3 report cannot tell whether the number in front of them is about this
 * term at all.
 *
 * So conduct is marked per term, out of 40, and the three terms add up to the
 * year's 120. On a report card the term's mark is shown both as it stands and
 * as a percentage, because that is the form every other figure on the sheet
 * takes and the two are not comparable otherwise.
 */

/** What every student starts each term on. */
export const TERM_CONDUCT_MARK = 40;

/** Terms in a Rwandan school year. */
export const TERMS_IN_YEAR = 3;

/** What the three terms add up to. */
export const YEAR_CONDUCT_MARK = TERM_CONDUCT_MARK * TERMS_IN_YEAR;

/**
 * A term's conduct mark, from what happened in that term.
 *
 * Incidents take points off; merits put them back. Held inside 0 and 40:
 * a term cannot end below nothing, and a merit cannot lift a student above a
 * clean sheet — the recognition still stands on the record either way, which
 * is what the merit is really for.
 */
export function termConduct(
  pointsDeducted: number,
  pointsRestored = 0,
  outOf: number = TERM_CONDUCT_MARK,
): number {
  const standing = outOf - pointsDeducted + pointsRestored;
  return Math.max(0, Math.min(outOf, standing));
}

/**
 * The year's conduct mark, out of 120.
 *
 * Terms not yet marked count as full: a year read in Term 1 should not show a
 * student two thirds of the way to nothing for terms that have not happened.
 * The denominator says how much of the year is actually being reported on.
 */
export function yearConduct(termMarks: number[]): {
  points: number;
  outOf: number;
} {
  const marks = termMarks.slice(0, TERMS_IN_YEAR);
  return {
    points: marks.reduce((sum, mark) => sum + mark, 0),
    outOf: marks.length * TERM_CONDUCT_MARK,
  };
}

/**
 * A conduct mark as a percentage, which is the form the rest of the report
 * card takes. Null rather than zero when there is nothing to divide by: a
 * year with no terms marked has no percentage, and printing 0% would read as
 * a student who behaved appallingly.
 */
export function conductPercentage(
  points: number,
  outOf: number,
): number | null {
  if (outOf <= 0) return null;
  return Math.round((points / outOf) * 100);
}

/** "32 / 40 (80%)" — the way a conduct mark is written on a report. */
export function conductLabel(points: number, outOf: number): string {
  const pct = conductPercentage(points, outOf);
  return pct === null ? '–' : `${points} / ${outOf} (${pct}%)`;
}

/**
 * The word for a conduct mark, as a percentage rather than as a raw score.
 *
 * Read off the percentage so the bands mean the same thing whether they are
 * applied to a term out of 40 or a year out of 120. They used to be applied
 * to raw points against a hundred-point scale, which quietly became wrong the
 * moment the scale was not a hundred.
 */
export function conductRemark(percentage: number | null): string {
  if (percentage === null) return '–';
  if (percentage >= 95) return 'Excellent';
  if (percentage >= 85) return 'Very good';
  if (percentage >= 70) return 'Good';
  if (percentage >= 50) return 'Fair';
  return 'Poor';
}
