/**
 * The conduct mark, on screen.
 *
 * Mirrors `backend/src/common/conduct.ts`, which is where the reasoning
 * behind the numbers is written down and which is what the report card is
 * actually printed from. Repeated here so a page can draw a bar and a word
 * without a round trip.
 */

/** What every student starts each term on. */
export const TERM_CONDUCT_MARK = 40;

/** Terms in a Rwandan school year. */
export const TERMS_IN_YEAR = 3;

/** What the three terms add up to. */
export const YEAR_CONDUCT_MARK = TERM_CONDUCT_MARK * TERMS_IN_YEAR;

/**
 * A conduct mark as a percentage. Null rather than zero when there is nothing
 * to divide by: printing 0% would read as a student who behaved appallingly,
 * when in fact nobody has marked anything at all.
 */
export function conductPercentage(
  points: number | null | undefined,
  outOf: number | null | undefined,
): number | null {
  if (points == null || !outOf || outOf <= 0) return null;
  return Math.round((points / outOf) * 100);
}

/**
 * The word for a conduct mark, read off the percentage so the bands mean the
 * same thing for a term out of forty and a year out of a hundred and twenty.
 */
export function conductRemark(percentage: number | null): string {
  if (percentage === null) return "-";
  if (percentage >= 95) return "Excellent";
  if (percentage >= 85) return "Very good";
  if (percentage >= 70) return "Good";
  if (percentage >= 50) return "Fair";
  return "Poor";
}

/**
 * The colour a conduct bar is drawn in. Three bands rather than five, because
 * a bar is read at a glance and five shades of it are not distinguishable at
 * that speed - the word beside it carries the detail.
 */
export function conductTone(percentage: number | null): string {
  /*
    Whole class names, never `bg-${tone}`. Tailwind reads the source for the
    classes it has to generate and cannot see a name that is assembled at
    runtime, so a constructed one comes out as no colour at all.
  */
  if (percentage === null) return "bg-muted";
  if (percentage >= 70) return "bg-success";
  if (percentage >= 40) return "bg-warning";
  return "bg-danger";
}
