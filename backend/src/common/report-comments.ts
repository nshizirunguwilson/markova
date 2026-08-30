import { conductRemark } from './conduct';

/**
 * Drafting the two comments on a report card.
 *
 * A school of six hundred issues eighteen hundred report cards a year, each
 * needing two written comments. What actually happens is that a teacher
 * writes "Good work, keep it up" thirty times in an evening, and a family
 * learns to skip the box. The comment is the only part of the sheet written
 * to *this* child, and it is the part that says the least.
 *
 * So the system drafts. It does not send: a suggestion lands in the box and
 * the person whose name is under it edits or replaces it before it is saved,
 * exactly the way the email suggestion in the user wizard fills a field
 * nobody is obliged to keep.
 *
 * The two comments must never read alike, and the way to guarantee that is
 * not a bigger bank of adjectives - it is to have them answer different
 * questions, which is also what is true in the building:
 *
 *   The class teacher taught this child every day. They write about the
 *   *work*: which subject carried the term, which one is holding the average
 *   down, what is not yet competent, and what to do about it. They name
 *   subjects, because they know them.
 *
 *   The head teacher has never taught this child and is reading the sheet.
 *   They write about *standing and consequence*: where this places the child
 *   in the class, whether the aggregate is where the next level needs it, and
 *   what the school expects next term. They never name a subject, because
 *   that is not the register they speak in.
 *
 * Two writers answering different questions cannot collide. `differ()` holds
 * that, and the tests hold it over every band of every input.
 *
 * Nothing here calls out to a language model. The facts are already on the
 * sheet, the sentences that carry them are a school's own register, and a
 * report card is the last document in a school that should depend on a
 * network call to a third party to be issued.
 */

export interface CommentSubject {
  name: string;
  /** The weighted term total, or null where nothing has been marked. */
  total: number | null;
  grade: string | null;
  competence: 'COMPETENT' | 'NOT_YET_COMPETENT' | null;
}

export interface CommentFacts {
  /** Only ever used to vary the phrasing, never printed. */
  studentId: string;
  firstName: string;
  average: number | null;
  letterGrade: string | null;
  rank: number | null;
  classSize: number;
  aggregate: number | null;
  aggregateMax: number | null;
  /** Last term's average, where there is a last term. */
  previousAverage: number | null;
  subjects: CommentSubject[];
  conduct: { points: number; outOf: number } | null;
}

/**
 * Which of several equally true phrasings to use.
 *
 * Thirty cards carrying the identical sentence read as thirty cards nobody
 * looked at, which is the very failure the draft is meant to fix. So the
 * wording varies across a class while staying fixed for one child: pressing
 * the button twice must not produce a different comment, or a teacher can
 * never tell whether they changed anything.
 */
function variant(seed: string, choices: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % choices;
}

type Band = 'strong' | 'solid' | 'fair' | 'weak' | 'serious';

function bandOf(average: number | null): Band | null {
  if (average === null) return null;
  if (average >= 70) return 'strong';
  if (average >= 60) return 'solid';
  if (average >= 50) return 'fair';
  if (average >= 40) return 'weak';
  return 'serious';
}

/** The subjects with a mark against them, best first. */
function marked(facts: CommentFacts): CommentSubject[] {
  return facts.subjects
    .filter((s) => s.total !== null)
    .sort((a, b) => (b.total as number) - (a.total as number));
}

const list = (names: string[]): string =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

// ── Fitting a comment into the space it has ────────────────────────────────

/**
 * The most a comment may run to.
 *
 * Twenty words is one sentence, or two short ones. That is a constraint on
 * the drafting rather than a limitation of it: the box on a report card is
 * two inches tall, and a comment that overflows it is a comment a family
 * reads the first half of. A teacher writing thirty of these by hand keeps
 * to about this length anyway - the long ones are the ones nobody wrote.
 */
export const MAX_COMMENT_WORDS = 20;

/** Words as a person counts them, not as a tokeniser does. */
export function countWords(text: string | null | undefined): number {
  return (text ?? '').trim().split(/\s+/).filter(Boolean).length;
}

