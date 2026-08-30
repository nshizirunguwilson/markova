import { describe, expect, it } from "vitest";
import {
  checkCard,
  isWritten,
  issueBlocker,
  stepOf,
  tally,
  type Tally,
} from "./report-card-step";

/**
 * What is stopping a class's report cards going out.
 *
 * The bug this was written for: the marks page knew about one gate out of
 * four. Whatever was actually holding a class up, it said "you have not
 * confirmed this class yet" and offered a confirm button the API would
 * refuse, because the comments had not been written. Every class in a fresh
 * school sat there, and the screen named a step nobody could take.
 *
 * So the rule these hold is that the named blocker is the first gate not met,
 * and that it is the same gate the API checks.
 */

const t = (over: Partial<Tally> = {}): Tally => ({
  total: 30,
  published: 30,
  commented: 30,
  confirmed: 30,
  issued: 30,
  ...over,
});

describe("counting a class's cards", () => {
  it("counts each gate from the results the page already has", () => {
    expect(
      tally([
        { isPublished: true, teacherComment: "Good term.", dosConfirmed: true, reportCardPublished: false },
        { isPublished: true, teacherComment: null, dosConfirmed: false, reportCardPublished: false },
      ]),
    ).toEqual({ total: 2, published: 2, commented: 1, confirmed: 1, issued: 0 });
  });

  it("copes with results that have not loaded", () => {
    expect(tally(undefined).total).toBe(0);
    expect(tally(null).total).toBe(0);
  });

  /* A box holding a space is a box nobody wrote in, and a card confirmed on
     one prints an empty comment. The API agrees. */
  it("does not count a comment of whitespace as written", () => {
    expect(isWritten("   ")).toBe(false);
    expect(isWritten("")).toBe(false);
    expect(isWritten(null)).toBe(false);
    expect(isWritten("Works hard.")).toBe(true);
  });
});

describe("the first gate not met", () => {
  it("names the marks while any are still a draft", () => {
    expect(stepOf(t({ published: 12, commented: 0, confirmed: 0, issued: 0 }))).toBe("MARKS_DRAFT");
  });

  it("names the comments once the marks are out", () => {
    expect(stepOf(t({ commented: 18, confirmed: 0, issued: 0 }))).toBe("COMMENTS_MISSING");
  });

  it("names the check once every comment is written", () => {
    expect(stepOf(t({ confirmed: 0, issued: 0 }))).toBe("AWAITING_CHECK");
  });

  it("says a confirmed class is ready to issue", () => {
    expect(stepOf(t({ issued: 0 }))).toBe("READY_TO_ISSUE");
  });

  it("says an issued class is issued", () => {
    expect(stepOf(t())).toBe("ISSUED");
  });

  it("has nothing to say about a class with no results", () => {
    expect(stepOf(t({ total: 0, published: 0, commented: 0, confirmed: 0, issued: 0 }))).toBe(
      "NO_RESULTS",
    );
  });

  /*
    The regression itself. A class with no comments is held up by the
    comments, not by a check that cannot begin, and this is the case the page
    used to get wrong for every class in the school.
  */
  it("blames the comments rather than the check when neither is done", () => {
    expect(stepOf(t({ commented: 0, confirmed: 0, issued: 0 }))).toBe("COMMENTS_MISSING");
  });
});

describe("why the issue button is off", () => {
  it("says nothing is wrong once the class is confirmed", () => {
    expect(issueBlocker(t({ issued: 0 }))).toBeNull();
  });

  it("names the comments, with how many are missing", () => {
    expect(issueBlocker(t({ commented: 4, confirmed: 0, issued: 0 }))).toBe(
      "26 of 30 cards have no class teacher's comment yet",
    );
  });

  it("names the draft marks, with how many are still held", () => {
    expect(issueBlocker(t({ published: 20, commented: 0, confirmed: 0, issued: 0 }))).toMatch(
      /Publish the marks first: 10 of 30/,
    );
  });

  it("names the check when that is genuinely what is left", () => {
    expect(issueBlocker(t({ confirmed: 22, issued: 0 }))).toMatch(
      /have not confirmed this class yet: 8 of 30/,
    );
  });

  // Every blocker has to be a sentence somebody can act on, not a state name.
  it("gives a reason for every state that blocks", () => {
    for (const over of [
      { total: 0, published: 0, commented: 0, confirmed: 0, issued: 0 },
      { published: 1, commented: 0, confirmed: 0, issued: 0 },
      { commented: 1, confirmed: 0, issued: 0 },
      { confirmed: 1, issued: 0 },
    ]) {
      expect(issueBlocker(t(over))?.length).toBeGreaterThan(20);
    }
  });
});

describe("what the check card says", () => {
  it("sends the DOS to the comments when those are what is missing", () => {
    const card = checkCard(t({ commented: 0, confirmed: 0, issued: 0 }));
    expect(card.heading).toBe("30 of 30 not written");
    expect(card.action?.href).toBe("/admin/report-cards");
  });

  /* Confirming is offered only where confirming would actually be accepted.
     Offering it earlier is what sent people into a refused request. */
  it("offers confirming only once every comment is in", () => {
    expect(checkCard(t({ commented: 29, confirmed: 0, issued: 0 })).action?.label).toBe(
      "Open the report cards",
    );
    expect(checkCard(t({ confirmed: 0, issued: 0 })).action?.label).toBe(
      "Read and confirm them",
    );
  });

  it("distinguishes a class nobody has started from one in progress", () => {
    expect(checkCard(t({ commented: 0, confirmed: 0, issued: 0 })).detail).toMatch(
      /has not written on these cards yet/,
    );
    expect(checkCard(t({ commented: 15, confirmed: 0, issued: 0 })).detail).toMatch(
      /still writing/,
    );
  });

  it("says the check has not begun while the marks are a draft", () => {
    const card = checkCard(t({ published: 0, commented: 0, confirmed: 0, issued: 0 }));
    expect(card.heading).toBe("Not started");
    expect(card.action).toBeNull();
  });

  it("stands behind a confirmed class rather than asking again", () => {
    expect(checkCard(t({ issued: 0 })).heading).toBe("Confirmed");
    expect(checkCard(t({ issued: 0 })).action).toBeNull();
  });
});
