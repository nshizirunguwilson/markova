/**
 * Where a class has got to on the way to a report card, and what is stopping
 * it going further.
 *
 * The pipeline has four gates and the API enforces every one of them: marks
 * are released, the class teacher writes a comment on each card, the DOS
 * reads the class and confirms it, and then the cards are issued. Each gate
 * refuses until the one before it is met.
 *
 * This exists because the marks page used to know about exactly one of them.
 * It reported "you have not confirmed this class yet" whatever the real
 * reason was, so on a class whose comments were not written it sent the DOS
 * to a confirm button that the API would refuse, with a message they only saw
 * after clicking. A screen that names a step you cannot take is worse than
 * one that says nothing: it spends somebody's afternoon.
 *
 * So the blocker is worked out in one place, from the same counts the API
 * checks, and the card, the button and its tooltip all read it.
 */

/** One class's cards, counted by how far each has come. */
export interface Tally {
  total: number;
  published: number;
  commented: number;
  confirmed: number;
  issued: number;
}

export type Step =
  | "NO_RESULTS"
  | "MARKS_DRAFT"
  | "COMMENTS_MISSING"
  | "AWAITING_CHECK"
  | "READY_TO_ISSUE"
  | "ISSUED";

/**
 * A comment of spaces is not a comment.
 *
 * The box being non-empty is not the thing that matters; somebody having
 * written in it is. Counting a space as written would let a class be
 * confirmed with a blank box on a printed card.
 */
export const isWritten = (comment: unknown): boolean =>
  typeof comment === "string" && comment.trim().length > 0;

/** Count a class's results into the four figures the gates are checked on. */
export function tally(results: readonly Record<string, unknown>[] | null | undefined): Tally {
  const rows = results ?? [];
  const count = (p: (r: Record<string, unknown>) => boolean) => rows.filter(p).length;
  return {
    total: rows.length,
    published: count((r) => Boolean(r.isPublished)),
    commented: count((r) => isWritten(r.teacherComment)),
    confirmed: count((r) => Boolean(r.dosConfirmed)),
    issued: count((r) => Boolean(r.reportCardPublished)),
  };
}

/**
 * The first gate not yet met, which is the only one worth naming. A class
 * with no comments and no confirmation is held up by the comments: saying
 * both would ask the DOS to do something they cannot do yet.
 */
export function stepOf(t: Tally): Step {
  if (t.total === 0) return "NO_RESULTS";
  if (t.issued === t.total) return "ISSUED";
  if (t.published < t.total) return "MARKS_DRAFT";
  if (t.commented < t.total) return "COMMENTS_MISSING";
  if (t.confirmed < t.total) return "AWAITING_CHECK";
  return "READY_TO_ISSUE";
}

/**
 * Why the Issue button is disabled, in the words of the step that is actually
 * blocking, or null when nothing is. Read out as the button's tooltip and its
 * accessible description, so it is not a colour-only signal.
 */
export function issueBlocker(t: Tally): string | null {
  switch (stepOf(t)) {
    case "NO_RESULTS":
      return "There are no results for this class yet";
    case "MARKS_DRAFT":
      return `Publish the marks first: ${t.total - t.published} of ${t.total} are still a draft, and the card carries them`;
    case "COMMENTS_MISSING":
      return `${t.total - t.commented} of ${t.total} cards have no class teacher's comment yet`;
    case "AWAITING_CHECK":
      return `You have not confirmed this class yet: ${t.total - t.confirmed} of ${t.total} are waiting`;
    default:
      return null;
  }
}

/** What the check card says, and where it sends somebody who has to act. */
export interface CheckCard {
  heading: string;
  detail: string;
  action: { label: string; href: string } | null;
}

/*
  Every state that is not the reader's own move still names whose it is, so
  the DOS knows who to chase rather than only that they are blocked.
*/
export function checkCard(t: Tally): CheckCard {
  const step = stepOf(t);
  const waiting = t.total - t.confirmed;
  const missing = t.total - t.commented;

  switch (step) {
    case "NO_RESULTS":
      return {
        heading: "Nothing to check",
        detail: "No results have been worked out for this class yet.",
        action: null,
      };
    case "MARKS_DRAFT":
      return {
        heading: "Not started",
        detail:
          "The check begins once the marks are released. A card carries them, so they are settled first.",
        action: null,
      };
    case "COMMENTS_MISSING":
      return {
        heading: `${missing} of ${t.total} not written`,
        detail:
          missing === t.total
            ? "The class teacher has not written on these cards yet. There is nothing to read until they have."
            : "The class teacher is still writing. You can read the ones that are done.",
        action: { label: "Open the report cards", href: "/admin/report-cards" },
      };
    case "AWAITING_CHECK":
      return {
        heading: `${waiting} of ${t.total} waiting`,
        detail: "Every comment is written. A card is issued on the strength of this check.",
        action: { label: "Read and confirm them", href: "/admin/report-cards" },
      };
    default:
      return {
        heading: "Confirmed",
        detail: "You have read these cards and stand behind them.",
        action: null,
      };
  }
}
