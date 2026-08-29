import { SubjectScope } from '@prisma/client';

// Rwandan national grading (NESA, 2022 reform). Grade value 6 is best, 0 worst.

export interface GradeBand {
  min: number;
  letter: string;
  points: number;
  remark: string;
}

// Core subjects and all A-Level (TVET) modules.
export const CORE_SCALE: GradeBand[] = [
  { min: 70, letter: 'A', points: 6, remark: 'Excellent' },
  { min: 65, letter: 'B', points: 5, remark: 'Very Good' },
  { min: 60, letter: 'C', points: 4, remark: 'Good' },
  { min: 50, letter: 'D', points: 3, remark: 'Satisfactory' },
  { min: 40, letter: 'E', points: 2, remark: 'Adequate' },
  { min: 20, letter: 'S', points: 1, remark: 'Fair' },
  { min: 0, letter: 'F', points: 0, remark: 'Fail' },
];

// Stricter scale for O-Level elective (non-core) subjects.
export const ELECTIVE_SCALE: GradeBand[] = [
  { min: 80, letter: 'A', points: 6, remark: 'Excellent' },
  { min: 75, letter: 'B', points: 5, remark: 'Very Good' },
  { min: 70, letter: 'C', points: 4, remark: 'Good' },
  { min: 65, letter: 'D', points: 3, remark: 'Satisfactory' },
  { min: 60, letter: 'E', points: 2, remark: 'Adequate' },
  { min: 50, letter: 'S', points: 1, remark: 'Fair' },
  { min: 0, letter: 'F', points: 0, remark: 'Fail' },
];

export const MAX_POINTS_PER_SUBJECT = 6;

/**
 * The mark at or above which a subject is Competent.
 *
 * The same number the practical modules have always used, now applied to
 * every subject: the Rwandan competence-based curriculum asks whether a
 * learner can do the thing, and that question is as real in English or
 * Mathematics as it is in a workshop. A report card that answers it for the
 * practical modules alone answers it for a handful of A-Level students and
 * for nobody else in the school.
 */
export const COMPETENCE_THRESHOLD = 70;

// Term mark composition per subject scope. Keys are assessment type names
// exactly as seeded; weights sum to 1 per scope.
export const ASSESSMENT_WEIGHTS: Record<
  SubjectScope,
  Record<string, number>
> = {
  O_CORE: { 'CAT 1': 0.2, 'CAT 2': 0.2, 'End of Term Exam': 0.6 },
  O_ELECTIVE: { 'CAT 1': 0.2, 'CAT 2': 0.2, 'End of Term Exam': 0.6 },
  A_GENERAL: { 'CAT 1': 0.2, 'CAT 2': 0.2, 'End of Term Exam': 0.6 },
  A_SPECIFIC: {
    'CAT 1': 0.15,
    'CAT 2': 0.15,
    Practical: 0.3,
    'End of Term Exam': 0.4,
  },
};

export function scaleFor(scope: SubjectScope): GradeBand[] {
  return scope === SubjectScope.O_ELECTIVE ? ELECTIVE_SCALE : CORE_SCALE;
}

export function gradeFor(scope: SubjectScope, totalPct: number): GradeBand {
  const scale = scaleFor(scope);
  return scale.find((b) => totalPct >= b.min) ?? scale[scale.length - 1];
}

// The overall term average is always read on the core scale.
export function overallGrade(averagePct: number): GradeBand {
  return CORE_SCALE.find((b) => averagePct >= b.min) ?? CORE_SCALE[6];
}

// Weighted term total (as a % out of 100) for one subject from its recorded
// assessments. Weights renormalize over the components actually present so a
// missing CAT does not sink the total.
export function computeSubjectTotal(
  scope: SubjectScope,
  assessments: { assessmentName: string; score: number; maxScore: number }[],
): number | null {
  // A scope the server grew before this table knew about it has no weights,
  // and reading through it took the whole report card down. No weights means
  // no total, which the sheet already draws as a dash.
  const weights = ASSESSMENT_WEIGHTS[scope] ?? {};
  let weighted = 0;
  let weightSum = 0;
  for (const a of assessments) {
    const w = weights[a.assessmentName];
    if (w === undefined || a.maxScore <= 0) continue;
    weighted += (a.score / a.maxScore) * 100 * w;
    weightSum += w;
  }
  if (weightSum === 0) return null;
  return Math.round(weighted / weightSum);
}

// Points that count toward the term aggregate: the 9 core papers at O-Level
// (max 54, as in national exams), every module at A-Level.
export function countsTowardAggregate(scope: SubjectScope): boolean {
  return scope !== SubjectScope.O_ELECTIVE;
}

export type Competence = 'COMPETENT' | 'NOT_YET_COMPETENT';

/**
 * Competent or not, from a percentage.
 *
 * Null for a subject with no mark at all: "not yet competent" is a judgement,
 * and a subject nobody has marked has not been judged. The report card draws
 * that as a dash.
 */
export function competenceFor(pct: number | null): Competence | null {
  if (pct === null) return null;
  return pct >= COMPETENCE_THRESHOLD ? 'COMPETENT' : 'NOT_YET_COMPETENT';
}

/**
 * Competent or not for one subject on a report card.
 *
 * Every subject is judged, not only the practical modules. Which mark decides
 * it depends on what the subject has:
 *
 * - A practical module with a practical mark is judged on that mark. That is
 *   what the practical is for - it is the assessment that asks whether the
 *   learner can do the work - and judging it on a total three fifths made of
 *   written papers would say something else.
 * - Everything else is judged on its term total, which is the only measure of
 *   the subject there is.
 */
export function competenceForSubject(
  scope: SubjectScope,
  totalPct: number | null,
  practicalPct: number | null,
): Competence | null {
  if (scope === SubjectScope.A_SPECIFIC && practicalPct !== null) {
    return competenceFor(practicalPct);
  }
  return competenceFor(totalPct);
}
