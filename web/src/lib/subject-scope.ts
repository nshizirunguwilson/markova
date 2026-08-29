/**
 * What a subject's scope means, in the words a school uses.
 *
 * `SubjectScope` decides three things that nothing on screen used to admit:
 * how a term mark is weighted, which grading scale the letter comes off, and
 * whether the subject counts toward the aggregate a student is certified on.
 * Kept here rather than inline so the same wording is used everywhere and can
 * be checked against backend/src/common/grading.ts, which is the authority.
 */

export type SubjectScope = "O_CORE" | "O_ELECTIVE" | "A_GENERAL" | "A_SPECIFIC";

export interface ScopeInfo {
  value: SubjectScope;
  label: string;
  stage: "O-Level" | "A-Level";
  /** How the term mark is put together. Mirrors ASSESSMENT_WEIGHTS. */
  weighting: string;
  /** Which grade scale the letter comes off. */
  scale: string;
  countsTowardAggregate: boolean;
  /** Trade-specific modules must belong to a trade; nothing else may. */
  requiresTrade: boolean;
  hint: string;
}

export const SUBJECT_SCOPES: ScopeInfo[] = [
  {
    value: "O_CORE",
    label: "O-Level core",
    stage: "O-Level",
    weighting: "CAT 1 20% · CAT 2 20% · Exam 60%",
    scale: "Core (A from 70%)",
    countsTowardAggregate: true,
    requiresTrade: false,
    hint: "One of the nine papers a Senior 1-3 student is certified on.",
  },
  {
    value: "O_ELECTIVE",
    label: "O-Level elective",
    stage: "O-Level",
    weighting: "CAT 1 20% · CAT 2 20% · Exam 60%",
    scale: "Elective (A from 80%)",
    countsTowardAggregate: false,
    requiresTrade: false,
    hint: "Marked on the stricter scale and left out of the aggregate.",
  },
  {
    value: "A_GENERAL",
    label: "A-Level general",
    stage: "A-Level",
    weighting: "CAT 1 20% · CAT 2 20% · Exam 60%",
    scale: "Core (A from 70%)",
    countsTowardAggregate: true,
    requiresTrade: false,
    hint: "Taught across every trade at Level 3-5.",
  },
  {
    value: "A_SPECIFIC",
    label: "Trade module",
    stage: "A-Level",
    weighting: "CAT 1 15% · CAT 2 15% · Practical 30% · Exam 40%",
    scale: "Core (A from 70%)",
    countsTowardAggregate: true,
    requiresTrade: true,
    hint: "Belongs to one trade and carries a practical mark.",
  },
];

export function scopeInfo(scope: string | null | undefined): ScopeInfo | null {
  return SUBJECT_SCOPES.find((s) => s.value === scope) ?? null;
}

export function scopeLabel(scope: string | null | undefined): string {
  return scopeInfo(scope)?.label ?? "-";
}
