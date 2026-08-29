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

// ── The class teacher: the work ────────────────────────────────────────────

/**
 * What was taught, how it went, and what to do next.
 *
 * Built from the subjects rather than the average, because the average is
 * already printed three lines above the box and repeating it in words is how
 * a comment ends up saying nothing the sheet did not.
 */
export function suggestClassTeacherComment(facts: CommentFacts): string {
  const name = facts.firstName;
  const rows = marked(facts);
  const band = bandOf(facts.average);
  const v = (n: number) => variant(`ct:${facts.studentId}`, n);

  if (!rows.length || band === null) {
    /* Nothing marked. Saying "keep it up" over an empty sheet is worse than
       admitting there is nothing to comment on yet. */
    return `${name}'s marks for this term are not yet complete, so there is nothing to comment on. This will be updated once the subjects have been marked.`;
  }

  const best = rows[0];
  const worst = rows[rows.length - 1];
  const sentences: string[] = [];

  // 1. What carried the term.
  if (band === 'strong' || band === 'solid') {
    sentences.push(
      [
        `${name} has worked well this term, and ${best.name} in particular is strong.`,
        `${best.name} is ${name}'s strongest work this term, and the rest of the sheet is not far behind it.`,
        `${name} has held a good standard across the term, with ${best.name} the best of it.`,
      ][v(3)],
    );
  } else if (band === 'fair') {
    sentences.push(
      [
        `${name} has managed a fair term, with ${best.name} the subject to build on.`,
        `There is ground to make up this term, though ${name} has kept ${best.name} steady.`,
        `${name}'s term has been uneven, but ${best.name} shows what is possible.`,
      ][v(3)],
    );
  } else {
    sentences.push(
      [
        `${name} has found this term difficult, and the marks show it in most subjects.`,
        `This has been a hard term for ${name}, and the work is behind where it needs to be.`,
        `${name} is struggling across the sheet this term and needs help to catch up.`,
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
    sentences.push(
      [
        `${worst.name} is holding the average down and is where the extra hour should go.`,
        `The gap is in ${worst.name}, which needs deliberate work rather than more of the same.`,
        `${worst.name} is well behind the others and should be the focus of next term.`,
      ][v(3)],
    );
  }

  // 3. Competence, where the curriculum's own question has been answered no.
  const notYet = rows.filter((s) => s.competence === 'NOT_YET_COMPETENT');
  if (notYet.length) {
    const names = list(notYet.slice(0, 3).map((s) => s.name));
    sentences.push(
      notYet.length > 3
        ? `${notYet.length} subjects are still Not Yet Competent, ${names} among them, and these need to be completed rather than repeated.`
        : `${names} ${notYet.length === 1 ? 'is' : 'are'} still Not Yet Competent, which means the work is unfinished rather than failed.`,
    );
  }

  /*
    4. Conduct, and only when there is something to say.

    A line about behaviour on every card is a line nobody reads, and it turns
    the one card that omits it into an accusation nobody wrote. The class
    teacher speaks up below "Very good", which is where it starts to affect
    the classroom.
  */
  if (facts.conduct && facts.conduct.outOf > 0) {
    const pct = Math.round((facts.conduct.points / facts.conduct.outOf) * 100);
    if (pct < 85) {
      sentences.push(
        pct < 50
          ? `Conduct is at ${facts.conduct.points} out of ${facts.conduct.outOf}, and behaviour has cost ${name} time that should have gone into the work.`
          : `Conduct at ${facts.conduct.points} out of ${facts.conduct.outOf} is below where it should be, and settling in class would show in these marks.`,
      );
    }
  }

  return sentences.join(' ');
}

// ── The head teacher: standing and consequence ─────────────────────────────

/**
 * Where this places the child, and what the school expects next.
 *
 * Deliberately shorter, and deliberately about the whole rather than the
 * parts. A head teacher who names a subject is writing the class teacher's
 * comment, and a family holding a card where both boxes say the same thing in
 * different handwriting learns that neither was written for them.
 */
export function suggestHeadTeacherComment(facts: CommentFacts): string {
  const name = facts.firstName;
  const band = bandOf(facts.average);
  const v = (n: number) => variant(`ht:${facts.studentId}`, n);

  if (band === null) {
    return `This term's results are incomplete. The school will issue a comment once the marks have been entered and checked.`;
  }

  const sentences: string[] = [];

  // 1. Standing, which is the head teacher's own reading of the sheet.
  const place =
    facts.rank !== null && facts.classSize > 0
      ? `${facts.rank} of ${facts.classSize}`
      : null;

  if (band === 'strong') {
    sentences.push(
      place
        ? [
            `A strong term. ${name} is placed ${place} and is among the students this school expects to see carry the class.`,
            `${name} finishes the term ${place}, which is a result the school is pleased to record.`,
          ][v(2)]
        : `A strong term, and a standard ${name} should now be expected to hold.`,
    );
  } else if (band === 'solid') {
    sentences.push(
      place
        ? [
            `A sound term overall. ${name} is placed ${place} and is within reach of the top of the class.`,
            `${name} ends the term ${place}, comfortably placed and with room to move up.`,
          ][v(2)]
        : `A sound term overall, with room to move higher.`,
    );
  } else if (band === 'fair') {
    sentences.push(
      place
        ? [
            `${name} is placed ${place} and is holding a pass, but this is not yet the standard the school looks for.`,
            `Placed ${place}. ${name} has passed the term without settling the question of what they are capable of.`,
          ][v(2)]
        : `${name} has passed the term without reaching the standard the school looks for.`,
    );
  } else {
    sentences.push(
      place
        ? [
            `${name} is placed ${place}, and these results are below the standard required to progress comfortably.`,
            `Placed ${place}. This is a result the school is concerned by, and it needs to change next term.`,
          ][v(2)]
        : `These results are below the standard required to progress comfortably.`,
    );
  }

  /*
    2. Movement. Where a previous term exists, the direction is the single
    most useful thing the head teacher can add: a 58% that was 48% last term
    is a different conversation from a 58% that was 68%.
  */
  if (facts.previousAverage !== null && facts.average !== null) {
    const shift = facts.average - facts.previousAverage;
    if (shift >= 5) {
      sentences.push(
        `The improvement on last term is real and has been noted.`,
      );
    } else if (shift <= -5) {
      sentences.push(
        `This is a fall on last term, and the school will be watching it.`,
      );
    }
  }

  /*
    3. Conduct, and only where it has become the school's business rather
    than the classroom's. The class teacher already speaks below "Very good";
    the head teacher speaks at "Fair" and below, which is where a matter
    stops being handled in the room it happened in.
  */
  if (facts.conduct && facts.conduct.outOf > 0) {
    const pct = Math.round((facts.conduct.points / facts.conduct.outOf) * 100);
    if (conductRemark(pct) === 'Fair' || conductRemark(pct) === 'Poor') {
      sentences.push(
        `Conduct this term is a matter for the school, and the family will be asked to meet the head teacher.`,
      );
    }
  }

  // 4. What is expected. One clause, because a head teacher's comment that
  // runs on stops being a head teacher's comment.
  sentences.push(
    band === 'strong' || band === 'solid'
      ? `Promoted to continue on the same terms.`
      : `${name} is expected to report next term ready to work.`,
  );

  return sentences.join(' ');
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
