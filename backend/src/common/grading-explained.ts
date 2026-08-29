import {
  ASSESSMENT_WEIGHTS,
  COMPETENCE_THRESHOLD,
  CORE_SCALE,
  ELECTIVE_SCALE,
  MAX_POINTS_PER_SUBJECT,
  type GradeBand,
} from './grading';
import { CONDUCT_BANDS, TERM_CONDUCT_MARK } from './conduct';

/**
 * How a mark becomes a grade, written out for the people who have to read it.
 *
 * This used to be a legend printed at the foot of every report card, which is
 * a strange place for it: the scale is identical on every card the school
 * will ever issue, so a fifth of each sheet went on something that never
 * changes, and a parent looking it up had to find a card first. Worse, it was
 * a second copy of the numbers - the card carried its own literal arrays,
 * which is exactly how a printed scale comes to disagree with the arithmetic
 * that produced the grades on the same page.
 *
 * So it is assembled here, from the same constants the marks are actually
 * computed with, and served to a page anybody can open. There is no second
 * copy anywhere: change `CORE_SCALE` and the explanation changes with it.
 */

export interface ScaleRow {
  /** "70-100", the way a reader recognises a band. */
  range: string;
  letter: string;
  points: number;
  remark: string;
}

export interface ExplainedScale {
  name: string;
  /** Who is graded on it, in a sentence. */
  appliesTo: string;
  rows: ScaleRow[];
}

export interface WeightRow {
  scope: string;
  name: string;
  parts: { assessment: string; percent: number }[];
}

/** A band, written as the range a reader sees rather than as a floor. */
function rangesOf(scale: GradeBand[]): ScaleRow[] {
  return scale.map((band, i) => ({
    // The band above starts where this one ends, so the top of this band is
    // one below it. The first band runs to 100.
    range: `${band.min}-${i === 0 ? 100 : scale[i - 1].min - 1}`,
    letter: band.letter,
    points: band.points,
    remark: band.remark,
  }));
}

const SCOPE_NAME: Record<string, string> = {
  O_CORE: 'Ordinary Level, core subjects',
  O_ELECTIVE: 'Ordinary Level, elective subjects',
  A_GENERAL: 'Advanced Level, general modules',
  A_SPECIFIC: 'Advanced Level, trade modules',
};

export function gradingExplained() {
  return {
    scales: [
      {
        name: 'Core scale',
        appliesTo:
          'Ordinary Level core subjects, and every Advanced Level module.',
        rows: rangesOf(CORE_SCALE),
      },
      {
        name: 'Elective scale',
        appliesTo:
          'Ordinary Level elective subjects only. It is the stricter of the two: the same mark earns a lower grade than it would in a core subject.',
        rows: rangesOf(ELECTIVE_SCALE),
      },
    ] as ExplainedScale[],

    /* What each assessment contributes to the term mark. A parent who can see
       that the exam is 60% of the total can read a poor CAT differently. */
    weights: Object.entries(ASSESSMENT_WEIGHTS).map(([scope, parts]) => ({
      scope,
      name: SCOPE_NAME[scope] ?? scope,
      parts: Object.entries(parts).map(([assessment, weight]) => ({
        assessment,
        percent: Math.round(weight * 100),
      })),
    })) as WeightRow[],

    competence: {
      threshold: COMPETENCE_THRESHOLD,
      /* Competence is a different question from a grade: not "how well" but
         "can they do it". The curriculum asks it of every subject. */
      competent: `A mark of ${COMPETENCE_THRESHOLD}% or above in a subject is Competent.`,
      notYet: `Below ${COMPETENCE_THRESHOLD}% is Not Yet Competent, which says the work is unfinished rather than failed.`,
      certificate:
        'A trade certificate requires at least grade E in the practical modules.',
    },

    aggregate: {
      maxPerSubject: MAX_POINTS_PER_SUBJECT,
      oLevel:
        'Ordinary Level aggregate is the sum of points from the 9 core subjects only, as in national examinations. The maximum is 54.',
      aLevel:
        'Advanced Level aggregate is the sum of points over every module taken in the term. In national examinations NESA counts a fixed set of papers with a maximum aggregate of 60.',
    },

    conduct: {
      outOf: TERM_CONDUCT_MARK,
      /* Conduct is marked out of forty a term like everything else on the
         card is marked out of something, and the card prints it as a row of
         the marks table rather than as a word in a corner. */
      explanation: `Conduct is marked out of ${TERM_CONDUCT_MARK} each term. Every student starts the term on full marks, and recorded incidents take marks off.`,
      bands: CONDUCT_BANDS.map((b) => ({
        from: b.min,
        remark: b.remark,
      })),
    },
  };
}