/**
 * As many of these clauses as will fit, in the order given.
 *
 * The clauses are written most important first, and this takes them until
 * the next one would not fit. That is what makes the limit a design rather
 * than a truncation: a comment is never cut mid-sentence, and what survives
 * is always the thing that mattered most about this child's term.
 */
export function fit(clauses: string[], budget = MAX_COMMENT_WORDS): string {
  const kept: string[] = [];
  let words = 0;
  for (const clause of clauses) {
    if (!clause) continue;
    const n = countWords(clause);
    if (words + n > budget) continue;
    kept.push(clause);
    words += n;
  }
  return kept.join(' ');
}

// ── The class teacher: the work ────────────────────────────────────────────

/**
 * What was taught, how it went, and what to do next.
 *
 * Built from the subjects rather than the average, because the average is
 * already printed three lines above the box and repeating it in words is how
 * a comment ends up saying nothing the sheet did not.
 *
 * The clauses are ordered by what a family can act on. The subject to work
 * on next term outranks the subject that went well, because one of those is
 * a plan and the other is a compliment.
 */
export function suggestClassTeacherComment(facts: CommentFacts): string {
  const name = facts.firstName;
  const rows = marked(facts);
  const band = bandOf(facts.average);
  const v = (n: number) => variant(`ct:${facts.studentId}`, n);

  if (!rows.length || band === null) {
    /* Nothing marked. Saying "keep it up" over an empty sheet is worse than
       admitting there is nothing to comment on yet. */
    return `${name}'s subjects are not yet marked, so there is nothing to comment on.`;
  }

  const best = rows[0];
  const worst = rows[rows.length - 1];
  const clauses: string[] = [];

  // 1. How the term went, and the subject that carried it.
  if (band === 'strong' || band === 'solid') {
    clauses.push(
      [
        `Good work this term, ${best.name} especially.`,
        `${best.name} is ${name}'s strongest work this term.`,
        `A good term, led by ${best.name}.`,
      ][v(3)],
    );
  } else if (band === 'fair') {
    clauses.push(
      [
        `An uneven term, though ${best.name} holds up.`,
        `${name} is passing, with ${best.name} the subject to build on.`,
        `A fair term; ${best.name} shows what is possible.`,
      ][v(3)],
    );
  } else {
    clauses.push(
      [
        `${name} is behind in most subjects this term.`,
        `A hard term: the work is well short of where it should be.`,
        `${name} is struggling across the sheet and needs help.`,
      ][v(3)],
    );
  }

  /*
    2. Where the ground is being lost - only when one subject is genuinely
    adrift of the rest. On an even sheet, naming the lowest of eleven near
    identical marks invents a problem the child does not have.
  */
  if (
    rows.length > 2 &&
    best.total !== null &&
    worst.total !== null &&
    best.total - worst.total >= 15
  ) {
    clauses.push(
      [
        `${worst.name} needs the extra hour next term.`,
        `The gap is ${worst.name}.`,
        `${worst.name} is holding the average down.`,
      ][v(3)],
    );
  }

  // 3. Competence, where the curriculum's own question has been answered no.
  const notYet = rows.filter((s) => s.competence === 'NOT_YET_COMPETENT');
  const competence = notYet.length
    ? notYet.length === 1
      ? `${notYet[0].name} is not yet competent.`
      : `${notYet.length} subjects are not yet competent.`
    : '';

  /*
    4. Conduct, and only when there is something to say. A line about
    behaviour on every card is a line nobody reads, and it turns the one card
    that omits it into an accusation nobody wrote.
  */
  const pct =
    facts.conduct && facts.conduct.outOf > 0
      ? Math.round((facts.conduct.points / facts.conduct.outOf) * 100)
      : null;
  const serious = pct !== null && pct < 50;

  /*
    What gets dropped when there is more to say than there is room for.

    Behaviour that has begun costing a child real time outranks a competence
    tally, because one of those is something a family can do something about
    tonight and the other is a curriculum artefact they will ask the school
    to explain. A milder conduct note ranks below the subject to work on: it
    is worth saying, but not at the price of the plan.
  */
  return fit([
    clauses[0],
    serious ? `Behaviour is costing ${name} real time.` : '',
    clauses[1] ?? '',
    pct !== null && !serious && pct < 85 ? `Conduct needs to settle.` : '',
    competence,
  ]);
}

