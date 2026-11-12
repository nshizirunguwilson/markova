import { describe, expect, it } from "vitest";
import { daysUntil, dueWord, latestMarks, percent, workDue } from "./student-home";

// Thursday 12 November 2026, mid-morning.
const now = new Date(2026, 10, 12, 10, 0);
const on = (day: number, hour = 23) => new Date(2026, 10, day, hour, 59).toISOString();

const work = (id: string, day: number, submission: unknown = null) => ({
  id,
  title: `Work ${id}`,
  dueDate: on(day),
  submission,
});

describe("how long until something is due", () => {
  it("counts whole days, whatever the hour", () => {
    expect(daysUntil(on(12, 8), now)).toBe(0);
    expect(daysUntil(on(13), now)).toBe(1);
    expect(daysUntil(on(11), now)).toBe(-1);
  });

  it("says it the way a person would", () => {
    expect(dueWord(on(12), now)).toBe("Due today");
    expect(dueWord(on(13), now)).toBe("Due tomorrow");
    expect(dueWord(on(16), now)).toBe("Due in 4 days");
    expect(dueWord(on(19), now)).toBe("Due Thu 19 Nov");
  });
});

describe("what is due", () => {
  it("lists what is not handed in, soonest first", () => {
    const { coming } = workDue([work("c", 20), work("a", 12), work("b", 14)], now);
    expect(coming.map((w) => w.id)).toEqual(["a", "b", "c"]);
  });

  it("leaves out what was handed in", () => {
    const { coming, late } = workDue([work("a", 14, { id: "s-1" }), work("b", 9, { id: "s-2" })], now);
    expect(coming).toEqual([]);
    expect(late).toBe(0);
  });

  it("counts what is already late apart from what is coming", () => {
    const { coming, late } = workDue([work("a", 9), work("b", 11), work("c", 13)], now);
    expect(coming.map((w) => w.id)).toEqual(["c"]);
    expect(late).toBe(2);
  });

  it("has nothing for a student with no work set", () => {
    expect(workDue(undefined, now)).toEqual({ coming: [], late: 0 });
  });
});

describe("the latest marks", () => {
  const mark = (id: string, day: number, updated?: number) => ({
    id,
    score: 30,
    maxScore: 40,
    createdAt: on(day),
    ...(updated && { updatedAt: on(updated) }),
  });

  it("puts the newest first and keeps five", () => {
    const marks = [1, 2, 3, 4, 5, 6, 7].map((d) => mark(`m-${d}`, d));
    expect(latestMarks(marks).map((m) => m.id)).toEqual(["m-7", "m-6", "m-5", "m-4", "m-3"]);
  });

  // A corrected mark is news again.
  it("counts a mark from when it was last changed", () => {
    const marks = [mark("old", 2, 11), mark("new", 9)];
    expect(latestMarks(marks).map((m) => m.id)).toEqual(["old", "new"]);
  });

  it("does not reorder the list it was given", () => {
    const marks = [mark("a", 1), mark("b", 9)];
    latestMarks(marks);
    expect(marks.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("has nothing when no marks are in, or none carry a date", () => {
    expect(latestMarks(undefined)).toEqual([]);
    expect(latestMarks([{ id: "x", score: 1, maxScore: 2 }])).toHaveLength(1);
  });

  it("writes a mark as a percentage", () => {
    expect(percent(34, 40)).toBe("85%");
    expect(percent(5, 0)).toBe("");
  });
});