// ── The head teacher: standing and consequence ─────────────────────────────

/**
 * Where this places the child, and what the school expects next.
 *
 * Deliberately about the whole rather than the parts. A head teacher who
 * names a subject is writing the class teacher's comment, and a family
 * holding a card where both boxes say the same thing in different
 * handwriting learns that neither was written for them.
 */
export function suggestHeadTeacherComment(facts: CommentFacts): string {
  const name = facts.firstName;
  const band = bandOf(facts.average);
  const v = (n: number) => variant(`ht:${facts.studentId}`, n);

  if (band === null) {
    return `This term's results are incomplete. A comment will follow.`;
  }

  const clauses: string[] = [];

  // 1. Standing, which is the head teacher's own reading of the sheet.
  const place =
    facts.rank !== null && facts.classSize > 0
      ? `${facts.rank} of ${facts.classSize}`
      : null;

  if (band === 'strong') {
    clauses.push(
      place
        ? [`A strong term, placed ${place}.`, `Placed ${place}. Excellent.`][
            v(2)
          ]
        : `A strong term.`,
    );
  } else if (band === 'solid') {
    clauses.push(
      place
        ? [
            `A sound term, placed ${place}.`,
            `Placed ${place}, with room to climb.`,
          ][v(2)]
        : `A sound term overall.`,
    );
  } else if (band === 'fair') {
    clauses.push(
      place
        ? [
            `Placed ${place}: a pass, but not the standard we look for.`,
            `Placed ${place}. Below what ${name} is capable of.`,
          ][v(2)]
        : `A pass, but not the standard we look for.`,
    );
  } else {
    clauses.push(
      place
        ? [
            `Placed ${place}. These results concern the school.`,
            `Placed ${place}, and below what progress requires.`,
          ][v(2)]
        : `These results are below what progress requires.`,
    );
  }

  /*
    2. Movement. A 58% that was 48% last term is a different conversation
    from a 58% that was 68%.
  */
  if (facts.previousAverage !== null && facts.average !== null) {
    const shift = facts.average - facts.previousAverage;
    if (shift >= 5) clauses.push(`The improvement on last term is noted.`);
    else if (shift <= -5) clauses.push(`This is a fall on last term.`);
  }

  /*
    3. Conduct, and only where it has stopped being the classroom's to
    handle. The class teacher already speaks below "Very good".
  */
  if (facts.conduct && facts.conduct.outOf > 0) {
    const pct = Math.round((facts.conduct.points / facts.conduct.outOf) * 100);
    if (conductRemark(pct) === 'Fair' || conductRemark(pct) === 'Poor') {
      clauses.push(`The family will be asked to meet me.`);
    }
  }

  // 4. What is expected. One clause, because a head teacher's comment that
  // runs on stops being a head teacher's comment.
  clauses.push(
    band === 'strong' || band === 'solid'
      ? `Promoted.`
      : `${name} must return ready to work.`,
  );

  return fit(clauses);
}

/**
 * Both drafts, and the guarantee that they are not the same comment twice.
 *
 * The check is kept here rather than in a test alone because it is a promise
 * to the person pressing the button, not merely a property of the code: a
 * card whose two boxes say the same thing in different handwriting teaches a
 * family that neither was written for them.
 */
export function suggestComments(facts: CommentFacts): {
  classTeacher: string;
  headTeacher: string;
} {
  return {
    classTeacher: suggestClassTeacherComment(facts),
    headTeacher: suggestHeadTeacherComment(facts),
  };
}

/** Whether two comments share no sentence. Used by the tests, and by nothing else. */
export function differ(a: string, b: string): boolean {
  const parts = (s: string) =>
    s
      .split(/(?<=\.)\s+/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
  const first = new Set(parts(a));
  return !parts(b).some((s) => first.has(s));
}
